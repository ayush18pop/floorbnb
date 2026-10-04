import { describe, expect, it } from "vitest";
import { toKeeperRun, toKeeperStatus } from "./keeper-runs";

const base = { vault: "0x00000000000000000000000000000000000000aa", symbol: "NVDAB", tx: "0x01", time: 1000 } as const;
const KEEPER = "0x90f79bf6eb2c4f870365e785982e1f101e93b906";

describe("keeper log from chain events", () => {
  it("a buy spends USDT and receives the stock", () => {
    const r = toKeeperRun({ ...base, buy: true, amountIn: 22n * 10n ** 18n, amountOut: 93_492_561_146_040_362n, caller: KEEPER }, new Set([KEEPER]));
    expect(r).toMatchObject({ buy: true, amountIn: 22, amountInUnit: "USDT", receivedUnit: "NVDAB", signer: "keeper" });
    expect(r.received).toBeCloseTo(0.093492, 6);
    expect(r.minOut).toBeUndefined();
    expect(r.costBps).toBeUndefined();
  });
  it("a sell spends the stock and receives USDT; an unknown caller is public", () => {
    const r = toKeeperRun({ ...base, buy: false, amountIn: 50_342_444_768_596_088n, amountOut: 10_018_979_427_582_445_713n, caller: "0x00000000000000000000000000000000000000bb" }, new Set([KEEPER]));
    expect(r).toMatchObject({ buy: false, amountInUnit: "NVDAB", receivedUnit: "USDT", signer: "public" });
    expect(r.received).toBeCloseTo(10.018979, 6);
  });
  it("status: offline without a heartbeat, counts the last 24 h, never invents a run time", () => {
    const run = toKeeperRun({ ...base, buy: true, amountIn: 1n, amountOut: 1n, caller: KEEPER }, new Set());
    expect(toKeeperStatus([], 5000, true, null)).toEqual({ online: false, lastRunTime: 0, tradingOpen: true, rebalancesToday: 0, heartbeatAgeSeconds: null });
    expect(toKeeperStatus([run], 1000 + 86_399, false, 30)).toMatchObject({ online: true, lastRunTime: 1000, rebalancesToday: 1, tradingOpen: false });
    expect(toKeeperStatus([run], 1000 + 86_400, false, 601).rebalancesToday).toBe(0);
    expect(toKeeperStatus([run], 2000, false, 601).online).toBe(false);
    expect(toKeeperStatus([run], 2000, false, 42).heartbeatAgeSeconds).toBe(42);
  });
});

import { scanNote } from "./keeper-runs";
import { receivedText } from "./format";
describe("wiring text", () => {
  it("scanNote: age from the heartbeat, never guessed", () => {
    expect(scanNote(null)).toBe("no heartbeat seen");
    expect(scanNote(12)).toBe("last scan 12 s ago");
    expect(scanNote(300)).toBe("last scan 5 min ago");
  });
  it("receivedText: exit in kind lists tokens with value and a total; close to USDT shows the USDT", () => {
    const w = (n: number) => BigInt(n) * 10n ** 18n;
    expect(receivedText({ usdt: w(5), tokens: [{ symbol: "NVDAB", amount: 12_345_600_000_000_000_000n, value: w(50) }] }, "exitInKind")).toBe("You received 12.3456 NVDAB (≈ 50.00 USDT at the 10-minute average) + 5.00 USDT. Total ≈ 55.00 USDT.");
    expect(receivedText({ usdt: w(52), tokens: [] }, "closeToUSDT")).toBe("You received 52.00 USDT.");
  });
});
