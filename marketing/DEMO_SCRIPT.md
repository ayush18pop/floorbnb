# Floor: 2-minute demo script

Target 120 seconds, about 250 spoken words. Every on-screen number comes from `RESEARCH_RESULTS.md` or is labelled "simulated". Do not show a fake balance as real. Mark anything not yet live: the plan assumes MCP, b402 and keeper are working by recording day. If not, label them "(building)" on screen and use a recorded stub.

| Time | On screen | Voice-over |
|---|---|---|
| 0:00–0:12 | Price chart of NVDA falling. Overlay: "NVDA, 2022: −51%". | "This is what holding a stock looks like in a bad year. NVIDIA in 2022, down 51%. You can hold stocks like this as tokens on BNB Chain now. You can't cap a fall." |
| 0:12–0:25 | Floor landing hero: "Set the lowest your portfolio can go." | "Floor lets you set the lowest your portfolio can go. Spot trades only. No perps, no options, no leverage, no borrowing." |
| 0:25–0:45 | App: deposit NVDAB, QQQB. Slider: floor at 90%. Display: "Worst case: about −10%". | "I deposit tokenized stocks. I pick a floor: ninety percent. That's my worst case, about ten percent down. One number." |
| 0:45–1:10 | Label "SIMULATED CRASH". Price drops day by day. Split view: stock value falling, USDT share rising, vault value flat near the floor line. Swap txs on BscScan. | "Now a simulated crash. As prices fall, the vault sells stock for USDT. Plain swaps on BNB Chain. The closer value gets to the floor, the less stock it holds. Value stays above the line." |
| 1:10–1:35 | Terminal / agent window: MCP call `quote_protection`. HTTP 402. b402 payment signed. Answer returns. Then keeper (Agentic Wallet) calls `rebalance()`; tx appears. | "Agents can do this too. An agent asks Floor's MCP server for a quote. Floor answers 402. The agent pays through b402, per call. A Binance Agentic Wallet is the keeper: it calls rebalance. The agent buys protection for the person it works for." |
| 1:35–1:52 | Trade-off card: "You keep about 42% of the gain in up years." Next: "93 of 93 windows held." Third: "Holds unless prices gap more than 25% before the vault can rebalance." | "The price is upside. In up years the vault kept about forty-two percent of the gain. In our backtest the floor held in ninety-three of ninety-three one-year windows. It isn't a guarantee: it holds unless prices gap more than twenty-five percent first." |
| 1:52–2:00 | Logo, tagline: "Your stocks, with a floor." URL and repo. | "Floor. Your stocks, with a floor." |

## Recording notes
- Say "simulated" aloud and show it on screen during the crash.
- Never say guaranteed, safe or can't lose.
- Do not show weekend cost or user numbers.
- Show the real contract address and a real swap transaction if available.
