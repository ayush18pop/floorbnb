# Floor

Set a floor under your stocks. Floor is a spot-only protection vault for tokenized stocks (bStocks) on BNB Chain,
built on CPPI: stock held = min(4 × (value − floor), value), the rest in USDT. The floor holds unless prices gap more than about 24% before the vault can rebalance; it is not a guarantee: at a 90% floor, 0.44% of historical one-year windows (95% CI 0.07% to 0.93%) ended more than 1 point below it, and the worst simulated one-week window lost 24%. You keep roughly 4 x (100 - floor)% of a gain (about 40% at a 90% floor). Deposits are USDT only, one vault per position, launch caps 1,000 USDT per position and 5,000 USDT in total across all users (shared, not per user; the owner can change both at any time with `setLimits`, no redeploy). Live on BNB Chain mainnet (see Live contracts below); no formal human audit. Built for BNB Hack: Tokenized Stocks Edition.

| Folder | What |
|---|---|
| `apps/web/` | Next.js landing page and app prototype |
| `docs/` | `CONTRACTS.md` (Solidity design), `ARCHITECTURE.md` (system and flows), `DECISIONS.md`, backtest data |
| `design/` | Brand system: logo, tokens, grid |
| `marketing/` | Positioning, landing copy, pitch, demo script |
| `assets/` | Asset plan and image prompts |
| `wireframes/` | Screen-by-screen image prompts and reference images |

Site: https://floor.ayush.works (domain being set up, not verified live). Fallback: https://floorbnb.vercel.app (not verified live).

Backtests use past prices and do not predict the future. Not financial advice.

## Live contracts

BNB Smart Chain mainnet (56), deployed at block 125815981, all source-verified on BscScan. Details and `cast` checks: `/docs/live-contracts`.

| Contract | Address |
| --- | --- |
| FloorFactory | [`0x1147d482fD08DDd7F377838efb610B606B3Ad765`](https://bscscan.com/address/0x1147d482fD08DDd7F377838efb610B606B3Ad765#code) |
| FloorLens | [`0x63Ae440B9D309959442eaD3E08cBC3A025C67780`](https://bscscan.com/address/0x63Ae440B9D309959442eaD3E08cBC3A025C67780#code) |
| FloorVault implementation | [`0xEA0603a83BCf28a1D57d8534971149eACD874055`](https://bscscan.com/address/0xEA0603a83BCf28a1D57d8534971149eACD874055#code) |

Owner and guardian: `0x762c9626711BCc882050cBf06Edd610fE8b91F1A`. Keeper: `0x46FD797AeBD0250A2E768022AD992DF21F12e58a`. Payee for paid API calls: `0xF5f349ABe9647278AC3450058bc054886DaF816B`. Launch caps: 1,000 USDT per position, 5,000 USDT in total. Only the direct PancakeSwap v3 router is allowed. AI-assisted reviews only, no formal audit.

## Trusted roles

Source: `packages/contracts/src/FloorFactory.sol`, `FloorVault.sol`; design in `docs/CONTRACTS.md` section 7.

- **Keeper:** triggers rebalances (one swap per call) through allowlisted routers, inside bounds the vault checks (direction, size, router, minimum out, market hours). Cannot withdraw, set prices, or change parameters.
- **Guardian:** can pause or halt trading, set the holiday table, remove a router, disable an asset, and approve a new bStock implementation. Cannot move funds or add a router. A pause stops de-risking sells but never exits.
- **Owner:** lists assets, adds routers (active after 24 hours), sets keepers, guardian, defaults for new positions and the launch caps (`setLimits(maxDeposit, maxTotalTvl)`, any time, no redeploy; positions that already exist are unaffected). Cannot touch an existing position. Exit in kind, close and rescue belong to the depositor. Owner is meant to be a hardware wallet; no multisig yet.
- **Owner and guardian are the same address** (`0x762c9626711BCc882050cBf06Edd610fE8b91F1A`) at launch, by choice, so the guardian gives no separation of duties. The keeper and deployer is a different address (`0x46FD797AeBD0250A2E768022AD992DF21F12e58a`). An EOA keeper is primary; an Agentic Wallet is an optional second keeper and is not set up.

## Disclosures

Launch caps (1,000 USDT per position, 5,000 total, shared by all users and changeable by the owner); a caller with 5,000 USDT can fill the shared cap and block new deposits (costs gas, not the caller's funds; the owner can raise the cap); pool and TVL manipulation; public rebalance can be sandwiched within the 1% slippage bound; once the floor is hit the vault stays in USDT until the term ends (cash lock); the public delay counts open-market seconds from the stock's last trade; a disabled token's weight stays in USDT; a sell can be delayed while spot and the 10-minute average disagree (F-04); no de-risking sell when a held stock has no price history; routers added after launch wait 24 hours. Details: `/docs/risks`.

## Known open items

Full list with status at `/docs/open-items` (`apps/web/app/docs/open-items/page.tsx`). Short version: AI-assisted audit only, no human audit; owner is not a multisig; team lead's written confirmation of the batch acceptance is pending; the latest AI-assisted run of the Pashov Audit Group skills (2026-10-05, report `floorbnb-pashov-ai-audit-report-20261005-051324.md`, repo head `84706ee`) raised the cap fill above and some unscored leads, with a proposed acceptance and no contract change in `reviews/acceptances.md`, not signed (AI-assisted audit by Pashov Audit Group skills, not a formal audit); weekend trading cost not measured; backtest uses daily closes with survivorship bias.

## Launch lock and payments

The app routes are locked by default (`apps/web/lib/launch.ts`, see `docs/BRANCHING.md`); docs stay public. The b402 (Binance x402) client in `packages/x402/src/b402.ts` calls `POST https://web3.binance.com/build/api/v2/b402/{supported,verify,settle}` with a Binance Web3 API key that has the B402 Payments permission (`X-OC-APIKEY`, `X-OC-TIMESTAMP`, `X-OC-SIGN` HMAC headers, body wrapped as `{"body": ...}`). It needs no clientId, RSA key or merchant application. Verified live on 2026-10-05: supported and verify. Settle has not been run live. The `payTo` address is the project payee, `0xF5f349ABe9647278AC3450058bc054886DaF816B`. Agent Studio and the Agentic Wallet side prize are not part of this submission. Live paid calls use our own self facilitator (`packages/x402/src/self.ts`; `X402_FACILITATOR` defaults to `self` in `apps/api/src/paid.ts`).
