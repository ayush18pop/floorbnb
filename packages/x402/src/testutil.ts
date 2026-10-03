import { randomBytes } from 'node:crypto';
import type { LocalAccount } from 'viem';
import { TRANSFER_WITH_AUTH_TYPES } from './self';
import { b64encode } from './encoding';
import type { PaymentPayload, PaymentRequirements } from './types';

export async function signPayment(
  account: LocalAccount,
  req: PaymentRequirements,
  token: { name: string; version: string },
  opts: { nonce?: string; validAfter?: number; validBefore?: number; value?: string; chainId?: number } = {},
): Promise<PaymentPayload> {
  const nonce = (opts.nonce ?? '0x' + randomBytes(32).toString('hex')) as `0x${string}`;
  const auth = {
    from: account.address,
    to: req.payTo,
    value: opts.value ?? req.amount,
    validAfter: String(opts.validAfter ?? 0),
    validBefore: String(opts.validBefore ?? Math.floor(Date.now() / 1000) + 300),
    nonce,
  };
  const signature = await account.signTypedData({
    domain: {
      name: token.name,
      version: token.version,
      chainId: opts.chainId ?? Number(req.network.split(':')[1]),
      verifyingContract: req.asset as `0x${string}`,
    },
    types: TRANSFER_WITH_AUTH_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: auth.from,
      to: auth.to as `0x${string}`,
      value: BigInt(auth.value),
      validAfter: BigInt(auth.validAfter),
      validBefore: BigInt(auth.validBefore),
      nonce,
    },
  });
  return { x402Version: 2, accepted: req, payload: { signature, authorization: auth } };
}

export const header = (p: PaymentPayload) => b64encode(p);
