# FIX3 progress (fixes after the real Pashov run 02)
Branch agent/FIX3. Triage: reviews/audit-pashov-02-triage.md. Tests: forge 216 pass / 2 skipped (fork tests need RPC, not run), SDK 303 pass, keeper 40 pass (5 skipped). forge fmt clean.

Fixed: #4 sells ignore minTrade above dust, #6 closeToUSDT uses plain TWAP, #7 disabled token no longer blocks buys, #8 CPPI sells suspended while a held asset has no TWAP, #9 sell band scaled by weight, #10 preview skips multiplier-blocked token, #11 public delay in open-market seconds, #13 cardinality >= ceil(window*4/3) in factory, createPosition and preflight; findings 1-3 hardened in the spike; leads: amountInOk, preflight bounds, zero beacon deploy, addAsset sanity, setDefaults bounds, _capTransfer no-code, createPosition while halted, holiday horizon.
Not fixed (listed or accepted-needs-lead): #5 TVL squat, #12 public sandwich.
Needs lead: #8 behaviour, #11 demo side effect (publicDelay), #5 and #12 acceptance. The audit must be re-run on the final commit.
