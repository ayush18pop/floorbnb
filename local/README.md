# Floor local stack

One command runs everything against an Anvil fork of BSC mainnet: contracts, API, keeper, MCP and the web app. Nothing is sent to a real network. All keys are anvil's public dev keys (derived at run time from the public test mnemonic, never stored).

```bash
pnpm install
pnpm local:up            # fork + deploy + fund + API + keeper + MCP + web (about 2 minutes), prints URLs, addresses and 5 flows
pnpm local:status        # processes, chain time, window, HTTP probes
pnpm local:logs [svc]    # tail anvil|api|keeper|mcp|web (all when omitted)
pnpm local:down          # stop everything
```

Needs: `anvil`/`forge` (Foundry), Node 20+, pnpm, internet to fork BSC.

## What `local:up` does
1. Starts `anvil` forking BSC (chain id **31337**, a block every 2 s so chain time keeps moving). Free endpoints tested on 2026-10-04: `bsc-mainnet.public.blastapi.io` and `bnb.api.onfinality.io/public` serve old state (1,000,000 blocks back), which a long-lived fork needs. `bsc-rpc.publicnode.com` answers 403 for old state; `1rpc.io`, `bsc-dataseed`, `blxrbdn`, `blockrazor` are non-archive ("missing trie node"). Preferred: put an archive-capable BSC URL (for example a private Alchemy one) in the env var **`BSC_FORK_RPC_URL`** (name only here; the value is a secret, keep it in `.env`, never commit it). Load it only for the command: `set -a; . ./.env; set +a; pnpm local:up`. `local:up` hands it to anvil as `--fork-url` (visible in `ps` to your own user only), never prints or saves it, and does not pass it to the other services. If unset it falls back to the public endpoints above. Free-tier RPCs rate-limit: anvil caches forked state on disk, so use `pnpm local:reset` (snapshot revert) instead of re-forking, and expect the first swap after a reset to be slow.
2. Deploys with the **audited** `Deploy.s.sol` and `SetHolidays.s.sol`, from a scratch Foundry project in `local/.work` whose `src`, `lib`, `holidays` and scripts are symlinks to `packages/contracts` (only the params file differs: **direct PancakeSwap router only, aggregator disabled**). `packages/contracts` is not touched. Then `acceptOwnership`, `setDefaults` with the demo `minTrade` of 6 USDT, a second keeper for manual runs.
3. Funds the demo user (anvil account #4) with **200 USDT** (impersonating a USDT whale on the fork) and 10 BNB; the other roles get BNB.
4. Sets the chain clock to the next **Tuesday 16:00 UTC** (the contract trades Mon-Fri 15:30-19:30 UTC only), takes a snapshot, writes `local/deployment.json`.
5. Starts API :8787 (`/healthz`), keeper in loop mode (60 s), MCP :8788 (`/mcp`), web :3000 with `NEXT_PUBLIC_APP_LOCKED=0` (the app is locked by default, see docs/BRANCHING.md), `NEXT_PUBLIC_DATA_SOURCE=chain`, `NEXT_PUBLIC_LOCAL_DEV=1`, the local RPC, API and addresses.

## A second stack beside the team one
`LOCAL_PORT_OFFSET=10000 pnpm local:up` shifts all four ports together (anvil 18545, API 18787, MCP 18788, web 13000); state (`.run`, `logs`, `deployment.json`, `.work`) lives in the checkout you run it from, so a worktree gets its own stack. Use the same variable for every other command (`local:status`, `local:time`, `local:e2e:wiring`). `pnpm --filter @floor/local cli restart api|keeper` restarts one service with the current code.

## Keeper heartbeat
The keeper loop writes `{"lastScan": <unix s>}` to `KEEPER_HEARTBEAT_FILE` every tick; the API serves it on `/healthz` (`keeper.heartbeatAgeSeconds`, from `FLOOR_KEEPER_HEARTBEAT_FILE`, same host only) and the Keeper page shows Online and "last scan N s ago" (Online means a scan in the last 10 minutes). `local:up` wires both to `local/.run/keeper-heartbeat.json`.

## Wallet
The web app shows a **Dev wallet** option in "Connect wallet" and a red **LOCAL DEV WALLET** badge. It is wagmi's mock connector acting as the unlocked anvil account #4 (the node signs; no key in the browser). It exists only when `NEXT_PUBLIC_LOCAL_DEV=1`, which only `local:up` sets, so production builds contain neither the option nor the badge.

MetaMask instead: Add network, RPC `http://127.0.0.1:8545`, chain id `31337`, symbol `BNB`. Import account: private key of anvil account #4 (from the mnemonic `test test test test test test test test test test test junk`, derivation path `m/44'/60'/0'/0/4`; `cast wallet private-key --mnemonic "<mnemonic>" --mnemonic-index 4`). Keep MetaMask on 31337 and connect with "MetaMask" on the connect modal. Never use these keys on a real network.

## Time
`pnpm local:time` shows chain time. `pnpm local:time window|closed|weekend|+30m|+1h|+2d` warps forward (the chain cannot go back; `pnpm local:reset` returns to the post-deploy snapshot). `window` = next weekday 16:00 UTC, `closed` = a weekday 21:00 UTC, `weekend` = Saturday 12:00 UTC.

## Scenarios (move the real Pancake pools on the fork)
```bash
pnpm local:scenario crash NVDAB 15     # price -15% through a price-limited swap on the real router, then +16 min so the 10-minute TWAP follows
pnpm local:scenario rally QQQB 10
pnpm local:scenario gap 20             # all three pools -20% at once
pnpm local:keeper once                 # run the keeper now (a second keeper account, no nonce clash with the loop); `keeper dry` simulates
pnpm local:reset                       # evm_revert to the post-deploy snapshot (also restarts the keeper loop: its nonce counter would be ahead)
```
The loop keeper acts within 60 s of a scenario. bStocks are not freely available on the fork and the pools hold few tokens, so `crash` writes a large balance for the trader straight into the token's storage (ERC-7201 ERC20 layout), sells through the real router and zeroes it afterwards.

## End-to-end test
`pnpm local:e2e` (stack must be up) resets the chain, then clicks through the real UX in headless Chromium (Playwright, `~/.cache/ms-playwright`): connect, set floor, review, approve, create, positions, detail, keeper buy, crash and sell, weekend banner, exit in kind, close to USDT, deep crash and cash lock. Screenshots go to `local/screens/`, the issue report to `local/logs/e2e-report.json`. Findings: `ops/progress/LOCAL.md`.

`pnpm local:e2e:wiring` is the single A22 script: dev wallet, builder (floor 85, 30 days, two assets), review, sign, confirmed, "Waiting for the first rebalance", keeper rebalance with the open page updating by itself, keeper Online, close to USDT, exit in kind. Screenshots (6) go to `apps/web/screenshots/wiring/`, transcript to `local/logs/e2e-wiring.json`. It pauses the loop keeper (SIGSTOP) to see the waiting state, warps 16 minutes (the vault's minInterval is 15 minutes per asset) and runs `keeper once` for determinism.

## Known local-only differences
- Chain id 31337, not 56. The web app picks the chain from `NEXT_PUBLIC_LOCAL_DEV`; production still uses `bsc`.
- Term end, "days left", activity times and the next window use the chain's block time (hover shows "Chain time" on local only). The fork's clock is not your computer's.
- Explorer links are hidden (the fork is not on BscScan).
- The aggregator route is disabled (needs live Binance quotes and a real clock).
