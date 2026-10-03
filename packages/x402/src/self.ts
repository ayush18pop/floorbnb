// SelfFacilitatorClient: verifies an EIP-3009 transferWithAuthorization signature with viem and
// settles from a gas EOA. The key (SELF_FACILITATOR_KEY) must only send on a real network when the
// human runs the server. Tests use anvil dev keys on a local fork.
import {
  createPublicClient,
  createWalletClient,
  hexToSignature,
  http,
  parseAbi,
  type Account,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
  verifyTypedData,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { chainIdOf } from './encoding';
import type {
  FacilitatorClient,
  PaymentPayload,
  PaymentRequirements,
  SettleResult,
  Supported,
  VerifyResult,
} from './types';

export const TRANSFER_WITH_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

// v,r,s overload (selector 0xe3ee160e): present on both U and USD1 (VERIFIED on a BSC fork, see
// ops/progress/A17.md). The bytes-signature overload is NOT on USD1, so do not use it.
export const EIP3009_ABI = parseAbi([
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
  'function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
  'function balanceOf(address) view returns (uint256)',
]);

export interface Eip3009Token {
  address: `0x${string}`;
  /** EIP-712 domain name and version. */
  name: string;
  version: string;
}

export interface SelfFacilitatorOptions {
  network: string; // eip155:<chainId>
  tokens: Eip3009Token[];
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain, Account>;
  now?: () => number; // seconds
}

/** Build from env. SELF_FACILITATOR_KEY is read here and never logged. */
export function selfFacilitatorFromEnv(
  env: Record<string, string | undefined>,
  chain: Chain,
  tokens: Eip3009Token[],
): SelfFacilitatorClient {
  const key = env.SELF_FACILITATOR_KEY;
  if (!key) throw new Error('SELF_FACILITATOR_KEY not set');
  const rpc = env.BSC_RPC_URL;
  if (!rpc) throw new Error('BSC_RPC_URL not set');
  const account = privateKeyToAccount(key as Hex);
  const transport = http(rpc);
  return new SelfFacilitatorClient({
    network: `eip155:${chain.id}`,
    tokens,
    publicClient: createPublicClient({ chain, transport }) as PublicClient,
    walletClient: createWalletClient({ account, chain, transport }),
  });
}

export class SelfFacilitatorClient implements FacilitatorClient {
  private settled = new Map<string, SettleResult>();
  private inflight = new Map<string, Promise<SettleResult>>();
  private now: () => number;

  constructor(private o: SelfFacilitatorOptions) {
    this.now = o.now ?? (() => Math.floor(Date.now() / 1000));
  }

  async getSupported(): Promise<Supported> {
    return {
      kinds: this.o.tokens.map((t) => ({
        x402Version: 2,
        scheme: 'exact',
        network: this.o.network,
        asset: t.address,
        extra: { name: t.name, version: t.version, assetTransferMethod: 'eip3009' },
      })),
    };
  }

  private async check(p: PaymentPayload, r: PaymentRequirements): Promise<VerifyResult> {
    const bad = (invalidReason: string, payer?: string): VerifyResult => ({ isValid: false, invalidReason, payer });
    const a = p.payload.authorization;
    const sig = p.payload.signature;
    if (!a || !sig) return bad('invalid_payload');
    const payer = a.from;
    if (r.scheme !== 'exact' || p.accepted.scheme !== 'exact') return bad('unsupported_scheme', payer);
    if (r.network !== this.o.network || p.accepted.network !== r.network) return bad('invalid_network', payer);
    if (r.extra.assetTransferMethod !== 'eip3009') return bad('unsupported_asset_transfer_method', payer);
    if (
      p.accepted.asset.toLowerCase() !== r.asset.toLowerCase() ||
      p.accepted.amount !== r.amount ||
      p.accepted.payTo.toLowerCase() !== r.payTo.toLowerCase()
    )
      return bad('accepted_mismatch', payer);
    const token = this.o.tokens.find((t) => t.address.toLowerCase() === r.asset.toLowerCase());
    if (!token) return bad('unsupported_asset', payer);
    if (a.to.toLowerCase() !== r.payTo.toLowerCase()) return bad('recipient_mismatch', payer);
    if (!/^\d+$/.test(a.value) || BigInt(a.value) !== BigInt(r.amount)) return bad('invalid_exact_amount', payer);
    const now = this.now();
    if (BigInt(a.validAfter) > BigInt(now)) return bad('authorization_not_yet_valid', payer);
    // 6 s grace so it cannot expire while the settle tx is being mined
    if (BigInt(a.validBefore) < BigInt(now + 6)) return bad('authorization_expired', payer);
    let ok = false;
    try {
      ok = await verifyTypedData({
        address: a.from as `0x${string}`,
        domain: {
          name: token.name,
          version: token.version,
          chainId: chainIdOf(r.network),
          verifyingContract: token.address,
        },
        types: TRANSFER_WITH_AUTH_TYPES,
        primaryType: 'TransferWithAuthorization',
        message: {
          from: a.from as `0x${string}`,
          to: a.to as `0x${string}`,
          value: BigInt(a.value),
          validAfter: BigInt(a.validAfter),
          validBefore: BigInt(a.validBefore),
          nonce: a.nonce as Hex,
        },
        signature: sig as Hex,
      });
    } catch {
      ok = false;
    }
    if (!ok) return bad('invalid_signature', payer);
    const [used, bal] = await Promise.all([
      this.o.publicClient.readContract({ address: token.address, abi: EIP3009_ABI, functionName: 'authorizationState', args: [a.from as `0x${string}`, a.nonce as Hex] }),
      this.o.publicClient.readContract({ address: token.address, abi: EIP3009_ABI, functionName: 'balanceOf', args: [a.from as `0x${string}`] }),
    ]);
    if (used) return bad('nonce_already_used', payer);
    if (bal < BigInt(a.value)) return bad('insufficient_funds', payer);
    return { isValid: true, payer };
  }

  verify(p: PaymentPayload, r: PaymentRequirements): Promise<VerifyResult> {
    return this.check(p, r);
  }

  /** Idempotent per (nonce, payer): repeat calls return the first result and never send twice. */
  settle(p: PaymentPayload, r: PaymentRequirements): Promise<SettleResult> {
    const a = p.payload.authorization;
    if (!a) return Promise.resolve({ success: false, transaction: '', network: r.network, errorReason: 'invalid_payload' });
    const id = `${a.nonce.toLowerCase()}|${a.from.toLowerCase()}`;
    const done = this.settled.get(id);
    if (done) return Promise.resolve(done);
    const running = this.inflight.get(id);
    if (running) return running;
    const job = this.doSettle(p, r).then((res) => {
      if (res.success) this.settled.set(id, res);
      this.inflight.delete(id);
      return res;
    }, (e) => {
      this.inflight.delete(id);
      throw e;
    });
    this.inflight.set(id, job);
    return job;
  }

  private async doSettle(p: PaymentPayload, r: PaymentRequirements): Promise<SettleResult> {
    const fail = (errorReason: string, payer?: string): SettleResult => ({ success: false, transaction: '', network: r.network, payer, errorReason });
    const v = await this.check(p, r);
    if (!v.isValid) return fail(v.invalidReason ?? 'invalid', v.payer);
    const a = p.payload.authorization!;
    const sg = hexToSignature(p.payload.signature as Hex);
    const vNum = sg.v !== undefined ? Number(sg.v) : 27 + sg.yParity;
    const rr = sg.r;
    const s = sg.s;
    try {
      const { request } = await this.o.publicClient.simulateContract({
        account: this.o.walletClient.account,
        address: r.asset as `0x${string}`,
        abi: EIP3009_ABI,
        functionName: 'transferWithAuthorization',
        args: [a.from as `0x${string}`, a.to as `0x${string}`, BigInt(a.value), BigInt(a.validAfter), BigInt(a.validBefore), a.nonce as Hex, vNum, rr, s],
      });
      const hash = await this.o.walletClient.writeContract(request);
      const rec = await this.o.publicClient.waitForTransactionReceipt({ hash });
      if (rec.status !== 'success') return { ...fail('transaction_reverted', a.from), transaction: hash };
      return { success: true, transaction: hash, network: r.network, payer: a.from, amount: a.value };
    } catch (e) {
      return fail('settle_failed:' + (e instanceof Error ? e.message.split('\n')[0] : 'unknown'), a.from);
    }
  }
}


