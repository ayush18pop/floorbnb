# Deploy the off-chain side on Render (one free service)

One Render web service, `floor-server`, runs three things in one Node process (`apps/onebox`): the API (`/v1/*`), the MCP server (`/mcp`) and the keeper loop. The web app stays on Vercel. Cost: **$0** on the free plan.

## Read this first (honest limits)

- A free web service **spins down after 15 minutes without inbound traffic**. While it is asleep the **keeper is not running**: no rebalances are signed. The public `rebalancePublic` path and `exitInKind` still work on-chain, but nobody automates them.
- The built-in keep-alive (the service pings its own `RENDER_EXTERNAL_URL/healthz` every 10 minutes) **may not be enough on its own**: Render can count only traffic from outside its network. Use a free external pinger as the primary keep-alive (step 5).
- Cold start after a sleep is about **30 to 60 seconds**. The first request waits; Vercel pages may show errors or a slow first load until it is awake.
- Free = 512 MB RAM and 750 instance-hours per month. 750 h covers exactly one always-on service (31 days = 744 h), which is why the three processes share one box.
- **This is not production grade for real money.** A sleeping or restarting instance means no keeper. The fix is a paid always-on instance: switch to `ops/deploy/render-three-services.yaml` (copy it over `render.yaml`), or change `plan: free` to `starter` on `floor-server`.
- The disk is ephemeral. Nothing important is stored (the keeper log is read from on-chain events).

## 1. Create the service

Render dashboard > New > Blueprint > pick this repo and branch (`main`). It reads `render.yaml` and creates `floor-server` (free). The build is `corepack enable && pnpm install --frozen-lockfile`, start is `pnpm --filter @floor/onebox start`, health check `/healthz`. Render asks for every value marked `sync: false`.

## 2. Values to paste

| Variable | Where to get it |
|---|---|
| `FLOOR_FACTORY`, `FLOOR_LENS` | printed by the deploy script; also `packages/contracts/deployments/56.json` |
| `FLOOR_RUNS_FROM_BLOCK` | block of the factory deploy (same deployments file or the BscScan creation tx) |
| `FLOOR_RPC_URL` | a keyed BSC mainnet RPC (Alchemy, QuickNode, ...). Used by the API, the keeper and x402. Optional overrides: `BSC_RPC_URL`, `X402_RPC_URL` |
| `BW3_API_KEY`, `BW3_API_SECRET` | Binance Web3 API (market data). Optional: without them market routes are off |
| `FLOOR_ASSETS` | comma-separated bStock token addresses the keeper pokes each cycle |
| `KEEPER_PRIVATE_KEY` | key of `0x46FD797AeBD0250A2E768022AD992DF21F12e58a`, about 0.03 BNB on it. Secret, dashboard only. **If unset the keeper runs dry-run** (simulates, signs nothing) and `/healthz` says so |
| `X402_PAYTO` | receive-only payout wallet |
| `X402_ASSET`, `X402_ASSET_SYMBOL` | the payment token (USD1 or U on BSC; must support EIP-3009) |
| `X402_ASSET_NAME`, `X402_ASSET_VERSION` | the token's EIP-712 domain, read on-chain (below) |
| `SELF_FACILITATOR_KEY` | a small gas EOA (about 0.005 BNB); not the keeper key, not the payout wallet |
| `ALERT_WEBHOOK_URL` | optional Discord/Slack webhook for keeper failures |

Fixed in the file: `KEEPER_ADDRESS`, `KEEPER_ROUTE=direct`, `KEEPER_INTERVAL_SEC=60`, `X402_*` network and prices, `WEB_ORIGIN`, `MCP_ALLOWED_ORIGINS`. `MCP_PUBLIC_URL` is `https://floor-server.onrender.com/mcp`: change it if Render gives the service another name. `API_BASE_URL` is not needed (MCP calls the API inside the process).

Read the token's EIP-712 domain:

```bash
RPC=<your BSC rpc>; T=<token address>
cast call $T "name()(string)" --rpc-url $RPC            # X402_ASSET_NAME
cast call $T "version()(string)" --rpc-url $RPC         # X402_ASSET_VERSION (if it reverts, use the next line)
cast call $T "eip712Domain()(bytes1,string,string,uint256,address,bytes32,uint256[])" --rpc-url $RPC   # fields: name, version
```

The EIP-712 name can differ from the display name; copy the on-chain value exactly.

## 3. Vercel env vars

Set both to the one Render URL, then redeploy the web app:

- `NEXT_PUBLIC_API_URL` = `https://floor-server.onrender.com`
- `NEXT_PUBLIC_MCP_URL` = `https://floor-server.onrender.com/mcp`

## 4. Verify

```bash
curl -s https://floor-server.onrender.com/healthz
# {"ok":true,"api":{...},"mcp":{...},"keeper":{"mode":"live","running":true,"lastScan":...,"lastError":null},"uptimeSec":...}
curl -s https://floor-server.onrender.com/v1/floor | head -c 300
curl -s -X POST https://floor-server.onrender.com/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

`/healthz` is one combined answer (the API and MCP each have their own, shown nested). It is 503 only if the API or MCP part fails. `keeper.mode` is `live`, `dry-run` (no key) or `disabled` (config problem, with a `note`); a keeper error never takes the web part down. Render logs show `keeper` JSON lines and `[onebox] keep-alive ... -> 200` every 10 minutes.

## 5. Keep it awake (primary: an external pinger)

Create a free monitor at UptimeRobot (HTTP(s) monitor, interval 5 minutes) or cron-job.org (every 5 minutes) on `https://floor-server.onrender.com/healthz`. That keeps the instance awake from outside, which is what Render counts. The in-process ping is only a backup. Check `uptimeSec` in `/healthz` after a day: if it resets, the service is being restarted or slept.

## Costs

Free plan: $0 (Render). Still paid elsewhere: the BSC RPC provider (free tiers exist), about 0.03 BNB keeper gas, about 0.005 BNB facilitator gas. Redeploys (SIGTERM) are handled: the keeper loop stops, an in-flight tick gets up to 20 s to finish, then the server closes.
