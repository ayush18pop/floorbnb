# Docs sync report (2026-10-05)

Branch `docs/sync-2026-10-05`, PR to `dev`. Docs and public copy only. Nothing under `packages/contracts/src`, `packages/contracts/script/params`, tests, `apps/web/lib/launch.ts` or the lock settings was changed, and `.env.render` was not read.

Checks run: `pnpm typecheck` (all workspaces) passed. Tests passed in `apps/web` (103), `apps/api` (28) and `packages/x402` (32 passed, 2 skipped: `src/fork.test.ts` needs an RPC, not run).

## Files changed

| File | Change |
|---|---|
| `README.md` | Caps are shared and owner-changeable (`setLimits`). Owner and guardian are the same address. EOA keeper primary, Agentic Wallet optional and not set up. b402 section: endpoint, auth headers, no clientId/RSA/merchant application, supported and verify verified live 2026-10-05, settle not run, payTo address, Agent Studio and the Agentic Wallet side prize not part of the submission. Cap-fill disclosure. Latest AI-assisted run mentioned without a bug count (see `docs/AUDIT.md` claim rules). Site line: `floor.ayush.works` planned, Vercel fallback. |
| `apps/web/app/docs/contracts/page.tsx` | Caps shared and owner-changeable. Floor and term ranges (UI 80 to 95 and 30 days to 1 year; contract 50 to 98 and 7 to 400 days). Owner and guardian same address. Agentic Wallet wording. |
| `apps/web/app/docs/risks/page.tsx` | Fixed the false line "owner and guardian are separate wallets". New risk: one caller can fill the shared cap. Owner can change caps. |
| `apps/web/app/docs/open-items/page.tsx` | Guardian line fixed. New row for the 2026-10-05 audit run (proposed, not signed). Holiday table row fixed (ends 31 Dec 2028; a 365-day term stops being creatable after about 18 Dec 2027). Agentic Wallet row. Trusted-roles row. Date. |
| `apps/web/app/docs/agents/page.tsx` | Keeper heading badge and wording: EOA primary, Agentic Wallet optional, not set up. |
| `apps/web/components/charts/agent-flow.tsx` | Figure label "EOA, plus Agentic Wallet" to "EOA; Agentic Wallet optional" (the figure is shown on `/docs/agents`). |
| `apps/web/public/.well-known/agent-registration.json` | `REPLACE_DOMAIN` to `floor.ayush.works` (3 places). Prepared, not deployed by this PR, not broadcast. |
| `ops/erc8004/RUNBOOK.md` | Status: prepared, NOT broadcast, optional. Domain facts. Agent Studio and the Agentic Wallet side prize skipped. New unverified items. |
| `ops/deploy/runbook.md` | Section 7 and 9 and the deploy step: 15.1M gas, about 0.00076 BNB at 0.05 gwei (2026-10-05 direct-only fork dry-run; old 9.7M kept as history). Signing by keystore or Ledger, not MetaMask. Addresses. `publicDelay` 14400 changed to 3600 in the `setDefaults` and verify examples. Section 1 heading no longer says "not decided". Caps note. K-1 status. |
| `reviews/acceptances.md` | Appended "Pashov run 06": PROPOSED acceptance, NOT SIGNED. |
| `dx/raw/MANAGER-b402.md` | Appended one entry (append only). |
| `docs/ARCHITECTURE.md` | Stale RSA, application and X-Tesla lines marked superseded or corrected to HMAC and Web3 API key. |
| `docs/CONTRACTS.md` | Caps: shared, owner can change, cap-fill note. `publicDelay` design default 4 h versus mainnet 3600 s. |
| `docs/DECISIONS.md`, `docs/AUDIT.md`, `docs/DEPLOY_RENDER.md`, `docs/EXECUTION_PLAN.md`, `CONTEXT.md`, `skills/floor/references/x402.md` | Decisions 5 to 8, run 06 pointer, payTo, snapshot banner, b402 correction and IST deadline, "untested live" line. |
| `ops/submission/docs-sync-report.md` | This file. |

## Mismatches found and NOT fixed

1. **Public delay in the UI.** `apps/web/lib/app-config.ts` has `PUBLIC_DELAY_HOURS = 4`, so the locked `/agents` page and the keeper log say "after 4 h idle". Mainnet params say `publicDelay` 3600 (1 h). Left alone: it is app code behind the lock. The public docs pages say 3600 and are correct.
2. **`publicDelay` 14400 in other params files.** `ops/deploy/variants/*.json` and `packages/contracts/script/params/31337.json` still say 14400. Only `56.json` says 3600. The dry-run harness uses 31337.
3. **`minTrade` in code comments.** `apps/keeper/src/agg.ts` and `keeper.ts` comments say "6 USDT at launch". The committed default is 20 USDT (`56.json`, `DefaultsCheck`). The runbook uses 6 only as a temporary demo `setDefaults`. Docs are consistent with the params.
4. **Holiday file name.** `56.json` points to `holidays/nyse_2026_2027.json`, which now covers through 2028-12-31. Name is stale, content is right. `SetHolidays.s.sol` requires the table to reach 2028-12-25.
5. **Guardian and owner in design text.** `docs/CONTRACTS.md` line 52 ("Owner multisig") and line 446 ("Guardian: Separate EOA") are the original design. `56.json` has one address for both. Also the batch acceptance item 6 in `reviews/acceptances.md` says "separate guardian and owner wallets" (a past record, left as written; the later note in the same file corrects it).
6. **Old acceptance text.** The A12 F-04 acceptance says the public path opens "after 4 h". Mainnet is 3600 s.
7. **Leads count.** The task said 18 unscored leads. The report `floorbnb-pashov-ai-audit-report-20261005-051324.md` lists 19. `reviews/acceptances.md` says 19. Public pages give no count.
8. **Domain in deploy config.** `render.yaml`, `ops/deploy/render-three-services.yaml` and `render.env.template` set `WEB_ORIGIN` and `MCP_ALLOWED_ORIGINS` to the Vercel URL only. Add `https://floor.ayush.works` when the domain goes live. Not changed (deploy config, not docs).
9. **Locked `/agents` page.** `apps/web/app/agents/page.tsx` still says the Agentic Wallet "depends on Developer Mode, whose behaviour ... is still being tested". Not in `app/docs/**`, left alone.
10. **Old logs and plans.** `ops/progress/A17.md`, `A18.md`, `AGENTPATH.md`, `DISCLOSE.md`, `A09*.md`, `docs/EXECUTION_PLAN.md` (steps 539, 544, 619) and the earlier lines of `dx/raw/MANAGER-b402.md` still contain "untested live", X-Tesla, clientId, RSA, merchant application and `floorbnb.vercel.app`. They are dated working logs. A banner was added to the plan; the logs were not rewritten.
11. **Audited commit placeholder.** `reviews/audit-pashov-final.md` does not exist, so `AUDITED_COMMIT` in the runbook is still a placeholder.
12. **Early closes.** Docs say early closes count as full closures (holiday JSON note). The audit run flagged the opposite risk as a lead (the 15:30 to 19:30 window stays open on early-close days unless the guardian lists them). The JSON lists the early-close days it names, so this is covered for those days. Not re-checked against nyse.com.

## Checked and consistent

Caps 1,000 and 5,000 USDT (`FloorFactory.sol` 44 to 45, `56.json`); `setLimits` is `onlyOwner`. Contract floors 50 to 98 and terms 7 to 400 days; UI slider 80 to 95, UI terms 30 to 365. `minTrade` 20 USDT (`56.json`). Holiday table through 2028-12-31 (horizon day 21549; last listed day 2028-12-25). Window Mon to Fri 15:30 to 19:30 UTC (`MarketHours.sol`). `publicDelay` 3600 (`56.json`; docs pages say 3600). Owner and guardian `0x762c…1F1A`, keeper `0x46FD…e58a` (`56.json`). `X402_FACILITATOR` defaults to `self` (`apps/api/src/paid.ts` line 109). Deadline 2026-10-11 12:00 UTC is 17:30 IST; no doc gave a different time.

## Not verified

- The 15.1M gas, 0.00076 BNB and the demo wallet `0x05BD…E685`: given by the team lead. Not re-run here (no forge, anvil or RPC in this session). No per-step breakdown exists for the new run.
- The `payTo` address `0xF5f3…816B` appears in the repo only as a comment in the Render files and the task; it is not set in code.
- That the MCP endpoint (the Render onebox /mcp) completes a full MCP handshake. `floor.ayush.works` was checked live on 2026-10-05 (200).
- Settle on b402 (not run live). The live supported and verify runs are from the team's notes, not re-run here.
- That the keeper sell-skip (K-1) is fixed on a fork. The code compares by USDT value; no fork run.
- The `_reportClosed` gas claim rejected in the audit gate (reasoned by four agents, not tested).
- The holiday list against nyse.com (no network use in this pass).
- The deployed state of Vercel, Render and the `.well-known` file.
