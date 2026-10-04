# UIFLEX progress

Floor slider (50-98, step 1, presets 80/85/90/95), term presets (1w, 1m, 3m, 6m, 1y) plus custom 7-365 days, live createPosition validation using chain defaults (mock otherwise), term in URL (`term=days`), review/confirmed updated.
Config: apps/web/lib/floor-config.ts. Validation: apps/web/lib/create-validation.ts. Screenshots: apps/web/screenshots/uiflex/.
Waiting on MSTUDY2 REPORT.md (absent at last check): `testedMin/testedMax` and term `tested` flags are one-year, 80-95% only until then.
