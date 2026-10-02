"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { ChartPanel } from "@/components/charts/panel";
import { PayoffChart } from "@/components/charts/payoff-chart";
import { BPS, FLOOR_BPS_MAX, FLOOR_BPS_MIN, M, TERM_SECONDS, cushion, exposureTarget, floorFor, worked } from "@/lib/cppi";

const ASSETS = [
  { symbol: "NVDAB", name: "NVIDIA", address: "0x02fca66c1d1afb4e2a7884261eb00f63598a7436", bps: "5.9" },
  { symbol: "SPCXB", name: "SpaceX", address: "0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1", bps: "6.0" },
  { symbol: "QQQB", name: "Nasdaq-100", address: "0x205812cdbed920aff76c6580abd681a46d11efc7", bps: "0.7" },
] as const;

const usd = (n: number, d = 0) => `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function Builder() {
  const [picked, setPicked] = useState<string[]>(["NVDAB"]);
  const [floorPct, setFloorPct] = useState(90);
  const [amountStr, setAmountStr] = useState("10000");

  const amount = Math.max(0, Number(amountStr.replace(/,/g, "")) || 0);
  const amountErr = amount < 100 ? "Enter at least 100 USDT. (Launch caps are not set yet.)" : null;
  const floorBps = floorPct * 100;

  const calc = useMemo(() => {
    const D = amount;
    const F = floorFor(D, floorBps);
    const C = cushion(D, F);
    const E = exposureTarget(D, F);
    const n = picked.length;
    const base = Math.floor(BPS / n);
    const weights = picked.map((_, i) => (i === 0 ? BPS - base * (n - 1) : base));
    return { D, F, C, E, usdt: D - E, stockPct: D ? (E / D) * 100 : 0, gap: E > 0 ? (C / E) * 100 : Infinity, weights, steps: worked(D, floorBps) };
  }, [amount, floorBps, picked]);

  const toggle = (s: string) =>
    setPicked((p) => {
      const next = p.includes(s) ? p.filter((x) => x !== s) : [...p, s];
      return next.length ? ASSETS.map((a) => a.symbol).filter((x) => next.includes(x)) : p;
    });
  const worstCase = 100 - floorPct;

  const args = `createPosition(
  amount:      ${Math.round(amount)}e18  // USDT has 18 decimals
  floorBps:    ${floorBps}  // range ${FLOOR_BPS_MIN} to ${FLOOR_BPS_MAX}
  termSeconds: ${TERM_SECONDS}  // 365 days
  assets_:     [${picked.map((s) => short(ASSETS.find((a) => a.symbol === s)!.address)).join(", ")}]
  weightsBps:  [${calc.weights.join(", ")}]
)`;

  return (
    <div className="cellgrid" style={{ borderTop: 0 }}>
      {/* controls */}
      <div className="col-span-4 md:col-span-8 lg:col-span-5 !p-0">
        <form className="flex flex-col" onSubmit={(e) => e.preventDefault()} aria-label="Protection settings">
          <div className="border-b border-grid p-4 md:p-6">
            <p className="label mb-3" id="assets-l">1 / Basket</p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="assets-l">
              {ASSETS.map((a) => (
                <button key={a.symbol} type="button" className="chip" aria-pressed={picked.includes(a.symbol)} onClick={() => toggle(a.symbol)}>
                  {a.symbol}<span className="text-muted">{a.name}</span>
                </button>
              ))}
            </div>
            <p className="small mt-3">Pick one to three. Weights are equal: {calc.weights.map((w, i) => `${picked[i]} ${(w / 100).toFixed(2)}%`).join(", ")}.</p>
          </div>

          <div className="border-b border-grid p-4 md:p-6">
            <div className="flex items-baseline justify-between">
              <label className="label" htmlFor="floor">2 / Floor</label>
              <span className="mono text-[20px]">{floorPct}%</span>
            </div>
            <input id="floor" className="range mt-3" type="range" min={FLOOR_BPS_MIN / 100} max={FLOOR_BPS_MAX / 100} step={1} value={floorPct} onChange={(e) => setFloorPct(Number(e.target.value))} aria-valuetext={`${floorPct} percent of the deposit`} />
            <div className="mono mt-1 flex justify-between text-[11px] text-muted"><span>50%</span><span>98%</span></div>
            <p className="small mt-3">The lowest value you accept: {usd(calc.F)} of a {usd(amount)} deposit. Your worst case is about a {worstCase}% loss, unless prices gap more than {calc.gap === Infinity ? "25" : calc.gap.toFixed(0)}% before the vault can rebalance.</p>
          </div>

          <div className="border-b border-grid p-4 md:p-6">
            <label className="label" htmlFor="amount">3 / Amount</label>
            <div className="field mt-3">
              <div className="input-wrap">
                <input id="amount" className="input pr-16" inputMode="numeric" value={amountStr} onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9,]/g, ""))} aria-invalid={!!amountErr} aria-describedby="amount-msg" style={amountErr ? { borderColor: "var(--negative)" } : undefined} />
                <span className="unit">USDT</span>
              </div>
              <p id="amount-msg" className={`small ${amountErr ? "neg" : ""}`}>{amountErr ?? "Deposit USDT and pick a basket. You approve USDT to the factory."}</p>
            </div>
          </div>

          <div className="p-4 md:p-6">
            <p className="label mb-2">Term</p>
            <p className="mono text-[15px]">365 days <span className="text-muted">({TERM_SECONDS.toLocaleString("en-US")} s)</span></p>
            <p className="small mt-2">One year at launch. Fee: none in v1. Gas is paid by you in BNB.</p>
            <div className="btn-stack mt-6 flex flex-col gap-3">
              <Link href={`/app/position`} className="btn btn-primary" aria-disabled={!!amountErr}>
                Continue to the mock position <ArrowRight size={16} strokeWidth={1.5} />
              </Link>
              <p className="small">Prototype: this does not send a transaction.</p>
            </div>
          </div>
        </form>
      </div>

      {/* preview */}
      <div className="col-span-4 md:col-span-8 lg:col-span-7 !p-0 flex flex-col gap-px bg-grid">
        <div className="grid grid-cols-2 gap-px bg-grid md:grid-cols-4">
          {[
            ["Floor", usd(calc.F), "F, floored up"],
            ["Cushion", usd(calc.C), "C = V − F"],
            ["Stock at start", usd(calc.E), `${calc.stockPct.toFixed(0)}% · E* = min(${M}C, V)`],
            ["USDT at start", usd(calc.usdt), `${(100 - calc.stockPct).toFixed(0)}%`],
          ].map(([l, v, n]) => (
            <div key={l} className="bg-surface p-4">
              <p className="stat-label">{l}</p>
              <p className="mono mt-2 text-[22px] leading-none">{v}</p>
              <p className="stat-note mt-2">{n}</p>
            </div>
          ))}
        </div>

        <div className="bg-surface p-4 md:p-6">
          <p className="label mb-3">Split at start, per asset</p>
          <div className="flex h-8 w-full border border-grid-strong" role="img" aria-label={`${calc.stockPct.toFixed(0)} percent stock, ${(100 - calc.stockPct).toFixed(0)} percent USDT`}>
            <div className="flex items-center justify-center mono text-[12px]" style={{ width: `${calc.stockPct}%`, background: "var(--text)", color: "var(--bg)", minWidth: calc.stockPct > 3 ? undefined : 0 }}>{calc.stockPct >= 12 ? `STOCK ${calc.stockPct.toFixed(0)}%` : ""}</div>
            <div className="flex flex-1 items-center justify-center mono text-[12px] text-ink-2">{`USDT ${(100 - calc.stockPct).toFixed(0)}%`}</div>
          </div>
          <div className="tbl-wrap mt-4">
            <table className="tbl">
              <caption className="sr-only">Starting split by asset</caption>
              <thead><tr><th scope="col">Asset</th><th scope="col" className="r">weightsBps</th><th scope="col" className="r">Stock target</th><th scope="col" className="r">Cost, $10k round trip</th></tr></thead>
              <tbody>
                {picked.map((s, i) => (
                  <tr key={s}><th scope="row">{s}</th><td className="r">{calc.weights[i]}</td><td className="r">{usd((calc.E * calc.weights[i]) / BPS)}</td><td className="r">{ASSETS.find((a) => a.symbol === s)!.bps} bps</td></tr>
                ))}
                <tr><th scope="row">USDT</th><td className="r">n/a</td><td className="r">{usd(calc.usdt)}</td><td className="r">n/a</td></tr>
              </tbody>
            </table>
          </div>
          <p className="small mt-2">Costs: live aggregator quotes, Thu 2026-10-02 12:06 UTC. Weekend and crash-time costs are not measured yet.</p>
        </div>

        <div className="bg-surface p-4 md:p-6">
          
          <ChartPanel className="border-0 !bg-transparent" corners={false} fig="FIG. A1 / PROTECTION PREVIEW" title={`${floorPct}% floor, m = ${M}`} caption="Computed here from the CPPI rule. Not a forecast." source="docs/CONTRACTS.md section 5 (E* = min(m × (V − F), V), m = 4)">
            <PayoffChart deposit={Math.max(calc.D, 1)} floorValue={calc.F} stock={calc.E} />
          </ChartPanel>
        </div>
      </div>

      {/* worked example */}
      <div className="col-span-4 md:col-span-8 lg:col-span-12 !p-0">
        <div className="border-b border-grid p-4 md:p-6">
          <p className="label">FIG. A2 / WHAT THE VAULT DOES, STEP BY STEP</p>
          <p className="body mt-2" style={{ fontSize: 15 }}>Your inputs, one stock at 100% weight, the rule from the contract spec. Values are before each trade. Bands and trading costs are left out.</p>
        </div>
        <p className="label px-4 pb-2 md:hidden">Scroll sideways to see all columns</p>
        <div className="tbl-wrap px-4 pb-2 md:px-6">
          <table className="tbl">
            <caption className="sr-only">Worked example of the rebalancing rule for your inputs</caption>
            <thead><tr><th scope="col">Step</th><th scope="col">Event</th><th scope="col" className="r">Stock</th><th scope="col" className="r">USDT</th><th scope="col" className="r">V</th><th scope="col" className="r">Cushion</th><th scope="col" className="r">Target stock</th><th scope="col" className="r">Trade</th></tr></thead>
            <tbody>
              {calc.steps.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.id}</td><td className="min-w-[200px]">{s.event}</td>
                  <td className="r">{usd(s.stock)}</td><td className="r">{usd(s.usdt)}</td><td className="r">{usd(s.v)}</td><td className="r">{usd(s.cushion)}</td><td className="r">{usd(s.target)}</td>
                  <td className={`r ${s.trade > 0.5 ? "pos" : s.trade < -0.5 ? "neg" : ""}`}>{Math.abs(s.trade) < 0.5 ? "none" : `${s.trade > 0 ? "buy" : "sell"} ${usd(Math.abs(s.trade))}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* honest text + call args */}
      <div className="col-span-4 md:col-span-8 lg:col-span-7">
        <h2 className="h3">The trade-off, in plain words</h2>
        <ul className="mt-4 space-y-3">
          {[
            `You give up part of the upside. In our backtest the vault kept about 42% of a three-stock basket's gain in up years (NVDA about 45%, QQQ about 32%). That is the price of the floor.`,
            `The floor holds unless prices gap more than ${calc.gap === Infinity ? 25 : calc.gap.toFixed(0)}% before the vault can rebalance. The biggest one-night or weekend drop since 2018 was NVDA's −19.3%. A future drop could be larger.`,
            `If your value reaches the floor, the vault holds only USDT until the term ends. You keep the floor value and miss any recovery in that term.`,
            `The vault does not trade on weekends and trades only Monday to Friday, 15:30 to 19:30 UTC. Weekend trading cost is not measured yet.`,
            `Choppy stocks cost more. TSLA's median backtest year was −6.8%, where holding returned +22.4%.`,
          ].map((t) => <li key={t} className="xh-li body" style={{ fontSize: 15 }}>{t}</li>)}
        </ul>
        <p className="small mt-4">Backtest on past prices. It does not predict the future.</p>
      </div>
      <div className="col-span-4 md:col-span-8 lg:col-span-5 sunken">
        <p className="label mb-3">Call this screen would build (FloorFactory)</p>
        <pre className="code" tabIndex={0} aria-label="createPosition arguments">{args}</pre>
        <p className="small mt-3">Field names from docs/CONTRACTS.md. The position id is the vault clone&apos;s address. Not sent: prototype.</p>
      </div>
    </div>
  );
}
