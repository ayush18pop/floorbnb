import { bsc } from 'viem/chains';
import { MemoryReceiptStore } from '@floor/db/src/x402Receipts';
import { FLOOR_DISCLOSURE, MAX_ASSETS, MAX_FLOOR_BPS, MAX_TERM_SECONDS, MIN_FLOOR_BPS, MIN_TERM_SECONDS, quoteProtection } from '@floor/sdk';
import { createGate, selfFacilitatorFromEnv, B402FacilitatorClient, type FacilitatorClient, type PaidAsset, type ReceiptStore } from '@floor/x402';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { ser } from './util';

type Env = Record<string, string | undefined>;

/** EIP-3009 tokens verified on a BSC fork by A17 (ops/progress/A17.md). */
const USD1 = { address: '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d' as const, name: 'World Liberty Financial USD', version: '1' };
const U = { address: '0xcE24439F2D9C6a2289F741120FE202248B666666' as const, name: 'United Stables', version: '1' };
const TOKENS = [USD1, U];
const ASSETS: PaidAsset[] = [
  { address: USD1.address, symbol: 'USD1', decimals: 18, method: 'eip3009', name: USD1.name },
  { address: U.address, symbol: 'U', decimals: 18, method: 'eip3009', name: U.name },
];

const quoteBody = z.object({
  deposit: z.string().regex(/^\d+$/),
  floorBps: z.number().int().min(MIN_FLOOR_BPS).max(MAX_FLOOR_BPS),
  termSeconds: z.number().int().min(MIN_TERM_SECONDS).max(MAX_TERM_SECONDS),
  weightsBps: z.array(z.number().int().positive()).min(1).max(MAX_ASSETS).optional(),
});
const MAX_AMOUNT = 10n ** 30n;
const bad = (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status });

export interface PaidOptions {
  payTo: string;
  facilitator: FacilitatorClient;
  receipts?: ReceiptStore;
  network?: string;
  now?: () => number;
}

/**
 * Adapts @floor/x402 gate() to the AppDeps.paidGate seam. The seam returns a Response that app.ts sends as is, so the full paid answer
 * (body plus PAYMENT-RESPONSE) is produced here, by the gate's handler. Input is validated inside the handler: a bad body gets a 400 and
 * the gate releases the payment without settling it (nobody is charged for a failed call).
 */
export function createPaidGate(o: PaidOptions): (req: Request, priceUsd: string) => Promise<Response | null> {
  const gate = createGate({
    facilitator: o.facilitator,
    // In-memory receipts reset on restart; the on-chain EIP-3009 nonce still blocks replays.
    receipts: o.receipts ?? new MemoryReceiptStore(),
    payTo: o.payTo,
    network: o.network ?? 'eip155:56',
    assets: ASSETS,
  });
  const now = o.now ?? Date.now;
  return (req, priceUsd) =>
    gate(req, { usd: priceUsd, description: 'Floor protection quote', mimeType: 'application/json' }, async (r) => {
      let json: unknown;
      try {
        json = await r.json();
      } catch {
        return bad(400, 'bad_request', 'body must be JSON');
      }
      const p = quoteBody.safeParse(json);
      if (!p.success) return bad(400, 'bad_request', p.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
      const deposit = BigInt(p.data.deposit);
      if (deposit <= 0n || deposit > MAX_AMOUNT) return bad(400, 'bad_request', 'deposit out of range');
      try {
        const q = quoteProtection({ deposit, floorBps: p.data.floorBps, termSeconds: p.data.termSeconds, weightsBps: p.data.weightsBps, now: Math.floor(now() / 1000) });
        return Response.json(ser({ quote: q, disclosure: FLOOR_DISCLOSURE }));
      } catch (e) {
        return bad(400, 'bad_request', e instanceof Error ? e.message : 'invalid input');
      }
    });
}

/** undefined when X402_PAYTO is unset (the route then answers 501, never serves unpaid). */
export function paidGateFromEnv(env: Env): ReturnType<typeof createPaidGate> | undefined {
  if (!env.X402_PAYTO) return undefined;
  let facilitator: FacilitatorClient;
  if ((env.X402_FACILITATOR ?? 'self') === 'b402') {
    const need = (k: string) => {
      const v = env[k];
      if (!v) throw new Error(`${k} is required when X402_FACILITATOR=b402`);
      return v;
    };
    // UNTESTED-LIVE (ops/progress/A17.md)
    facilitator = new B402FacilitatorClient({ baseUrl: need('B402_BASE_URL'), clientId: need('B402_CLIENT_ID'), signAccessToken: need('B402_SIGN_ACCESS_TOKEN'), privateKey: readFileSync(need('B402_RSA_KEY_PATH'), 'utf8') });
  } else {
    facilitator = selfFacilitatorFromEnv(env, bsc, TOKENS);
  }
  return createPaidGate({ payTo: env.X402_PAYTO, facilitator, network: env.X402_NETWORK });
}
