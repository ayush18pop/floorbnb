# SKILL progress (A19)
Branch agent/SKILL. Agent skill in `skills/floor/` (SKILL.md 119 lines, `references/tools.md`, `x402.md`, `examples.md`). Plan lists `skills/floor-protection/**`; the task brief named `skills/floor/**`, which was used.
Disclosure copied verbatim from `packages/sdk/src/constants.ts` `FLOOR_DISCLOSURE`.

Dry run (in-memory MCP client against `apps/mcp/src/tools.ts`, fake API, no network, no spend; temp script and symlinks removed). Mismatches found and fixed in the skill:
- `build_create_position_tx` requires `termSeconds` and `weightsBps` (paid tools make them optional); documented.
- `build_create_position_tx.amount` is wei string, paid tools use decimal `depositUsdt`; documented.
- `backtest.basket` takes underlyings (NVDA, TSLA, QQQ, SPY, AAPL, two baskets), not bStock symbols.
- `closeToUSDT` needs stock at dust, so exit is requestClose, sell, closeToUSDT (first draft said one step).
- Unknown key (`deposit`) is rejected by the strict schema; error codes list added.
Open: caps conflict. README and runbook say 1,000 per position / 5,000 total; docs/CONTRACTS.md line 198 says 5,000 / 50,000. Skill uses 1,000 / 5,000 and tells agents to trust `get_floor_info`. Unpaid 402 path not dry-run (needs a gate and facilitator).
