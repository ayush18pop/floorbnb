# Pashov run 05 triage (run 20261004-180820, contracts at ec6e6d6)

Report: `reviews/audit-pashov-05-real.md`. `packages/contracts/src` is byte-identical to ec6e6d6 at this triage, so this run audited the code that would be deployed. Four findings, no Critical/High, no new class.

| # | Finding | Conf. | Status | Decision |
|---|---|---|---|---|
| 1 | One address fills the TVL cap and blocks other users | 85 | KNOWN | Already accepted (batch acceptance #1, TVL squatting). Guard: caps 1,000/5,000, `exitInKind`. |
| 2 | Factory checks the first buy against the keeper band; `rebalancePublic` uses 2x that band | 75 | KNOWN (3 scans) | **Accepted, new (#7).** Only the keeper can buy for some small baskets; sells are unaffected and the keeper is the intended buyer. No contract change (freeze). Params keep the default buy band at 2%. Disclose. |
| 3 | Thin-pool TWAP held low sets the permanent cash lock | 75 | KNOWN | Already accepted (batch #3). The report's fix (two reads one TWAP window apart) is a contract change; deferred past launch. Guards: all guards pass, market open, value below floor by tolDirectBps. |
| 4 | `rebalancePublic` can be traded around within the slippage bound | 75 | KNOWN (6 scans) | Already accepted (batch #2). Guard: keeper acts first, `publicDelay`, minTrade, TWAP bounds. |

Notes from the run: stale ledger records (TakerProbe access control, lock accepts a failed price) were not re-checked; TakerProbe is a spike contract and is not deployed. Rejected as privileged-only leads (no unprivileged amplifier): approveTokenImpl, removeRouter, setHolidayHorizon, and **owner and guardian set to the same address in the deploy params** (our `56.json` does this by the team lead's choice: one wallet holds both roles, so the guardian does not add separation; disclosed in the trusted-roles text).
