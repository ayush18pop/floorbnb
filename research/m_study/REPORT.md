# Choosing the CPPI multiplier m: long-history evidence (agent MSTUDY)

Branch `agent/MSTUDY`. Everything is simulation on historical daily prices. Nothing on-chain was touched.
Data pulled 2026-10-03 from yfinance (no rate limiting, no series missing; see section 2).

## 0. Plain-English summary (read this first)

**What m does.** m sets how hard the vault leans into the stock: stock exposure = m x (value minus floor). The one
thing m really controls is the *size of a one-day drop the floor can survive*: roughly 1/m. At m=4 that is a 25%
one-day drop; at m=3, 33%; at m=6, 17%. We tested that rule directly and it holds (section 6): in 1,552 of 1,581
one-year windows with no single-day drop bigger than 25%, the vault never ended more than 1 point below its 90% floor;
all 7 such failures at m=4 were in the 29 windows that contained a one-day drop bigger than 25%.

**Is m=4 still defensible?** Yes, for diversified index/ETF and large-cap baskets, with a clear caveat for single
stocks. Over 98 years of S&P 500 data (98 one-year windows) m=4 never finished below the 90% floor. Across all 38
equity series (1,581 non-overlapping years, 1928-2026) m=4 ended more than 1 point below the floor in 0.44% of years
(95% CI 0.11% to 0.91%) and ended even slightly below the floor in 2.85% (1.75% to 4.30%). Single stocks are the weak
spot: real one-day drops of 30% to 61% happen (AIG -61% 2008, AAPL -52% 2000, NFLX -41% 2004, Citi -39% 2009), and m=4
cannot survive those. "The floor held in 93 of 93 windows" is true of the 2018-2026 sample but should not be read as
"the floor always holds".

**Which user wants which m?** If you accept losing X% at most, the floor sets X and m sets how much upside you keep
(table in section 5): m=2 keeps ~22% of the upside in up years, m=3 ~34%, m=4 ~42%, m=5 ~47%, m=6 ~51% (all at a
90% floor), while the chance of ending clearly below the floor rises from ~0% (m<=3) to 0.4% (m=4), 1.1% (m=5) and
1.5% (m=6). Going above m=4 buys little (+5 points of upside for m=5) and breach risk roughly doubles. A lower floor
(more loss tolerance) is a much stronger lever on upside than a higher m.

**Is a user-selectable dial worth building?** Marginal. The floor is already user-selectable. A second dial for m
(Conservative 2 / Balanced 3 / Growth 4) would be defensible, but it is not needed to be safe, and we found no
evidence for tiers above 4. The "gradient floor" ideas (min of two CPPI lines; two sleeves with different floors) did
not beat a plain fixed m at the same blended floor: the min-form is mathematically redundant, and the sleeves matched
fixed m=3 at an 80% floor to within noise. Recommendation: keep m=4 as a constant for the hackathon; do not add m as a
parameter now. If you ever add tiers, cap at 4 and show 3 as the default for single-stock baskets.

**Is ML worth building?** No. Simple rules (m = k / trailing worst gap, m = k / trailing volatility) and a gradient-
boosting model all failed to beat plain fixed m out of sample by more than the bootstrap noise (section 7). The model
did forecast the size of the worst one-day drop better than the simple rules (rank correlation 0.51 to 0.53 vs 0.33
to 0.44), but that did not translate into better returns at equal breach risk.

**Single biggest caveat.** Daily closing prices are not the on-chain reality: we cannot see intraday paths, trading
halts, token-vs-stock price gaps, or a stock going to zero (survivorship: no delisted names). Real tail events (a
fraud or bankruptcy gap of -80% to -100% in one name) break any m. The 1/m rule is the honest summary of the risk:
the floor is a gap-size guarantee, not an absolute guarantee.

## 1. Headline findings, in one table

| Question | Answer | Where |
|---|---|---|
| Breach rate at m=4 (pooled equities, 90% floor) | 0.44% material, 2.85% any shortfall | T1 |
| Breach rate at m=4, US indices/ETFs only | 0% material, 1.03% any | T1 |
| Breach rate at m=4, single stocks only | 0.61% material, 4.07% any | T1 |
| 1/m rule | Confirmed (0 material breaches without a >1/m one-day drop) | 6, T5, MC3 |
| Does m calibrated pre-2015 hold after? | Yes for a "<=1% material breach" rule (picks m=4 to 4.5; test breach 0 to 0.46%) | 4, T7 |
| Does the 2018+ sample's choice hold earlier? | Not well: picks m=5.5; pre-2018 test material breach 1.28%, worst -21% | 4, T7 |
| Tiers / gradient floor | No gain vs fixed m at the same blended floor | 5, T8 |
| Dynamic m (simple rules) | No gain OOS | 7, T9, T10 |
| ML | No gain OOS | 7, T11, T12 |

## 2. Data

yfinance daily OHLC, `auto_adjust=True` (splits and dividends adjusted), downloaded in `fetch_data.py`; all 42 requested
and extra series downloaded, none missing (`results/T0_data_inventory.csv` has first/last date, days, worst one-day
move for each). Highlights: ^GSPC 1927-12 start (24,806 days), ^IXIC 1971, ^NDX 1985, ^DJI 1992, ^RUT 1987, SPY 1993,
QQQ 1999, plus ^N225 (1965), ^FTSE, ^GDAXI, ^HSI (1987 crash: -33.3% on 1987-10-26), ^KS11; single stocks NVDA 1999,
TSLA 2010, AAPL 1980, MSFT 1986, AMZN 1997, META 2012, GOOGL 2004, AMD 1980, NFLX 2002, INTC 1980, and crash-heavy
CSCO, ORCL, QCOM, C, BAC, AIG, GE, F, XOM, JPM, BA, DIS, WMT; ETFs ARKK, SMH, XLF; non-equity TLT, GLD, BTC-USD (not
used in headline numbers). Baskets (equal weight, daily rebalanced): MAG6+TSLA (2012+), NVDA+TSLA+QQQ (2010+),
Financials-crash C/BAC/AIG/GE/F (1977+), SPY+QQQ+NVDA (1999+).

Crash coverage: 1987 (^GSPC -20.5% on 1987-10-19), 2000-02, 2008 (AIG, Citi, BAC, XLF), 2020, 2022, 1989 and 1997-98
Asia/Europe.

Honest data caveats:
- **Survivorship bias.** The single stocks are mostly survivors/winners (NVDA, AAPL, MSFT, AMZN, META, GOOGL, NFLX, TSLA).
  I added losers/near-misses that still trade (INTC, AIG, C, BAC, F, GE, BA) but not delisted or zero names (Lehman, Bear
  Stearns, WaMu, Enron). So single-stock breach rates are **understated** and upside **overstated**.
- Pre-1982 indices have unreliable "open" prices (open = prior close), so every headline number uses close-to-close
  returns. Close-to-close includes all overnight and weekend gaps in full. Intraday lows are not modelled.
- A few large old single-stock moves (e.g. NVDA -35% 2004-08-06, NFLX -41% 2004-10-15, AMD -38% 1992) were spot-checked
  against high-volume days and look genuine, but yfinance history before ~2000 is not audited here.
- Windows are ~252 trading days; non-overlapping windows start at each series' first date. Different series start
  on different dates, so cross-asset correlation is handled with a calendar-year cluster bootstrap.
- BTC-USD trades on weekends and is not representative; excluded from headline numbers.

## 3. Simulator (`sim.py`)

Re-implements `gap_backtest.py` and CONTRACTS.md section 5, generalised and vectorised:
- Exposure target E* = min(m x max(V-F, 0), V); stable leg earns 0%; F = floor x deposit; deposit D = 1.
- Bands: sell if E exceeds target by >= 1% of V; buy if target exceeds E by >= 2% of V; ignore trades below minTrade
  (0.2% of D, = 20 USDT on 10,000); buys limited to available cash; if V <= F the vault fully unwinds (minTrade ignored).
- Cost: **the stated bps are charged one-way on every trade** (buy and sell), plus a final maturity unwind. This is
  conservative: a "6 bps" setting is a ~12 bps round trip, versus ~1-6 bps measured round trip for NVDAB/SPCXB.
  Grid 2/6/25/50 bps one-way.
- Term: 252 steps, floor can bind and then the vault sits in cash ("cash lock") to term end.
- Rebalance modes: **close** = once per day at the close (the headline; economically the same as one rebalance per day
  anywhere in the day, because the 24h unhedged period is identical; the exact 15:30-19:30 UTC timing is not
  observable with daily data); **window** = once per day at O x (C/O)^0.65 (an *assumption*: ~65% of the open-to-close
  move done by ~17:30 UTC); **weekly** = every 5th close.
- Breach = final value < floor (what the user receives at maturity). Because of swap costs and the 1% sell band a
  floored vault can end a few tenths of a point below F even with no gap. So I report two measures:
  **any shortfall** (value < F) and **material breach** (value < F - 1 point of the deposit, e.g. below 89% for a 90% floor).
- Upside kept ("capture") = mean vault return / mean hold return, over windows where holding was positive.
- Grid: m 1 to 8 step 0.5; floors 80/85/90/95%; costs; 3 modes. Output: `data/hist_windows.csv.gz` (gitignored).

## 4. Historical results (`study_hist.py`, `ana_hist.py`)

Pooled equity series (US index/ETF 10, Intl index 5, single stock 23; 1,581 non-overlapping windows), 90% floor,
6 bps one-way, daily at close. CIs: calendar-year cluster bootstrap of window start year, 1,000 resamples.

| m | breach any | 95% CI | material | 95% CI | worst final | mean ret | median ret | upside kept | bad-yr ret* | cash-locked | turnover (x D/yr) | cost drag |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 0.32% | 0-0.76 | 0.00% | 0-0 | -10.5% | 4.6% | 2.1% | 22% | -5.2% | 0.1% | 0.8 | 0.05% |
| 3 | 1.45% | 0.70-2.35 | 0.06% | 0-0.21 | -12.9% | 7.1% | 2.1% | 34% | -7.4% | 0.7% | 2.1 | 0.13% |
| 4 | 2.85% | 1.75-4.30 | 0.44% | 0.11-0.91 | -18.2% | 8.8% | 1.6% | 42% | -8.8% | 1.2% | 3.7 | 0.22% |
| 5 | 6.33% | 4.13-8.65 | 1.14% | 0.54-1.92 | -20.2% | 9.9% | 0.6% | 47% | -9.5% | 2.7% | 4.8 | 0.29% |
| 6 | 9.55% | 6.86-12.89 | 1.52% | 0.85-2.57 | -20.9% | 10.7% | -0.3% | 51% | -9.8% | 4.7% | 5.3 | 0.32% |
| 8 | 15.88% | 11.89-20.43 | 2.02% | 1.03-3.44 | -27.3% | 11.1% | -2.1% | 53% | -10.0% | 8.6% | 5.5 | 0.33% |

Hold (buy and keep): mean +20.3%, median +13.7%; windows where holding lost >10%: median -24.0% (288 windows).
*bad-yr ret = median vault return in windows where holding lost more than 10%. "Worst final" is the single worst of
1,581 windows (a lower bound on tail risk, not a forecast).

By group at m=4 (material / any / upside kept): US index/ETF 0% / 1.03% / 42% (390 windows); Intl index 0.48% / 0.48% /
41% (207, the 1987 Hong Kong crash); Single stock 0.61% / 4.07% / 42% (984). Mean return vs hold: US 5.2% vs 12.0%; single
stock 11.2% vs 25.9%. Median year: US 3.4% vs hold 11.9%; single stock 0.6% vs 15.9% (the vault gives away most of the
median year: whipsaw cost, as the team already found for TSLA).

Per series at m=4 (`T4`): S&P 500 1928-2026 0/98 breaches, worst -9.6%; SPY 0/33; QQQ 0/27; NVDA 3/27 any-shortfall
(worst -10.5%, none material); TSLA 0/16; AAPL 2/45 material (1982 and 1999); MSFT 1/40 material (1987-10-19, -30%,
worst -15.3%). Baskets (T2): NVDA+TSLA+QQQ 0/16, MAG6+TSLA 0/14, SPY+QQQ+NVDA 0/27, Financials-crash 0/49 material (2/49 any-shortfall); basket upside kept 43% to 55%.

**Sensitivity (T3, m=4, 90% floor, pooled):** costs barely move breach (2.9% to 3.4% any, 0.32% to 0.51% material) but
cut upside kept from 42% (2 bps) to 34% (50 bps one-way) and mean return from 9.0% to 6.6%. **Weekly rebalancing is
worse:** material 1.27% vs 0.44% (it widens the unhedged period, so the 1/m rule is weakened). The assumed-timing
"window" mode gives 0.32% / 2.6% any and 50% upside kept, similar breach to close (the upside difference is an artefact
of how the interpolated price path is built; do not quote it). Floors at m=4: 80% floor keeps 72% of upside; 85% 59%; 90%
42%; 95% 23% (material breach 0.5%, 0.5%, 0.44%, 0.25%).

**Overlapping windows (step 21 days, T6)** give the same picture: m=4 material breach 0.00% (US index/ETF, 4,636
windows), 0.41% (Intl, 2,463), 0.70% (single stock, 11,692); any-shortfall 0.69%, 0.69%, 4.58%. m=6: material 0.19%,
0.77%, 2.18%. Those windows are heavily dependent, so treat them as a robustness check, not as more evidence.

**Block bootstrap (MC1, 6,000 synthetic years per cell, 21-day or 63-day blocks of real daily returns, 90% floor, daily):**
any-shortfall at m=4: S&P 500 0.0%; US index/ETF pool 0.05%; Intl index pool 0.40%; single-stock pool 4.7%. At m=6:
1.3%, 1.1%, 1.3%, 16%. Material at m=4: 0.0%, 0.0%, 0.30%, 1.9% (63-day blocks: 1.25% for single stocks). This agrees
with the historical windows. Weekly rebalancing raises material breach at m=4 to 0.1% to 0.3% (index pools) and
3.1% to 4.3% material (single stocks).

## 5. Risk dial (`dial.py`, `T8`)

Plain-language table, pooled equities, 6 bps one-way, daily. "Upside kept" = share of the gain you would have had by
holding, in years when holding gained. "Breach" = ended more than 1 point below your floor.

| If you are OK losing at most | m=2 (Conservative) | m=3 (Balanced) | m=4 (Growth) | m=5 | m=6 |
|---|---|---|---|---|---|
| 5% (floor 95%) | keeps ~11%, breach 0.0% | ~18%, 0.1% | ~23%, 0.3% | ~27%, 0.6% | ~29%, 0.8% |
| 10% (floor 90%) | ~22%, 0.0% | ~34%, 0.1% | ~42%, 0.4% | ~47%, 1.1% | ~51%, 1.5% |
| 15% (floor 85%) | ~33%, 0.0% | ~48%, 0.1% | ~59%, 0.5% | ~64%, 1.4% | ~66%, 1.8% |
| 20% (floor 80%) | ~43%, 0.0% | ~62%, 0.1% | ~72%, 0.5% | ~76%, 1.1% | ~77%, 1.3% |

Reading it: from m=4 to m=6 you gain 9 points of upside at a 90% floor and breach risk rises 3.5x. From m=3 to m=4 you
gain 8 points and breach goes from 0.06% to 0.44%. The floor (loss tolerance) buys far more: floor 80% at m=3 keeps
62% of the upside with 0.1% breach.

By asset type at a 90% floor the same m means different things: single stocks at m=3 have 0.10% material breach (m=4:
0.61%, m=5: 1.73%); index/ETF at m=4 has 0.00% (m=6: 0.26%). So a natural tiering is *by basket* (index/large-cap m=4,
single-name m=3), not by user.

**Gradient floor ideas (both tested, neither helps):**
- *min-form* E = min(m1 (V-F1), m2 (V-F2), V) with F2 < F1: the second line only binds when the first already exceeds
  V (fully invested), so results are **identical to fixed m1** (8 variants tested). Mathematically redundant.
- *Two sleeves* (e.g. 50% at floor 90% m=3 plus 50% at floor 70% m=6, blended floor 80%): upside kept 62.1%, mean
  12.45%, ending >1 point below the blended floor 0.38% of the time, any shortfall 1.64%. Plain **fixed m=3 at floor 80%**:
  61.8%, 12.69%, 0.13%, 1.01%. No improvement, and the 90% primary floor is only kept in the strict-sleeve sense. Not
  worth the complexity. (6 sleeve variants in T8.)

## 6. The 1/m rule (T5, MC3, MC2)

- **Deterministic (MC3):** start at the target, calm path, one gap on day 100. Largest gap survived: 24.x% at m=4
  (floor 90%), 33% at m=3, 20% at m=5, 16% at m=6, 12% at m=8 (all within one percentage point of 1/m). Exceptions
  are *safer* than 1/m: when m x cushion exceeds V the vault is capped at fully invested, so the survivable gap is the
  cushion (e.g. m=8 at floor 80% survives 20%, not 12.5%; at floor 80% after a +20% run-up m=4 survives 32%). So the exact
  threshold is max(1/m, cushion/V), minus up to 1 point for the 1% band slack. It does not depend on the floor.
- **Real data (T5):** among the 1,581 windows, material breach at m=4 happened 0 times in 1,552 windows with no
  one-day drop > 25%, and 7 times in 29 windows with a drop > 25%. Same at m=3, 5, 6 and 8 (zero material breaches
  without a >1/m drop). Not every big gap breaches (the exposure at that moment was often below the maximum): the
  breach rate in "over" windows was 11% (m=3), 24% (m=4), 33% (m=5), 26% (m=6), 17% (m=8).
- **Monte Carlo with GJR-GARCH-t(4) returns and one injected gap at a random day (MC2, 8,000 paths, 18% annual vol):**
  at m=4 the material-breach probability is 0.1% at gaps up to 20%, 1.0% at 25%, 90.6% at 30%. At m=5: 1.8% at 20%,
  88.8% at 25%. At m=3: 0% up to 30%, 94% at 40%. A sharp cliff at 1/m. (Stock-like 45% vol: the cliff is softer since
  exposure is often lower, 4.9% at 25%, 58.5% at 30% for m=4, and baseline breach is 1.3% with no gap.)
- Verdict: the rule of thumb is **confirmed** as an accurate description of the single-gap failure point. It is
  silent about *how likely* a >1/m gap is, which is what drives the single-stock vs index difference.

## 7. Out of sample, dynamic m, ML

### 7.1 Out-of-sample choice of m (`oos.py`, T7)
Calibration windows end before the cutoff; test windows start after it (straddlers dropped). Rule "mat1": largest m
whose calibration material-breach rate <= 1%. (A naive "largest m with zero any-shortfall" picks m=1 to 2.5, because
costs alone produce small shortfalls; that is why I use the material measure.)

| Universe | Calibrate | chosen m | calib material | test windows | test material | test any | test worst |
|---|---|---|---|---|---|---|---|
| Single stock | <=2014 | 4.0 | 0.84% | 249 | 0.00% | 2.01% | -10.4% |
| Single stock | <=2019 | 4.0 | 0.73% | 134 | 0.00% | 2.99% | -10.4% |
| All equity | <=2014 | 4.5 | 0.97% | 409 | 0.24% | 1.96% | -11.1% |
| All equity | <=2019 | 4.5 | 0.83% | 219 | 0.46% | 2.74% | -11.1% |
| US index/ETF | <=2014 | 8.0 (grid edge) | 0.37% | 108 | 0.00% | 5.56% | -10.1% |
| All equity | 2018+ (team's sample) | 5.5 | 0.68% | 1,248 (pre-2018) | 1.28% | 8.81% | -21.2% |
| Single stock | 2018+ | 4.5 | 0.56% | 781 | 1.28% | 7.30% | -17.4% |

Findings: (a) the m chosen on pre-2015 data holds up after 2015 (test material breach 0 to 0.46%, consistent with the
<=1% target). (b) The calibration sample matters: calibrating on 2018-2026 alone picks a more aggressive m (5.5 for
all equity), and that choice breaks when tested on earlier years (1.28% material, 8.8% any, worst -21%). The 2018+
window has no 1987/2000/2008-type shock. (c) The index-only calibration picks m=8, which is a symptom of too few
tail events in the calibration set (the 1987 gap of 20.5% fits under 1/8 only barely); do not choose m from index
breach rates alone. (d) For the "team assets" (NVDA, TSLA, QQQ, SPY, AAPL), calibrating on 2018+ then testing before 2018
gave 1.9% material breach at m=8 and 27.9% any shortfall.

### 7.2 Dynamic m, simple rules (`dyn.py`, T9/T10)
Rules, using only information through the previous close, rebalanced daily with the same bands and costs:
m_t = clip(k / (trailing 252-day worst one-day loss), 1, 8) and m_t = clip(k / trailing 63-day daily vol, 1, 8).
k chosen on the calibration terms (max mean return subject to material breach <= 1%), applied out of sample.
Test terms (63-day-start overlapping, 1,625 terms after 2014; 870 after 2019), pooled equities:

| Strategy (cut 2014) | avg m | test material | test any | worst | mean ret | upside kept |
|---|---|---|---|---|---|---|
| Fixed m=4.5 | 4.5 | 0.31% | 1.85% | -12.6% | 11.26% | 47.6% |
| Trailing worst gap (k=0.35) | 5.6 | 0.25% | 1.29% | -18.2% | 9.63% | 42.9% |
| Trailing vol (k=0.10) | 6.2 | 0.74% | 2.34% | -14.8% | 11.41% | 49.6% |
| Hindsight oracle (perfect knowledge of the term's worst gap) | 7.8 | 0.00% | 8.37% | -10.2% | 12.87% | 55.4% |

The 2019 cutoff is similar (fixed 13.10% mean / 0.57% material; vol rule 13.19% / 1.03%; gap rule 10.62% / 0.46%).
Neither rule beats fixed m: the vol rule gets the same return with more breach; the gap rule gets lower return at
similar breach. The hindsight oracle shows how much room exists even with perfect information: ~+1.6 to +2.5 points
of mean annual return at zero breach (and that oracle is not achievable). **The simple rules capture none of it.**
Changing m on-chain would also need the MultiplierTransition poke and TWAP wait, which this simulation ignores.

### 7.3 ML (`ml.py`, T11/T12)
Because the oracle shows some theoretical room, I ran a small check, strictly walk-forward: gradient boosting
(quantile 0.9, 120 depth-3 trees) predicts the log of a term's worst one-day loss from 13 features at the term start
(vols, worst trailing losses, drawdown, trailing returns, skew, kurtosis, index/stock flag); m = clip(k / prediction,
1, 8) fixed for the term; k chosen on **purged 5-block cross-validated** calibration predictions (400-day purge), final
model fit on pre-cutoff terms, tested on later terms (18,330 terms with step 21 for training; test uses 63-day starts).
Skill: Spearman correlation of prediction with the realised worst loss on test terms: ML 0.51 (cut 2014) / 0.53 (cut 2019),
trailing vol 0.47 / 0.44, trailing worst gap 0.39 / 0.33. So it does forecast gap size a bit better.
Outcome, walk-forward chosen points versus fixed m=4.5, paired calendar-year bootstrap (95% CI of difference, points):

| Cut | Strategy | test mean ret | test material | diff mean ret vs fixed | diff material vs fixed |
|---|---|---|---|---|---|
| 2014 | Fixed 4.5 | 11.17% | 0.31% | n/a | n/a |
| 2014 | ML GBM | 10.77% | 0.43% | -1.42 to +0.74 | -0.19 to +0.48 |
| 2014 | trailing vol | 10.97% | 0.62% | -1.95 to +1.49 | 0.00 to +0.66 |
| 2014 | trailing worst gap | 9.13% | 0.37% | -4.45 to +0.03 | -0.31 to +0.43 |
| 2019 | Fixed 4.5 | 12.82% | 0.57% | n/a | n/a |
| 2019 | ML GBM | 13.21% | 0.46% | -0.43 to +1.20 | -0.34 to 0.00 |
| 2019 | trailing vol | 12.05% | 0.69% | -3.24 to +1.14 | -0.33 to +0.66 |
| 2019 | trailing worst gap | 9.73% | 0.23% | -6.82 to -0.44 | -0.57 to -0.11 |

Every ML interval contains zero. The frontier chart (`charts/5`) shows fixed m on or above all alternatives at low breach.
**Verdict: ML did not beat the simple baselines out of sample by more than noise; do not build it.** Overfitting: with only
a handful of true tail events (1987, 2000, 2008, 2020), tail-risk targets are intrinsically data-starved, and the
training terms overlap heavily (step 21 with 252-day terms), so the effective sample is much smaller than 18,330.

## 8. Charts (all in `charts/`)
1. `1_breach_vs_m.png`: breach rate (any, material) vs m by group.
2. `2_gap_vs_one_over_m.png`: breach probability vs injected gap size, showing the 1/m cliff.
3. `3_dial_capture_vs_breach.png`: upside kept vs breach rate for each floor.
4. `4_sample_dependence.png`: breach by m in 2018+ vs earlier windows (any shortfall at m=4: 2.0% vs 3.0%; at m=6: 8.1% vs 9.9%; material m=6: 1.0% vs 1.6%).
5. `5_dynamic_ml_frontier.png`: fixed m vs rules vs ML, test terms 2015+.
6. `6_block_bootstrap.png`: bootstrap breach rate vs m by pool.

## 9. Numbers safe for public copy (exact definitions)

All: one-year (252 trading days) terms, 90% floor, exposure = min(4 x (value - floor), value), rest in stablecoin at 0%,
daily rebalance at the close with the contract's 1%/2% bands, costs 6 bps one-way per trade, full overnight and weekend gaps,
non-overlapping windows starting at each series' first trading day, closing prices (adjusted), data to 2026-10-02.
1. "Across 1,581 one-year periods (38 stock, ETF and index histories, 1928-2026), the vault ended more than 1 point
   below its 90% floor in 0.44% of them (7 periods; 95% CI 0.11% to 0.91%), and slightly below the floor in 2.85%."
2. "On the S&P 500 (1928-2026, 98 non-overlapping years) the vault never ended below its 90% floor at m=4; worst final value
   -9.6%." (T4; the same series at m=6 breaches 1.2% to 1.3% in the bootstrap; do not quote m=6 for the index without the CI)
3. "At m=4 the vault keeps about 42% of the gain in years when holding gained (pooled mean-of-gains ratio, 1,105 up
   windows; 43% to 55% by basket)" (not a median; the median year is +1.6% vs +13.7% for holding).
4. "In years when holding lost more than 10% (288 windows) the vault's median result was -8.8% vs -24.0% for holding."
5. The 1/m rule: "the floor survives any single-day drop smaller than about 25% at m=4 (verified: no period without such
   a drop ended more than 1 point below the floor)". Must be accompanied by: single stocks have had one-day drops of
   -30% to -61% (AIG 2008-09-15 -60.8%, AAPL 2000-09-29 -51.9%, NFLX -40.9%, C -39.0%, AMD -37.9%, NVDA -35.2%, HSI -33.3%
   1987-10-26, MSFT -30.1% 1987-10-19; S&P 500 worst one-day close -20.5% 1987-10-19).
6. Cost: 6 bps one-way costs the vault 0.22% a year of return at m=4 (turnover 3.7x deposit/yr); at 50 bps one-way
   the cost is 1.75% a year and upside kept falls to 34%.
7. Dial table (section 5) for floor 80/85/90/95 and m = 2 to 6.
Do **not** publish: "worst year -36%" style numbers, window-mode upside (50%), any ML or dynamic-m performance, or the
`weekly` numbers as product behaviour.

## 10. Claims in CONTEXT.md that these results contradict or need softening (I did not edit it)
- "Floor held in 93 of 93 one-year windows (2018 -> 2026-10) at m = 4" is accurate for that sample, but must not be used
  as a general statement. Suggested: add "in a 98-year, 38-series sample (1,581 years) m=4 ended more than 1 point below
  the floor in 0.44% of years, always after a one-day drop bigger than 25%".
- "m = 4 survives a single 25% gap": true only at the exact boundary (24.x% with the 1% band slack at the start state,
  not for a gap the day after a full rebalance with the band at its limit). Suggest "about 24%".
- Any wording like "floor guaranteed" or "protected" without "unless a single-day drop exceeds ~25%". Single stocks have
  suffered such drops (AAPL 2000, AIG 2008).
- "Upside kept ~42% of the gain" is right as a pooled mean-of-gains ratio (41.6%), but it is not what a typical year
  looks like; the typical (median) year gives back most of the return (pooled median +1.6% vs +13.7% holding).
- Best-window claims (NVDA +240.6% vs +298.1%) are real but cherry-picked; keep them paired with the median/bad-year numbers.

## 11. Limits (what was measured vs assumed)
Measured: price-driven behaviour of the rules on real daily closes. Assumed: 0% stable yield; one-way costs 2/6/25/50 bps
flat (no crash-time liquidity thinning, no price impact); TWAP/oracle lag, keeper outages, the 15:30-19:30 UTC window (approximated by
once-per-day), halts, issuer pauses and token-vs-stock gaps are not modelled; basket = equal-weight daily-rebalanced
average, treated as one asset; no stablecoin depeg; windows cover mostly US/large-cap equities; survivorship bias (section 2);
dynamic-m ignores the MultiplierTransition delay. The oracle and ML sections use ~1,600 test terms of which very few are
tail events; all confidence intervals are about sampling error only, not model error.

## 12. Reproduce
```
cd research/m_study && ./run_all.sh          # or step by step, in order:
uv venv .venv && uv pip install --python .venv/bin/python pandas numpy yfinance matplotlib scikit-learn scipy
.venv/bin/python fetch_data.py && .venv/bin/python study_hist.py && .venv/bin/python ana_hist.py
.venv/bin/python oos.py && .venv/bin/python dial.py && .venv/bin/python mc.py
.venv/bin/python dyn.py && .venv/bin/python ml.py && .venv/bin/python charts.py
```
Data (`data/`) is gitignored; `results/*.csv` are committed. Seeds are fixed, but yfinance may revise history, so
re-downloads may move numbers slightly. Files: `sim.py` (engine), `common.py` (loaders, baskets), scripts above.
