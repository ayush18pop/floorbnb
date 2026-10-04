import { isMarketOpen } from "@floor/sdk";
import { ASSETS, assetBySymbol } from "./assets";
import { wad } from "./format";
import { DEFAULT_LIMITS } from "../create-validation";
import type {
  Address, AssetSymbol, CreateParams, CreateProgress, CreateResult, ExitKind, Hex, Holding, KeeperRun,
  KeeperStatus, PositionSource, PositionView, SignerKind, ValuePoint, VaultEvent, VaultStatus,
} from "./types";

/**
 * MOCK SOURCE. Everything here is EXAMPLE data for layout and review: invented positions, invented
 * prices, invented hashes. Every screen that renders it shows an EXAMPLE label (see components/app/ui.tsx).
 * It is typed to the same views the contracts expose, so the swap to the SDK/chain is a data change only.
 */
const OWNER = "0x1111111111111111111111111111111111111111" as Address;
const hex = (seed: string, len: number) => {
  let h = 2166136261;
  let out = "";
  for (let i = 0; out.length < len; i++) {
    h = Math.imul(h ^ (seed.charCodeAt(i % seed.length) + i), 16777619) >>> 0;
    out += h.toString(16).padStart(8, "0");
  }
  return out.slice(0, len);
};
const tx = (s: string) => `0x${hex(`tx${s}`, 64)}` as Hex;
const addr = (prefix: string, s: string) => `0x${prefix}${hex(`a${s}`, 40 - prefix.length)}` as Address;

/** Example prices in USDT per token. Invented. */
const PX: Record<AssetSymbol, number> = { NVDAB: 200, SPCXB: 100, QQQB: 500, SPYB: 650 };
const utc = (s: string) => Math.floor(Date.parse(s + "Z") / 1000);
const YEAR = 365 * 86_400;

const holding = (symbol: AssetSymbol, weightBps: number, value: number, paused = false): Holding => ({
  symbol, token: assetBySymbol(symbol).token, weightBps, value: wad(value), amount: wad(value / PX[symbol]), paused,
});

type Spec = {
  id: Address; assets: [AssetSymbol, number][]; deposit: number; floorPct: number; V: number; exposure: number;
  vaultStatus: VaultStatus; start: string; asOf: string; tradingOpen: boolean; lastRebalance: string;
};

function build(s: Spec): PositionView {
  const floor = (s.deposit * s.floorPct) / 100;
  const cushion = Math.max(s.V - floor, 0);
  const target = Math.min(4 * cushion, s.V);
  const start = utc(s.start);
  return {
    status: { vault: s.id, V: wad(s.V), floor: wad(floor), cushion: wad(cushion), exposure: wad(s.exposure), target: wad(s.vaultStatus === "Closed" ? 0 : target), needsRebalance: Math.abs(s.exposure - target) > s.V * 0.01 && s.vaultStatus === "Active", tradingOpen: s.tradingOpen },
    owner: OWNER, vaultStatus: s.vaultStatus, deposit: wad(s.deposit), start, maturity: start + YEAR, asOf: utc(s.asOf),
    usdtBalance: wad(s.V - s.exposure),
    holdings: s.assets.map(([sym, w]) => holding(sym, w, (s.exposure * w) / 10_000)),
    lastRebalance: utc(s.lastRebalance),
  };
}

const IDS = {
  active: addr("7a3f", "active"), weekend: addr("2b81", "weekend"), lock: addr("9ce4", "lock"), closed: addr("44d0", "closed"),
};

const SPECS: Spec[] = [
  { id: IDS.active, assets: [["NVDAB", 4000], ["SPCXB", 3000], ["QQQB", 3000]], deposit: 10_000, floorPct: 90, V: 10_412.3, exposure: 5_649.2, vaultStatus: "Active", start: "2026-10-05T14:58", asOf: "2026-10-07T16:05", tradingOpen: true, lastRebalance: "2026-10-07T16:02" },
  { id: IDS.weekend, assets: [["NVDAB", 10_000]], deposit: 10_000, floorPct: 90, V: 10_388.04, exposure: 5_713.42, vaultStatus: "Active", start: "2026-10-05T14:40", asOf: "2026-10-10T12:00", tradingOpen: false, lastRebalance: "2026-10-09T17:12" },
  { id: IDS.lock, assets: [["QQQB", 5000], ["SPCXB", 5000]], deposit: 10_000, floorPct: 90, V: 9_000, exposure: 0, vaultStatus: "Active", start: "2026-10-05T14:52", asOf: "2026-11-23T16:00", tradingOpen: true, lastRebalance: "2026-11-19T15:44" },
  { id: IDS.closed, assets: [["NVDAB", 5000], ["QQQB", 5000]], deposit: 5_000, floorPct: 90, V: 5_610.8, exposure: 0, vaultStatus: "Closed", start: "2026-10-05T15:01", asOf: "2026-12-01T16:30", tradingOpen: true, lastRebalance: "2026-11-30T16:10" },
];

/** Deterministic noise. */
const rnd = (seed: number) => { let s = seed; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32) - 0.5; };

function series(from: string, to: string, keys: [number, number][], steps: number, noise: number, seed: number, minV?: number): ValuePoint[] {
  const a = utc(from), b = utc(to), r = rnd(seed);
  const out: ValuePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    let v = keys[keys.length - 1][1];
    for (let k = 0; k < keys.length - 1; k++) if (f >= keys[k][0] && f <= keys[k + 1][0]) { const u = (f - keys[k][0]) / (keys[k + 1][0] - keys[k][0]); v = keys[k][1] + u * (keys[k + 1][1] - keys[k][1]); }
    v += r() * noise * (i === 0 || i === steps ? 0 : 1);
    if (minV !== undefined) v = Math.max(v, minV);
    out.push({ t: Math.round(a + f * (b - a)), v: Math.round(v * 100) / 100 });
  }
  out[out.length - 1].v = keys[keys.length - 1][1];
  return out;
}

const HISTORY: Record<string, ValuePoint[]> = {
  [IDS.active]: series("2026-10-05T15:00", "2026-10-07T16:05", [[0, 10_000], [1, 10_412.3]], 48, 25, 3),
  [IDS.weekend]: series("2026-10-05T14:40", "2026-10-10T12:00", [[0, 10_000], [0.2, 10_180], [0.45, 10_520], [0.7, 10_960], [0.78, 10_900], [1, 10_388.04]], 90, 40, 5),
  [IDS.lock]: series("2026-10-05T15:00", "2026-11-23T16:00", [[0, 10_000], [0.1, 10_450], [0.25, 10_200], [0.45, 9_900], [0.6, 9_450], [0.85, 9_010], [1, 9_000]], 80, 45, 9, 9_000),
  [IDS.closed]: series("2026-10-05T15:01", "2026-12-01T16:30", [[0, 5_000], [0.4, 5_300], [0.7, 5_700], [1, 5_610.8]], 80, 30, 11),
};

type RB = { vault: Address; at: string; sym: AssetSymbol; buy: boolean; usdt: number; stockPctBefore?: number; stockPctAfter?: number; trigger?: string; signer?: SignerKind; lock?: boolean };
const RBS: RB[] = [
  { vault: IDS.active, at: "2026-10-05T15:31", sym: "NVDAB", buy: true, usdt: 1600, trigger: "First rebalance: stock target 4,000 USDT, held 0" },
  { vault: IDS.active, at: "2026-10-05T15:32", sym: "SPCXB", buy: true, usdt: 1200, trigger: "First rebalance: stock target 4,000 USDT, held 0" },
  { vault: IDS.active, at: "2026-10-05T15:33", sym: "QQQB", buy: true, usdt: 1200, trigger: "First rebalance: stock target 4,000 USDT, held 0" },
  { vault: IDS.active, at: "2026-10-06T18:40", sym: "QQQB", buy: true, usdt: 212.4, stockPctBefore: 51.8, stockPctAfter: 53.9, trigger: "Stock was under target by more than the 2% buy band", signer: "agentic" },
  { vault: IDS.active, at: "2026-10-07T16:02", sym: "NVDAB", buy: false, usdt: 320.11, stockPctBefore: 58, stockPctAfter: 54, trigger: "Stock was over target by more than the 1% sell band" },
  { vault: IDS.weekend, at: "2026-10-05T15:30", sym: "NVDAB", buy: true, usdt: 4000, trigger: "First rebalance: stock target 4,000 USDT, held 0" },
  { vault: IDS.weekend, at: "2026-10-09T17:12", sym: "NVDAB", buy: true, usdt: 402, stockPctBefore: 51.2, stockPctAfter: 55, trigger: "Stock was under target by more than the 2% buy band" },
  { vault: IDS.lock, at: "2026-10-05T15:34", sym: "QQQB", buy: true, usdt: 2000, trigger: "First rebalance: stock target 4,000 USDT, held 0" },
  { vault: IDS.lock, at: "2026-10-05T15:35", sym: "SPCXB", buy: true, usdt: 2000, trigger: "First rebalance: stock target 4,000 USDT, held 0" },
  { vault: IDS.lock, at: "2026-11-19T15:44", sym: "QQQB", buy: false, usdt: 5961.3, stockPctBefore: 4, stockPctAfter: 0, trigger: "Cushion reached 0: stock target is 0", lock: true },
  { vault: IDS.closed, at: "2026-10-05T15:36", sym: "NVDAB", buy: true, usdt: 1000, trigger: "First rebalance: stock target 2,000 USDT, held 0" },
  { vault: IDS.closed, at: "2026-11-30T16:10", sym: "QQQB", buy: false, usdt: 212.4, stockPctBefore: 40, stockPctAfter: 0, trigger: "Close requested: selling all stock" },
];

const EVENTS: Record<string, VaultEvent[]> = {};
const RUNS: KeeperRun[] = [];
{
  const counters: Record<string, number> = {};
  for (const s of SPECS) EVENTS[s.id] = [{ type: "PositionCreated", time: utc(s.start), tx: tx(`c${s.id}`), deposit: wad(s.deposit), floor: wad((s.deposit * s.floorPct) / 100), maturity: utc(s.start) + YEAR, assets: s.assets.map(([a]) => a) }];
  for (const r of RBS) {
    const time = utc(r.at);
    const id = (counters[r.vault] = (counters[r.vault] ?? 0) + 1);
    const price = PX[r.sym] * (1 + ((id * 37) % 11) / 400);
    const stockUnits = r.usdt / price;
    const signer: SignerKind = r.signer ?? "keeper";
    const costBps = Math.round(assetBySymbol(r.sym).roundTripBps * 5) / 10;
    const T = tx(`${r.vault}${r.at}`);
    EVENTS[r.vault].push({
      type: "Rebalanced", time, tx: T, id, symbol: r.sym, buy: r.buy,
      amountIn: wad(r.buy ? r.usdt : stockUnits), amountOut: wad(r.buy ? stockUnits : r.usdt),
      V: wad(0), exposureTarget: wad(0), caller: signer === "agentic" ? addr("e1", "aw") : addr("91c", "keeper"), signer,
      minOut: wad((r.buy ? stockUnits : r.usdt) * 0.997), costBps, stockPctBefore: r.stockPctBefore, stockPctAfter: r.stockPctAfter, trigger: r.trigger,
    });
    RUNS.push({
      time, vault: r.vault, symbol: r.sym, buy: r.buy,
      amountIn: r.buy ? r.usdt : Math.round(stockUnits * 100) / 100, amountInUnit: r.buy ? "USDT" : r.sym,
      minOut: Math.round((r.buy ? stockUnits : r.usdt) * 0.997 * 100) / 100,
      received: Math.round((r.buy ? stockUnits : r.usdt) * 100) / 100, receivedUnit: r.buy ? r.sym : "USDT",
      costBps, signer, tx: T, cashLock: r.lock,
    });
    if (r.lock) EVENTS[r.vault].push({ type: "CashLock", time: time + 1, tx: T, usdtOut: wad(r.usdt) });
  }
  EVENTS[IDS.closed].push({ type: "CloseRequested", time: utc("2026-11-30T15:50"), tx: tx("cr") }, { type: "Closed", time: utc("2026-12-01T16:30"), tx: tx("cl"), usdtOut: wad(5610.8) });
  for (const k of Object.keys(EVENTS)) EVENTS[k].sort((a, b) => b.time - a.time);
  RUNS.sort((a, b) => b.time - a.time);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function mockSource(): PositionSource {
  const positions = SPECS.map(build);
  return {
    kind: "mock",
    assets: async () => ASSETS,
    listPositions: async () => positions,
    getPosition: async (v) => positions.find((p) => p.status.vault.toLowerCase() === v.toLowerCase()) ?? null,
    getEvents: async (v) => EVENTS[positions.find((p) => p.status.vault.toLowerCase() === v.toLowerCase())?.status.vault ?? ""] ?? [],
    getHistory: async (v) => HISTORY[positions.find((p) => p.status.vault.toLowerCase() === v.toLowerCase())?.status.vault ?? ""] ?? [],
    keeperStatus: async (): Promise<KeeperStatus> => {
      const now = Math.floor(Date.now() / 1000);
      return { online: true, lastRunTime: RUNS[0].time, tradingOpen: isMarketOpen(now), rebalancesToday: 14, heartbeatAgeSeconds: 20 };
    },
    keeperRuns: async (limit = 20) => RUNS.slice(0, limit),
    createLimits: async () => DEFAULT_LIMITS,
    chainTime: async () => Math.floor(Date.now() / 1000),
    createPosition: async (p: CreateParams, onProgress: (e: CreateProgress) => void): Promise<CreateResult> => {
      const approveTx = tx(`ap${p.amount}${p.floorBps}`), createTx = tx(`cp${p.amount}${p.floorBps}${p.assets.join()}`);
      onProgress({ step: "approve", state: "wallet" }); await sleep(700);
      onProgress({ step: "approve", state: "pending", tx: approveTx }); await sleep(900);
      onProgress({ step: "approve", state: "done", tx: approveTx });
      onProgress({ step: "create", state: "wallet" }); await sleep(700);
      onProgress({ step: "create", state: "pending", tx: createTx }); await sleep(1100);
      onProgress({ step: "create", state: "done", tx: createTx });
      return { vault: addr("7a3f", `new${p.amount}`), approveTx, createTx };
    },
    exit: async (_v: Address, kind: ExitKind) => { await sleep(900); return tx(`exit${kind}`); },
  };
}
