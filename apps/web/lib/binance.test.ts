import { describe, expect, it } from "vitest";
import { deviationLabel, fmtBps, fmtPrice, freshness, findAsset, parseCandles, parseMarket, parseStatus, toMs } from "./binance";

describe("deviationLabel", () => {
  it("uses the 50 / 200 bps cut-offs on the absolute value", () => {
    expect(deviationLabel(0)).toBe("in line");
    expect(deviationLabel(49.9)).toBe("in line");
    expect(deviationLabel(-49)).toBe("in line");
    expect(deviationLabel(50)).toBe("slight gap");
    expect(deviationLabel(-199)).toBe("slight gap");
    expect(deviationLabel(200)).toBe("wide gap");
    expect(deviationLabel(-1500)).toBe("wide gap");
    expect(deviationLabel(null)).toBeNull();
  });
});

describe("formatters", () => {
  it("formats bps with a sign", () => {
    expect(fmtBps(12.4)).toBe("+12 bps");
    expect(fmtBps(-35)).toBe("−35 bps");
    expect(fmtBps(0)).toBe("0 bps");
    expect(fmtBps(null)).toBe("n/a");
  });
  it("formats prices", () => {
    expect(fmtPrice("1234.5")).toBe("$1,234.50");
    expect(fmtPrice("0.5")).toBe("$0.5000");
    expect(fmtPrice(null)).toBe("n/a");
    expect(fmtPrice("abc")).toBe("n/a");
  });
  it("formats freshness for seconds and ms timestamps", () => {
    const now = 1_800_000_000_000;
    expect(freshness(now / 1000 - 42, now)).toBe("updated 42 s ago");
    expect(freshness(now - 42_000, now)).toBe("updated 42 s ago");
    expect(freshness(now / 1000 - 300, now)).toBe("updated 5 min ago");
    expect(freshness(now / 1000 - 7200, now)).toBe("updated 2 h ago");
    expect(freshness(now / 1000 - 3 * 86400, now)).toBe("updated 3 d ago");
    expect(freshness(now / 1000 + 10, now)).toBe("updated just now");
    expect(freshness(null, now)).toBe("no update time reported");
    expect(toMs(1_800_000_000)).toBe(1_800_000_000_000);
  });
});

describe("parsers", () => {
  it("parses a market and tolerates nulls and extra fields", () => {
    const m = parseMarket({
      sources: ["a"],
      extra: 1,
      assets: [
        { symbol: "NVDAB", address: "0xAbC", price: "100", referencePrice: null, priceUpdatedAt: null, deviationBps: 12, underlying: { marketStatus: null, price: "101", change24hPct: "0.5", updatedAt: 5, raw: {} }, profile: { companyName: "NVIDIA", description: "x" }, more: true },
        { nope: true },
        { symbol: "SPYB", underlying: null, profile: null },
      ],
    });
    expect(m?.assets).toHaveLength(2);
    expect(m?.assets[0].underlying?.marketStatus).toBeNull();
    expect(m?.assets[0].profile?.companyName).toBe("NVIDIA");
    expect(m?.assets[0].profile?.logoUrl).toBeNull();
    expect(m?.assets[1].deviationBps).toBeNull();
    expect(parseMarket(null)).toBeNull();
    expect(parseMarket({ assets: "x" })).toBeNull();
  });
  it("finds assets by address or symbol", () => {
    const m = parseMarket({ assets: [{ symbol: "NVDAB", address: "0xAbC" }] })!;
    expect(findAsset(m, { token: "0xabc" })?.symbol).toBe("NVDAB");
    expect(findAsset(m, { symbol: "nvdab" })?.symbol).toBe("NVDAB");
    expect(findAsset(m, { symbol: "QQQB", token: "0x1" })).toBeNull();
  });
  it("parses candles, drops bad rows and sorts by time", () => {
    const c = parseCandles({ symbol: "X", interval: "1d", source: "s", candles: [{ t: 2, o: "1", h: "2", l: "1", c: "2", v: "3" }, { t: 1, c: "1.5" }, { t: "x", c: "1" }, { t: 3, c: null }] });
    expect(c?.candles.map((x) => x.t)).toEqual([1, 2]);
    expect(c?.candles[0].o).toBe("1.5");
    expect(parseCandles({})).toBeNull();
  });
  it("parses status", () => {
    const s = parseStatus({ configured: false, generatedAt: 1, modules: [{ id: "m", api: "A", endpoint: "/e", usedBy: ["x", 3], inProduction: true, note: null, calls: 3, okCalls: 2, lastOkAt: 9, lastErrorAt: null, lastError: null }, 5] });
    expect(s?.configured).toBe(false);
    expect(s?.modules).toHaveLength(1);
    expect(s?.modules[0].usedBy).toEqual(["x"]);
    expect(parseStatus([])).toBeNull();
  });
});
