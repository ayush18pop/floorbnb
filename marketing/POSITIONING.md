# Floor: positioning

Source of truth for numbers: `CONTEXT.md` and `docs/RESEARCH_RESULTS.md`. No other numbers are used.

## One-sentence positioning
Floor lets you set the lowest your tokenized-stock portfolio can fall, and keeps part of the upside, using spot trades only on BNB Chain.

## The problem (3 sentences)
Tokenized stocks now trade on BNB Chain, and people who hold them have no way to cap a crash. The tools that exist are lending, baskets and perps, and none of them sets a floor. In traditional finance this protection exists as a bank-issued note with fees and minimums, so it is not something an ordinary holder can buy.

## Who it's for
- **Primary:** a person who holds tokenized stocks (NVDAB, QQQB, SPCXB) and is afraid of a crash. They are not a crypto native. They want to know the worst case before they hold.
- **Secondary:** AI agents, and the people who run them, that manage money for someone and need a way to buy protection for that person. They reach Floor through its MCP server and pay per call with b402.
- **Judges:** a product that has no direct match on BNB Chain, uses only spot trades, and uses the Agentic Wallet and b402 in a real role.

## The three messages (final wording)

### 1. Lead: the floor
**Set the lowest your portfolio can go.**
You pick a floor, for example 90% of what you put in. Floor moves your money between stocks and stablecoins so the value stays above that line. The floor holds unless prices gap more than 25% before the vault can rebalance. In 93 of 93 one-year backtest windows, it held.

Price of protection, said plainly: you give up part of the upside. In up years the vault kept about 42% of the basket's gain.

### 2. How: spot trades only
**No perps. No options. No leverage. No borrowing.**
Floor only swaps tokens on BNB Chain: stock tokens for USDT when prices fall, and back when they rise. Everything it does, you could do by hand with a swap.

### 3. Who runs it: agents
**An Agentic Wallet runs it. Any AI agent can use it.**
A Binance Agentic Wallet is the keeper that rebalances the vault. Floor has an MCP server, so any AI agent can quote, deposit, withdraw and check status. Agents pay per call through b402.

## Tagline options
1. **Set the lowest your portfolio can go.** (headline pick)
2. **Your stocks, with a floor.** (tagline pick)
3. Choose your worst case. Keep the upside.
4. Hold stocks. Pick your floor.
5. Know your worst year before it happens.
6. A floor under your tokenized stocks.
7. Insurance for your portfolio, without the bank.

**Headline: "Set the lowest your portfolio can go."** It says the lead message in the user's own terms, and "set" makes it a choice, not a promise. It does not say you cannot lose.

**Tagline: "Your stocks, with a floor."** Five words, concrete, no jargon. A non-crypto person understands "floor" at once, and it gives the product its name.

Option 3 is held for the sub-headline area. "Keep the upside" overstates things, because you keep only part of it. If used, write "Keep part of the upside."

Option 7 is not used: "insurance" implies a payout from a third party. Floor is a trading rule, not an insurer.

## Words we use
- floor, "the line you set", worst case, protection
- "holds unless prices gap more than 25% before the vault can rebalance"
- "you keep part of the upside" / "about 42% of the gain in up years (backtest)"
- spot trades, swap, stablecoin (USDT), vault, keeper
- backtest, "in 93 of 93 one-year windows", "since 2018"
- "measured", "assumes", "not yet measured"
- (building) for anything not yet live

## Words we never use
- guaranteed, can't lose, risk-free, "won't let you lose", safe, zero risk, insured, 100% protected
- never lose money (as our own claim; Buffett's line is quoted only as his)
- "beat the market", moonshot, revolutionary, seamless, unleash, game-changing
- "AI-powered" or anything about an in-app AI. There is none.
- weekend cost or weekend performance numbers. They are not measured yet.
- user counts, TVL, partner names, testimonials. We have none.
- "derivative", "hedge", "put option" as a description of what Floor does. It does not use them.
- "CPPI" in main copy. One footnote only.
