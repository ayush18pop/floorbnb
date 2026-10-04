# Raw DX note: Binance Web3 API edge cases (manager session). Facts only; humans write the report.

Endpoint: `GET /api/v1/dex/aggregator/quote` (via packages/bw3, HMAC-signed). Live, read-only, re-run 2026-10-05 with `packages/bw3/scripts/amount-probe.ts`. Tokens: BSC USDT `0x55d3...7955` (18 decimals) to NVDAB `0x02fc...7436`. Nothing sent to chain.

| amount sent | result |
|---|---|
| `10000000000000000000` (10 USDT, in wei) | OK: LiquidMesh / SWAP, to=42535790855322255 |
| `100000000000000000000` | OK, scales 10x |
| `10` (meant as 10 USDT) | `Insufficient liquidity for a quote. Please decrease the transaction amount or try again later.` |
| `10.0` | `Parameter [amount] error: invalid amount, must be a positive numeric string within uint256 range (e.g. "1000000" for 1 USDT with 6 decimals)` |

Misleading messages:
- `amount: "10"` returns "Insufficient liquidity ... decrease the transaction amount". The real cause is that the amount is in the token's smallest unit, so "10" is 10 wei (too small, not too large). The message points the wrong way.
- `amount: "10.0"`: the example in the message uses 6 decimals (USDT elsewhere); BSC USDT has 18, so the example is off by 10^12 for this token. It also never says "smallest unit" outright.

Other observed behaviour (ops/progress/A09b.md, live 2026-10-03):
- quoteId reusable at 20 s, "not found or expired" at 40 s (one message for two cases).
- Swap calldata has a deadline of about quote time + 10 min; later the router reverts `Route: expired` (on-chain, not an API error).
- `quote.router` is a route descriptor like `tokenA--tokenB`, not an address; the address to call and approve is `tx.to` / `approveTarget` in the swap response.
- `POST /pre-transaction/simulate` simulates the raw router tx and fails with `BEP20: transfer amount exceeds allowance` until an allowance exists.
- `No valid quote result from any vendor, please retry later` for no route.
- On a fork whose clock is ahead of the vendor oracle: `Kipseli swap fail: zero out`.
- We did not trigger "Minimum order amount is 5 USD"; quotes for 0.1, 1 and 4 USDT were not rejected from a dummy wallet.
