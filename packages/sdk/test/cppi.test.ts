import { describe, expect, it } from 'vitest';
import { cppi, WAD } from '../src';
import vectors from './cppi-vectors.json';
import planVectors from './plan-vectors.json';

const P = 100n * WAD;
const e = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 12n; // n token units, 6 dp precision

function state(stock: bigint, usdt: bigint, F: bigint) {
  const V = usdt + cppi.valueOf(stock, P);
  const C = cppi.cushion(V, F);
  const E = cppi.exposureTarget(C, V);
  return { V, C, E, T: cppi.assetTarget(E, 10_000) };
}

describe('CONTRACTS.md section 5 worked example (WAD)', () => {
  const F = cppi.floorFor(10_000n * WAD, 9000);
  it('F rounds to 9,000', () => expect(F).toBe(9000n * WAD));
  it('step 0: deposit', () => {
    const s = state(0n, 10_000n * WAD, F);
    expect([s.V, s.C, s.E, s.T]).toEqual([10_000n * WAD, 1000n * WAD, 4000n * WAD, 4000n * WAD]);
    expect(cppi.buyAmount(0n, s.T, s.V, 10_000n * WAD, 200n, 20n * WAD, 2n ** 255n)).toBe(4000n * WAD);
  });
  it('step 1: -10%', () => {
    const stock = 36n * WAD;
    const s = state(stock, 6000n * WAD, F);
    expect([s.V, s.C, s.E]).toEqual([9600n * WAD, 600n * WAD, 2400n * WAD]);
    const sell = cppi.sellAmount(cppi.valueOf(stock, P), s.T, s.V, s.E, 100n, 20n * WAD, 2n ** 255n);
    expect(sell).toBe(1200n * WAD);
    expect(cppi.sellAmountIn(sell, P, stock)).toBe(12n * WAD);
  });
  it('step 2: -10% again', () => {
    const stock = 216n * WAD / 10n;
    const s = state(stock, 7200n * WAD, F);
    expect([s.V, s.C, s.E]).toEqual([9360n * WAD, 360n * WAD, 1440n * WAD]);
    expect(cppi.sellAmount(cppi.valueOf(stock, P), s.T, s.V, s.E, 100n, 20n * WAD, 2n ** 255n)).toBe(720n * WAD);
  });
  it('step 3: -25% gap, cash lock', () => {
    const stock = 108n * WAD / 10n;
    const s = state(stock, 7920n * WAD, F);
    expect([s.V, s.C, s.E]).toEqual([9000n * WAD, 0n, 0n]);
    expect(cppi.sellAmount(cppi.valueOf(stock, P), s.T, s.V, s.E, 100n, 20n * WAD, 2n ** 255n)).toBe(1080n * WAD);
  });
  it("step 0': +10%", () => {
    const stock = 44n * WAD;
    const s = state(stock, 6000n * WAD, F);
    expect([s.V, s.C, s.E]).toEqual([10_400n * WAD, 1400n * WAD, 5600n * WAD]);
    expect(cppi.buyAmount(cppi.valueOf(stock, P), s.T, s.V, 6000n * WAD, 200n, 20n * WAD, 2n ** 255n)).toBe(1200n * WAD);
  });
});

describe('CONTRACTS.md section 5 worked example (float)', () => {
  it.each([
    [10_000, 4000],
    [9600, 2400],
    [9360, 1440],
    [9000, 0],
    [10_400, 5600],
  ])('V=%d gives E=%d', (V, E) => {
    expect(cppi.cppiFloat(V, 9000).E).toBeCloseTo(E, 9);
  });
});

describe('Solidity vectors (CPPIMath.sol outputs)', () => {
  it('has vectors with real coverage', () => {
    expect(vectors.vectors.length).toBe(150);
    expect(vectors.vectors.some((v) => v.sell !== '0')).toBe(true);
    expect(vectors.vectors.some((v) => v.buy !== '0')).toBe(true);
  });
  it.each(vectors.vectors.map((v, i) => [i, v] as const))('vector %i matches bit for bit', (_i, v) => {
    const b = (s: string) => BigInt(s);
    const F = cppi.floorFor(b(v.D), b(v.bps));
    expect(F).toBe(b(v.F));
    const Ei = cppi.valueOf(b(v.bal), b(v.price));
    expect(Ei).toBe(b(v.Ei));
    const st = cppi.computeState(b(v.usdt), [b(v.bal)], [b(v.price)], F);
    expect(st.V).toBe(b(v.V));
    expect(st.C).toBe(b(v.C));
    expect(st.estar).toBe(b(v.E));
    const T = cppi.assetTarget(st.estar, b(v.w));
    expect(T).toBe(b(v.T));
    const sell = cppi.sellAmount(Ei, T, st.V, st.estar, b(v.sb), b(v.mt), b(v.mx));
    const buy = cppi.buyAmount(Ei, T, st.V, b(v.usdt), b(v.bb), b(v.mt), b(v.mx));
    expect(sell).toBe(b(v.sell));
    expect(buy).toBe(b(v.buy));
    const sin = cppi.sellAmountIn(sell, b(v.price), b(v.bal));
    expect(sin).toBe(b(v.sin));
    expect(cppi.minOut(sin, b(v.price), b(v.tol), false)).toBe(b(v.minOutSell));
    expect(cppi.minOut(buy, b(v.price), b(v.tol), true)).toBe(b(v.minOutBuy));
    expect(cppi.amountInOk(b(v.given), sin)).toBe(v.inRange);
  });
});

describe('properties', () => {
  // deterministic xorshift so failures reproduce
  let s = 0x9e3779b9n;
  const rnd = (mod: bigint) => {
    s ^= (s << 13n) & 0xffffffffffffffffn;
    s ^= s >> 7n;
    s ^= (s << 17n) & 0xffffffffffffffffn;
    return s % mod;
  };
  it('E* <= V, E* <= M*C, F >= D*bps/BPS, sum T <= E*', () => {
    for (let i = 0; i < 2000; i++) {
      const D = rnd(10n ** 24n) + 1n;
      const bps = 5000n + rnd(4801n);
      const V = rnd(2n * D) + 1n;
      const F = cppi.floorFor(D, bps);
      expect(F * 10_000n >= D * bps).toBe(true);
      expect((F - 1n) * 10_000n < D * bps).toBe(true);
      const C = cppi.cushion(V, F);
      const E = cppi.exposureTarget(C, V);
      expect(E <= V).toBe(true);
      expect(E <= 4n * C).toBe(true);
      const w1 = 1n + rnd(9999n);
      expect(cppi.assetTarget(E, w1) + cppi.assetTarget(E, 10_000n - w1) <= E).toBe(true);
    }
  });
  it('mulDiv rejects zero divisor', () => {
    expect(() => cppi.mulDiv(1n, 1n, 0n)).toThrow();
  });
});

describe('planSwap vs FloorVault._plan (real Solidity vectors)', () => {
  const b = (s: string) => BigInt(s);
  it('has vectors with real coverage', () => {
    expect(planVectors.vectors.length).toBe(120);
    expect(planVectors.vectors.some((v) => v.buy)).toBe(true);
    expect(planVectors.vectors.some((v) => !v.buy && v.value !== '0')).toBe(true);
    // the new rule: a full-unwind sale below minTrade
    expect(planVectors.vectors.some((v) => v.estar === '0' && v.value !== '0' && b(v.value) < b(v.mt))).toBe(true);
    // Pashov 02 #4: a CPPI sell below minTrade; #8: a suspended sell
    expect(planVectors.vectors.some((v) => v.estar !== '0' && v.active && !v.buy && v.value !== '0' && b(v.value) < b(v.mt))).toBe(true);
    expect(planVectors.vectors.some((v) => v.noPrice && v.estar !== '0' && v.active && !v.closing)).toBe(true);
  });
  it.each(planVectors.vectors.map((v, i) => [i, v] as const))('vector %i matches bit for bit', (_i, v) => {
    const r = cppi.planSwap({
      Ei: b(v.Ei), Ti: b(v.Ti), V: b(v.V), estarI: v.active ? b(v.estar) : 0n, usdtBal: b(v.usdtBal), price: b(v.price),
      bal: b(v.bal), sellBandBps: b(v.sb), buyBandBps: b(v.bb), bandMul: b(v.mul), minTrade: b(v.mt), dust: b(v.dust),
      maxTradeValue: b(v.mx), anyFailed: v.anyFailed, weightBps: b(v.w), noPrice: v.noPrice, unwinding: !v.active || v.closing,
    });
    expect(r).toEqual({ buy: v.buy, value: b(v.value), amountIn: b(v.amountIn) });
  });
  it('E_i == dust is kept, E_i == dust + 1 wei is sold, in a full unwind', () => {
    const base = { Ti: 0n, V: 1000n * WAD, estarI: 0n, usdtBal: 0n, price: WAD, bal: 0n, sellBandBps: 100n, buyBandBps: 200n, bandMul: 1n, minTrade: 20n * WAD, dust: WAD, maxTradeValue: 1000n * WAD };
    expect(cppi.planSwap({ ...base, Ei: WAD }).value).toBe(0n);
    expect(cppi.planSwap({ ...base, Ei: WAD + 1n, bal: WAD + 1n }).value).toBe(WAD + 1n);
  });
});
