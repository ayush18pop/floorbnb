> Superseded 2026-10-05 (commit 20485eb): b402 uses the Web3 API key with HMAC headers; see packages/x402/src/b402.ts.

# AGENTPATH: the agent payment path, proven on a local fork

## Status
- Works end to end on a local anvil fork of BSC: MCP paid tool -> HTTP 402 (x402 v2) -> EIP-3009 signature with a throwaway key -> `PAYMENT-SIGNATURE` retry -> data -> free `build_create_position_tx` -> tx sent on the fork -> position exists.
- Settlement is by Floor's own **self facilitator** (`X402_FACILITATOR=self`) on a local test token. This is **not b402**.
- **Live b402 is UNTESTED.** We have no credentials and the merchant application form is closed to us. `B402FacilitatorClient` is kept with its tests; those use mocks only. The new test `matches docs/ARCHITECTURE.md 3.2` pins: paths `/papi/v2/b402/{supported,verify,settle}`, the five headers (`Content-Type`, `X-Tesla-ClientId`, `X-Tesla-SignAccessToken`, `X-Tesla-Signature`, `X-Tesla-Timestamp` in ms), signature = Base64(SHA256withRSA(exact body bytes + timestamp)), and the v2 body `{x402Version:2, paymentPayload, paymentRequirements}`. Whether b402 itself accepts that is unknown.
- Nothing was run against a real network. No secrets in files. Payee in the demo is a local anvil dev address, never the team wallet.

## Commands
```bash
set -a; . ./.env; set +a      # only for BSC_FORK_RPC_URL (archive RPC for the fork); optional, public endpoints are the fallback
pnpm local:agent-demo         # about 1 minute; exit code 0 = whole flow passed
```
It starts its own anvil (:19545), API (:19787), MCP (:19788) (override with `AGENT_ANVIL_PORT`, `AGENT_API_PORT`, `AGENT_MCP_PORT`) and never touches the team stack on :3000/:8545/:8787/:8788. Logs: `local/logs/agent-*.log`. Needs Foundry. Test token: a 6-decimal EIP-3009 token compiled at run time (source inside `local/e2e/agent-flow.mjs`).
Unit tests: `pnpm --filter @floor/x402 --filter @floor/mcp --filter @floor/api test` (35 + 24 + 27 pass; fork tests skipped without `FLOOR_FORK=1`). `typecheck` clean for the three (there is no `lint` script in them).

## Changes
- `apps/mcp`: price per tool (`PRICE_*_USD`, existing), **asset** (`X402_ASSET`, `_NAME`, `_VERSION`, `_SYMBOL`, `_DECIMALS`; default stays USD1 and U on BSC), **payTo** (`X402_PAYTO`, now validated), **network/chain** (`X402_NETWORK`, was hardwired to BSC for the facilitator) and **RPC** (`X402_RPC_URL`, else `BSC_RPC_URL`). The payment-required result now carries a plain `payment` block (tool, `priceUsd`, `network`, `payTo`, options with symbol and atomic amount) next to the x402 body.
- `apps/api`: same asset/network/RPC config for `/v1/paid/quote`, and `PRICE_QUOTE_USD` (was a literal 0.01).
- Settlement failure: the gate runs the tool, then settles; on failure it answers 402 and drops the result. Now covered by tests (MCP result and HTTP 402) and by the demo (facilitator out of gas: no quote, agent not charged; the same signature succeeds after refunding gas, charged once).
- Known gap: if settlement is still pending after 20 s the gate returns the data with `PAYMENT-RESPONSE pending`; a later background failure cannot take it back. Cost is one tool call (about 0.01 USD). Not changed.
- `apps/web/app/docs/agents/page.tsx`: one sentence saying the self-facilitator path exists and is not b402.

## Transcript (docs-ready, from a real run)
An agent pays for Floor's paid tools with x402. No account, no API key.

```
1. agent -> POST /mcp tools/call quote_protection {depositUsdt:"1000", floorBps:9000}
   <- HTTP 402, header PAYMENT-REQUIRED (x402 v2)
      pay 0.01 USD = 10000 atomic TUSD (6 decimals) to 0x2361...1E8f on eip155:31337, scheme exact, EIP-3009
2. agent signs TransferWithAuthorization (throwaway key, no BNB needed, valid 10 min)
3. agent -> same call + header PAYMENT-SIGNATURE: <base64 payload>
   <- HTTP 200, PAYMENT-RESPONSE {success:true, transaction:0xf46f...}   (gas paid by the facilitator)
      floor 900 USDT, stock exposure 400, cash 600, tolerates a 25% gap; disclosure attached
4. agent -> same payment again       <- HTTP 402 nonce_already_used, no data
   backtest 0.02 USD and simulate_gap 0.03 USD work the same way
5. facilitator out of gas            <- HTTP 402 settle_failed, no quote, agent not charged
6. agent -> build_create_position_tx {owner, amount:55 USDT, floor 90%, 1 year, NVDAB}   (free)
   <- 2 UNSIGNED txs: approve USDT, createPosition. Every `to` is USDT or the factory.
7. owner wallet signs and sends both on the fork -> factory.positionsCount 0 -> 1
   get_status(owner) returns the position.
```
Honest framing for the docs: settled by Floor's own x402 facilitator on a local fork with a test token; b402 (Binance) is written but not yet tested live, and mainnet payments need a funded gas account and U or USD1.
