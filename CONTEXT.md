# Floor — shared context for every agent (read this first)

Last updated 2026-10-02 (rev 2: worst-window paths, keeper role, b402 access). This is the single source of truth. If something you need isn't here, say so
in your report instead of inventing it. Mark anything unverified as **unverified**.

## The hackathon
**BNB Hack: Tokenized Stocks Edition** (BNB Chain + Binance Web3 Wallet).
- Submission deadline **2026-10-11 12:00 UTC (Sun 11 Oct, 17:30 IST)**. Judging 10-12 → 10-23.
- Hard rules: one of **bStocks, Ondo, or xStocks** must be central. **Spot only: no perps or derivatives.**
  **BSC mainnet** deployment. The named execution venue is PancakeSwap / BSC tokenized-equity liquidity.
- Judging: Technical 30%, Creativity 25% ("does this already exist five times over?"), Developer
  Experience Report 25% (must be real, not AI-written), Product/UX 20% ("would it bring non-crypto-native
  users on-chain?").
- Side prizes ($2k each): Best Use of Agentic Wallet / Wallet Skills; Best Use of BNB Agent Studio.

## The product: Floor
**Lead message:** your stock portfolio doesn't go below the line you set. You keep part of the upside;
that's the price of the protection. **Second message:** it's done with spot trades only, no perps,
no options, no leverage, no borrowing.

Honesty rule: never say "guaranteed" or "you can't lose." Say "a floor that holds unless prices gap
more than about 24% before the vault can rebalance." The user (team lead) explicitly wants real numbers
and no hype.

**Mechanism: CPPI (constant proportion portfolio insurance).**
- User deposits bStocks (or USDT) and picks a floor F, e.g. 90% of the deposit, for a one-year term.
- Stock exposure E = min(m × (V − F), V), with m = 4. The rest is held in stablecoins (USDT).
- Prices fall → the vault sells stock for USDT. Prices rise → it buys back. All spot swaps on BSC.
- No rebalancing on weekends (weekend on-chain prices are noise vs Monday, see research), so the full
  weekend gap is assumed in the risk maths. m = 4 survives a single gap smaller than about 24% (1/m = 25% before costs; tested in research/m_study).
- Once value hits the floor the vault holds only USDT until the term ends ("cash lock"); the one-year
  term resets this.
- Optional later: idle USDT supplied to Venus for yield (lending, not borrowing). Not in v1.

**Assets for v1:** bStocks only. NVDAB, SPCXB, QQQB (SPYB optional). Ondo tokens are excluded: the Ondo
issuer RFQ never quoted through the aggregator. There is **no AAPL bStock**.

| Token | Address (BSC, 18 decimals) |
|---|---|
| NVDAB | 0x02fca66c1d1afb4e2a7884261eb00f63598a7436 |
| SPCXB | 0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1 |
| QQQB | 0x205812cdbed920aff76c6580abd681a46d11efc7 |
| SPYB | 0x7138b48df7d98d7e3cc221bfe7192d0a178182d8 |
| TSLAB | 0x5b1910eaad6450e50f816082aa078c41f10c292f (borderline liquidity) |
| USDT | 0x55d398326f99059fF775485246999027B3197955 |

## Measured numbers (the only numbers anyone may use)
Full detail: `docs/RESEARCH_RESULTS.md`. Scripts and raw data:
`/home/hyprayush/Documents/Projects/afterbell/research/vault_check/`.
- **Do not use '93 of 93' as a claim.** In the short 2018 to 2026-10 sample (93 overlapping one-year windows, one regime) no window ended below the floor at m = 4 (also with one rebalance a day, matching the
  contract's trading window; m = 5 broke in 3.2% of TSLA windows in that case), on NVDA, QQQ, SPY, TSLA and
  baskets. Assumes full weekend gaps and 0% stablecoin yield.
- **Long-history study (2026-10-03, `research/m_study/REPORT.md`, supersedes '93/93' as the headline):** 1,581
  non-overlapping one-year windows over 38 series, 1928 to 2026, 90% floor, m = 4, 6 bps one-way, daily rebalance at the
  close. The vault ended more than 1 point below its floor in **0.44%** of windows (95% CI 0.07% to 0.93%, study 2, `research/m_study2/REPORT.md`; 1-month windows 0.09%; cash lock 2.85% of one-year and 0.17% of one-month windows; the worst simulated one-week window, AIG 15 Sep 2008, lost 24% at a 90% floor) and slightly
  below the floor in 2.85%. S&P 500 alone: 0 breaches in 98 years. Single stocks: 0.61% material, 4.07% any shortfall
  (real one-day drops of -30% to -61% exist: AIG 2008, AAPL 2000, NFLX 2004, Citi 2009). The 1/m rule held: 0 material
  breaches in 1,552 windows without a one-day drop above 25%; all 7 material breaches at m = 4 came from the 29 windows
  that had one. Keep m = 4 fixed (no dial, no dynamic m, no ML: none beat fixed m out of sample). Caveats: daily closes
  only, survivorship bias (no delisted names), no intraday or halt gaps. '93 of 93' covers only 2018 to 2026 and is never used alone; never
  write 'the floor always holds' or 'max loss 10%'. The '42% of upside' figure holds at a 90% floor only (upside kept is about 4 x (100 - floor)%: ~20% at 95%) and is a pooled mean ratio in up years, not a typical year (the
  median year is +1.6% for the vault vs +13.7% holding).
- **Bad years (median of the windows where holding lost >10%):** NVDA vault −9.9% vs holding −36%
  (17 windows). NVDA+TSLA+QQQ basket −8.6% vs −17%. QQQ −7.4% vs −19%. These are medians, NOT the
  single worst year; never write "worst year: −36%".
- **Single worst window (real day-by-day paths in `docs/data/vault_path_*.csv`):** NVDA 2022-01-04 →
  2023-01-04: holding **−51.0%** (down −62.7% at the low), vault **−10.0%**. NVDA+TSLA+QQQ basket, same
  window: holding −53.0%, vault −9.9%.
- **Best window:** NVDA 2023-03-08 → 2024-03-07: holding +298.1%, vault +240.6%. Basket 2019-09-05 →
  2020-09-02: holding +307.2%, vault +256.3%. Strong trends keep more of the upside than the 42% median.
- **Upside kept at m=4:** ~42% of the basket's gain in up years at a 90% floor only (NVDA ~45%, QQQ ~32%); in general about 4 x (100 - floor)%.
- **Rebalance cost (live quotes, Thu 2026-10-02 12:06 UTC):** $10k round trip: QQQB 0.7 bps, NVDAB 5.9,
  SPCXB 6.0, SPYB 6.6, TSLAB 46 bps. Weekend cost **not yet measured**.
- **Worst overnight/weekend gaps since 2018:** NVDA −19.3%, TSLA −14.9%, AAPL −13.0%, QQQ −9.5%,
  SPCX −10.3% (only 76 days of history; SpaceX listed June 2026).
- **Costs of honesty:** TSLA at m=4: vault −6.8% median year vs holding +22% (whipsaw).
- **Market context:** BNB Chain has 709+ tokenized stocks/ETFs, $5B+ cumulative volume (BNB Chain blog,
  2026-06-26). bStocks launched 2026-06-10.

## Competitive landscape (from research)
- Already on BNB Chain: lending against bStocks (Venus, Lista DAO), stock baskets (City Protocol, Mag-7
  index, 2026-09-15), stock perps (Aster), pre-IPO tokens (Colb, Paimon).
- **No downside-protection product for tokenized stocks found on BNB Chain.** Closest elsewhere: xPrime
  (1st, xStocks hackathon; uses covered calls), Kraken xStocks Vaults (yield, Ink/Solana).
- In TradFi this protection is a bank-issued principal-protected note: fees, minimums, not retail.

## Binance building blocks (verified from docs unless marked)
**Binance Web3 API** (`https://web3.binance.com/build`, HMAC-signed): RWA Data API (prices, token lists,
`statusInfo` market state), Trading API (`/api/v1/dex/aggregator/quote` → `/swap`), Transaction API
(`/pre-transaction/simulate`, `/broadcast-transaction` with optional MEV protection). Detail:
`/home/hyprayush/Documents/Projects/afterbell/docs/EXECUTION.md`.

**Binance Agentic Wallet** (`baw` CLI, npm `@binance/agentic-wallet`, skill in GitHub
`binance/binance-skills-hub` → `skills/binance-web3/binance-agentic-wallet`):
- Keyless MPC wallet driven by an AI agent (Claude Code, OpenClaw, ChatGPT…). Local CLI, one user per
  machine, QR-paired session via the Binance App. **Not a multi-tenant server API.**
- Commands: `market-order swap/quote`, `limit-order`, `wallet send/balance`, `defi deposit/redeem`,
  `x402-payment preview/sign`, and **`contract-call preview` → `contract-call execute`** (any contract,
  any calldata on BSC). Contract calls require **Developer Mode**, switchable only in the Binance App,
  with its own daily quota.
- **Untested unknowns:** when `requireConfirmation=true` (manual tap in the Binance App per call)
  triggers; whether the risk engine (`351803 AGENT_DEV_MODE_RISK_BLOCKED`) blocks a fresh unverified
  contract. Either could stop an unattended keeper. Design a fallback.
- Role in Floor (revised per ARCHITECTURE.md): a normal EOA is the primary keeper; an Agentic Wallet is a
  supervised second keeper used for demo rebalances, and users' own Agentic Wallets sign deposits/withdrawals
  and pay b402. Previously: one Agentic Wallet is the vault's **keeper**, calling `rebalance()`. User funds sit in
  the vault contract, never in the keeper wallet. Also publish a Floor skill so any user's agent can
  deposit/withdraw.

**b402** = Binance's x402 implementation on BSC (docs:
developers.binance.com/en/docs/products/onchainpay-x402/introduction). An HTTP API returns 402; the
caller signs an EIP-712 authorization; the B402 Facilitator verifies and settles on-chain in
U/USD1/USDT/USDC, gas sponsored. Role in Floor: AI agents pay per call for Floor's API/MCP tools.
It does **not** pay for LLM inference. Corrected 2026-10-05: no merchant application is needed. A Binance Web3 API key with the
"B402 Payments" permission works against `https://web3.binance.com/build/api/v2/b402/*`; supported and verify were run live,
settle was not. USDT/USDC are Permit2-only, U/USD1 support eip3009 (per ARCHITECTURE.md).

**MCP server:** Floor exposes its main actions (e.g. `quote_protection`, `deposit`, `withdraw`,
`status`, `backtest`) as MCP tools so any agent can use Floor. The team lead considers this more
important than any in-app AI. **There is no in-app AI model / no Jev / no natural-language parser.**

## Design direction (team lead's words)
"Really, really professional." Visible-grid / blueprint style: thin lines dividing the page into
boxes, everything aligned to those lines, "+" crosshair marks where lines cross. Professional and
"agentic". UI library preference: **Magic UI** (shadcn/Tailwind/Framer Motion based) or similar.

## Folder layout (`/home/hyprayush/Documents/Projects/floor/`)
- `design/` brand agent · `marketing/` marketing agent · `docs/CONTRACTS.md` contracts agent ·
  `docs/ARCHITECTURE.md` architecture agent · `assets/` asset planner · `web/` landing page (later).
- Work only in your own folder/files. Don't edit CONTEXT.md; put needed changes in your report.

## Rules for every agent
1. No git commits, no transactions, no spending funds, never read or print secrets (`.env` files).
2. Use only the numbers above. New facts you research: cite the source URL. Unverified → say so.
3. Write in plain, direct English. Short sentences. No hype words ("revolutionary", "seamless",
   "unleash", "game-changing").
4. Finish with a short report: what you produced (paths), decisions you made, open questions, and
   anything that contradicts this file.
