# FIX5 progress (fixes after the real Pashov run 04)
Branch agent/FIX5. Triage: reviews/audit-pashov-04-triage.md. Tests: forge 270 pass / 2 skipped (fork run: 13 pass), SDK 303, keeper 40 (5 skipped), api 23, mcp 21 (2 skipped), x402 34 (2 skipped). forge fmt clean. ABIs unchanged (no interface change), SDK cppi vectors unchanged (`_plan` arithmetic unchanged).

Fixed: lock only from a fully guarded price (#3), lock needs open market and a tolDirectBps margin (#4), disabled-token failed price valued at its TWAP (#2), lock survives a call that cannot trade, `cashLocked` unwinds unpriced tokens, zero TWAP rejected, public-delay restarts only on real change, createPosition per-token minTrade and buy-band checks, preflight router.factory and approveTarget, `_capTransfer` long return.
Needs lead: #1, #5, permanent lock, public delay from last trade, disabled weight in USDT, trusted-role disclosures.
