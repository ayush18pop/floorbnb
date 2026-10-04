# FIRST60: public /try simulator (agent/FIRST60)

- Route /try (apps/web/app/try/page.tsx, components/try/simulator.tsx, lib/try.ts). Public, read-only, no wallet. IMPORTANT for LOCK: /try must stay reachable when the app is locked (exclude it from the middleware matcher).
- Choices: NVDA, QQQ, SPY, all three (SPCXB not offered: no history); floor slider 80 to 95 (default 90); term 1m, 3m, 6m, 1y (default 1y).
- Numbers: all from lib/backtest.ts (simulate, buildChart) on data/closes.json. No new numbers. Default view: worst 1-year window (NVDA: hold -51.0%, vault -10.0%).
- Crash replays (data runs 2018-01-02 to 2026-10-02): COVID crash 19 Feb to 23 Mar 2020; 2022 bear market 3 Jan to 30 Dec 2022; Aug 2024 vol spike 10 Jul to 7 Aug 2024; Apr 2025 tariff drop 19 Feb to 8 Apr 2025. Same simulate() over exactly those dates.
- Always-visible risk card with link to the existing Risks drawer (RisksBody in DetailsDrawer).
- Entries: landing hero "Try it, no wallet" (primary) and nav link "Try it".
- Fit: 1440x900 and 1280x720 no scroll (document height equals viewport); 375 stacks and scrolls (1288px). Screenshots: apps/web/screenshots/first60/ (script apps/web/scripts/first60-shots.mjs).
- Time to first number: numbers render with first paint, no input needed (0.2 to 2.6 s to DOM-ready on the dev server).
- Tests: lib/try.test.ts (episode windows, match to backtest.ts output). tsc, eslint, vitest (65), build pass.
- Not done: lock-aware "Open the app" (LOCK owns it); episodes are fixed windows, not per-asset peak-to-trough.
