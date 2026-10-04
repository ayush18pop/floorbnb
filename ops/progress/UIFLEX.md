# UIFLEX progress

Floor slider (50-98, step 1, presets 80/85/90/95), term presets (1w, 1m, 3m, 6m, 1y) plus custom 7-365 days, live createPosition validation using chain defaults (mock otherwise), term in URL (`term=days`), review/confirmed updated.
Config: apps/web/lib/floor-config.ts. Validation: apps/web/lib/create-validation.ts. Screenshots: apps/web/screenshots/uiflex/.
Waiting on MSTUDY2 REPORT.md (absent at last check): `testedMin/testedMax` and term `tested` flags are one-year, 80-95% only until then.

Update: slider 80-95 and terms 1m/3m/6m/1y (custom 30-365) per MSTUDY2 report (08acbf4); live backtest chart (apps/web/lib/backtest.ts, data/closes.json from research/m_study data, NVDA/QQQ/SPY 2018-2026; SPCXB has no history); tradeoff visual; holiday-horizon check (constant 2027-12-31, ABI lacks holidayHorizonDay).
