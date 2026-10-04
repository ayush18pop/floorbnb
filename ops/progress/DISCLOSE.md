# DISCLOSE progress (honesty pass)

## Role statements, verified in code
All from `packages/contracts/src/FloorFactory.sol` (modifiers `onlyOwner`, `onlyGuardian`, `onlyGuardianOrOwner`) and `FloorVault.sol`:
- Keeper: `rebalance` requires `isKeeper` (Vault:200-201); `setKeeper` owner only (Factory:309). Router must pass `routerOk`; bounds in Vault `_plan`/`minInterval`.
- Guardian: `pause/unpause/setHalted/removeRouter/disableAsset` (guardian or owner, Factory:319-380), `setNonTradingDay(s)`, `setHolidayHorizon`, `approveTokenImpl` (guardian only). No fund-moving function.
- Owner: `addAsset`, `reenableAsset`, `addRouter` (`ROUTER_DELAY = 24 hours`, Factory:42,472), `setGuardian`, `setDefaults` (new positions only), `setLimits`, `setTokenBeacon`, `transferOwnership`. No access to vault funds.
- Depositor: `requestClose`, `closeToUSDT`, `exitInKind`, `rescue` are `onlyOwner` on the vault (Vault:303-422), no factory reads.
- Public path: Vault:242-280 (`hasOpenSeconds`, `tolDirectBps` 100 = 1%, `params/56.json` publicDelay 3600, caps 1000/5000).
- No-price rule: Vault:105,687 (`noPrice`). Disabled token E*=0: Vault `_plan`. Cash lock: Vault `_lockCheck`.
- x402: `packages/x402/src/b402.ts` header says UNTESTED-LIVE; `apps/api/src/paid.ts:77` default `self`.
- Note: factory `pokeMultiplier` has no access modifier (anyone can call), so I did not list it as a keeper power.
- Note: guardian powers are wider than a halt-only description (F-12 in reviews/security-01.md): disable asset, approve token impl. Disclosed.

## Changed claims
- risks page: rewritten; roles, all batch disclosures; gap limit "about 24%"; worst one-week 24%; 0.44% (0.07 to 0.93), cash lock 2.85%; upside 4 x (100 - floor)%.
- docs index, FAQ, how-it-works step 2: removed "loss about 10% or less"; 42% now "at a 90% floor", 0.44% added.
- backtest: "93 of 93" x2 replaced by short-sample wording plus 0.44% (CI).
- evidence: CI 0.11 to 0.91 changed to 0.07 to 0.93 (x2); "Lose at most N%" row labels now "Floor N%"; 42% qualified; 93-of-93 note and one-week 24% added.
- trade-off: 42% qualified at 90% floor, chart title and labels.
- contracts roles, agents b402 (built, untested live; own facilitator), new `/docs/open-items` + docs-nav entry (under /docs, allowed by launch.ts ALLOW_PREFIX).
- README: numbers, roles, disclosures, open items, launch lock, b402.
- CONTEXT.md: 93/93 demoted, CI, 42% qualified, cash lock and 24% figures. docs/DECISIONS.md: 93/93 wording and a honesty-pass note. docs/RESEARCH_RESULTS.md: 42% header, 25% gap to about 24%.

## Not owned, still need WIRING/manager attention
`apps/web/components/{landing/sections,locked/lock-screen,try/simulator,app/risks,app/builder,charts/bars}.tsx` and `lib/floor-config.ts`, `lib/cppi.ts` matched "42%/guarantee/10%" greps; not edited.
- landing/sections.tsx:121 tile shows "~42%" without "at a 90% floor" (not mine to edit).
