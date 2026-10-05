# Floor

Set a floor under your stocks. Floor is a spot-only protection vault for tokenized stocks (bStocks) on BNB Chain,
built on CPPI: stock held = min(4 × (value − floor), value), the rest in USDT. The floor holds unless prices gap more than about 24% before the vault can rebalance; it is not a guarantee: at a 90% floor, 0.44% of historical one-year windows (95% CI 0.07% to 0.93%) ended more than 1 point below it, and the worst simulated one-week window lost 24%. You keep roughly 4 x (100 - floor)% of a gain (about 40% at a 90% floor). Deposits are USDT only, one vault per position, launch caps 1,000 USDT per position and 5,000 USDT in total. Not yet on mainnet. Built for BNB Hack: Tokenized Stocks Edition.

| Folder | What |
|---|---|
| `apps/web/` | Next.js landing page and app prototype |
| `docs/` | `CONTRACTS.md` (Solidity design), `ARCHITECTURE.md` (system and flows), `DECISIONS.md`, backtest data |
| `design/` | Brand system: logo, tokens, grid |
| `marketing/` | Positioning, landing copy, pitch, demo script |
| `assets/` | Asset plan and image prompts |
| `wireframes/` | Screen-by-screen image prompts and reference images |

Backtests use past prices and do not predict the future. Not financial advice.

## Trusted roles

Source: `packages/contracts/src/FloorFactory.sol`, `FloorVault.sol`; design in `docs/CONTRACTS.md` section 7.

- **Keeper:** triggers rebalances (one swap per call) through allowlisted routers, inside bounds the vault checks (direction, size, router, minimum out, market hours). Cannot withdraw, set prices, or change parameters.
- **Guardian:** can pause or halt trading, set the holiday table, remove a router, disable an asset, and approve a new bStock implementation. Cannot move funds or add a router. A pause stops de-risking sells but never exits.
- **Owner:** lists assets, adds routers (active after 24 hours), sets keepers, guardian, defaults for new positions and the launch caps. Cannot touch an existing position. Exit in kind, close and rescue belong to the depositor. Owner is meant to be a hardware wallet; no multisig yet.

## Disclosures

Launch caps (1,000 USDT per position, 5,000 total); pool and TVL manipulation; public rebalance can be sandwiched within the 1% slippage bound; once the floor is hit the vault stays in USDT until the term ends (cash lock); the public delay counts open-market seconds from the stock's last trade; a disabled token's weight stays in USDT; a sell can be delayed while spot and the 10-minute average disagree (F-04); no de-risking sell when a held stock has no price history; routers added after launch wait 24 hours. Details: `/docs/risks`.

## Known open items

Full list with status at `/docs/open-items` (`apps/web/app/docs/open-items/page.tsx`). Short version: not on mainnet; AI-assisted audit only, no human audit; owner is not a multisig; team lead's written confirmation of the batch acceptance is pending; weekend trading cost not measured; backtest uses daily closes with survivorship bias.

## Launch lock and payments

The app routes are locked by default (`apps/web/lib/launch.ts`, see `docs/BRANCHING.md`); docs stay public. The b402 (Binance x402) client in `packages/x402/src/b402.ts` works with a Binance Web3 API key (B402 Payments permission); supported and verify have been run live, settle has not. Live paid calls use our own self facilitator (`packages/x402/src/self.ts`; `X402_FACILITATOR` defaults to `self` in `apps/api/src/paid.ts`).
