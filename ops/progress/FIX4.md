# FIX4 progress (fixes after the real Pashov run 03)
Branch agent/FIX4. Triage: reviews/audit-pashov-03-triage.md. Tests: forge 250 pass / 2 skipped (fork run separately: 13 pass), SDK 303, keeper 40 (5 skipped), api 23, mcp 21 (2 skipped). forge fmt clean.

Fixed: #2 disabled-token V, #3 buy band by weight, #4 preview skips paused, #5 holidays/halts not open time (factory.hasOpenSeconds, tradingResumedAt), cash lock persistent (cashLocked, lockIfBelowFloor), PositionTooSmall, paused held token suppresses buys, listing and defaults checks (DefaultsCheck lib), vault cardinality for its window, per-asset public delay, 14-day unwind buffer, deploy casts/preflight/beacon slot/runbook.
Needs lead: #1, #6, public delay from last trade, permanent cash lock. The audit must be re-run on the final commit.
