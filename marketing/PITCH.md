# Floor: pitch

**Floor lets you set the lowest your tokenized-stock portfolio can go, using spot trades only.**

**Problem.** 709+ tokenized stocks and ETFs trade on BNB Chain, and over $5B has changed hands. Holders have no way to cap a crash. Lending, baskets and perps exist. A downside floor does not. In traditional finance it is a bank note with fees and minimums.

**Proof it's real.** The rule is known: sell stock as prices fall, buy as they rise. We tested it on real prices from 2018 to October 2026. The floor held in **93 of 93** one-year windows, assuming full weekend gaps and 0% yield on stablecoins.

**Numbers.**
- NVDA's worst year in the backtest (2022): holding **−51%**, Floor **−10.0%**. In a typical bad year: −9.9% vs −36%.
- Bad year, basket (NVDA+TSLA+QQQ): **−8.6%** vs **−17%**.
- Cost: about **42%** of the basket's upside kept in up years. We say so up front.
- Rebalance cost: **0.7 to 6.6 bps** on a $10k round trip (QQQB, NVDAB, SPCXB, SPYB).

> "Rule No. 1: Never lose money. Rule No. 2: Never forget rule No. 1." — Warren Buffett
>
> We can't promise Rule 1. We let you set how far you can fall.

**Impact.** A non-crypto holder gets a worst case before they buy, and one number to choose. No options, no perps, no leverage, no borrowing: the vault only swaps.

**Measurable improvement.** In 2022 a 51% NVDA loss became a 10.0% loss in the same backtest. The floor holds unless prices gap more than 25% before the vault can rebalance. The worst gap since 2018 was 19.3%.

**Why only possible now.**
- Tokenized stocks are BEP-20 tokens. A public contract can hold them and rebalance them. Before, this took a private bank.
- A Binance Agentic Wallet can act as the keeper, and agents can buy protection for the people they manage money for through Floor's MCP server (building) and pay per call with b402 (building).

**Built on:** bStocks (NVDAB, SPCXB, QQQB), PancakeSwap / BSC liquidity, Binance Web3 API, Agentic Wallet, b402.
