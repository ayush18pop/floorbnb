import { describe, expect, it, vi } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { SelfFacilitatorClient } from './self';
import { signPayment } from './testutil';
import type { PaymentRequirements } from './types';

const TOKEN = { address: '0x00000000000000000000000000000000000000a1' as const, name: 'United Stables', version: '1' };
const req: PaymentRequirements = {
  scheme: 'exact', network: 'eip155:56', asset: TOKEN.address, amount: '10000', payTo: '0x00000000000000000000000000000000000000c3',
  maxTimeoutSeconds: 60, extra: { name: TOKEN.name, version: TOKEN.version, assetTransferMethod: 'eip3009' },
};

function setup(state: { used?: boolean; balance?: bigint } = {}) {
  const publicClient = {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => (functionName === 'authorizationState' ? !!state.used : (state.balance ?? 10n ** 18n))),
    simulateContract: vi.fn(async (a: object) => ({ request: a })),
    waitForTransactionReceipt: vi.fn(async () => ({ status: 'success' })),
  };
  const walletClient = { account: { address: '0x0000000000000000000000000000000000000001' }, writeContract: vi.fn(async () => '0xhash') };
  const f = new SelfFacilitatorClient({ network: 'eip155:56', tokens: [TOKEN], publicClient: publicClient as never, walletClient: walletClient as never });
  return { f, publicClient, walletClient };
}
const acct = () => privateKeyToAccount(generatePrivateKey());

describe('SelfFacilitatorClient (mocked chain)', () => {
  it('getSupported lists eip3009 tokens with name/version', async () => {
    const { f } = setup();
    const s = await f.getSupported();
    expect(s.kinds[0]).toMatchObject({ asset: TOKEN.address, extra: { name: 'United Stables', version: '1', assetTransferMethod: 'eip3009' } });
  });

  it('verifies a good signature', async () => {
    const { f } = setup();
    const p = await signPayment(acct(), req, TOKEN);
    expect(await f.verify(p, req)).toMatchObject({ isValid: true });
  });

  it.each([
    ['wrong domain version', async () => signPayment(acct(), req, { ...TOKEN, version: '2' }), 'invalid_signature'],
    ['wrong chain id', async () => signPayment(acct(), req, TOKEN, { chainId: 1 }), 'invalid_signature'],
    ['expired', async () => signPayment(acct(), req, TOKEN, { validBefore: 5 }), 'authorization_expired'],
    ['not yet valid', async () => signPayment(acct(), req, TOKEN, { validAfter: 4_000_000_000 }), 'authorization_not_yet_valid'],
    ['underpaid', async () => signPayment(acct(), req, TOKEN, { value: '1' }), 'invalid_exact_amount'],
  ])('rejects %s', async (_n, make, reason) => {
    const { f } = setup();
    expect((await f.verify(await make(), req)).invalidReason).toBe(reason);
  });

  it('rejects a signature from a different signer than authorization.from', async () => {
    const { f } = setup();
    const p = await signPayment(acct(), req, TOKEN);
    p.payload.authorization!.from = acct().address;
    expect((await f.verify(p, req)).invalidReason).toBe('invalid_signature');
  });

  it('rejects used nonce and insufficient balance', async () => {
    const p = await signPayment(acct(), req, TOKEN);
    expect((await setup({ used: true }).f.verify(p, req)).invalidReason).toBe('nonce_already_used');
    expect((await setup({ balance: 1n }).f.verify(p, req)).invalidReason).toBe('insufficient_funds');
  });

  it('rejects redirected recipient', async () => {
    const { f } = setup();
    const p = await signPayment(acct(), { ...req, payTo: '0x00000000000000000000000000000000000000d4' }, TOKEN);
    expect((await f.verify(p, req)).invalidReason).toBe('accepted_mismatch');
  });

  it('settle sends once, is idempotent, uses v/r/s overload', async () => {
    const { f, walletClient } = setup();
    const p = await signPayment(acct(), req, TOKEN);
    const [a, b] = await Promise.all([f.settle(p, req), f.settle(p, req)]);
    const c = await f.settle(p, req);
    expect(a).toMatchObject({ success: true, transaction: '0xhash' });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
  });

  it('settle reports invalid auth without sending', async () => {
    const { f, walletClient } = setup();
    const p = await signPayment(acct(), req, TOKEN, { validBefore: 5 });
    expect(await f.settle(p, req)).toMatchObject({ success: false, errorReason: 'authorization_expired' });
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });
});
