# Floor: landing page copy

Section order is final. IDs are for the web engineer (`<section id="...">`). Each section has a visual note. Design direction: visible grid, thin lines, "+" marks at crossings.
All numbers come from `CONTEXT.md` / `docs/RESEARCH_RESULTS.md`. Backtest numbers are from past data, and the page must say so near each one.

---

## nav (sticky)
Links: How it works · Trade-off · Proof · Agents · FAQ
Button: **Set your floor**
Visual: thin one-line bar on the grid, logo left, button right.

---

## #hero
**Headline:** Set the lowest your portfolio can go.
**Sub-headline:** Floor protects your tokenized stocks with a line you choose. If prices fall, the vault moves into stablecoins to stay above it. If prices rise, you keep part of the gain.
**Primary CTA:** Set your floor
**Secondary CTA:** See the proof
**Small line under CTAs:** Spot trades only on BNB Chain. The floor holds unless prices gap more than 25% before the vault can rebalance.
Visual: a price chart of a stock falling, with a flat horizontal line labelled "Your floor: 90%". The portfolio line follows the stock down, then flattens at the floor. Use backtest data (see #proof), label it "backtest".

---

## #problem
**Heading:** A crash does not ask what you can afford to lose.
**Body:** You can now hold stocks like NVIDIA and the Nasdaq-100 as tokens on BNB Chain. A bad year can cut the value by a third. In 2022, holding NVDA lost 51%.
Today you have two choices. Sell and miss the upside. Or hold and hope.
Floor adds a third: hold, with a floor.
Visual: two bars side by side, "NVDA 2022, hold: −51.0%" and "NVDA 2022 with Floor: −10.0%" (data: docs/data/vault_path_nvda_worst.csv). Caption: "Past data, not a prediction."

---

## #how-it-works
**Heading:** How it works
**Intro:** You choose one number. Floor does the rest.

**Step 1: Deposit.**
Put in tokenized stocks (NVDAB, SPCXB, QQQB) or USDT.
**Step 2: Pick your floor.**
Choose the lowest value you accept, for example 90% of your deposit, for a one-year term. At 90%, your worst case is about a 10% loss.
**Step 3: The vault keeps you above the line.**
Think of the gap between your value and your floor as a cushion. The vault holds more stock when the cushion is big, and less when it is small. When prices fall, it sells some stock for USDT. When prices rise, it buys some back. Each move is a normal swap on BNB Chain.
**Step 4: Withdraw when you like.**
Your money stays in the vault contract. At the end of the term you take it out.

**What if value reaches the floor?**
The vault moves fully into USDT and stays there until the term ends. This protects your floor. It also means you miss any recovery during that term.

**Footnote:** The rule is called constant proportion portfolio insurance (CPPI). Floor holds four times your cushion in stocks, and the rest in USDT.
Visual: a 4-step horizontal diagram on the grid. Under step 3, a small chart: stock exposure (top line) shrinking as the price falls toward the floor line.

---

## #trade-off
**Heading:** What it costs: part of the upside.
**Body:** Protection is not free. Floor charges for it in upside, not in fees we hide. We measured the trade.

| You give | You get |
|---|---|
| About 58% of the gain in an up year. The vault kept about 42% of a three-stock basket's gain. | Bad years cut to −8.6% where holding lost 17% (NVDA + TSLA + QQQ basket). |
| NVDA: kept about 45% of the gain. QQQ: about 32%. | NVDA: −9.9% where holding lost 36% (typical bad year). QQQ: −7.4% where holding lost 19%. |
| Small trading costs on each rebalance: 0.7 to 6.6 basis points for QQQB, NVDAB, SPCXB and SPYB on a $10k round trip (measured Thursday, 2026-10-02). | A floor you chose, written in a public contract you can read. |

**Warning line:** Choppy stocks cost more. For TSLA, the vault's median year was −6.8%, where holding returned +22%. We tell you this before you deposit.
Visual: a two-column "give / get" table on the grid. Beneath it, a simple bar showing "up year: you keep ~42% of the gain".

*(Note for the web engineer: 100 basis points = 1%. Show "0.7 bps = 0.007%" as a tooltip.)*

---

## #proof
**Heading:** Tested on real prices.
**Body:** We ran the Floor rule over every one-year window from 2018 to October 2026 on real daily prices of NVDA, QQQ, SPY, TSLA and baskets of them. The floor held in 93 of 93 windows.

**What the test assumed (we made it harder on purpose):**
- Weekend price gaps hit in full. Floor does not trade on weekends.
- Stablecoins earn 0%.
- Trading costs as measured in calm markets.

**Numbers to chart (in this order):**
1. **Hero stat:** "93 of 93" one-year windows where the floor held. Large number tile.
2. **Typical bad year (median of windows where holding lost >10%), vault vs hold** (bar pairs): NVDA −9.9% vs −36%. NVDA+TSLA+QQQ −8.6% vs −17%. QQQ −7.4% vs −19%. TSLA −9.7% vs −27%.
3. **Upside kept at 4x** (bars): basket 42%, NVDA 45%, QQQ 32%. TSLA is −3% and must be shown, labelled "whipsaw".
4. **Biggest one-night or weekend drops since 2018** (bars): NVDA −19.3%, TSLA −14.9%, AAPL −13.0%, SPCX −10.3% (76 days of history), QQQ −9.5%. A reference line at −25% labelled "Floor holds up to here".
5. **Breach rate vs. multiplier** (small table): at 4x, 0% for every basket. At 6x, NVDA 12%. At 8x, NVDA 20%, TSLA 9%. Caption: "This is why we use 4x."

**Caption under every chart:** Backtest on past prices. It does not predict the future.
Visual: the stat tile, then paired bars in two colours (hold, Floor). Keep one chart type per number. Do not smooth lines.

---

## #spot-only
**Heading:** Spot trades only. Nothing exotic.
**Body:** Floor buys and sells tokens. That is all.
- **No perps.** No bets on future prices.
- **No options.** No contracts that expire.
- **No leverage.** Your exposure never goes above your deposit.
- **No borrowing.** Floor owes no one anything.

When prices fall, the vault swaps stock tokens for USDT on BNB Chain (PancakeSwap and other liquidity). When prices rise, it swaps back.
You can check every trade on-chain.
Visual: four crossed-out labels in a row (perps, options, leverage, borrowing) on grid cells, with a single "swap" arrow below.

---

## #agents
**Heading:** Built for agents, too.
**Body:** More money is now managed by AI agents. Floor lets an agent buy protection for the person it works for.

**Keeper: Binance Agentic Wallet.** One Agentic Wallet runs the vault's rebalances. Your funds stay in the vault contract. The keeper wallet never holds them.
**MCP server (building).** Floor exposes its actions as MCP tools: `quote_protection`, `deposit`, `withdraw`, `status`, `backtest`. Any MCP-capable agent can use them.
**Pay per call with b402 (building).** The agent pays a small fee for each call in stablecoins, through Binance's x402 on BSC. No sign-up, no API key. (Gas is sponsored.)
**Agent skill (building).** A Floor skill so a user's own agent can deposit and withdraw.

**Honest note:** the keeper depends on the Agentic Wallet's Developer Mode, which is still being tested. We are building a fallback so rebalances do not stop.
Visual: a left-to-right flow: Agent → MCP call → b402 payment → Floor vault ← Keeper (Agentic Wallet). Code snippet card showing an MCP `quote_protection` call (placeholder, mark as example).

---

## #limits
**Heading:** What we don't claim.
**Body:**
- **Floor is not a guarantee.** It holds unless prices gap more than 25% before the vault can rebalance. Past drops since 2018 were smaller (worst: NVDA −19.3%). A future drop could be larger.
- **It can miss the recovery.** If value reaches the floor, the vault goes to USDT until the term ends.
- **You give up upside.** About 42% of a basket's gain was kept in up years.
- **Some stocks suit it badly.** TSLA's choppy moves made the vault lose in a median year.
- **Weekends.** Floor does not trade on weekends. We assume the full weekend gap hits. Weekend trading cost is not measured yet.
- **Costs rise in a crash.** We measured trading costs in calm markets only. Costs in a crash are not tested.
- **Token risk.** A tokenized stock can move or be paused differently from the real stock. Not yet tested.
- **Contract risk.** The vault is new code. (Add audit status here only if one exists.)
- **Limited stocks.** Today: NVDAB, SPCXB, QQQB, with SPYB optional. No Apple token exists yet.
- **Not financial advice.**
Visual: plain text list on the grid, each line with a small "+" marker. No icons, no colour alarms.

---

## #faq
**Heading:** Questions you should ask

**1. Can I lose money?**
Yes. You set the floor, for example 90%, so your worst case is about a 10% loss. A loss can be larger if prices gap more than 25% before the vault can rebalance. And your money is still in the market, so it can fall to the floor.

**2. What happens if my value hits the floor?**
The vault holds only USDT until your one-year term ends. You keep your floor value. You miss any recovery in that term.

**3. How much upside do I give up?**
In our backtest, about 42% of the gain was kept in up years for a three-stock basket. So you gave up about 58%. It was 45% kept for NVDA and 32% for QQQ.

**4. Is this insurance? Is anyone paying me if I lose?**
No. No one pays you. It is a rule the vault follows: sell stock as prices fall, buy as they rise.

**5. Do you use leverage, options or borrowing?**
No. Spot trades only: swaps between stock tokens and USDT on BNB Chain.

**6. Who holds my money?**
The vault contract holds it, not Floor and not the keeper wallet. The contract is public. (Add audit status when it exists.)

**7. Why not just sell my stocks if I'm scared?**
You can. Then you miss any rise. Floor keeps you in the market, with a limit on how far you can fall, and you keep part of the gain.

**8. What does it cost?**
There is no hidden fee in this copy. The cost is the upside you give up, plus small trading costs: on a $10k round trip, 0.7 to 6.6 basis points for QQQB, NVDAB, SPCXB and SPYB, measured on 2026-10-02. (Add any Floor fee here once decided: **open question**.)

**9. What happens on weekends?**
The vault does not rebalance on weekends. We assume the full weekend gap hits your value. The biggest one-night or weekend drop since 2018 was NVDA's −19.3%.

**10. Do I need to know crypto?**
You need a BNB Chain wallet and tokenized stocks (or USDT). After that, you pick one number.

Visual: accordion list on the grid, one thin line per question.

---

## #cta
**Heading:** Pick your floor before the next drop.
**Button:** Set your floor
**Secondary link:** Read the agent docs
Visual: large empty grid cell with one "+" and the button.

---

## #footer
**Line:** Floor. Your stocks, with a floor.
**Columns:** Product (How it works, Trade-off, Proof) · Agents (MCP server, b402, Agent skill) · Code (Contracts on BscScan, GitHub, Backtest scripts) · Legal (Risks, Terms, Privacy)
**Disclaimer:** Floor is a hackathon project built for BNB Hack: Tokenized Stocks Edition. Backtests use past prices and do not predict the future. Not financial advice. Tokenized stocks and smart contracts carry risk, including loss of the amount deposited.
Visual: thin footer grid with link columns and the "+" marks at the crossings.
