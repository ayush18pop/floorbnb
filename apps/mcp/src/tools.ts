import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { formatUnits, parseUnits } from 'viem';
import { z } from 'zod';
import {
  LAUNCH_TERM_SECONDS,
  MAX_ASSETS,
  MAX_FLOOR_BPS,
  MAX_TERM_SECONDS,
  MIN_FLOOR_BPS,
  MIN_TERM_SECONDS,
  addressSchema,
  quoteProtection,
} from '@floor/sdk';
import { b64decode, type PaymentPayload, type PaymentRequired } from '@floor/x402';
import { ApiError, type FloorApi } from './api';
import { AUDIT_STATEMENT, DISCLOSURE, type McpConfig } from './config';
import { BASKETS, DataError, MODES, readBacktest, readLongHistory } from './data';
import type { Gate } from './payments';

export const FREE_TOOLS = ['get_floor_info', 'list_assets', 'get_status', 'get_rebalance_history', 'build_create_position_tx', 'build_exit_tx'] as const;
export const PAID_TOOLS = ['quote_protection', 'backtest', 'simulate_gap'] as const;
export type PaidToolName = (typeof PAID_TOOLS)[number];

/** Filled while one HTTP request runs, so the HTTP layer can mirror the payment headers. */
export interface RequestCtx {
  /** Payment from the PAYMENT-SIGNATURE HTTP header, used when params._meta["x402/payment"] is absent. */
  headerPayment?: PaymentPayload;
  /** Base64 PAYMENT-REQUIRED header value when a paid tool answered "payment required". */
  paymentRequired?: string;
  /** Base64 PAYMENT-RESPONSE header value after settlement. */
  paymentResponse?: string;
}

export interface ToolDeps {
  api: FloorApi;
  cfg: McpConfig;
  gate?: Gate;
  ctx: RequestCtx;
}

/** JSON with bigint as decimal strings. */
export function ser(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)));
}

function ok(data: Record<string, unknown>, meta?: Record<string, unknown>): CallToolResult {
  const out = ser({ ...data, disclosure: DISCLOSURE }) as Record<string, unknown>;
  return { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out, ...(meta ? { _meta: meta } : {}) };
}

function fail(code: string, message: string, extra: Record<string, unknown> = {}): CallToolResult {
  const out = { error: { code, message }, ...extra, disclosure: DISCLOSURE };
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out };
}

function toFailure(e: unknown): CallToolResult {
  if (e instanceof ApiError) return fail(e.code, e.message);
  if (e instanceof DataError) return fail('data_unavailable', e.message);
  return fail('internal_error', 'tool failed');
}

// ---- input schemas (strict: unknown keys are rejected) ----
const uintDecimal = z.string().regex(/^\d+(\.\d{1,18})?$/, 'decimal number with at most 18 places, e.g. "1000" or "250.5"');
const floorBps = z.number().int().min(MIN_FLOOR_BPS).max(MAX_FLOOR_BPS).describe('Floor as basis points of the deposit, e.g. 9000 = 90%');
const termSeconds = z.number().int().min(MIN_TERM_SECONDS).max(MAX_TERM_SECONDS).default(LAUNCH_TERM_SECONDS).describe('Term in seconds. Default one year');
const weights = z.array(z.number().int().positive()).min(1).max(MAX_ASSETS).optional().describe('Basis-point weights per asset, sum 10000. Default: one asset at 100%');

const protectionShape = {
  depositUsdt: uintDecimal.describe('Deposit in USDT, decimal string'),
  floorBps,
  termSeconds,
  weightsBps: weights,
};

const createShape = {
  owner: addressSchema.describe('The wallet that will own the position and sign'),
  amount: z.string().regex(/^\d+$/).describe('USDT amount in wei (18 decimals), integer string'),
  floorBps,
  termSeconds: z.number().int().min(MIN_TERM_SECONDS).max(MAX_TERM_SECONDS),
  assets: z.array(addressSchema).min(1).max(MAX_ASSETS).describe('bStock token addresses from get_floor_info / list_assets'),
  weightsBps: z.array(z.number().int().positive()).min(1).max(MAX_ASSETS),
};

const outputSchema = z.looseObject({ disclosure: z.string() });

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

function protection(a: { depositUsdt: string; floorBps: number; termSeconds: number; weightsBps?: number[] }) {
  const deposit = parseUnits(a.depositUsdt, 18);
  if (deposit <= 0n) throw new DataError('deposit must be positive');
  try {
    return { deposit, q: quoteProtection({ deposit, floorBps: a.floorBps, termSeconds: a.termSeconds, weightsBps: a.weightsBps }) };
  } catch (e) {
    throw new DataError(e instanceof Error ? e.message : 'invalid input');
  }
}
const usdt = (x: bigint) => formatUnits(x, 18);

/** Pure arithmetic from the SDK's CPPI maths. A what-if, not a forecast. */
function gapWhatIf(a: { depositUsdt: string; floorBps: number; termSeconds: number; weightsBps?: number[]; gapBps: number }) {
  const { deposit, q } = protection(a);
  const loss = (q.startingExposure * BigInt(a.gapBps)) / 10_000n;
  const valueAfter = deposit - loss;
  const belowFloor = valueAfter < q.floorValue;
  return {
    inputs: { depositUsdt: a.depositUsdt, floorBps: a.floorBps, gapBps: a.gapBps },
    startingExposureUsdt: usdt(q.startingExposure),
    startingFloorUsdt: usdt(q.floorValue),
    lossUsdt: usdt(loss),
    valueAfterUsdt: usdt(valueAfter),
    belowFloor,
    shortfallUsdt: belowFloor ? usdt(q.floorValue - valueAfter) : '0',
    gapToleranceBps: q.gapToleranceBps,
    method:
      'Arithmetic only: the position starts at its opening split (stock exposure E = min(4 x cushion, deposit), the rest in USDT). One instant fall of the stock holdings by gapBps, no rebalance before it, costs ignored, USDT earns 0. It is a what-if, not a forecast.',
  };
}

export function createFloorMcpServer(deps: ToolDeps): McpServer {
  const { api, cfg, ctx } = deps;
  const server = new McpServer(
    { name: 'floor', version: '0.1.0' },
    {
      instructions:
        'Floor sets a floor under tokenized stocks (bStocks) on BNB Chain with spot trades only. Call get_floor_info first and use the addresses it returns. ' +
        'Tools that change state only RETURN UNSIGNED transactions; Floor never signs. Check every returned `to` against get_floor_info (factory, USDT) or the vault, ' +
        'show the user the decoded call, and let the user confirm before signing with their own wallet. ' +
        `Paid tools (${PAID_TOOLS.join(', ')}) use x402: the first call returns a payment-required result; pay and retry with params._meta["x402/payment"]. ` +
        `${DISCLOSURE}`,
    },
  );

  const reg = <S extends z.ZodRawShape>(name: string, title: string, description: string, shape: S, run: (a: z.infer<z.ZodObject<S>>, extra: { _meta?: Record<string, unknown> }) => Promise<CallToolResult>) =>
    server.registerTool(
      name,
      { title, description, inputSchema: z.strictObject(shape), outputSchema, annotations: { title, ...READ } } as never,
      (async (a: never, extra: { _meta?: Record<string, unknown> }) => {
        try {
          return await run(a, extra);
        } catch (e) {
          return toFailure(e);
        }
      }) as never,
    );

  // ---------------- free tools ----------------
  reg('get_floor_info', 'Floor info', 'Factory, lens and USDT addresses, enabled bStocks, term and floor bounds, caps, state and the disclosure. Call this first. Free. Reads the chain through the Floor API.', {}, async () => {
    const f = (await api.get('/v1/floor')) as Record<string, unknown>;
    return ok({
      ...f,
      audit: AUDIT_STATEMENT,
      tools: { free: FREE_TOOLS, paid: PAID_TOOLS.map((n) => ({ name: n, priceUsd: cfg.prices[n], note: 'proposed price' })) },
      howToSign: 'Floor returns unsigned transactions only. Your own wallet signs; Floor never holds keys.',
    });
  });

  reg('list_assets', 'List assets', 'bStocks the factory has enabled (symbol, address, pool, fee) and, when the price source is configured, price and market status. Free.', {}, async () => {
    const assets = (await api.get('/v1/assets')) as Record<string, unknown>;
    let market: unknown = null;
    let marketNote: string | null = null;
    try {
      market = await api.get('/v1/market');
    } catch (e) {
      marketNote = e instanceof ApiError ? `market data unavailable: ${e.code}` : 'market data unavailable';
    }
    return ok({ ...assets, market, marketNote });
  });

  reg(
    'get_status',
    'Position status',
    'Value, floor, cushion and state of a Floor position. Pass exactly one of `vault` (a position address) or `owner` (all positions of a wallet). Free.',
    { owner: addressSchema.optional(), vault: addressSchema.optional() },
    async (a) => {
      if (!!a.owner === !!a.vault) return fail('bad_request', 'pass exactly one of owner or vault');
      const r = a.vault ? await api.get(`/v1/positions/${a.vault}`) : await api.get(`/v1/positions?owner=${a.owner}`);
      return ok({ result: r });
    },
  );

  reg(
    'get_rebalance_history',
    'Rebalance history',
    'Recent keeper rebalance runs, optionally for one vault. Public. Free. May be empty if the keeper log is not connected to the API.',
    { vault: addressSchema.optional(), limit: z.number().int().min(1).max(100).default(20) },
    async (a) => {
      const q = new URLSearchParams({ limit: String(a.limit), ...(a.vault ? { vault: a.vault } : {}) });
      return ok({ result: await api.get(`/v1/keeper/runs?${q}`) });
    },
  );

  reg(
    'build_create_position_tx',
    'Build create-position transactions',
    'Returns UNSIGNED transactions: a USDT approve to the factory, then createPosition, each with a simulation result from the API (createPosition is simulated only once the allowance is on chain, else simulation is null). ' +
      'Nothing is signed or sent. The owner wallet signs. Free.',
    createShape,
    async (a) => {
      const [r, info] = await Promise.all([api.post('/v1/tx/create-position', a), api.get('/v1/floor')]);
      const txs = (r as { txs?: { to: string }[] }).txs ?? [];
      const f = info as { factory: string; usdt: string };
      const allowed = new Set([f.factory.toLowerCase(), f.usdt.toLowerCase()]);
      if (txs.length === 0 || txs.some((t) => !allowed.has(t.to.toLowerCase()))) return fail('guard', 'refusing to return a transaction to an unexpected address');
      return ok({ ...(r as object), instructions: 'Show the user both calls. They sign the approve first, then createPosition. Verify each `to` equals the factory or USDT from get_floor_info.' });
    },
  );

  reg(
    'build_exit_tx',
    'Build exit transaction',
    'Returns ONE UNSIGNED transaction to leave a position: requestClose (ask for a close), closeToUSDT (settle to USDT) or exitInKind (take the held tokens; `to` defaults to the owner). Includes a simulation run as the owner. Only the owner can send it. Free.',
    { vault: addressSchema, kind: z.enum(['requestClose', 'closeToUSDT', 'exitInKind']), to: addressSchema.optional() },
    async (a) => {
      const r = (await api.post('/v1/tx/exit', { vault: a.vault, mode: a.kind, ...(a.to ? { to: a.to } : {}) })) as { tx?: { to: string } };
      if (!r.tx || r.tx.to.toLowerCase() !== a.vault.toLowerCase()) return fail('guard', 'refusing to return a transaction whose target is not the requested vault');
      return ok({ ...r, instructions: 'Show the user the decoded call. They sign with the owner wallet.' });
    },
  );

  // ---------------- paid tools ----------------
  const paid = <S extends z.ZodRawShape>(name: PaidToolName, title: string, description: string, shape: S, compute: (a: z.infer<z.ZodObject<S>>) => Promise<Record<string, unknown>> | Record<string, unknown>) =>
    reg(name, title, `${description} PAID: ${cfg.prices[name]} USD per call via x402 (proposed price). The first call without payment returns a payment-required result (isError) listing what to pay; retry with params._meta["x402/payment"].`, shape, async (a, extra) => {
      if (!deps.gate) return fail('payments_not_configured', 'paid tools are not enabled on this server (no payee configured)');
      const metaPayment = extra._meta?.['x402/payment'] as PaymentPayload | undefined;
      const payment = metaPayment ?? ctx.headerPayment;
      const res = await deps.gate(
        new Request(`${cfg.publicUrl}/tools/${name}`),
        { usd: cfg.prices[name], description: `Floor MCP tool ${name}`, mimeType: 'application/json' },
        async () => {
          try {
            return Response.json(ser(await compute(a)));
          } catch (e) {
            // a failed run is not charged (the gate releases the receipt on status >= 400)
            return Response.json({ error: e instanceof DataError || e instanceof ApiError ? e.message : 'tool failed' }, { status: 400 });
          }
        },
        { payment },
      );
      if (res.status === 402) {
        const body = (await res.json()) as PaymentRequired;
        ctx.paymentRequired = res.headers.get('PAYMENT-REQUIRED') ?? undefined;
        return { isError: true, content: [{ type: 'text', text: JSON.stringify(body) }], structuredContent: body as unknown as Record<string, unknown> };
      }
      if (res.status >= 400) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        return fail(res.status === 503 ? 'payments_unavailable' : 'tool_failed', b.error ?? 'tool failed');
      }
      const payload = (await res.json()) as Record<string, unknown>;
      const pr = res.headers.get('PAYMENT-RESPONSE');
      ctx.paymentResponse = pr ?? undefined;
      return ok(payload, pr ? { 'x402/payment-response': b64decode(pr) } : undefined);
    });

  paid(
    'quote_protection',
    'Quote protection',
    'Starting split for a deposit, floor and term: floor value, cushion, stock exposure E = min(4 x cushion, deposit), USDT held, the largest single gap absorbed with no rebalance, and stored long-history results for context. Computed from the SDK CPPI maths (m = 4). Not a forecast.',
    protectionShape,
    (a) => {
      const { q } = protection(a);
      return {
        quote: q,
        asUsdt: { floor: usdt(q.floorValue), cushion: usdt(q.cushion), startingExposure: usdt(q.startingExposure), startingCash: usdt(q.startingCash) },
        label: 'Computed live from the SDK CPPI formulas. The reference results below are stored past data and do not predict the future.',
        reference: readLongHistory(cfg.dataRoot),
      };
    },
  );

  paid(
    'backtest',
    'Backtest results',
    'Stored backtest results only, read from docs/data and research/m_study/results: nothing is computed or invented. For a basket and mode: the m = 4 row from the 2018 to 2026 study, the worst and best real windows where a day-by-day path is stored, and the long-history study. Past data.',
    { basket: z.enum(BASKETS), mode: z.enum(MODES).default('close_only') },
    (a) => ({
      basket: a.basket,
      m: 4,
      ...readBacktest(cfg.dataRoot, a.basket, a.mode),
      columns: 'Percent values unless noted. Names are as stored in docs/data/gap_backtest.csv; see docs/RESEARCH_RESULTS.md.',
      longHistory: readLongHistory(cfg.dataRoot),
      caveats: ['Underlying stocks and indices, not bStocks. There is no AAPL bStock.', 'Assumes full weekend gaps and 0% stablecoin yield.', 'Past data. It does not predict the future.'],
    }),
  );

  paid(
    'simulate_gap',
    'Simulate a gap',
    'What an instant fall of the stock holdings by gapBps (before any rebalance) does to a position that has just opened: value after, whether it ends below the floor, and the shortfall. Arithmetic from the SDK maths, not a forecast.',
    { ...protectionShape, gapBps: z.number().int().min(1).max(10_000).describe('Fall in basis points, e.g. 2500 = 25%') },
    (a) => gapWhatIf(a),
  );

  return server;
}
