export type DocLink = { slug: string; href: string; title: string; blurb: string };

export const DOCS: DocLink[] = [
  { slug: "", href: "/docs", title: "Overview", blurb: "What Floor is, and where to read more." },
  { slug: "how-it-works", href: "/docs/how-it-works", title: "How it works", blurb: "The floor, the cushion, the 4× rule, cash lock and where CPPI comes from." },
  { slug: "trade-off", href: "/docs/trade-off", title: "The trade-off", blurb: "What you give and what you get: upside kept, costs, the TSLA whipsaw." },
  { slug: "backtest", href: "/docs/backtest", title: "Backtest", blurb: "Method, assumptions, every chart and table." },
  { slug: "evidence", href: "/docs/evidence", title: "Evidence", blurb: "How we tested the multiplier: 98 years, 1,581 one-year periods, and where it fails." },
  { slug: "spot-only", href: "/docs/spot-only", title: "Spot only", blurb: "No perps, options, leverage or borrowing. How swaps work." },
  { slug: "agents", href: "/docs/agents", title: "Agents", blurb: "Keeper, MCP tools, b402 and the agent skill." },
  { slug: "binance", href: "/docs/binance", title: "Binance Web3 integration", blurb: "Which Binance Web3 APIs Floor calls, live call counts, and what it does not use." },
  { slug: "contracts", href: "/docs/contracts", title: "Contracts", blurb: "The on-chain design in plain words." },
  { slug: "live-contracts", href: "/docs/live-contracts", title: "Live contracts", blurb: "Addresses, roles, caps and how to verify them yourself." },
  { slug: "risks", href: "/docs/risks", title: "Risks", blurb: "What we do not claim." },
  { slug: "open-items", href: "/docs/open-items", title: "Known open items", blurb: "What is not done, not tested or accepted, with status." },
  { slug: "faq", href: "/docs/faq", title: "FAQ", blurb: "Questions you should ask." },
];
