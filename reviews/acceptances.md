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
6. **Trusted roles keeper / guardian / owner:** accepted. Guard: 24 h `ROUTER_DELAY`, guardian can only halt. (Correction 2026-10-05: at launch the owner and guardian are the SAME address, 0x762c9626711BCc882050cBf06Edd610fE8b91F1A, so there is no separation between them; see #7 and the G3 confirmation below.) **Required disclosure:** the risks page and README must name these roles and what each can do.
Also recorded: **#8** keep the no-de-risking-sell rule when a held stock has no TWAP (fails closed; owner `exitInKind`). **#11** demo `publicDelay` = 3600 s (`script/params/56.json`). **H1** router allowlist = Pancake only (direct-only variant).

## Pashov run 05 (2026-10-04, contracts ec6e6d6): one new acceptance
7. **Public path uses 2x the keeper buy band (run 05 #2):** accepted by the manager on the team lead's "do it yourself" delegation; **confirm in writing before mainnet.** Guard: sells are unaffected; the keeper buys; no contract change. Disclose in `/docs/open-items` and the risks page: in a keeper outage, small positions may not be bought by the public path. Findings #1, #3 and #4 of run 05 are the already-accepted batch items 1, 3 and 2.
Also record: owner and guardian are the same address (`0x762c…1F1A`) by choice, so the guardian gives no separation; the trusted-roles disclosure must say so.

## Pashov run 06 (2026-10-05, repo head `84706ee`): PROPOSED acceptance, NOT SIGNED
Report: `floorbnb-pashov-ai-audit-report-20261005-051324.md` (on `main`). AI-assisted run, 12 agents, 1 pass. Result: 1 finding (confidence 85) and 19 unscored leads. No contract change is proposed. **This is a proposal. Only the team lead can accept it, in writing, with a name and a date. Until then it is not an acceptance.**
1. **Shared TVL cap can be filled (finding, `FloorFactory.createPosition`):** proposed accepted for the hackathon launch. A caller with 5,000 USDT can open five positions at `maxDeposit` and leave them open, so every later `createPosition` reverts with `TvlCapReached`. Guards: it costs the caller gas and the use of the money, not the money; the caller can exit at any time; the owner can change both caps at any time with `setLimits(maxDeposit, maxTotalTvl)`, with no redeploy, and existing positions are unaffected. Limit of the guard: a caller with the new cap's worth of USDT can fill it again. Disclosed in `README.md`, `/docs/risks` and `/docs/open-items`.
2. **Leads (19, unscored):** not accepted and not rejected. They are trails for manual review, and some are already accepted above (public sandwich, cash lock, trusted roles). Others are new and unreviewed by a human, for example: one failed pool guard blocks buys of every asset, the multiplier check covers only the traded token, a keeper picks the router and so the slippage limit, early-close days are not modelled, the closed-position array grows without bound. The list is in the report.
3. **Raised by one agent and rejected at the gate:** a tight gas limit on `closeToUSDT` makes the report to the factory fail, so a closed position keeps its deposit in `totalTvl`. Four other agents traced it and found that the 63/64 gas rule leaves too little gas for the rest of the call, so the whole call reverts. Not tested here; no test was run in this docs pass.
Also noted: the owner can change the launch caps at any time (README, `/docs/contracts`, `/docs/risks`). That is a trust point beside "owner and guardian are the same address".
Status: **PROPOSED. Not signed by the team lead.**


## G3 team lead confirmation, 2026-10-05
Recorded by the manager in the Claude Code session. The manager showed the team lead a plain-language list of what is being confirmed: the six batch acceptances above (TVL cap can be filled, public rebalance can be sandwiched, permanent cash lock, public delay timing, disabled-token weight stays in USDT, trusted keeper/guardian/owner roles), the Pashov run 06 proposal (1 finding, 19 unscored leads, no contract change), and the corrections that owner and guardian are the same address at launch and that the owner can change the launch caps at any time. The team lead replied: "Oh yeah sure do that" (2026-10-05).
This is recorded as the team lead's confirmation of that list. The AI-assisted reviews are not a formal human audit. If the team lead wants to reverse or change any item, say so in writing and this section is amended.
Status: **CONFIRMED by the team lead in chat, 2026-10-05.** The contracts were deployed before this was recorded (2026-10-05, block about 125815981), so G3 was closed after the fact.
