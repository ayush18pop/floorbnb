# LOCAL progress (full local stack for hands-on UX testing)

Branch agent/LOCAL. Everything runs on an anvil fork of BSC (chain 31337). No real network was touched. `packages/contracts/src` and `script` are unchanged (the deploy uses symlinks into a scratch project in `local/.work`, only the params file differs: direct Pancake router only). **No contract change is needed.**

Start: `pnpm local:up` (see `local/README.md`). Fork RPC: env `BSC_FORK_RPC_URL` (private Alchemy, read from env only, never printed or saved; no rate-limit errors seen in the run), else public blastapi / onfinality (archive-capable; publicnode 403s on old state, 1rpc/dataseed/blxr/blockrazor are non-archive).

## Verified end to end (`pnpm local:e2e`, headless Chromium, 12 of 12 steps, final run on the Alchemy fork)
connect Dev wallet (badge, 200.00 USDT read from chain) / builder -> review (NVDAB, 55 USDT, floor 90%) / approve + createPosition -> Confirmed / positions list + detail with real chain numbers / keeper buys 22 USDT of NVDAB in the window (keeper log + Rebalanced event, 40% in stocks) / `crash NVDAB 15` -> keeper sells to 17% in stocks, detail updates / keeper page lists buy and sell / weekend and after-hours banners / second position QQQB then **Exit in kind** / **Close to USDT** (request close, keeper sells, closeToUSDT, +51.61 USDT in wallet) / **cash lock** after `crash NVDAB 26` (value 49.20 under floor 49.50, Cash lock notice). Screenshots: `local/screens/`. API (`/healthz`, `/v1/positions/:vault`, `/v1/keeper/runs`) and MCP (`initialize`, `tools/list`, `get_status`) answered against the fork.

## Bugs and findings, prioritised
FIXED = fixed on this branch with a test where the code is testable.

**P0 (blocked the real flow)**
1. FIXED. Web was hard-wired to chain 56 (wagmi, network guard, "Create" button disabled unless chain 56). Now `APP_CHAIN_ID` (56 in production, 31337 when `NEXT_PUBLIC_LOCAL_DEV=1`).
2. FIXED. Keeper log page failed ("Keeper API 404"): the web called `/v1/keeper/status`, which does not exist, and `/v1/keeper/runs` returns a different shape and is always empty. The web chain source now builds the log from on-chain `Rebalanced` events (test `keeper-runs.test.ts`). Activity rows also marked every caller "keeper"; now checked with `factory.isKeeper`.
3. FIXED. Close dialog: after "Request close" / "Close to USDT" the position view was replaced by a skeleton, which unmounted the dialog and lost its "Close requested / Done" message, and the refresh ran before the tx was mined. Now the view keeps the old data during a refresh (`useAsync` group, test `use.test.ts`) and exits wait for the receipt.
4. FIXED. A reverted approve, create or exit was shown as success (receipt status was never checked). Now an error is shown.
5. FIXED (keeper). The EOA sender kept its local nonce after a receipt timeout, so one dropped tx (or a chain revert) made every later tx stick behind a gap until restart. Now resyncs from the node (test `apps/keeper/src/chain.test.ts`, fails without the fix).

**P1**
6. OPEN, needs a decision. Keeper tile always shows **Offline**: nothing reports a keeper heartbeat (API run store is in memory, empty). Needs a keeper-to-API heartbeat or a real run store. The web reports offline when no heartbeat is known rather than guessing.
7. FIXED (opt-in). API `/v1/keeper/runs` and MCP `get_rebalance_history` were always empty. `FLOOR_RUNS_FROM_BLOCK=<deploy block>` now serves runs from chain events (`ChainKeeperRunStore`, test). Off by default (public RPCs reject open-ended log ranges); production needs the real deploy block set, or a keeper-written store.
8. OPEN, product risk for the lead. After a large drop the pool's in-range liquidity falls under `assetMinLiquidity` (1e21) and the vault **cannot trade at all** (fails closed; exit in kind still works). Measured on the fork, NVDAB pool, fresh state, price-limited swap with no LP reaction: -22% L=1.0e23, -26% L=3.4e22 (tradable), -27% L=8.3e20 (not tradable), -30% L=1.4e20. So a cash lock can only engage for a gap of about 25% to 27%; a larger gap leaves the position holding stock it cannot sell. Real LPs would re-range, so this is a worst case, but worth a look at `assetMinLiquidity` and the pool depth before launch.
9. OPEN, copy/design. A position closed by **Exit in kind** shows "0.00 USDT -100%" (the vault is empty and the value in kind is not recorded). Closed-to-USDT now shows the payout (FIXED). Suggest "Exited in kind" instead of a number.
10. OPEN, data. Builder warns for starting buys under a hardcoded 20 USDT minimum while the chain's live `minTrade` (6 in the demo setup) is what is enforced; read it from the factory.

**P2**
11. FIXED. Value chart y-axis could not go below a step of 50, so a 55 USDT position was drawn on a 0 to 100 scale; steps now start at 1.
12. FIXED. Explorer links (BscScan) hidden in local-dev mode (the fork is not on BscScan).
13. OPEN, copy. After-hours (weekday) banner repeats "The floor maths already assumes the full weekend gap". Cash lock text says "reached the floor" while the value can be below it (49.20 vs 49.50).
14. OPEN. Header chip says "BNB CHAIN" on the local fork.

**P3**
15. OPEN. Hydration mismatch warning on reload when a wallet reconnects (wagmi `ssr: true` without cookie storage and `initialState`); React recovers, a one-frame flash. Pre-existing.
16. Local-only: confirmation page "First rebalance" and some term dates use the browser clock (real Sunday) not chain time (fork Tuesday).
17. Next dev warns about `scroll-behavior: smooth` on `<html>` (add `data-scroll-behavior`).

## Local stack notes (things that do not work or behave differently)
- Aggregator route disabled (needs live Binance quotes and a real clock). Direct Pancake only.
- bStocks are not freely available on the fork and the pools hold few tokens: scenarios write the trader's token balance into storage (ERC-7201 layout) and sell through the real router.
- `evm_revert` (`local:reset`) leaves the keeper's nonce counter ahead: `local:reset` restarts the keeper. After a reset the first heavy swap can be slow while anvil refetches state (default viem timeout was too short; raised).
- Once, with the public RPC, anvil stopped answering after a snapshot/revert while upstream was slow; `local:down` and `local:up` recovered it.
- Production build checked: with `NEXT_PUBLIC_LOCAL_DEV` unset, `next build` output contains none of "LOCAL DEV WALLET", "Dev wallet", the local chain definition or `127.0.0.1:8545` (needed `env` in `next.config.ts` so the flag is always inlined).
- Tests: `local` 8, `apps/web` 9, `apps/api` 26, `apps/keeper` 42 (5 fork tests skipped), all green.

## For the lead to try by hand
1. Builder with 2 or 3 stocks and a small amount (the 20 vs 6 USDT minimum warning, item 10). 2. `pnpm local:scenario rally QQQB 10` then watch the keeper buy. 3. `pnpm local:scenario gap 20` on a 3-stock position. 4. Wrong-network banner with MetaMask on another chain (Dev wallet cannot show it). 5. Exit in kind and Close to USDT on a position holding stock, and the closed-state wording (item 9).
