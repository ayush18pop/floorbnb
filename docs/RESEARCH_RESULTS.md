# Vault check: trading cost and price gaps (2026-10-02)

Scripts: `slippage_probe.py` (live quotes, appends `slippage_runs.jsonl`), `gap_backtest.py`
(writes `gap_backtest.csv`). Only one cost run so far: Thursday 12:06 UTC (US pre-market).
**Weekend cost run still missing.**

## 1. Round-trip cost (buy then sell back), live aggregator quotes, bps

| Token | $1k | $10k | $50k |
|---|---|---|---|
| QQQB | ~0 | 0.7 | no quote |
| NVDAB | 2.8 | 5.9 | 10.1 |
| SPCXB | 3.1 | 6.0 | 7.7 |
| SPYB | 1.1 | 6.6 | 13.6 |
| TSLAB | 18 | 46 | 27 (noisy) |
| CRCLB | 53 | 38 | 132 |
| MUB | 137 | 406 | 2,124 |
| AAPLon / NVDAon / SPCXon | 2,354 / 214 / 624 | no quote / 8,689 / 8,442 | — |

- Usable for a vault by these aggregator quotes: **NVDAB, SPCXB, QQQB, SPYB**. Floor enables only NVDAB, SPCXB and QQQB (SPYB is not offered, `apps/web/lib/adapters/assets.ts`).
- These are aggregator quotes, a best case. The live route is direct PancakeSwap v3, measured on a fork 2026-10-02 at 100 USDT: about 49 bps round trip for NVDAB and SPCXB, about 1 bp for QQQB (`ops/spikes/RESULTS-taker.md`, `reviews/claims-01.md`). TSLAB is borderline. MUB/CRCLB are not.
- **Ondo tokens are unusable through the aggregator right now**: the issuer RFQ never quoted. No AAPL bStock exists.

## 2. Did a 90% floor hold? 93 one-year windows, 2018 → 2026-10, real daily prices

Assumes: full weekend gaps hit (no weekend trading), 0% stablecoin yield, calm-market trading costs.
"Breach" = value ever below the floor. Breach rate per multiplier m, rebalancing at open and close:

| Basket | m=3 | m=4 | m=5 | m=6 | m=8 | Up-year capture at m=4 (90% floor only) | Bad-year vault vs hold |
|---|---|---|---|---|---|---|---|
| NVDA | 0% | 0% | 0% | 12% | 20% | 45% | −9.9% vs −36% |
| QQQ | 0% | 0% | 0% | 0% | 0% | 32% | −7.4% vs −19% |
| TSLA | 0% | 0% | 0% | 0% | 9% | −3% (whipsaw) | −9.7% vs −27% |
| NVDA+TSLA+QQQ | 0% | 0% | 0% | 0% | 0% | 42% | −8.6% vs −17% |

- Worst downward gaps since 2018: NVDA −19.3% (2018-11-16), TSLA −14.9%, AAPL −13.0%, QQQ −9.5%,
  SPCX −10.3% (only 76 days of history). m=4 survives a single gap smaller than about 24% (not a guarantee; see research/m_study2/REPORT.md: 0.44% of one-year windows at a 90% floor ended more than 1 point below it, 95% CI 0.07% to 0.93%).
- Worst breach at m=8 was −13.4% against a −10% floor.
- Choppy assets (TSLA) cost the most: the vault buys high and sells low. Its median one-year
  return at m=4 was −6.8%, versus +22% for holding.
- Once a window hits the floor, the vault sits in stablecoins for the rest of the year ("cash lock").

## Not yet tested
- Weekend trading cost; costs during a crash, when liquidity thins.
- On-chain token gaps or issuer pauses that differ from the real stock.
- Whether Ondo RFQ will fill for a contract (vault) address.
