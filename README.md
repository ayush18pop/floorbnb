# Floor

Set a floor under your stocks. Floor is a spot-only protection vault for tokenized stocks (bStocks) on BNB Chain,
built on CPPI: stock held = min(4 × (value − floor), value), the rest in USDT. The floor holds unless prices gap more than 25% before the vault can rebalance; it is not a guarantee. Deposits are USDT only, one vault per position, launch caps 1,000 USDT per position and 5,000 USDT in total. Not yet on mainnet. Built for BNB Hack: Tokenized Stocks Edition.

| Folder | What |
|---|---|
| `apps/web/` | Next.js landing page and app prototype |
| `docs/` | `CONTRACTS.md` (Solidity design), `ARCHITECTURE.md` (system and flows), `DECISIONS.md`, backtest data |
| `design/` | Brand system: logo, tokens, grid |
| `marketing/` | Positioning, landing copy, pitch, demo script |
| `assets/` | Asset plan and image prompts |
| `wireframes/` | Screen-by-screen image prompts and reference images |

Backtests use past prices and do not predict the future. Not financial advice.
