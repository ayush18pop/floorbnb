# Accepted findings (written acceptances, per docs/AUDIT.md)

Only the team lead can accept a finding. An acceptance names the finding, why it is accepted, the guard that limits loss, and who accepted it and when.

## A12 F-04 (Medium): sells revert when spot lags the 10-minute TWAP by more than 0.3%
- Source: `reviews/security-01.md` F-04. Contract threat id: T-lag in `docs/CONTRACTS.md`. Behaviour is pinned by `test_audit_F04_KNOWN_*`.
- Decision: **accepted, option 1.** The tolerance is not widened. Widening it would loosen invariant I1 / threat T1 (the floor).
- Why acceptable: a reverted sell is retried by the keeper, and `rebalancePublic` opens to anyone after 4 h idle. The failure mode is a delayed sell during a fast move, not a wrong trade.
- Guards that limit loss: launch caps (1,000 USDT per position, 5,000 USDT total), the 25% gap limit already stated on every product surface, `exitInKind` always allowed.
- Required disclosure: the risks page and FAQ must say that in a fast crash a sell can be delayed until spot and the 10-minute average agree, and that this can let the value fall below the floor.
- Accepted by: team lead, in the Claude Code session on 2026-10-03 ("yes accept option 1"). Name to be added by the team lead.
