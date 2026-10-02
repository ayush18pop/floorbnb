import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AgentFlow } from "@/components/charts/agent-flow";
import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { Xh } from "@/components/ui/xh";
import { BRAND } from "@/lib/brand";
import { Section } from "./section";

/* ---------- 05 spot only ---------- */
const nots = [
  { t: "No perps.", b: "No bets on future prices." },
  { t: "No options.", b: "No contracts that expire." },
  { t: "No leverage.", b: "Your exposure never goes above your deposit." },
  { t: "No borrowing.", b: `${BRAND.name} owes no one anything.` },
];
export function SpotOnly() {
  return (
    <Section id="spot-only" index="05" label="Spot only" title="Spot trades only. Nothing exotic." intro={`${BRAND.name} buys and sells tokens. That is all.`}>
      <div className="cellgrid">
        {nots.map((n) => (
          <div key={n.t} className="col-span-4 md:col-span-4 lg:col-span-3 xh-corners">
            <p className="mono text-[15px] font-medium" style={{ textDecoration: "line-through", textDecorationThickness: 1, textUnderlineOffset: "-0.4em" }}>
              <span className="sr-only">Not used: </span>{n.t.replace(".", "").toUpperCase()}
            </p>
            <p className="body mt-3" style={{ fontSize: 15 }}><span className="sr-only">{n.t} </span>{n.b}</p>
          </div>
        ))}
        <div className="col-span-4 md:col-span-8 lg:col-span-12 bare">
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-center">
            <span className="mono inline-flex items-center gap-3 border border-grid-strong bg-surface px-4 py-2 text-[13px]" aria-hidden="true">
              STOCK TOKEN <ArrowRight size={16} strokeWidth={1.5} /> USDT
            </span>
            <p className="body" style={{ fontSize: 15 }}>
              When prices fall, the vault swaps stock tokens for USDT on BNB Chain (PancakeSwap and other liquidity). When prices rise, it swaps back. You can check every trade on-chain.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ---------- 06 agents ---------- */
const snippet = `// Example only. The endpoint is a placeholder until the server is live.
POST https://mcp.<domain>/mcp
{
  "method": "tools/call",
  "params": {
    "name": "quote_protection",
    "arguments": {
      "assets": [{ "symbol": "NVDAB", "weightBps": 10000 }],
      "depositUsd": 10000,
      "floorPct": 90,
      "termDays": 365
    }
  }
}
// First reply: HTTP 402 with the price.
// Sign it with your wallet, retry, get the quote.`;

export function Agents() {
  const items = [
    { t: "Keeper", tag: "Binance Agentic Wallet", b: "An automated keeper triggers rebalances; a Binance Agentic Wallet holds the same role. Neither can move your funds. Your funds stay in your own vault contract. Your own Agentic Wallet can sign deposits and pay b402." },
    { t: "MCP server", tag: "building", b: "Floor exposes its actions as MCP tools: quote_protection, build_deposit_tx, build_withdraw_tx, get_status, backtest. Any MCP-capable agent can use them. Tools that change state return an unsigned transaction. Floor never signs." },
    { t: "Pay per call with b402", tag: "building", b: "The agent pays a small fee for each paid call in stablecoins, through Binance's x402 on BSC. No sign-up, no API key. Gas is sponsored." },
    { t: "Agent skill", tag: "building", b: "A Floor skill so a user's own agent can deposit and withdraw with the user's own wallet." },
  ];
  return (
    <Section id="agents" index="06" label="Agents" title="Built for agents, too." intro="More money is now managed by AI agents. Floor lets an agent buy protection for the person it works for.">
      <div className="cellgrid">
        <div className="col-span-4 md:col-span-8 lg:col-span-12 !p-4 md:!p-6">
          <p className="label mb-5">FIG. 10 / HOW AN AGENT USES {BRAND.name.toUpperCase()}</p>
          <AgentFlow />
        </div>
        {items.map((i) => (
          <div key={i.t} className="col-span-4 md:col-span-4 lg:col-span-3 xh-corners">
            <span className={`badge ${i.tag === "building" ? "b-warn" : "b-acc"}`}>{i.tag}</span>
            <h3 className="h3 mt-3">{i.t}</h3>
            <p className="body mt-2" style={{ fontSize: 14.5 }}>{i.b}</p>
          </div>
        ))}
        <div className="col-span-4 md:col-span-8 lg:col-span-7 !p-0">
          <div className="flex items-center justify-between border-b border-grid px-4 py-3 md:px-6">
            <span className="label">An MCP call</span>
            <span className="badge">Example</span>
          </div>
          <pre className="code !border-0 !bg-transparent !p-4 md:!p-6" tabIndex={0} aria-label="Example MCP call to quote_protection">{snippet}</pre>
        </div>
        <div className="col-span-4 md:col-span-8 lg:col-span-5 flex flex-col justify-between gap-6 bare">
          <div className="border-l-2 pl-4" style={{ borderColor: "var(--warning)" }}>
            <p className="label warn">Honest note</p>
            <p className="body mt-1" style={{ fontSize: 15 }}>The Agentic Wallet keeper depends on Developer Mode, which is still being tested. A plain wallet is the main keeper, so rebalances do not stop if the Agentic Wallet is blocked.</p>
          </div>
          <div><ButtonLink variant="secondary" href="/agents">Read the agent docs <ArrowRight size={16} strokeWidth={1.5} /></ButtonLink></div>
        </div>
      </div>
    </Section>
  );
}

/* ---------- 07 limits ---------- */
const limits: [string, string][] = [
  ["Floor is not a guarantee.", "It holds unless prices gap more than 25% before the vault can rebalance. Past drops since 2018 were smaller (worst: NVDA −19.3%). A future drop could be larger."],
  ["It can miss the recovery.", "If value reaches the floor, the vault goes to USDT until the term ends."],
  ["You give up upside.", "About 42% of a basket's gain was kept in up years."],
  ["Some stocks suit it badly.", "TSLA's choppy moves made the vault lose in a median year."],
  ["Weekends.", "Floor does not trade on weekends. We assume the full weekend gap hits. Weekend trading cost is not measured yet."],
  ["The vault trades in a set window.", "The contract trades Monday to Friday, 15:30 to 19:30 UTC. We re-ran the backtest with one rebalance a day to match: the floor still held in 93 of 93 windows at 4x. At 5x it broke in 3.2% of TSLA windows."],
  ["Costs rise in a crash.", "We measured trading costs in calm markets only. Costs in a crash are not tested."],
  ["Token issuer risk.", "The issuer of a tokenized stock can pause the token, block an address or apply a sanctions list. If that happens, the vault cannot swap that token. You can always exit: the vault sends you your USDT and any tokens that can still move, and the rest can be recovered once the restriction is lifted. A tokenized stock can also move differently from the real stock. Not yet tested."],
  ["Contract risk.", "The vault is new code. No audit is published yet."],
  ["Limited stocks.", "Today: NVDAB, SPCXB, QQQB, with SPYB optional. No Apple token exists yet."],
  ["Not financial advice.", ""],
];
export function Limits() {
  return (
    <Section id="limits" index="07" label="Limits" title="What we don't claim.">
      <div className="cellgrid">
        <div className="col-span-4 md:col-span-8 lg:col-span-12">
          <ul className="grid gap-x-12 gap-y-5 lg:grid-cols-2">
            {limits.map(([h, b]) => (
              <li key={h} className="xh-li">
                <p className="body font-medium text-ink!" style={{ fontSize: 16 }}>{h}</p>
                {b && <p className="body mt-1" style={{ fontSize: 15 }}>{b}</p>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

/* ---------- 08 faq ---------- */
const faqs: [string, string][] = [
  ["Can I lose money?", "Yes. You set the floor, for example 90%, so your worst case is about a 10% loss. A loss can be larger if prices gap more than 25% before the vault can rebalance. And your money is still in the market, so it can fall to the floor."],
  ["What happens if my value hits the floor?", "The vault holds only USDT until your one-year term ends. You keep your floor value. You miss any recovery in that term."],
  ["How much upside do I give up?", "In our backtest, about 42% of the gain was kept in up years for a three-stock basket. So you gave up about 58%. It was 45% kept for NVDA and 32% for QQQ."],
  ["Is this insurance? Is anyone paying me if I lose?", "No. No one pays you. It is a rule the vault follows: sell stock as prices fall, buy as they rise."],
  ["Do you use leverage, options or borrowing?", "No. Spot trades only: swaps between stock tokens and USDT on BNB Chain."],
  ["Who holds my money?", "Your own vault contract holds it, one per position. Not Floor and not the keeper wallet. The contract is public. No audit is published yet."],
  ["Why not just sell my stocks if I'm scared?", "You can. Then you miss any rise. Floor keeps you in the market, with a limit on how far you can fall, and you keep part of the gain."],
  ["What does it cost?", "There is no protocol fee in v1. The cost is the upside you give up, plus small trading costs: on a $10k round trip, 0.7 to 6.6 basis points for QQQB, NVDAB, SPCXB and SPYB, measured on 2026-10-02."],
  ["What happens on weekends?", "The vault does not rebalance on weekends. We assume the full weekend gap hits your value. The biggest one-night or weekend drop since 2018 was NVDA's −19.3%."],
  ["Do I need to know crypto?", "You need a BNB Chain wallet and USDT. Deposit USDT, pick a basket, then pick one number."],
];
export function Faq() {
  return (
    <Section id="faq" index="08" label="FAQ" title="Questions you should ask">
      <div className="cellgrid">
        <div className="col-span-4 md:col-span-8 lg:col-span-12 faq !py-2">
          {faqs.map(([q, a], i) => (
            <details key={q}>
              <summary><span><span className="mono mr-3 text-[12px] text-muted">{String(i + 1).padStart(2, "0")}</span>{q}</span><span className="plus" aria-hidden="true">+</span></summary>
              <div><p className="body pl-0 md:pl-9">{a}</p></div>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ---------- cta ---------- */
export function Cta() {
  return (
    <section id="cta" className="sec" aria-labelledby="cta-h">
      <Xh style={{ left: 0, top: 0 }} />
      <Xh style={{ left: "100%", top: 0 }} />
      <Reveal className="lattice relative grid grid-cols-4 md:grid-cols-8 lg:grid-cols-12 [grid-auto-rows:var(--row)]">
        <Xh style={{ left: 0, top: "100%" }} />
        <Xh style={{ left: "100%", top: "100%" }} />
        <div className="col-span-4 row-span-4 flex flex-col items-start justify-center gap-6 p-4 md:col-span-8 md:row-span-3 md:p-6 lg:col-span-8 lg:col-start-3 lg:row-span-3">
          <h2 id="cta-h" className="h1 max-w-[20ch]">Pick your floor before the next drop.</h2>
          <div className="btn-stack flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <ButtonLink variant="primary" href="/app">Set your floor</ButtonLink>
            <ButtonLink variant="ghost" href="/agents">Read the agent docs <ArrowRight size={16} strokeWidth={1.5} /></ButtonLink>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ---------- footer ---------- */
const cols: { h: string; links: [string, string][] }[] = [
  { h: "Product", links: [["How it works", "/#how-it-works"], ["Trade-off", "/#trade-off"], ["Proof", "/#proof"], ["Prototype", "/app"]] },
  { h: "Agents", links: [["MCP server", "/agents#tools"], ["b402", "/agents#b402"], ["Agent skill", "/agents#connect"]] },
  { h: "Code", links: [["Contracts on BscScan (soon)", "#"], ["GitHub (soon)", "#"], ["Backtest scripts (soon)", "#"]] },
  { h: "Legal", links: [["Risks", "/#limits"], ["Terms (soon)", "#"], ["Privacy (soon)", "#"]] },
];
export function Footer() {
  return (
    <footer className="sec" aria-label="Footer">
      <Xh style={{ left: 0, top: 0 }} />
      <Xh style={{ left: "100%", top: 0 }} />
      <div className="cellgrid" style={{ borderTop: 0 }}>
        <div className="col-span-4 md:col-span-8 lg:col-span-4">
          <p className="h3">{BRAND.name}. {BRAND.tagline}</p>
        </div>
        {cols.map((c) => (
          <nav key={c.h} aria-label={c.h} className="col-span-2 md:col-span-2 lg:col-span-2">
            <p className="label mb-3 text-ink!">{c.h}</p>
            <ul className="space-y-2">
              {c.links.map(([t, h]) => (
                <li key={t}>{h === "#" ? <span className="small">{t}</span> : <Link href={h} className="navlink">{t}</Link>}</li>
              ))}
            </ul>
          </nav>
        ))}
        <div className="col-span-4 md:col-span-8 lg:col-span-12 bare">
          <p className="small max-w-[96ch]">
            {BRAND.name} is a hackathon project built for BNB Hack: Tokenized Stocks Edition. Backtests use past prices and do not predict the future. Not financial advice. Tokenized stocks and smart contracts carry risk, including loss of the amount deposited.
          </p>
        </div>
      </div>
    </footer>
  );
}
