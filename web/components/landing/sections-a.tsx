import Link from "next/link";
import { ChartPanel } from "@/components/charts/panel";
import { PairedBars, SingleBars } from "@/components/charts/bars";
import { ExposureChart } from "@/components/charts/exposure-chart";
import { StackDiagram } from "@/components/charts/stack-diagram";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Xh } from "@/components/ui/xh";
import { Section } from "./section";
import type { PathPoint } from "@/lib/data";

/* ---------- 01 problem ---------- */
export function Problem({ hold, vault }: { hold: number; vault: number }) {
  return (
    <Section
      id="problem"
      index="01"
      label="The problem"
      title="A crash does not ask what you can afford to lose."
      intro={
        <div className="space-y-4">
          <p className="body-l">You can now hold stocks like NVIDIA and the Nasdaq-100 as tokens on BNB Chain. A bad year can cut the value by a third. In 2022, holding NVDA lost 51%.</p>
          <p className="body-l">Today you have two choices. Sell and miss the upside. Or hold and hope. Floor adds a third: <strong className="text-ink font-medium">hold, with a floor.</strong></p>
        </div>
      }
    >
      <div className="cellgrid">
        <div className="col-span-4 md:col-span-4 lg:col-span-6">
          <p className="stat-label">NVDA 2022, hold</p>
          <p className="num-xl neg mt-3" style={{ fontSize: "clamp(2.5rem, 2rem + 3vw, 4rem)" }}>
            <NumberTicker value={hold} decimalPlaces={1} prefix="−" />%
          </p>
          <div className="mt-5 h-4 w-full" style={{ background: "var(--surface-sunken)" }}>
            <div className="h-4" style={{ width: `${hold}%`, background: "var(--crosshair)" }} />
          </div>
          <p className="stat-note mt-3">Holding the stock from 4 Jan 2022 to 4 Jan 2023. It was down 62.7% at the low.</p>
        </div>
        <div className="col-span-4 md:col-span-4 lg:col-span-6">
          <p className="stat-label">NVDA 2022, with Floor</p>
          <p className="num-xl mt-3 acc" style={{ fontSize: "clamp(2.5rem, 2rem + 3vw, 4rem)" }}>
            <NumberTicker value={vault} decimalPlaces={1} prefix="−" />%
          </p>
          <div className="mt-5 h-4 w-full" style={{ background: "var(--surface-sunken)" }}>
            <div className="h-4" style={{ width: `${vault}%`, background: "var(--accent)" }} />
          </div>
          <p className="stat-note mt-3">Same window, a 90% floor, m = 4. Bar length = size of the loss on the same scale.</p>
        </div>
        <div className="col-span-4 md:col-span-8 lg:col-span-12 bare">
          <p className="label" style={{ textTransform: "none", letterSpacing: "0.02em" }}>Backtest on past prices, not a prediction. Source: docs/data/vault_path_nvda_worst.csv.</p>
        </div>
      </div>
    </Section>
  );
}

/* ---------- 02 how it works ---------- */
const steps = [
  { n: "1", t: "Deposit", b: "Deposit USDT and pick a basket: NVDAB, SPCXB, QQQB." },
  { n: "2", t: "Pick your floor", b: "Choose the lowest value you accept, for example 90% of your deposit, for a one-year term. At 90%, your worst case is about a 10% loss." },
  { n: "3", t: "The vault keeps you above the line", b: "The gap between your value and your floor is a cushion. The vault holds more stock when the cushion is big, and less when it is small. When prices fall, it sells some stock for USDT. When prices rise, it buys some back. Each move is a normal swap on BNB Chain." },
  { n: "4", t: "Withdraw when you like", b: "Your money stays in the vault contract. You can exit at any time, or take it all out at the end of the term." },
];

export function HowItWorks({ data }: { data: PathPoint[] }) {
  return (
    <Section id="how-it-works" index="02" label="How it works" title="How it works" intro="You choose one number. Floor does the rest.">
      <div className="cellgrid">
        {steps.map((s) => (
          <div key={s.n} className="col-span-4 md:col-span-4 lg:col-span-3 xh-corners">
            <p className="mono text-[13px] acc">STEP {s.n}</p>
            <h3 className="h3 mt-3">{s.t}</h3>
            <p className="body mt-3" style={{ fontSize: 15 }}>{s.b}</p>
          </div>
        ))}
        <div className="col-span-4 md:col-span-8 lg:col-span-6 !p-0">
          <ChartPanel className="h-full border-0" corners={false} fig="FIG. 02 / THE FLOOR AND THE CUSHION" title="At deposit" caption={null}>
            <StackDiagram />
            <p className="body mt-5" style={{ fontSize: 15 }}>
              Think of the gap between your value and your floor as a cushion. {`Floor holds four times your cushion in stock, and the rest in USDT.`} If the cushion shrinks, the vault sells stock for USDT. If it grows, the vault buys stock back.
            </p>
          </ChartPanel>
        </div>
        <div className="col-span-4 md:col-span-8 lg:col-span-6 !p-0">
          <ChartPanel
            className="h-full border-0"
            corners={false}
            fig="FIG. 03 / STOCK HELD AS THE PRICE FALLS"
            title="NVDA 2022"
            source="docs/data/vault_path_nvda_worst.csv"
          >
            <ExposureChart data={data} />
          </ChartPanel>
        </div>
        <div className="col-span-4 md:col-span-8 lg:col-span-12 bare">
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h3 className="h3">What if value reaches the floor?</h3>
            </div>
            <div className="lg:col-span-7 space-y-3">
              <p className="body">The vault moves fully into USDT and stays there until the term ends. This protects your floor. It also means you miss any recovery during that term.</p>
              <p className="small">The rule is called constant proportion portfolio insurance (CPPI). The vault holds 4 times your cushion in stocks (never more than your whole value), and the rest in USDT.</p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ---------- 03 trade-off ---------- */
export function TradeOff({ bestNvda }: { bestNvda: { hold: number; vault: number } }) {
  const rows: [string, string][] = [
    ["About 58% of the gain in an up year. The vault kept about 42% of a three-stock basket's gain.", "Bad years cut to −8.6% where holding lost 17.2% (NVDA + TSLA + QQQ basket, typical bad year)."],
    ["NVDA: kept about 45% of the gain. QQQ: about 32%.", "NVDA: −9.9% where holding lost 36.5% (typical bad year). QQQ: −7.4% where holding lost 19.4%."],
    ["Small trading costs on each rebalance: 0.7 to 6.6 basis points for QQQB, NVDAB, SPCXB and SPYB on a $10k round trip (measured Thursday, 2026-10-02).", "A floor you chose, written in a public contract you can read."],
  ];
  return (
    <Section id="trade-off" index="03" label="Trade-off" title="What it costs: part of the upside." intro="Protection is not free. Floor charges for it in upside, not in fees we hide. We measured the trade.">
      <div className="cellgrid">
        <div className="col-span-4 md:col-span-4 lg:col-span-6 sunken hidden lg:block"><p className="label text-ink!">You give</p></div>
        <div className="col-span-4 md:col-span-4 lg:col-span-6 sunken hidden lg:block"><p className="label text-ink!">You get</p></div>
        {rows.map(([give, get]) => (
          <div key={give} className="col-span-4 md:col-span-8 lg:col-span-12 !p-0">
            <div className="grid grid-cols-1 gap-px bg-grid lg:grid-cols-2">
              <p className="body bg-surface p-4 md:p-6" style={{ fontSize: 15 }}><span className="label mb-1 block lg:hidden">You give</span>{give}</p>
              <p className="body bg-surface p-4 md:p-6" style={{ fontSize: 15 }}><span className="label mb-1 block lg:hidden">You get</span>{get}</p>
            </div>
          </div>
        ))}
        <div className="col-span-4 md:col-span-8 lg:col-span-6 !p-0">
          <ChartPanel className="h-full border-0" corners={false} fig="FIG. 04 / UPSIDE KEPT IN UP YEARS" title="Basket, m = 4" caption="Backtest on past prices. It does not predict the future." source="docs/data/gap_backtest.csv (NVDA+TSLA+QQQ, open_close, m = 4, capture_up)">
            <p className="stat-label">Share of the gain you keep</p>
            <p className="num-xl mt-2"><NumberTicker value={42} suffix="%" /></p>
            <div className="mt-4 flex h-4 w-full" style={{ background: "var(--surface-sunken)" }} role="img" aria-label="You keep about 42 percent of the gain and give up about 58 percent.">
              <div className="h-4" style={{ width: "42%", background: "var(--accent)" }} />
            </div>
            <div className="mt-2 flex justify-between mono text-[12px]" style={{ color: "var(--text-muted)" }}>
              <span>KEPT ~42%</span><span>GIVEN UP ~58%</span>
            </div>
          </ChartPanel>
        </div>
        <div className="col-span-4 md:col-span-8 lg:col-span-6 bare">
          <h3 className="h3">Best window, same rule</h3>
          <p className="body mt-3" style={{ fontSize: 15 }}>
            Strong trends keep more of the gain than the typical 42%. NVDA, 8 Mar 2023 to 7 Mar 2024: holding <span className="mono text-ink">+{bestNvda.hold.toFixed(1)}%</span>, with Floor <span className="mono text-ink">+{bestNvda.vault.toFixed(1)}%</span>. Past data, not a prediction.
          </p>
          <div className="mt-5 border-l-2 pl-4" style={{ borderColor: "var(--warning)" }}>
            <p className="label warn">Warning</p>
            <p className="body mt-1" style={{ fontSize: 15 }}>Choppy stocks cost more. For TSLA, the vault&apos;s median year was −6.8%, where holding returned +22.4%. We tell you this before you deposit.</p>
          </div>
          <p className="small mt-4">1 basis point (bp) = 0.01%. So 0.7 bps = 0.007%, and 100 bps = 1%.</p>
        </div>
      </div>
    </Section>
  );
}
export { Link, SingleBars, PairedBars, Xh };
