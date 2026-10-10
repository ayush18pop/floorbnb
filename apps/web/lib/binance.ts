import { API_URL } from "@/lib/app-config";

/**
 * Binance Web3 RWA data as served by the Floor API (/v1/market, /v1/market/:symbol/candles, /v1/binance/status).
 * Fetchers never throw: they return a result the UI can render (data, "not configured", or a quiet network error).
 * Guards tolerate extra fields and nulls.
 */

export type Underlying = { marketStatus: string | null; price: string | null; change24hPct: string | null; updatedAt: number | null };
export type Profile = { companyName: string | null; ticker: string | null; sector: string | null; description: string | null; logoUrl: string | null; issuer: string | null };
export type MarketAsset = {
  symbol: string;
  address: string;
  price: string | null;
  referencePrice: string | null;
  priceUpdatedAt: number | null;
  marketStatus: string | null;
  deviationBps: number | null;
  underlying: Underlying | null;
  profile: Profile | null;
};
export type Market = { sources: string[]; assets: MarketAsset[] };
export type Candle = { t: number; o: string; h: string; l: string; c: string; v: string };
export type CandlesResponse = { symbol: string; interval: string; source: string | null; candles: Candle[] };
export type BinanceModule = {
  id: string;
  api: string;
  endpoint: string;
  usedBy: string[];
  inProduction: boolean;
  note: string | null;
  calls: number;
  okCalls: number;
  lastOkAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
};
export type BinanceStatus = { configured: boolean; generatedAt: number | null; modules: BinanceModule[] };

export type Fetched<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "not_configured" | "not_found" | "network" | "bad_response" };

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown): string | null => (typeof x === "string" && x.length > 0 ? x : typeof x === "number" && Number.isFinite(x) ? String(x) : null);
const numOrNull = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);

export function parseMarket(j: unknown): Market | null {
  if (!isRec(j) || !Array.isArray(j.assets)) return null;
  const assets: MarketAsset[] = [];
  for (const a of j.assets) {
    if (!isRec(a) || typeof a.symbol !== "string") continue;
    const u = isRec(a.underlying)
      ? { marketStatus: str(a.underlying.marketStatus), price: str(a.underlying.price), change24hPct: str(a.underlying.change24hPct), updatedAt: numOrNull(a.underlying.updatedAt) }
      : null;
    const p = isRec(a.profile)
      ? { companyName: str(a.profile.companyName), ticker: str(a.profile.ticker), sector: str(a.profile.sector), description: str(a.profile.description), logoUrl: str(a.profile.logoUrl), issuer: str(a.profile.issuer) }
      : null;
    assets.push({
      symbol: a.symbol,
      address: typeof a.address === "string" ? a.address : "",
      price: str(a.price),
      referencePrice: str(a.referencePrice),
      priceUpdatedAt: numOrNull(a.priceUpdatedAt),
      marketStatus: str(a.marketStatus),
      deviationBps: numOrNull(a.deviationBps),
      underlying: u,
      profile: p,
    });
  }
  return { sources: strs(j.sources), assets };
}

export function parseCandles(j: unknown): CandlesResponse | null {
  if (!isRec(j) || !Array.isArray(j.candles)) return null;
  const candles: Candle[] = [];
  for (const c of j.candles) {
    if (!isRec(c) || typeof c.t !== "number" || !Number.isFinite(c.t)) continue;
    const close = str(c.c);
    if (close === null || !Number.isFinite(Number(close))) continue;
    candles.push({ t: c.t, o: str(c.o) ?? close, h: str(c.h) ?? close, l: str(c.l) ?? close, c: close, v: str(c.v) ?? "0" });
  }
  candles.sort((a, b) => a.t - b.t);
  return { symbol: typeof j.symbol === "string" ? j.symbol : "", interval: typeof j.interval === "string" ? j.interval : "", source: str(j.source), candles };
}

export function parseStatus(j: unknown): BinanceStatus | null {
  if (!isRec(j) || !Array.isArray(j.modules)) return null;
  const modules: BinanceModule[] = [];
  for (const m of j.modules) {
    if (!isRec(m) || typeof m.id !== "string") continue;
    modules.push({
      id: m.id,
      api: typeof m.api === "string" ? m.api : m.id,
      endpoint: typeof m.endpoint === "string" ? m.endpoint : "",
      usedBy: strs(m.usedBy),
      inProduction: m.inProduction === true,
      note: str(m.note),
      calls: numOrNull(m.calls) ?? 0,
      okCalls: numOrNull(m.okCalls) ?? 0,
      lastOkAt: numOrNull(m.lastOkAt),
      lastErrorAt: numOrNull(m.lastErrorAt),
      lastError: str(m.lastError),
    });
  }
  return { configured: j.configured === true, generatedAt: numOrNull(j.generatedAt), modules };
}

async function get<T>(path: string, parse: (j: unknown) => T | null, signal?: AbortSignal): Promise<Fetched<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { signal, headers: { accept: "application/json" } });
  } catch {
    return { ok: false, kind: "network" };
  }
  if (res.status === 503) return { ok: false, kind: "not_configured" };
  if (res.status === 404) return { ok: false, kind: "not_found" };
  if (!res.ok) return { ok: false, kind: "network" };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, kind: "bad_response" };
  }
  const data = parse(body);
  return data ? { ok: true, data } : { ok: false, kind: "bad_response" };
}

export const fetchMarket = (signal?: AbortSignal) => get("/v1/market", parseMarket, signal);
export const fetchCandles = (symbol: string, interval: "1d" | "4h" = "1d", limit = 90, signal?: AbortSignal) =>
  get(`/v1/market/${encodeURIComponent(symbol)}/candles?interval=${interval}&limit=${limit}`, parseCandles, signal);
export const fetchBinanceStatus = (signal?: AbortSignal) => get("/v1/binance/status", parseStatus, signal);

/** Find an asset by symbol or token address (case-insensitive). */
export function findAsset(m: Market, h: { symbol?: string; token?: string }): MarketAsset | null {
  const addr = h.token?.toLowerCase();
  return m.assets.find((a) => (addr && a.address.toLowerCase() === addr) || (h.symbol && a.symbol.toLowerCase() === h.symbol.toLowerCase())) ?? null;
}

/** Signed basis points: "+12 bps", "−35 bps", "0 bps". */
export function fmtBps(bps: number | null): string {
  if (bps === null) return "n/a";
  const r = Math.round(bps);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)} bps`;
}

/** USD price from a decimal string, 2 decimals (4 under $1). null or unparseable gives "n/a". */
export function fmtPrice(p: string | null): string {
  if (p === null) return "n/a";
  const n = Number(p);
  if (!Number.isFinite(n)) return "n/a";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: n < 1 ? 4 : 2, maximumFractionDigits: n < 1 ? 4 : 2 })}`;
}

/** Normalise a timestamp to ms. Values above 1e11 are taken as ms, smaller ones as seconds (the API does not state the unit for every field). */
export const toMs = (t: number) => (t > 1e11 ? t : t * 1000);

/** "updated 42 s ago", "updated 5 min ago", "updated 3 h ago", "updated 2 d ago"; "no update time reported" when null. */
export function freshness(t: number | null, nowMs: number): string {
  if (t === null) return "no update time reported";
  const s = Math.max(0, Math.round((nowMs - toMs(t)) / 1000));
  if (s < 5) return "updated just now";
  if (s < 90) return `updated ${s} s ago`;
  if (s < 5400) return `updated ${Math.round(s / 60)} min ago`;
  if (s < 129_600) return `updated ${Math.round(s / 3600)} h ago`;
  return `updated ${Math.round(s / 86_400)} d ago`;
}

/** |d| < 50 bps in line, < 200 slight gap, else wide gap. null when there is no deviation. */
export function deviationLabel(bps: number | null): "in line" | "slight gap" | "wide gap" | null {
  if (bps === null || !Number.isFinite(bps)) return null;
  const a = Math.abs(bps);
  return a < 50 ? "in line" : a < 200 ? "slight gap" : "wide gap";
}
