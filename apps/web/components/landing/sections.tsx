import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AgentFlow } from "@/components/charts/agent-flow";
import { ButtonLink } from "@/components/ui/button";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Reveal } from "@/components/ui/reveal";
import { Xh } from "@/components/ui/xh";
import { BRAND } from "@/lib/brand";
import { Section } from "./section";

const CAP = "Backtest, past data, not a prediction.";

/* ---------- the big -51% vs -10% moment ---------- */
export function Moment({ hold, vault }: { hold: number; vault: number }) {
  const big = { fontSize: "clamp(3.5rem, 2rem + 6vw, 7rem)" };
  return (
    <section id="moment" aria-label="NVDA 2022, holding versus Floor" className="sec">
      <Xh style={{ left: 0, top: 0 }} />
      <Xh style={{ left: "100%", top: 0 }} />
      <Reveal>
        <div className="cellgrid">
          <div className="col-span-4 md:col-span-4 lg:col-span-6 !p-6 md:!p-10">
            <p className="stat-label">Holding NVDA, its worst year since 2018</p>
            <p className="num-xl neg mt-3 leading-none" style={big}><NumberTicker value={hold} decimalPlaces={0} prefix="−" />%</p>
            <div className="mt-6 h-6 w-full" style={{ background: "var(--surface-sunken)" }}>
              <div className="h-6" style={{ width: `${hold}%`, background: "var(--crosshair)" }} />
            </div>
          </div>
          <div className="col-span-4 md:col-span-4 lg:col-span-6 !p-6 md:!p-10">
            <p className="stat-label">With {BRAND.name}, same year</p>
            <p className="num-xl acc mt-3 leading-none" style={big}><NumberTicker value={vault} decimalPlaces={0} prefix="−" />%</p>
            <div className="mt-6 h-6 w-full" style={{ background: "var(--surface-sunken)" }}>
              <div className="h-6" style={{ width: `${vault}%`, background: "var(--accent)" }} />
            </div>
          </div>
          <div className="col-span-4 md:col-span-8 lg:col-span-12 bare">
            <p className="label" style={{ textTransform: "none", letterSpacing: "0.02em" }}>
              {CAP} NVDA 2022 is its worst one-year window, not a typical year. Source: docs/data/vault_path_nvda_worst.csv. Same scale on both bars.{" "}
              <Link href="/docs/backtest#worst-year" className="prose-link">Details</Link>
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ---------- how it works: 3 visual steps ---------- */
function MiniFloor() {
  return (
    <div className="relative h-24 w-full border border-grid-strong bg-surface" role="img" aria-label="A value bar with a floor line near the bottom">
      <div className="absolute inset-x-0 top-0" style={{ height: "10%", background: "var(--accent-soft)" }} />
      <div className="absolute inset-x-0" style={{ top: "10%", height: 2, background: "var(--floor-line)" }} />
      <span className="label absolute bottom-2 left-3">Your floor</span>
    </div>
  );
}
function MiniSplit() {
  return (
    <div className="flex h-24 w-full border border-grid-strong" role="img" aria-label="A bar split into stock and USDT">
      <div className="flex w-[40%] items-center justify-center mono text-[12px]" style={{ background: "var(--text)", color: "var(--bg)" }}>STOCK</div>
      <div className="flex flex-1 items-center justify-center mono text-[12px] text-ink-2">USDT</div>
    </div>
  );
}
function MiniSwap() {
  return (
    <div className="flex h-24 w-full items-center justify-center gap-3 border border-grid-strong mono text-[12px]" role="img" aria-label="Stock is swapped for USDT when prices fall, and back when they rise">
      <span>STOCK</span>
      <span className="flex flex-col items-center gap-2" aria-hidden="true"><ArrowRight size={14} strokeWidth={1.5} /><ArrowRight size={14} strokeWidth={1.5} className="rotate-180" /></span>
      <span>USDT</span>
    </div>
  );
}

export function Steps() {
  const steps = [
    { n: "1", t: "Pick your floor", v: <MiniFloor /> },
    { n: "2", t: "Vault holds stock above it", v: <MiniSplit /> },
    { n: "3", t: "Sells on falls, buys on rises", v: <MiniSwap /> },
  ];
  return (
    <Section id="how-it-works" index="01" label="How it works" title="Three steps.">
      <div className="cellgrid">
        {steps.map((s) => (
          <div key={s.n} className="col-span-4 md:col-span-8 lg:col-span-4 xh-corners !p-6">
            <p className="mono text-[13px] acc">STEP {s.n}</p>
            <div className="mt-4">{s.v}</div>
            <h3 className="h3 mt-5">{s.t}</h3>
          </div>
        ))}
        <div className="col-span-4 md:col-span-8 lg:col-span-12 bare">
          <ButtonLink variant="ghost" href="/docs/how-it-works">Read how it works <ArrowRight size={16} strokeWidth={1.5} /></ButtonLink>
        </div>
      </div>
    </Section>
  );
}

/* ---------- proof tiles ---------- */
function Tile({ href, label, children, note, cap = true }: { href: string; label: string; children: React.ReactNode; note: string; cap?: boolean }) {
  return (
    <Link href={href} className="group col-span-4 flex flex-col justify-between gap-6 no-underline md:col-span-4 lg:col-span-3 !p-6" style={{ minHeight: 220 }}>
      <p className="stat-label">{label}</p>
      <div>
        <p className="mono leading-none" style={{ fontSize: "clamp(2.25rem, 1.5rem + 2.5vw, 3.5rem)", letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>{children}</p>
        <p className="stat-note mt-3">{note}</p>
        {cap && <p className="stat-note mt-1">{CAP}</p>}
      </div>
      <span className="label inline-flex items-center gap-2 group-hover:text-accent!">See the detail <ArrowRight size={14} strokeWidth={1.5} /></span>
    </Link>
  );
}

export function ProofTiles() {
  return (
    <Section id="proof" index="02" label="Proof" title="Tested on real prices.">
      <div className="cellgrid">
        <Tile href="/docs/evidence" label="1,581 years tested, 1928 to 2026" note="ended clearly below a 90% floor (7 periods). A one-day drop bigger than about 24% breaks it, and single stocks have had them."><span>0.44%</span></Tile>
        <Tile href="/docs/backtest#worst-year" label="NVDA worst year, with Floor" note="Holding lost 51.0%"><span className="acc">−10.0%</span></Tile>
        <Tile href="/docs/trade-off#upside" label="Upside kept, up years" note="At a 90% floor and m = 4: about 4 × (100 − floor)% of an up-window gain. A typical year keeps less."><span>~42%</span></Tile>
        <Tile href="/docs/spot-only" label="How it trades" note="No perps, options, leverage or borrowing" cap={false}><span style={{ fontSize: "0.7em" }}>Spot only</span></Tile>
      </div>
    </Section>
  );
}

/* ---------- spot only ---------- */
export function SpotOnly() {
  const words = ["Perps", "Options", "Leverage", "Borrowing"];
  return (
    <Section id="spot-only" index="03" label="Spot only" title="Only plain swaps.">
      <div className="cellgrid">
        {words.map((w) => (
          <div key={w} className="col-span-2 md:col-span-4 lg:col-span-3 xh-corners !py-8">
            <p className="mono text-[clamp(1.25rem,1rem+1.2vw,2rem)] font-medium" style={{ textDecoration: "line-through", textDecorationThickness: 2 }}>
              <span className="sr-only">Not used: </span>{w.toUpperCase()}
            </p>
          </div>
        ))}
        <div className="col-span-4 md:col-span-8 lg:col-span-12 bare">
          <p className="body">{BRAND.name} swaps stock tokens and USDT on {BRAND.chain}. Nothing else. <Link href="/docs/spot-only" className="prose-link">How swaps work</Link></p>
        </div>
      </div>
    </Section>
  );
}

/* ---------- agents ---------- */
export function Agents() {
  return (
    <Section id="agents" index="04" label="Agents" title="Built for agents, too.">
      <div className="cellgrid">
        <div className="col-span-4 md:col-span-8 lg:col-span-12 !p-4 md:!p-6">
          <AgentFlow />
        </div>
        <div className="col-span-4 md:col-span-8 lg:col-span-12 bare flex flex-wrap items-center justify-between gap-4">
          <p className="body">An agent can quote, deposit and check status through MCP tools, and pay per call.</p>
          <ButtonLink variant="ghost" href="/docs/agents">Agent docs <ArrowRight size={16} strokeWidth={1.5} /></ButtonLink>
        </div>
      </div>
    </Section>
  );
}

/* ---------- not a guarantee ---------- */
export function NotAGuarantee() {
  return (
    <section id="limits" className="sec" aria-label="Not a guarantee">
      <Xh style={{ left: 0, top: 0 }} />
      <Xh style={{ left: "100%", top: 0 }} />
      <div className="pad py-6 md:!py-8">
        <div className="border-l-2 pl-4" style={{ borderColor: "var(--warning)" }}>
          <p className="label warn">Not a guarantee</p>
          <p className="body mt-1">The floor holds unless prices gap more than about {BRAND.gapLimitPct}% before the vault can rebalance. You also give up part of the upside, and the token issuer can pause a stock token. <Link href="/docs/risks" className="prose-link">Read the risks</Link></p>
        </div>
      </div>
    </section>
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
        <div className="col-span-4 row-span-3 flex flex-col items-start justify-center gap-6 p-4 md:col-span-8 md:p-6 lg:col-span-8 lg:col-start-3 max-md:row-span-4">
          <h2 id="cta-h" className="h1 max-w-[20ch]">Pick your floor before the next drop.</h2>
          <div className="btn-stack flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <ButtonLink variant="primary" href="/app">Set your floor</ButtonLink>
            <ButtonLink variant="ghost" href="/docs">Read the docs <ArrowRight size={16} strokeWidth={1.5} /></ButtonLink>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
