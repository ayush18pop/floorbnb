# Accepted findings (written acceptances, per docs/AUDIT.md)

Only the team lead can accept a finding. An acceptance names the finding, why it is accepted, the guard that limits loss, and who accepted it and when.

## A12 F-04 (Medium): sells revert when spot lags the 10-minute TWAP by more than 0.3%
- Source: `reviews/security-01.md` F-04. Contract threat id: T-lag in `docs/CONTRACTS.md`. Behaviour is pinned by `test_audit_F04_KNOWN_*`.
- Decision: **accepted, option 1.** The tolerance is not widened. Widening it would loosen invariant I1 / threat T1 (the floor).
- Why acceptable: a reverted sell is retried by the keeper, and `rebalancePublic` opens to anyone after 4 h idle. The failure mode is a delayed sell during a fast move, not a wrong trade.
- Guards that limit loss: launch caps (1,000 USDT per position, 5,000 USDT total), the 25% gap limit already stated on every product surface, `exitInKind` always allowed.
- Required disclosure: the risks page and FAQ must say that in a fast crash a sell can be delayed until spot and the 10-minute average agree, and that this can let the value fall below the floor.
- Accepted by: team lead, in the Claude Code session on 2026-10-03 ("yes accept option 1"). Name to be added by the team lead.

## Batch acceptance, 2026-10-04 (six findings recommended in `reviews/audit-pashov-02-triage.md`, `-03-triage.md`, `-04-real.md`)
Decided by the manager on the team lead's instruction "do it yourself" in the Claude Code session on 2026-10-04. **The team lead should confirm or reverse this in writing before mainnet** (G3). Each is accepted with the guard and disclosure shown; none changes contract code.
1. **TVL squatting (#1):** accepted. Guard: launch caps 1,000 / 5,000 USDT, per-position vaults, `exitInKind` always allowed. Disclose: caps and that a pool's TVL can be manipulated.
2. **`rebalancePublic` sandwich (#5/#12):** accepted. Guard: TWAP price bounds, SwapGuard balance deltas, `minTrade`, keeper acts first; public path opens only after `publicDelay` of open-market time (demo value 3600 s). Disclose: public rebalances can be sandwiched within the slippage bound.
3. **Permanent cash lock:** accepted. Guard: lock needs all guards, market open and value below floor by `tolDirectBps`; the owner can always `exitInKind`/withdraw USDT. Disclose: once locked, a position stays in USDT until the term ends and cannot re-enter stocks.
4. **Public delay counts from the last trade and counts pause time:** accepted as is. Disclose in docs only.
5. **Disabled token's weight stays in USDT:** accepted. Guard: `exitInKind`. Disclose in docs only.
6. **Trusted roles keeper / guardian / owner:** accepted. Guard: separate guardian and owner wallets (owner hardware wallet), 24 h `ROUTER_DELAY`, guardian can only halt. **Required disclosure:** the risks page and README must name these roles and what each can do.
Also recorded: **#8** keep the no-de-risking-sell rule when a held stock has no TWAP (fails closed; owner `exitInKind`). **#11** demo `publicDelay` = 3600 s (`script/params/56.json`). **H1** router allowlist = Pancake only (direct-only variant).

## Pashov run 05 (2026-10-04, contracts ec6e6d6): one new acceptance
7. **Public path uses 2x the keeper buy band (run 05 #2):** accepted by the manager on the team lead's "do it yourself" delegation; **confirm in writing before mainnet.** Guard: sells are unaffected; the keeper buys; no contract change. Disclose in `/docs/open-items` and the risks page: in a keeper outage, small positions may not be bought by the public path. Findings #1, #3 and #4 of run 05 are the already-accepted batch items 1, 3 and 2.
Also record: owner and guardian are the same address (`0x762c…1F1A`) by choice, so the guardian gives no separation; the trusted-roles disclosure must say so.
