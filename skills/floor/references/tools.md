# Floor MCP tools: schemas, units, errors

Source: `apps/mcp/src/tools.ts`, `apps/mcp/src/config.ts`. All inputs are strict objects (unknown keys rejected). All results include `disclosure`. Tools are annotated read-only: they never sign or send.

## Free

- `get_floor_info {}`: factory, lens, USDT, enabled bStocks, term and floor bounds, caps, `state` {paused, halted, positionsCount, tradingOpen}, `audit`, `tools.paid[{name, priceUsd, note}]`, `howToSign`.
- `list_assets {}`: `assets` plus `market` (price and market status, or null with `marketNote`).
- `get_status {owner?, vault?}`: pass exactly one (else `bad_request`). Result is under `result`: for a vault, the position; for an owner, `{owner, count, truncated, positions[]}`. Position fields: vault, owner, V, floor, cushion, exposure, target, needsRebalance, tradingOpen, deposit, maturity, status (Active|Closing|Closed), exposureBps, cushionBps, cashLocked, assets[{token, weightBps}]. Money is wei strings, 18 decimals.
- `get_rebalance_history {vault?, limit?=20 (1-100)}`: `result.runs[]`. May be empty.
- `build_create_position_tx {owner, amount, floorBps, termSeconds, assets[], weightsBps[]}`:
  - `amount`: integer string, wei (18 decimals). 1000 USDT = "1000000000000000000000".
  - `floorBps` 5000 to 9800. `termSeconds` 604800 (7 d) to 34560000 (400 d); launch default 31536000 (required here, no default).
  - `assets`: 1 to 3 enabled bStock addresses from `get_floor_info`. `weightsBps`: same length, positive integers, sum 10000. Both required here, unlike the paid tools where weights are optional.
  - Returns `txs[2]` (approve to the factory, then createPosition) each with `simulation` (createPosition's is null until the allowance is on chain), `checks` {usdtBalance, allowance, sufficientBalance, createSimulated}, `instructions`.
- `build_exit_tx {vault, kind: requestClose|closeToUSDT|exitInKind, to?}`: returns ONE `tx` with `simulation` run as the owner. The server refuses if `tx.to` is not the vault.

## Paid (x402, proposed price per `get_floor_info`; default 0.01 USD)

- `quote_protection {depositUsdt, floorBps, termSeconds?=31536000, weightsBps?}`: `depositUsdt` is a decimal string ("1000", "250.5", max 18 places). Returns `quote` (floorValue, cushion, startingExposure, startingCash, gapToleranceBps, ...), `asUsdt` {floor, cushion, startingExposure, startingCash}, `reference` long-history study.
- `backtest {basket, mode?="close_only"}`: stored results only; `basket` is one of NVDA, TSLA, QQQ, SPY, AAPL, NVDA+AAPL+QQQ, NVDA+TSLA+QQQ (underlyings, not bStock symbols; there is no AAPL bStock); `mode` is close_only or open_close (`apps/mcp/src/data.ts`). Returns a data-unavailable error instead of inventing numbers. Caveats: underlying stocks and indices not bStocks, full weekend gaps assumed, 0% stablecoin yield, past data.
- `simulate_gap {depositUsdt, floorBps, termSeconds?, weightsBps?, gapBps (1-10000)}`: returns startingExposureUsdt, startingFloorUsdt, lossUsdt, valueAfterUsdt, belowFloor, shortfallUsdt, gapToleranceBps, method. One instant fall of the stock part, no rebalance, costs ignored.

## Error codes (`isError: true`, `structuredContent.error.code`)

bad_request, not_found, rate_limited (from the API), guard (a returned tx pointed at an unexpected address: stop), data_unavailable, internal_error, payments_not_configured (paid tools off: do not retry), payments_unavailable, tool_failed. An unpaid paid-tool call returns a PaymentRequired object instead (see x402.md). Limits: 120 requests/min per IP, 20/min on paid tools, 64 KB body.
