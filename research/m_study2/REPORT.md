# Floor and term: how far can the slider go? (agent MSTUDY2)

Branch `agent/MSTUDY2`. Everything here is a simulation on historical daily prices (data from yfinance, pulled
2026-10-04, same 38 series as `research/m_study/`). Nothing on-chain was touched. Reproduce with `run_all.sh`.
Simulator: `research/m_study/sim.py` logic (m = 4, daily rebalance at the close, sell band 1%, buy band 2%, 6 bps and
25 bps one-way, final unwind charged), extended in `common2.py` only to record when the lock happens, average
exposure, and separate buy and sell minimum sizes (verified identical to `sim.cppi`: `check_sim.py`, max difference 0).

## 0. Summary in plain English (read this first)

**The floor sets how much of the stock you own; the term barely changes the protection per day, it just gives the
market more time to hurt you or help you.** At m = 4 the vault starts with stock worth `4 x (100% - floor)` of the
deposit (capped at 100%). A 90% floor starts 40% in stock; 95% starts 20%; 98% starts 8%; any floor of 75% or lower
starts fully in stock. The share of a holder's gain that the vault keeps follows that same number almost exactly:
about 72% to 77% at an 80% floor, 38% to 42% at 90%, 19% to 23% at 95%, 8% to 10% at 98%, for every term from one week to one
year (T6). So the floor is the product's real "risk dial", and the term is just a calendar.

**Protection.** Across 38 indices, ETFs and large single stocks (1928 to 2026), at a 90% floor the vault ended more
than 1 point below its floor in 0.02% of one-week windows, 0.09% of one-month windows, 0.20% of three-month windows and
0.44% of one-year windows (95% CIs in T1). The longer the term, the more chances for a one-day gap to land. Nearly
every material miss is a single-stock gap day (AIG 15 Sep 2008 -61%, AAPL 26 Sep 2000 -52%, NFLX Oct 2004 and Oct 2011); the
only index case is the Hang Seng in Oct 1987 (market shut for four days, reopened about -33%). The
S&P 500 alone never ended below an 80%, 90% or 95% floor in any window of any of the six term lengths (0 of 98 years, 0 of 4,961 weeks), and
once in 98 years at 98%. "Ended below the floor by any amount" is more frequent at high floors (6.3% of one-year
windows at 98%) but those misses are tiny (median 0.02 points).

**What people actually get.** The typical result is small. At a 90% floor the median one-month ride returns +0.19%
(holding: +1.31%), the median one-year +1.56% (holding +13.70%), because the vault is only 40% invested and sells
into every fall. The point of the product is the bad windows: when holding lost more than 10%, the 90%-floor vault's
median result was -5.3% over a month (holding -14.5%) and -8.8% over a year (holding -24.0%).

**Cash lock and "start date matters".** The cash lock is rare (0.04% of one-week windows, 0.17% of one-month, 0.53% of
three-month, 2.85% of one-year at a 90% floor) and when it happens it is typically around the middle of the term. It is
strongly regime dependent: a three-month ride started when the stock was already 20% below its 1-year high, or after the
20-day volatility was in its top 10%, hit the lock in 1.8% to 2.2% of windows, against 0.10% when it started within 5% of the
1-year high (T18). The crash starts (Oct 1987, Sep 2008, Feb 2020) all ended 0.4 to 4.9 points above the 90% floor, never below,
for the S&P 500, Nasdaq-100 and NVDA (T20).

**What does not work.** A 98% floor is nearly cash: average stock exposure 8%, median one-year return +0.31%, in one
window in five (21%) it averaged under 5% in stock over the year, and 45% of windows end below the deposit. A one-week
ride has a median result of +0.04% at 6 bps and a negative mean at 25 bps (T11): it is a coin flip with fees. Floors
below 75% are not "more protective but cheaper", they are simply buy-and-hold with a deep stop: only 27 non-overlapping one-year
windows in the whole history ever ended with the stock below a 50% floor, so we have almost no evidence of how those behave.

**Contract limits that bite before the market does.** The factory rejects any deposit where the smallest basket
token's first purchase `min(100%, 4 x (100% - floor)) x deposit x weight` is under `minTrade` (20 USDT live). At 20 USDT
minTrade a 3-token basket cannot be opened with 55 USDT at any floor, and a 125 USDT deposit works only up to an 87%
floor (section 6). A separate rule rejects terms that mature within 14 days of the end of the holiday table (31 Dec 2027):
a 365-day term can no longer be created after 17 Dec 2026 unless the table is extended.

## 1. Recommendation for the UI

| Item | Recommendation | Evidence |
|---|---|---|
| Floor slider range | **80% to 95%**, step 1 point, ticks at 80 / 85 / 90 / 95. Default **90%**. | T16: from 80% up there are at least 173 windows (36 distinct years) in which holding ended below the floor, in every term. 75% to 79%: only 132 to 226 windows for terms of 1 month and longer, 89 to 121 for shorter (22 to 28 years), and the vault is 100% invested at the start so the "floor" is a stop-loss. |
| Label 'backtested' | **80% to 98%**, all terms from 1 week to 1 year. | Same rule: at least 100 stress windows and at least 30 distinct years in every term. |
| Label 'light evidence' | 75% to 79%. Do not offer in v1; if offered, show a yellow note "few historical cases; this is nearly buy-and-hold". | T16, T17. |
| Label 'not backtested' | **below 75%**, and terms over 365 days. Do not offer (the contract accepts 50% and 400 days; the UI should not). | At 50% to 60% only 3 to 68 stress windows, 2 to 31 years; vault still ended below those floors in 29% to 41% of the few stress windows (T17). |
| Why stop at 95% in the UI | 96% to 98% are tested, but they keep under 20% of the upside, make the position mostly cash (at 98%: 8% stock), and need big deposits (min deposit 75 USDT at 98% with a single token even at minTrade 6, 250 at 20). Offer 96 to 98 only behind an "almost all cash" warning, if at all. | T6, T10, section 6. |
| Term presets | **1 month, 3 months, 6 months, 1 year** (30, 90, 180, 365 days). Default **1 year**: it is the best evidenced (98 years of S&P windows, 1,581 pooled) and matches existing copy. | T1 to T14 |
| 1 week and 2 weeks | **Do not offer as presets.** Contract allows 7 to 400 days and the simulation is fine, but the typical gain is about zero: +0.04% median, +0.09% mean at 6 bps (+0.19% / +0.52% for 1 month), mean -0.08% at 25 bps, before gas and keeper effects we did not model. If kept, label "experiment, expect roughly 0". | T7, T11 |
| Custom term | Allow 30 to 365 days only. Not 366 to 400 (untested), not under 30. | |
| Live readout next to the slider | "Starts with `min(100, 4 x (100 - floor))`% in stock. Keeps about the same percentage of a rise." Show the loss at the floor in USDT. | T6, T10 |
| Pre-sign blocking check | Use the formula in section 6; block with "Minimum deposit for this floor and basket: X USDT". | A1, A2 |
| Soft warnings | deposit under 3x the minimum: "small deposits keep a few points less upside" (T21: 125 USDT at minTrade 20 keeps 38% instead of 42% of upside at 90%); floor over 95: "mostly cash"; single-stock baskets: "a one-day drop of more than about 25% can push the final value below the floor" (T15); term 7 to 14 days: "typical result about zero". | T15, T21 |
| Default term and floor pair | 1 year / 90% | |

## 2. Exact numbers allowed in public copy

All: m = 4, daily rebalance at the close, 6 bps one-way unless stated, 38 indices, ETFs and large-cap stocks, 1928 to
2026, non-overlapping windows (indices and single stocks pooled, baskets reported separately), floor measured against
the deposit at creation. "Ended more than 1 point below" means final value below floor minus 1% of the deposit.
Always say "in our historical test" and link the caveats.

| Number | Definition / where | Allowed wording |
|---|---|---|
| **0.44%** (95% CI 0.07% to 0.93%) of windows | 1-year, 90% floor, ended more than 1 point below the floor; 7 of 1,581 windows (T1) | "In 1,581 historical one-year windows, 7 ended more than 1 point below a 90% floor (0.4%)." |
| **0.09%** (0.04 to 0.15) | 1-month, 90% floor, same definition; 17 of 19,209 (T1) | as above for one month |
| **0 of 98 years** | S&P 500 alone, 1-year windows, floors 80, 90, 95 | "never in 98 years of S&P 500 windows" (98% floor: once) |
| **38% to 42%** of the gain kept | up windows, 90% floor, every term (T6); formula `4 x (100 - floor)` for floors 80 to 98 | "keeps roughly 4 times the cushion: about 40% of the rise at a 90% floor" |
| **+0.19%** vs **+1.31%** | median 1-month return, 90% floor vs holding, indices+stocks (T7; CI +0.04% to +0.33% vs +0.99% to +1.63%) | only with "median" and CIs |
| **+1.56%** vs **+13.70%** | median 1-year, 90% floor vs holding (T7) | only with "median"; CI -0.09% to +3.34% vs +9.55% to +17.08% |
| **-5.3% vs -14.5%** (1 month), **-8.8% vs -24.0%** (1 year) | median result in windows where holding lost more than 10%, 90% floor (T8). Not a worst case | "In windows where the stock fell more than 10%, the median 90%-floor ride lost about 5% to 9% where holding lost 15% to 24%." |
| **0.04% / 0.17% / 0.53% / 2.85%** | share of windows reaching the cash lock: 1 wk / 1 mo / 3 mo / 1 yr, 90% floor (T4) | "the cash lock was triggered in 1 in 600 one-month windows" (0.17% = 1 in 590) |
| **0.22% / 0.90%** of deposit | total trading cost over a year at 6 / 25 bps one-way, 90% floor (T9, T9b) | cost estimates, not measured on chain |
| **0.4 to 4.9 points above the floor** | named crash starts, 90% floor, 3 months, S&P 500 / Nasdaq-100 / NVDA (T20). One path each, daily closes | "e.g. started 1 Sep 2008" with the date |

Do not publish: any "worst case" better than "single-stock gap days of -50% to -61% breached every floor" (worst
simulated shortfalls in T3: one-week, 90% floor, AIG 15 Sep 2008: 24% loss, 14 points under the floor); the 98% floor's
tiny breach rates without the "mostly cash" context; any one-week number without its CI.

## 3. How protection and upside change with term (answers by term)

**T1. Ended more than 1 point below the floor (non-overlapping windows, 95% CI)**

| Floor | 1 wk | 2 wk | 1 mo | 3 mo | 6 mo | 1 yr |
|---|---|---|---|---|---|---|
| 80% | 0.03% (0.01 to 0.05) | 0.05% (0.02 to 0.10) | 0.10% (0.04 to 0.18) | 0.25% (0.09 to 0.49) | 0.41% (0.13 to 0.82) | 0.51% (0.18 to 0.92) |
| 85% | 0.03% (0.01 to 0.05) | 0.05% (0.02 to 0.08) | 0.10% (0.04 to 0.18) | 0.25% (0.09 to 0.47) | 0.35% (0.07 to 0.76) | 0.51% (0.13 to 1.05) |
| 90% | 0.02% (0.01 to 0.04) | 0.04% (0.02 to 0.06) | 0.09% (0.04 to 0.15) | 0.20% (0.08 to 0.36) | 0.25% (0.06 to 0.50) | 0.44% (0.07 to 0.93) |
| 95% | 0.02% (0.01 to 0.03) | 0.02% (0.01 to 0.04) | 0.05% (0.02 to 0.08) | 0.14% (0.05 to 0.26) | 0.19% (0.03 to 0.41) | 0.25% (0.00 to 0.70) |
| 98% | 0.01% (0.00 to 0.02) | 0.01% (0.00 to 0.03) | 0.01% (0.00 to 0.02) | 0.03% (0.00 to 0.08) | 0.03% (0.00 to 0.11) | 0.06% (0.00 to 0.22) |

**T2. Ended below the floor by any amount**

| Floor | 1 wk | 2 wk | 1 mo | 3 mo | 6 mo | 1 yr |
|---|---|---|---|---|---|---|
| 80% | 0.04% (0.02 to 0.06) | 0.08% (0.04 to 0.14) | 0.17% (0.08 to 0.29) | 0.55% (0.24 to 0.97) | 1.10% (0.47 to 1.90) | 2.09% (1.11 to 3.24) |
| 85% | 0.04% (0.02 to 0.07) | 0.08% (0.04 to 0.14) | 0.17% (0.08 to 0.29) | 0.55% (0.23 to 0.96) | 1.19% (0.55 to 1.94) | 2.47% (1.30 to 3.76) |
| 90% | 0.04% (0.02 to 0.07) | 0.08% (0.04 to 0.14) | 0.17% (0.08 to 0.29) | 0.53% (0.23 to 0.92) | 1.22% (0.55 to 2.02) | 2.85% (1.62 to 4.49) |
| 95% | 0.04% (0.02 to 0.07) | 0.08% (0.03 to 0.14) | 0.16% (0.07 to 0.27) | 0.66% (0.30 to 1.14) | 1.63% (0.82 to 2.67) | 4.36% (2.53 to 6.37) |
| 98% | 0.04% (0.02 to 0.07) | 0.10% (0.05 to 0.17) | 0.21% (0.10 to 0.36) | 1.02% (0.51 to 1.67) | 2.85% (1.67 to 4.43) | 6.26% (4.10 to 8.72) |

**T3. Worst shortfall (points below floor, single worst window) and median shortfall of the breaching windows**

| Floor | 1 wk | 2 wk | 1 mo | 3 mo | 6 mo | 1 yr |
|---|---|---|---|---|---|---|
| 80% | -28.7 / -2.39 | -28.7 / -1.85 | -15.0 / -2.05 | -21.4 / -0.80 | -21.8 / -0.18 | -15.6 / -0.07 |
| 85% | -21.5 / -1.96 | -21.5 / -1.39 | -11.3 / -1.51 | -13.8 / -0.52 | -24.1 / -0.09 | -4.3 / -0.08 |
| 90% | -14.3 / -1.20 | -14.3 / -0.92 | -7.5 / -1.01 | -8.8 / -0.50 | -10.5 / -0.10 | -8.2 / -0.06 |
| 95% | -7.2 / -0.68 | -7.2 / -0.62 | -3.8 / -0.65 | -4.5 / -0.16 | -5.3 / -0.07 | -3.6 / -0.02 |
| 98% | -2.9 / -0.26 | -2.9 / -0.18 | -1.2 / -0.15 | -1.4 / -0.06 | -1.4 / -0.03 | -1.3 / -0.02 |

**T4. Windows that hit the cash lock (V reached the floor), and median point in the term when it happened**

| Floor | 1 wk | 2 wk | 1 mo | 3 mo | 6 mo | 1 yr |
|---|---|---|---|---|---|---|
| 80% | 0.04% @ 80% | 0.08% @ 40% | 0.17% @ 43% | 0.55% @ 56% | 1.10% @ 51% | 2.09% @ 56% |
| 85% | 0.04% @ 80% | 0.08% @ 40% | 0.17% @ 38% | 0.55% @ 46% | 1.19% @ 53% | 2.47% @ 56% |
| 90% | 0.04% @ 80% | 0.08% @ 40% | 0.17% @ 48% | 0.53% @ 56% | 1.22% @ 53% | 2.85% @ 61% |
| 95% | 0.04% @ 80% | 0.08% @ 40% | 0.16% @ 43% | 0.66% @ 55% | 1.63% @ 57% | 4.36% @ 62% |
| 98% | 0.04% @ 80% | 0.10% @ 50% | 0.21% @ 57% | 1.02% @ 59% | 2.89% @ 60% | 6.33% @ 58% |

**T5. Share of windows that ended within 2 points above the floor or below it (floor effectively 'used')**

| Floor | 1 wk | 2 wk | 1 mo | 3 mo | 6 mo | 1 yr |
|---|---|---|---|---|---|---|
| 80% | 0.1% | 0.2% | 0.4% | 2.0% | 4.8% | 9.5% |
| 85% | 0.1% | 0.2% | 0.6% | 2.6% | 6.0% | 10.8% |
| 90% | 0.1% | 0.3% | 1.0% | 4.1% | 7.8% | 13.9% |
| 95% | 0.4% | 1.1% | 2.9% | 8.7% | 14.6% | 21.9% |
| 98% | 47.6% | 46.6% | 45.5% | 44.8% | 44.8% | 44.6% |

![breach](charts/1_breach_vs_floor_term.png)

*Reading T1 to T5.* Per day, short rides are not safer: the one-week 90% result (18 of 80,733 windows) and the
one-year (7 of 1,581) come from the same few single-stock crashes, and one-week and two-week windows share the same
gap days, so the effective number of independent breach events is under 10 for every cell. The material-breach rate
grows with the term (0.02% to 0.44%) because there are more days at risk; it is lower at 95% to 98% because the stock
share is smaller. "Any shortfall" at high floors rises quickly with term (98% floor, 1 year: 6.3%, CI 4.1% to 8.7%)
but with a median depth of 0.02 points of the deposit: that is the cash lock firing a hair late, not real loss.

**1 month ride, 90% floor (what to tell a person who wants a month):** you start 40% in stock; if the stock rises, you
keep about 39% of the rise; if it falls 10%, you lose roughly 4% (40% x 10%); the chance of ending more than 1 point below your floor
was 1 in 1,100 (0.09%) in our history, and always from a single-stock one-day collapse. Typical result +0.19%, which
is the price of protection.

**1 year hold, 90% floor:** median +1.56%, mean +8.75% (holding median +13.70%, mean +20.32%); 2.9% of windows hit the
lock, and one in seven (13.9%) ends within two points of the floor.

**T6. Upside kept: vault gain / holding gain, summed over windows where holding gained (CI = year-block bootstrap)**

| Floor | 1 wk | 2 wk | 1 mo | 3 mo | 6 mo | 1 yr |
|---|---|---|---|---|---|---|
| 80% | 76% (76 to 77) | 77% (76 to 77) | 77% (76 to 78) | 77% (75 to 79) | 75% (72 to 77) | 72% (68 to 76) |
| 85% | 57% (57 to 57) | 57% (57 to 58) | 58% (57 to 59) | 59% (57 to 61) | 60% (57 to 62) | 59% (54 to 63) |
| 90% | 38% (38 to 38) | 38% (38 to 39) | 39% (38 to 39) | 40% (38 to 42) | 42% (39 to 44) | 42% (37 to 46) |
| 95% | 19% (19 to 19) | 19% (19 to 19) | 19% (19 to 19) | 20% (19 to 21) | 21% (19 to 23) | 23% (19 to 27) |
| 98% | 8% (8 to 8) | 8% (7 to 8) | 7% (7 to 8) | 8% (7 to 8) | 9% (7 to 9) | 10% (7 to 13) |

![upside](charts/2_upside_kept_vs_floor.png)

**T7. Median and mean return, vault vs simply holding (all equity series ex-basket, 6 bps)**

| Term | Hold median [95% CI] | Hold mean | Floor 80 median / mean | Floor 90 median [CI] / mean | Floor 95 median / mean | Floor 98 median / mean |
|---|---|---|---|---|---|---|
| 1 wk | +0.34% [+0.27, +0.41] | +0.35% | +0.07% / +0.17% | +0.04% [+0.00, +0.07] / +0.09% | +0.02% / +0.04% | +0.01% / +0.02% |
| 2 wk | +0.62% [+0.47, +0.76] | +0.70% | +0.17% / +0.43% | +0.08% [+0.01, +0.15] / +0.21% | +0.05% / +0.11% | +0.03% / +0.04% |
| 1 mo | +1.31% [+0.99, +1.63] | +1.48% | +0.42% / +1.03% | +0.19% [+0.04, +0.33] / +0.52% | +0.10% / +0.26% | +0.06% / +0.10% |
| 3 mo | +3.52% [+2.45, +4.66] | +4.55% | +1.28% / +3.42% | +0.51% [-0.03, +0.94] / +1.85% | +0.26% / +0.93% | +0.12% / +0.36% |
| 6 mo | +6.72% [+5.00, +8.64] | +9.49% | +2.28% / +7.03% | +0.84% [-0.02, +1.56] / +4.11% | +0.42% / +2.15% | +0.18% / +0.86% |
| 1 yr | +13.70% [+9.55, +17.08] | +20.32% | +6.08% / +14.58% | +1.56% [-0.09, +3.34] / +8.75% | +0.67% / +4.87% | +0.31% / +2.11% |

![median](charts/3_median_return_vs_hold.png)

**T8. Down windows (holding lost money): median vault return vs median holding return. Severe = holding lost more than 10%.**

| Term | n down / n severe | Floor 90: down vault vs hold | Floor 90: severe vault vs hold | Floor 95: severe vault vs hold | Floor 98: severe vault vs hold |
|---|---|---|---|---|---|
| 1 wk | 1549 severe of 80733 | -0.9% vs -2.1% | -4.7% vs -12.7% | -2.4% vs -12.7% | -1.0% vs -12.7% |
| 2 wk | 1633 severe of 40356 | -1.3% vs -2.9% | -4.9% vs -13.3% | -2.4% vs -13.3% | -1.0% vs -13.3% |
| 1 mo | 1512 severe of 19209 | -2.0% vs -4.3% | -5.3% vs -14.5% | -2.7% vs -14.5% | -1.1% vs -14.5% |
| 3 mo | 889 severe of 6391 | -3.7% vs -7.2% | -6.6% vs -17.4% | -3.2% vs -17.4% | -1.3% vs -17.4% |
| 6 mo | 540 severe of 3188 | -5.2% vs -10.0% | -7.4% vs -19.3% | -3.7% vs -19.3% | -1.4% vs -19.3% |
| 1 yr | 288 severe of 1581 | -7.3% vs -14.0% | -8.8% vs -24.0% | -4.3% vs -24.0% | -1.7% vs -24.0% |

**Cost and turnover.** Cost is not the limiting factor at 6 bps (0.065% of the deposit for a one-month 90% ride) but
it is at 25 bps: it eats half the mean gain of a one-month ride (T7 +0.52% to T11 +0.31%) and turns the one-week mean
negative (-0.08%). The 46 bps TSLAB quote in CONTEXT.md would be worse. Turnover at 90% floor: 0.85x to 3.7x the deposit
over the term.

**T9. Cost paid, % of deposit, 6 bps one-way (25 bps in T9b)**

| Floor | 1 wk | 2 wk | 1 mo | 3 mo | 6 mo | 1 yr |
|---|---|---|---|---|---|---|
| 80% | 0.103% | 0.111% | 0.125% | 0.168% | 0.213% | 0.279% |
| 85% | 0.077% | 0.084% | 0.098% | 0.142% | 0.193% | 0.275% |
| 90% | 0.051% | 0.055% | 0.065% | 0.098% | 0.141% | 0.221% |
| 95% | 0.025% | 0.027% | 0.031% | 0.046% | 0.069% | 0.118% |
| 98% | 0.010% | 0.010% | 0.011% | 0.015% | 0.023% | 0.042% |

**T9b. Cost paid at 25 bps one-way**

| Floor | 1 wk | 2 wk | 1 mo | 3 mo | 6 mo | 1 yr |
|---|---|---|---|---|---|---|
| 80% | 0.427% | 0.460% | 0.521% | 0.695% | 0.884% | 1.160% |
| 85% | 0.321% | 0.348% | 0.404% | 0.586% | 0.797% | 1.133% |
| 90% | 0.212% | 0.230% | 0.267% | 0.403% | 0.579% | 0.901% |
| 95% | 0.104% | 0.111% | 0.126% | 0.189% | 0.283% | 0.475% |
| 98% | 0.041% | 0.042% | 0.045% | 0.064% | 0.096% | 0.168% |

**T11. Mean return vault at 25 bps one-way (compare T7 6 bps)**

| Floor | 1 wk | 2 wk | 1 mo | 3 mo | 6 mo | 1 yr |
|---|---|---|---|---|---|---|
| 80% | -0.15% | +0.07% | +0.62% | +2.85% | +6.26% | +13.42% |
| 85% | -0.12% | +0.05% | +0.47% | +2.21% | +5.03% | +10.91% |
| 90% | -0.08% | +0.04% | +0.31% | +1.51% | +3.58% | +7.79% |
| 95% | -0.04% | +0.02% | +0.16% | +0.77% | +1.88% | +4.35% |
| 98% | -0.01% | +0.01% | +0.06% | +0.30% | +0.77% | +1.94% |

**T12. Turnover (multiples of deposit traded over the term, 6 bps)**

| Floor | 1 wk | 2 wk | 1 mo | 3 mo | 6 mo | 1 yr |
|---|---|---|---|---|---|---|
| 80% | 1.72x | 1.85x | 2.09x | 2.79x | 3.55x | 4.65x |
| 85% | 1.29x | 1.40x | 1.63x | 2.37x | 3.22x | 4.58x |
| 90% | 0.85x | 0.92x | 1.08x | 1.63x | 2.36x | 3.68x |
| 95% | 0.42x | 0.45x | 0.51x | 0.77x | 1.16x | 1.96x |
| 98% | 0.16x | 0.17x | 0.18x | 0.26x | 0.39x | 0.69x |

**T10. Average stock exposure over the term (share of vault value in stock)**

| Floor | 1 wk | 2 wk | 1 mo | 3 mo | 6 mo | 1 yr |
|---|---|---|---|---|---|---|
| 80% | 80% | 80% | 79% | 78% | 76% | 75% |
| 85% | 60% | 60% | 60% | 61% | 61% | 61% |
| 90% | 40% | 40% | 40% | 42% | 43% | 44% |
| 95% | 20% | 20% | 20% | 21% | 22% | 24% |
| 98% | 8% | 8% | 8% | 8% | 9% | 10% |

## 4. Start date matters (short terms especially)

Weekly-start overlapping windows, classified by what the market looked like just before the start (no look-ahead:
the 20-day volatility rank is within each series over its whole history, which is mild hindsight; the 1-year-peak
drawdown is purely backward-looking).

**T18. Start-date view (weekly-start overlapping windows, indices+single stocks, 6 bps). Floor 90 unless noted.**

| Term | Start regime | n | Hit cash lock [95% CI] | >1pt below floor | Median vault / hold | 10th pct vault / hold | Upside kept |
|---|---|---|---|---|---|---|---|
| 1 wk | all starts | 401292 | 0.04% (0.02 to 0.07) | 0.02% | +0.04% / +0.33% | -1.8% / -4.5% | 38% |
| 1 wk | calm start (20d vol in bottom half) | 200691 | 0.01% (0.00 to 0.02) | 0.00% | +0.05% / +0.30% | -1.4% / -3.4% | 38% |
| 1 wk | high-vol start (20d vol in top 10%) | 40096 | 0.19% (0.04 to 0.35) | 0.08% | -0.10% / +0.40% | -3.3% / -8.1% | 38% |
| 1 wk | start >=20% below 1y peak | 90501 | 0.14% (0.07 to 0.22) | 0.08% | -0.08% / +0.29% | -2.9% / -7.1% | 38% |
| 1 wk | start within 5% of 1y peak | 155387 | 0.00% (0.00 to 0.01) | 0.00% | +0.06% / +0.33% | -1.3% / -3.2% | 38% |
| 1 mo | all starts | 80157 | 0.17% (0.08 to 0.29) | 0.08% | +0.20% / +1.31% | -3.6% / -8.5% | 39% |
| 1 mo | calm start (20d vol in bottom half) | 40064 | 0.05% (0.01 to 0.11) | 0.03% | +0.24% / +1.14% | -2.8% / -6.8% | 40% |
| 1 mo | high-vol start (20d vol in top 10%) | 8023 | 0.70% (0.12 to 1.33) | 0.16% | -0.30% / +1.77% | -6.0% / -14.7% | 36% |
| 1 mo | start >=20% below 1y peak | 18090 | 0.55% (0.25 to 0.91) | 0.22% | -0.17% / +1.62% | -5.4% / -13.7% | 38% |
| 1 mo | start within 5% of 1y peak | 30979 | 0.04% (0.00 to 0.10) | 0.03% | +0.28% / +1.23% | -2.5% / -6.1% | 39% |
| 3 mo | all starts | 79829 | 0.57% (0.27 to 0.95) | 0.18% | +0.47% / +3.51% | -5.7% / -13.6% | 40% |
| 3 mo | calm start (20d vol in bottom half) | 39902 | 0.24% (0.07 to 0.47) | 0.10% | +0.61% / +3.04% | -4.6% / -11.0% | 41% |
| 3 mo | high-vol start (20d vol in top 10%) | 7992 | 2.20% (0.64 to 4.11) | 0.44% | -0.64% / +5.12% | -8.2% / -21.7% | 36% |
| 3 mo | start >=20% below 1y peak | 18021 | 1.78% (0.83 to 2.91) | 0.47% | -0.61% / +4.26% | -8.0% / -22.6% | 39% |
| 3 mo | start within 5% of 1y peak | 30868 | 0.10% (0.00 to 0.32) | 0.06% | +0.67% / +3.16% | -4.2% / -9.6% | 40% |

**T19. Same start regimes at floor 98: share of windows with the cash lock, and 10th-percentile vault / hold**

| Term | Start regime | Cash lock | Median vault | 10th pct vault / hold |
|---|---|---|---|---|
| 1 mo | all starts | 0.22% | +0.06% | -0.70% / -8.5% |
| 1 mo | calm start (20d vol in bottom half) | 0.08% | +0.06% | -0.55% / -6.8% |
| 1 mo | high-vol start (20d vol in top 10%) | 0.93% | -0.04% | -1.17% / -14.7% |
| 1 mo | start >=20% below 1y peak | 0.65% | -0.01% | -1.06% / -13.7% |
| 1 mo | start within 5% of 1y peak | 0.07% | +0.07% | -0.50% / -6.1% |
| 3 mo | all starts | 0.99% | +0.11% | -1.10% / -13.6% |
| 3 mo | calm start (20d vol in bottom half) | 0.45% | +0.14% | -0.89% / -11.0% |
| 3 mo | high-vol start (20d vol in top 10%) | 3.49% | -0.09% | -1.59% / -21.7% |
| 3 mo | start >=20% below 1y peak | 2.74% | -0.10% | -1.56% / -22.6% |
| 3 mo | start within 5% of 1y peak | 0.34% | +0.15% | -0.81% / -9.6% |

![start](charts/4_start_regime_lock.png)

*Reading.* Starting after volatility has spiked or when the market is already 20% off its high multiplies the chance
of hitting the lock by roughly ten (1 month: 0.70% / 0.55% vs 0.04% to 0.05% for calm or near-high starts) and flips the median result
from slightly positive to slightly negative (-0.30% vs +0.24%). The protection still holds (breach rates stay under
0.5%), but the person who starts a ride in a panic gets the stock exposure cut and a small loss rather than the rebound.
For one-year rides the same split is 9.0% (CI 3.6% to 14.6%) after a volatility spike and 7.0% when starting 20% below the high, against 1.1% near a high and 1.4% in calm markets (chart; T18 prints 1 week, 1 month, 3 months). This is worth one line in the UI ("starting after a sell-off: the vault can lock early and miss the rebound").

**T20. Named crisis starts, floor 90, 6 bps (actual path, daily closes). Vault / hold; 'pts above floor' at the end.**

| Series | Start | Event | 1 mo vault / hold | 3 mo vault / hold | 3 mo end vs floor (pts) |
|---|---|---|---|---|---|
| GSPC | 1987-10-12 | Oct 1987 crash week | -8.7% / -21.8% | -8.7% / -20.4% | +1.3 |
| GSPC | 2000-03-10 | Nasdaq 2000 peak | +3.2% / +8.2% | +0.5% / +4.3% | +10.5 |
| GSPC | 2008-09-02 | Sep 2008 (Lehman month) | -4.0% / -9.1% | -8.9% / -30.1% | +1.1 |
| GSPC | 2020-02-19 | Feb 2020 (Covid peak) | -8.3% / -28.8% | -7.0% / -12.4% | +3.0 |
| GSPC | 2022-01-03 | Jan 2022 bear start | -1.9% / -4.6% | -2.3% / -4.6% | +7.7 |
| GSPC | 2025-04-02 | Apr 2025 tariff shock | -1.3% / -0.5% | +2.8% / +10.6% | +12.8 |
| NDX | 1987-10-12 | Oct 1987 crash week | -8.8% / -27.6% | -8.6% / -21.5% | +1.4 |
| NDX | 2000-03-10 | Nasdaq 2000 peak | -3.4% / -6.4% | -8.3% / -19.2% | +1.7 |
| NDX | 2008-09-02 | Sep 2008 (Lehman month) | -5.7% / -14.8% | -9.3% / -36.7% | +0.7 |
| NDX | 2020-02-19 | Feb 2020 (Covid peak) | -8.0% / -25.5% | -5.1% / -3.1% | +4.9 |
| NDX | 2022-01-03 | Jan 2022 bear start | -3.2% / -8.0% | -4.2% / -8.9% | +5.8 |
| NDX | 2025-04-02 | Apr 2025 tariff shock | -0.9% / +1.8% | +5.1% / +16.5% | +15.1 |
| NVDA | 2000-03-10 | Nasdaq 2000 peak | -9.2% / +2.3% | -8.8% / +22.6% | +1.2 |
| NVDA | 2008-09-02 | Sep 2008 (Lehman month) | -6.8% / -15.3% | -9.6% / -40.9% | +0.4 |
| NVDA | 2020-02-19 | Feb 2020 (Covid peak) | -9.2% / -31.6% | -5.6% / +18.1% | +4.4 |
| NVDA | 2022-01-03 | Jan 2022 bear start | -5.8% / -16.2% | -6.4% / -9.2% | +3.6 |
| NVDA | 2025-04-02 | Apr 2025 tariff shock | -2.5% / +1.3% | +16.7% / +42.8% | +26.7 |
| TSLA | 2020-02-19 | Feb 2020 (Covid peak) | -10.0% / -57.9% | -9.2% / -5.2% | +0.8 |
| TSLA | 2022-01-03 | Jan 2022 bear start | -5.8% / -11.9% | -5.1% / +2.6% | +4.9 |
| TSLA | 2025-04-02 | Apr 2025 tariff shock | -3.0% / +4.5% | -3.2% / +17.6% | +6.8 |

## 5. Overlapping windows and groups (robustness)

**T13. Overlapping weekly-start windows (breach >1pt, CI), All equity**

| Floor | 1 wk | 2 wk | 1 mo | 3 mo | 6 mo | 1 yr |
|---|---|---|---|---|---|---|
| 80% | 0.03% (0.01 to 0.05) | 0.05% (0.02 to 0.09) | 0.10% (0.04 to 0.16) | 0.24% (0.09 to 0.42) | 0.38% (0.16 to 0.72) | 0.57% (0.26 to 1.00) |
| 85% | 0.03% (0.01 to 0.05) | 0.05% (0.02 to 0.09) | 0.10% (0.04 to 0.17) | 0.23% (0.09 to 0.42) | 0.37% (0.13 to 0.70) | 0.56% (0.24 to 1.01) |
| 90% | 0.02% (0.01 to 0.04) | 0.04% (0.02 to 0.06) | 0.08% (0.03 to 0.12) | 0.18% (0.07 to 0.31) | 0.28% (0.10 to 0.56) | 0.47% (0.19 to 0.93) |
| 95% | 0.02% (0.01 to 0.03) | 0.02% (0.01 to 0.04) | 0.04% (0.01 to 0.07) | 0.10% (0.03 to 0.18) | 0.16% (0.04 to 0.32) | 0.30% (0.10 to 0.58) |
| 98% | 0.01% (0.00 to 0.01) | 0.01% (0.00 to 0.02) | 0.02% (0.00 to 0.04) | 0.03% (0.01 to 0.07) | 0.05% (0.01 to 0.10) | 0.10% (0.03 to 0.19) |

**T14. Overlapping: cash lock**

| Floor | 1 wk | 2 wk | 1 mo | 3 mo | 6 mo | 1 yr |
|---|---|---|---|---|---|---|
| 80% | 0.04% (0.02 to 0.06) | 0.08% (0.04 to 0.13) | 0.17% (0.08 to 0.29) | 0.51% (0.24 to 0.83) | 1.13% (0.58 to 1.81) | 2.40% (1.33 to 3.71) |
| 85% | 0.04% (0.02 to 0.07) | 0.08% (0.04 to 0.13) | 0.17% (0.07 to 0.28) | 0.55% (0.26 to 0.92) | 1.23% (0.63 to 2.01) | 2.70% (1.54 to 4.11) |
| 90% | 0.04% (0.02 to 0.07) | 0.08% (0.04 to 0.13) | 0.17% (0.08 to 0.29) | 0.57% (0.29 to 0.94) | 1.32% (0.67 to 2.16) | 3.06% (1.86 to 4.55) |
| 95% | 0.04% (0.02 to 0.07) | 0.09% (0.04 to 0.14) | 0.17% (0.07 to 0.29) | 0.64% (0.32 to 1.05) | 1.58% (0.80 to 2.58) | 3.94% (2.36 to 5.87) |
| 98% | 0.04% (0.02 to 0.07) | 0.10% (0.04 to 0.16) | 0.22% (0.11 to 0.36) | 1.00% (0.54 to 1.49) | 2.49% (1.46 to 3.81) | 5.89% (3.74 to 8.24) |

Overlapping weekly starts agree with the non-overlapping set within the CIs (the CIs use calendar-year blocks, so overlap
does not make them too narrow).

**T15. By group (Index/ETF), non-overlapping: >1pt below floor / any shortfall**

| Floor | 1 wk | 2 wk | 1 mo | 3 mo | 6 mo | 1 yr |
|---|---|---|---|---|---|---|
| 80% | 0.00% / 0.00% (n=30533) | 0.01% / 0.01% (n=15262) | 0.01% / 0.01% (n=7264) | 0.04% / 0.04% (n=2415) | 0.08% / 0.08% (n=1204) | 0.00% / 0.50% (n=597) |
| 85% | 0.00% / 0.00% (n=30533) | 0.01% / 0.01% (n=15262) | 0.01% / 0.01% (n=7264) | 0.04% / 0.04% (n=2415) | 0.08% / 0.08% (n=1204) | 0.17% / 0.67% (n=597) |
| 90% | 0.00% / 0.00% (n=30533) | 0.01% / 0.01% (n=15262) | 0.01% / 0.01% (n=7264) | 0.04% / 0.04% (n=2415) | 0.08% / 0.08% (n=1204) | 0.17% / 0.84% (n=597) |
| 95% | 0.00% / 0.00% (n=30533) | 0.00% / 0.01% (n=15262) | 0.00% / 0.01% (n=7264) | 0.00% / 0.04% (n=2415) | 0.08% / 0.33% (n=1204) | 0.17% / 1.17% (n=597) |
| 98% | 0.00% / 0.00% (n=30533) | 0.00% / 0.01% (n=15262) | 0.00% / 0.01% (n=7264) | 0.00% / 0.17% (n=2415) | 0.00% / 0.66% (n=1204) | 0.17% / 1.68% (n=597) |

**T15. By group (Single stock), non-overlapping: >1pt below floor / any shortfall**

| Floor | 1 wk | 2 wk | 1 mo | 3 mo | 6 mo | 1 yr |
|---|---|---|---|---|---|---|
| 80% | 0.04% / 0.06% (n=50200) | 0.08% / 0.13% (n=25094) | 0.15% / 0.26% (n=11945) | 0.38% / 0.86% (n=3976) | 0.60% / 1.71% (n=1984) | 0.81% / 3.05% (n=984) |
| 85% | 0.04% / 0.06% (n=50200) | 0.08% / 0.13% (n=25094) | 0.16% / 0.27% (n=11945) | 0.38% / 0.86% (n=3976) | 0.50% / 1.86% (n=1984) | 0.71% / 3.56% (n=984) |
| 90% | 0.03% / 0.07% (n=50200) | 0.06% / 0.13% (n=25094) | 0.13% / 0.27% (n=11945) | 0.30% / 0.83% (n=3976) | 0.35% / 1.92% (n=1984) | 0.61% / 4.07% (n=984) |
| 95% | 0.03% / 0.07% (n=50200) | 0.04% / 0.13% (n=25094) | 0.08% / 0.25% (n=11945) | 0.23% / 1.03% (n=3976) | 0.25% / 2.42% (n=1984) | 0.30% / 6.30% (n=984) |
| 98% | 0.01% / 0.07% (n=50200) | 0.02% / 0.16% (n=25094) | 0.01% / 0.33% (n=11945) | 0.05% / 1.53% (n=3976) | 0.05% / 4.18% (n=1984) | 0.00% / 9.04% (n=984) |

**T15. By group (Basket), non-overlapping: >1pt below floor / any shortfall**

| Floor | 1 wk | 2 wk | 1 mo | 3 mo | 6 mo | 1 yr |
|---|---|---|---|---|---|---|
| 80% | 0.00% / 0.00% (n=5434) | 0.00% / 0.00% (n=2717) | 0.00% / 0.00% (n=1293) | 0.00% / 0.23% (n=430) | 0.00% / 0.47% (n=214) | 0.00% / 0.94% (n=106) |
| 85% | 0.00% / 0.00% (n=5434) | 0.00% / 0.00% (n=2717) | 0.00% / 0.00% (n=1293) | 0.00% / 0.47% (n=430) | 0.00% / 0.93% (n=214) | 0.00% / 1.89% (n=106) |
| 90% | 0.00% / 0.00% (n=5434) | 0.00% / 0.00% (n=2717) | 0.00% / 0.00% (n=1293) | 0.00% / 0.47% (n=430) | 0.00% / 0.93% (n=214) | 0.00% / 1.89% (n=106) |
| 95% | 0.00% / 0.00% (n=5434) | 0.00% / 0.00% (n=2717) | 0.00% / 0.00% (n=1293) | 0.00% / 0.47% (n=430) | 0.00% / 0.93% (n=214) | 0.00% / 1.89% (n=106) |
| 98% | 0.00% / 0.00% (n=5434) | 0.00% / 0.00% (n=2717) | 0.00% / 0.15% (n=1293) | 0.00% / 0.70% (n=430) | 0.00% / 1.87% (n=214) | 0.00% / 4.72% (n=106) |

Index/ETF pools (US and international indices, ETFs): 0 to 0.17% material breaches at any floor and term (the one repeat offender is the Hang Seng in Oct 1987); single
stocks carry nearly all breaches. Baskets (4 baskets, 106 to 5,434 windows) had no material breach, but only 106 independent
one-year windows each correlated across 4 baskets, so that is weak evidence.

**T16. Evidence strength: windows where holding ended BELOW the floor (the floor was actually under stress), non-overlapping, indices+single stocks**

| Floor | 1 wk (windows / years) | 2 wk (windows / years) | 1 mo (windows / years) | 3 mo (windows / years) | 6 mo (windows / years) | 1 yr (windows / years) |
|---|---|---|---|---|---|---|
| 50% | 3 / 2 | 5 / 4 | 10 / 7 | 23 / 13 | 30 / 14 | 27 / 15 |
| 55% | 6 / 3 | 11 / 5 | 13 / 7 | 33 / 16 | 41 / 19 | 38 / 18 |
| 60% | 13 / 7 | 20 / 8 | 32 / 15 | 56 / 20 | 68 / 31 | 58 / 28 |
| 65% | 25 / 10 | 34 / 13 | 52 / 20 | 87 / 28 | 96 / 38 | 75 / 33 |
| 70% | 44 / 14 | 58 / 20 | 100 / 27 | 139 / 38 | 135 / 41 | 103 / 37 |
| 75% | 89 / 22 | 121 / 28 | 199 / 38 | 226 / 48 | 187 / 46 | 132 / 43 |
| 80% | 191 / 36 | 254 / 44 | 365 / 55 | 345 / 59 | 263 / 56 | 173 / 52 |
| 85% | 461 / 52 | 604 / 58 | 693 / 64 | 554 / 65 | 369 / 68 | 229 / 55 |
| 90% | 1549 / 67 | 1633 / 71 | 1512 / 75 | 889 / 71 | 540 / 72 | 288 / 63 |
| 95% | 6767 / 83 | 5199 / 89 | 3508 / 90 | 1512 / 85 | 783 / 76 | 372 / 68 |
| 98% | 18814 / 98 | 11167 / 98 | 5890 / 98 | 1995 / 89 | 960 / 81 | 436 / 71 |

**T17. When the floor WAS under stress (holding ended below it), how often did the vault still end below it? (1 year)**

| Floor | stress windows | vault ended below floor | vault >1pt below |
|---|---|---|---|
| 50% | 27 | 41% | 7.4% |
| 60% | 58 | 29% | 6.9% |
| 70% | 103 | 22% | 3.9% |
| 75% | 132 | 20% | 3.8% |
| 80% | 173 | 16% | 2.9% |
| 85% | 229 | 14% | 1.7% |
| 90% | 288 | 12% | 0.7% |
| 95% | 372 | 15% | 0.5% |
| 98% | 436 | 18% | 0.2% |

*Reading T16 and T17.* This is the basis of the tested/untested zones. At a 50% floor only 27 windows in 98 years ever
had the stock end below the floor and in 41% of those the vault still ended below it too (7.4% by more than 1 point):
a few events, not enough to claim anything. By 80% the evidence is 173 to 365 windows over 36 to 59 years per term.

## 6. What the contract accepts (practical constraints)

Source: `packages/contracts/src/FloorFactory.sol` `createPosition` and `_checkNotTooSmall`, `libs/CPPIMath.sol`,
`script/params/56.json` (live defaults: minTrade 20 USDT, buy band 2%, sell band 1%, dust 1 USDT), `packages/sdk/src/constants.ts`.
`contract_accept.py` reproduces the contract's integer arithmetic exactly and matches the contract's own tests
(`PashovFix4.t.sol`: 50 USDT / 90% / 1 token accepted, 49 rejected, 500 at 98% accepted, 200 at 98% rejected, 100 at 60/40 rejected,
150 accepted) and the closed form below (0 mismatches).

Checks in order: not paused/halted; deposit between 1 and the launch cap 1,000 USDT (`maxDeposit`; total TVL cap 5,000);
floor 50% to 98%; term 7 to 400 days AND maturity + 14 days (`UNWIND_BUFFER`) not after `holidayHorizonDay`; 1 to 3 assets,
weights sum 100%, every asset active with enough oracle history; then, for every token:

1. first target `t = min(4 x (D - F), D) x weight` must be at least `minTrade` (else `PositionTooSmall`);
2. `t` must pass the buy band: `t >= 2% x weight x D` (else `BadFloor`). With floors up to 98% the first target is at least 8% of the
   deposit, so **`BadFloor` can never fire inside the 50% to 98% range** (it would need a floor above 99.5%). The
   "floor so high that the first buy never passes the band" case is therefore unreachable today; `PositionTooSmall` is
   the only rejection driven by floor and size.

**Formula for the UI (single check, matches the contract):** let `w` = the smallest basket weight (1 for one token),
`f` = floor as a fraction (0.90), `D` = deposit in USDT.

```
start_stock_share = min(1, 4 x (1 - f))
first_buy_of_smallest_token = D x start_stock_share x w
accept  iff  first_buy_of_smallest_token >= minTrade
minimum deposit = minTrade / (w x min(1, 4 x (1 - f)))
highest accepted floor = 1 - minTrade / (4 x D x w)     (floors at or below 75% only need D x w >= minTrade)
```

Round the floor up when the contract does (`floorFor` rounds the floor amount up, so a hair more than the formula can be rejected at the boundary;
add a 1% margin in the UI).

**Highest floor the factory accepts (minTrade 20 USDT). 'all' = every floor 50 to 98 passes; 'none' = rejected at every floor.**

| Basket | 55 USDT | 125 USDT | 500 USDT | 1000 USDT | 5000 USDT (above 1000 launch cap) |
|---|---|---|---|---|---|
| 1 token | up to 90% | up to 96% | all | all | all |
| 2 tokens 50/50 | up to 81% | up to 92% | all | all | all |
| 3 tokens 34/33/33 | none | up to 87% | up to 96% | all | all |

**Highest floor the factory accepts (minTrade 6 USDT). 'all' = every floor 50 to 98 passes; 'none' = rejected at every floor.**

| Basket | 55 USDT | 125 USDT | 500 USDT | 1000 USDT | 5000 USDT (above 1000 launch cap) |
|---|---|---|---|---|---|
| 1 token | up to 97% | all | all | all | all |
| 2 tokens 50/50 | up to 94% | up to 97% | all | all | all |
| 3 tokens 34/33/33 | up to 91% | up to 96% | all | all | all |


Minimum deposit (USDT) by floor, from the formula (`A2_min_deposit.csv`):

| minTrade | Basket (smallest weight) | 80% | 85% | 90% | 92% | 95% | 96% | 98% |
|---|---|---|---|---|---|---|---|---|
| 20 | 1 token | 25 | 33 | 50 | 63 | 100 | 125 | 250 |
| 20 | 2 tokens 50/50 | 50 | 67 | 100 | 125 | 200 | 250 | 500 |
| 20 | 3 tokens 34/33/33 | 76 | 101 | 152 | 190 | 304 | 379 | 758 |
| 6 | 1 token | 7.5 | 10 | 15 | 19 | 30 | 38 | 75 |
| 6 | 2 tokens 50/50 | 15 | 20 | 30 | 38 | 60 | 75 | 150 |
| 6 | 3 tokens 34/33/33 | 23 | 31 | 46 | 57 | 91 | 114 | 228 |

![mindep](charts/5_min_deposit_vs_floor.png)

**"Accepted but stays mostly in cash."** The contract only checks the first purchase. Later buys also need `minTrade`
and the 2% weighted band, so a small position whose cushion has shrunk can sit in USDT after a drawdown (sells above
the 1 USDT dust size always go through). Effect on a one-year ride (T21, single series pool): 125 USDT at minTrade 20
keeps 38% of the upside instead of 42% at a 90% floor (19% vs 23% at 95%); 55 USDT at minTrade 6 keeps 40% and 36% for
one and three tokens. So the upside cost of a small deposit is a few points, not a loss of protection (material
breach unchanged at 0.4% to 0.5%). The mid-term re-buy rule is simulated for a single token; for baskets each token must pass on its own,
which we approximate by scaling the minimum.

The 'never bought stock' metric asked for in the brief: with the factory check passed, the vault buys on day one, so
the share of windows that never exceeded 2% stock is 0.00% to 0.03% at floors 50 to 98 (only windows where a gap wipes the
cushion on the first day). The related real-world effect is "mostly cash" (average stock share under 5%): 1.0% at 90%,
4.3% at 95% and **21.1% at 98% over a year**, and 9.2% at 98% over three months.

**T21. Small deposits: effect of minTrade on a 1-year, floor-90 and floor-95 ride (single token; 3-token = equal weights; indices+single stocks)**

| Deposit / minTrade | Basket | Floor | Factory | Avg stock exposure | Upside kept | Mean return | >1pt below floor |
|---|---|---|---|---|---|---|---|
| 55 / 6 | 1 token | 90% | accepts | 41% | 40% | +8.42% | 0.51% |
| 55 / 6 | 1 token | 95% | accepts | 21% | 20% | +4.39% | 0.25% |
| 55 / 6 | 3 tokens equal | 90% | accepts | 37% | 36% | +7.39% | 0.38% |
| 55 / 6 | 3 tokens equal | 95% | REJECTS | 19% | 18% | +3.74% | 0.32% |
| 125 / 6 | 1 token | 90% | accepts | 43% | 41% | +8.68% | 0.44% |
| 125 / 6 | 1 token | 95% | accepts | 23% | 22% | +4.77% | 0.25% |
| 125 / 6 | 3 tokens equal | 90% | accepts | 40% | 39% | +8.18% | 0.44% |
| 125 / 6 | 3 tokens equal | 95% | accepts | 20% | 20% | +4.18% | 0.25% |
| 125 / 20 | 1 token | 90% | accepts | 40% | 38% | +8.00% | 0.38% |
| 125 / 20 | 1 token | 95% | accepts | 19% | 19% | +4.06% | 0.25% |
| 125 / 20 | 3 tokens equal | 90% | REJECTS | 34% | 33% | +6.83% | 0.44% |
| 125 / 20 | 3 tokens equal | 95% | REJECTS | 17% | 16% | +3.24% | 0.13% |
| 500 / 20 | 1 token | 90% | accepts | 43% | 41% | +8.70% | 0.44% |
| 500 / 20 | 1 token | 95% | accepts | 23% | 22% | +4.80% | 0.19% |
| 500 / 20 | 3 tokens equal | 90% | accepts | 41% | 39% | +8.33% | 0.38% |
| 500 / 20 | 3 tokens equal | 95% | accepts | 20% | 20% | +4.24% | 0.25% |
| 1000 / 20 | 1 token | 90% | accepts | 44% | 42% | +8.75% | 0.44% |
| 1000 / 20 | 1 token | 95% | accepts | 24% | 23% | +4.87% | 0.25% |
| 1000 / 20 | 3 tokens equal | 90% | accepts | 43% | 41% | +8.66% | 0.44% |
| 1000 / 20 | 3 tokens equal | 95% | accepts | 22% | 21% | +4.62% | 0.25% |
| 5000 / 20 | 1 token | 90% | accepts | 44% | 42% | +8.75% | 0.44% |
| 5000 / 20 | 1 token | 95% | accepts | 24% | 23% | +4.87% | 0.25% |
| 5000 / 20 | 3 tokens equal | 90% | accepts | 44% | 42% | +8.75% | 0.44% |
| 5000 / 20 | 3 tokens equal | 95% | accepts | 24% | 23% | +4.87% | 0.25% |
| infinite / 20 | 1 token | 90% | accepts | 44% | 42% | +8.75% | 0.44% |
| infinite / 20 | 1 token | 95% | accepts | 24% | 23% | +4.87% | 0.25% |
| infinite / 20 | 3 tokens equal | 90% | accepts | 44% | 42% | +8.75% | 0.44% |
| infinite / 20 | 3 tokens equal | 95% | accepts | 24% | 23% | +4.87% | 0.25% |

**Terms:** bounds 7 to 400 days (`MIN_TERM`, `MAX_TERM`). Today the holiday table covers through 31 Dec 2027
(`holidayHorizonDay`, from `packages/contracts/holidays/nyse_2026_2027.json`), and a position is rejected if
`now + term + 14 days` is later than that day. Latest creation dates: 365 days: **17 Dec 2026**; 180 days: 20 Jun 2027; 90
days: 18 Sep 2027; 30 days: 17 Nov 2027; 7 days: 10 Dec 2027. The 400-day cap itself binds only until 12 Nov 2026. The UI
should read `holidayHorizonDay` from the factory and disable a term whose maturity plus 14 days exceeds it. Ops should extend the table
(it covers 2028 only if `setHolidayHorizon` is called) before 17 Dec 2026 or the 1-year preset will revert.
The sdk constant `LAUNCH_TERM_SECONDS` is 365 days.

## 7. Honest wording about "term" and exiting early

Plain-language version (checked against `docs/CONTRACTS.md` and `FloorVault.sol`):

- **The floor is a level the vault defends by selling, not a guarantee from anyone.** It is a fixed amount (a percentage of
  your deposit when you open). It never moves up, so after a gain it protects much less of your *gains* than your principal.
  Do not say "protects your gains".
- **What the term controls.** Until maturity the vault trades Monday to Friday inside the window. At maturity the target stock
  exposure becomes zero: it sells everything to USDT during the next trading window(s) and the protection is over. Nothing
  renews; to keep riding you open a new position (new deposit, new floor from the then-current value).
- **If the floor is reached before maturity (cash lock):** the vault holds USDT only until maturity and cannot re-enter. It is
  worth about the floor; the term ends, you take the USDT. It is not a refund of more, and not less (except the rare shortfall).
- **Exiting early.** You can close at any time (`requestClose` then `closeToUSDT`, or `exitInKind` to take whatever the vault holds). You receive
  the vault's current value at that moment (stock plus USDT, after sale costs), not the floor amount. That is normally
  above the floor, but nothing promises it, and you give up the rest of the term's upside. There are no partial withdrawals and no top-ups.
- **Short terms.** A one-week or one-month term does not change the 1-in-4 rule: a one-day drop of more than about 25% of the stock
  can still push the final value under the floor. Typical results over a month are small (+0.19% median at a 90% floor).

## 8. Claims in CONTEXT.md / site that change or need a qualifier (report only; not edited here)

1. "One-year term" in the product definition: now several terms. Every statistic in CONTEXT.md applies to a 1-year
   ride at a 90% floor unless stated; add the term and floor to each.
2. "~42% of upside": true for a 90% floor only (38% to 42% by term). At 80% it is ~75%, at 95% ~20%, at 98% ~8%. Replace with
   "about 4 times your cushion", e.g. "40% at a 90% floor".
3. "Worst-case loss is X": the worst simulated windows (AIG 15 Sep 2008, one-week) lost 24% at a 90% floor (shortfall 14 points);
   keep "unless prices gap more than about 25% in a day", and never "you cannot lose more than 10%". At 1,581 one-year windows 7 ended more than 1
   point under a 90% floor (0.44%).
4. "93 of 93" is 2018 to 2026 only (already flagged). Do not generalize to other terms.
5. Cash lock wording: it fires in about 0.2% of one-month and 2.9% of one-year windows at 90% (not "often"); a more
   common experience is "ended within 2 points of the floor" (13.9% of one-year windows at 90%, 21.9% at 95%).
6. The 1-year default will stop working on 2026-12-17 (holiday horizon); ops item.
7. The marketing claim of a floor "slider" from 50% to 98%: only 80% to 95% is backtested well enough (see section 1);
   the contract allows more.
8. Anything about "short rides" earning something: median one-week +0.04%, mean negative at 25 bps. No promotional copy.

## 9. Caveats (state these next to any number)

- **Survivorship bias.** Only companies that exist in 2026 (and indices) are in the data: no Lehman, Enron, SVB, no bankruptcies
  or delistings. A -100% gap breaks any m. Single-stock breach rates are therefore a floor, not a ceiling.
- **Daily closes only.** No intraday path, no halts, no token-vs-stock gap, no oracle (TWAP) lag, no weekend token trading. The
  contract trades mid-session (15:30 to 19:30 UTC) and never at the close; the first study measured a mid-window variant
  (m_study REPORT section on timing) with similar results, not repeated here. Weekends and overnight gaps are fully inside the
  daily returns.
- **Short windows have large sampling noise.** Material-breach events are 7 to 18 windows per term in the whole pooled
  history and the same gap days appear in every term, so the cells are not independent. CIs shown are 95% year-block
  bootstrap (resampling calendar start-years, 1,000 draws; medians 300 draws); one-week and one-month medians are tight
  only because there are tens of thousands of overlapping-in-time windows, not because we know the future.
- **Pooling.** Indices and 23 single stocks pooled equally per window; single stocks drive all breaches. Baskets are treated as one
  daily-rebalanced equal-weight asset. The result for TSLA-like names (46 bps cost, whipsaw) is worse than the pooled mean.
- **Costs** are a flat 6 or 25 bps one-way on traded value (swap fee plus slippage). No gas, no keeper reward, no weekend cost,
  USDT earns 0%. The final unwind is charged.
- **Hold return** is price return for indices and total (dividend-adjusted) for stocks; tokenized stocks track total return only if the
  issuer passes dividends through.
- **Contract vs simulator.** Simulator locks at V <= floor; the contract latch fires at V <= floor / 1.01 (1% confirmation margin). The
  rebalance already sets target stock to zero at the floor, so the effect on the numbers is negligible but not zero.
- **Evidence labels** ("backtested") mean that many historical windows, not that the future will look like them.

## 10. Reproduce

`run_all.sh` (about 6 minutes on 12 cores). Outputs: `results/S1_nonoverlap.csv` (term x floor x cost x group, with CIs),
`S2_overlap.csv`, `S3_start_regime.csv`, `S4_named_starts.csv`, `S5_deposit_size.csv`, `S6_stress_counts.csv`,
`P1_median_ci.csv`, `A1_contract_accept.csv`, `A2_min_deposit.csv`, `tables.md`; `charts/` has 5 PNGs. Data is cached
under `data/` (gitignored).
