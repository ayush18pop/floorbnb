import type { PaymentPayload, ReceiptKey } from './types';

export function b64encode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
}

export function b64decode<T = unknown>(s: string): T {
  return JSON.parse(Buffer.from(s, 'base64').toString('utf8')) as T;
}

export function paymentKey(p: PaymentPayload): ReceiptKey | undefined {
  const a = p.payload.authorization;
  if (a) return { nonce: a.nonce.toLowerCase(), network: p.accepted.network, payer: a.from.toLowerCase() };
  const p2 = p.payload.permit2Authorization;
  if (p2) return { nonce: String(p2.nonce).toLowerCase(), network: p.accepted.network, payer: p2.from.toLowerCase() };
  return undefined;
}

export function chainIdOf(network: string): number {
  const m = /^eip155:(\d+)$/.exec(network);
  if (!m) throw new Error(`unsupported network ${network}`);
  return Number(m[1]);
}
