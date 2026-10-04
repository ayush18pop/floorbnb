"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { erc20Abi, parseUnits } from "viem";
import { ArrowRight } from "lucide-react";
import { USDT, quoteProtection } from "@floor/sdk";
import { ValueChart } from "@/components/charts/value-chart";
import { Xh } from "@/components/ui/xh";
import { buildChart, termWord, type Mode } from "@/lib/backtest";
import { useNow } from "@/lib/adapters/use";
import { parseBuilderParams, equalWeights } from "@/lib/builder-params";
import { ASSETS, type AssetSymbol, fmt, num } from "@/lib/adapters";
import { BRAND } from "@/lib/brand";
import { Notice, Tile } from "./ui";
import { useConnectModal } from "./wallet";
import { FloorControl, TermControl } from "./floor-term";
import { Tradeoff } from "./tradeoff";
import { DAY, upsideKeptPct } from "@/lib/floor-config";
import { checkCreate } from "@/lib/create-validation";
import { useCreateLimits } from "@/lib/use-create-limits";

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const sgnPct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;

export { parseBuilderParams, equalWeights };

export function Builder() {
  const router = useRouter();
  const sp = useSearchParams();
  const init = useMemo(() => parseBuilderParams(new URLSearchParams(sp.toString())), [sp]);
  const [assets, setAssets] = useState<AssetSymbol[]>(init.assets);
  const [floor, setFloor] = useState<number>(init.floor);
  const [termDays, setTermDays] = useState<number>(init.termDays);
  const [amountStr, setAmountStr] = useState(String(init.amount));
  const [mode, setMode] = useState<Mode>("worst");
  const now = useNow();
  const termSeconds = termDays * DAY;
  const { limits } = useCreateLimits();

  const { address, isConnected } = useAccount();
  const modal = useConnectModal();
  const bal = useReadContract({ address: USDT, abi: erc20Abi, functionName: "balanceOf", args: address ? [address] : undefined, query: { enabled: !!address } });
  const balance = bal.data !== undefined ? num(bal.data) : null;

  const amount = Number(amountStr.replace(/,/g, "")) || 0;
    const err =
    amount <= 0 ? "Enter an amount in USDT." :
    balance !== null && amount > balance ? `You have ${fmt(balance)} USDT. Lower the amount or add USDT.` : null;

  const weights = useMemo(() => equalWeights(assets.length), [assets.length]);
  const q = useMemo(() => {
    if (amount <= 0) return null;
    try { return quoteProtection({ deposit: parseUnits(String(amount), 18), floorBps: floor * 100, termSeconds, weightsBps: weights }); } catch { return null; }
  }, [amount, floor, termSeconds, weights]);
  const check = useMemo(() => (amount > 0 ? checkCreate({ amount: parseUnits(String(amount), 18), floorBps: floor * 100, termSeconds, weightsBps: weights, limits, nowSec: now }) : { ok: false, issues: [] }), [amount, floor, termSeconds, weights, limits, now]);

  const toggle = (s: AssetSymbol) => setAssets((p) => {
    if (p.includes(s)) return p.length === 1 ? p : p.filter((x) => x !== s);
    if (p.length >= 3) return p;
    return ASSETS.map((a) => a.symbol).filter((x) => p.includes(x) || x === s);
  });

  const cost = assets.reduce((acc, s, i) => acc + (ASSETS.find((a) => a.symbol === s)!.roundTripBps * weights[i]) / 10_000, 0);
  const floorValue = q ? num(q.floorValue) : 0;
  const stock = q ? num(q.startingExposure) : 0;
  const stockPct = q ? q.startingExposureBps / 100 : 0;
  const run = useMemo(() => buildChart({ assets, floorPct: floor, termDays, mode }), [assets, floor, termDays, mode]);
  const axis = useMemo(() => {
    if (!run) return { min: 30, max: 110, ticks: [40, 60, 80, 100] };
    const vals = run.points.flatMap((p) => [p.stock, p.vault]);
    const lo = Math.min(...vals, run.floorPct), hi = Math.max(...vals, 100);
    const step = hi - lo > 200 ? 50 : hi - lo > 80 ? 20 : hi - lo > 30 ? 10 : 5;
    const min = Math.floor((lo - 3) / step) * step, max = Math.ceil((hi + 3) / step) * step;
    const ticks: number[] = []; for (let v = min; v <= max; v += step) ticks.push(v);
    return { min, max, ticks };
  }, [run]);

  const go = () => router.push(`/app/review?assets=${assets.join(",")}&floor=${floor}&term=${termDays}&amount=${amount}`);

  return (
    <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* LEFT: form */}
      <form className="border-b border-grid lg:border-b-0 lg:border-r" onSubmit={(e) => { e.preventDefault(); if (!err && check.ok) go(); }} aria-label="Floor settings" noValidate>
        <section className="border-b border-grid p-4 md:p-6" aria-labelledby="l-basket">
          <h2 id="l-basket" className="label mb-3">Basket</h2>
          <div className="basket" role="group" aria-labelledby="l-basket">
            {ASSETS.map((a) => (
              <button key={a.symbol} type="button" aria-pressed={assets.includes(a.symbol)} onClick={() => toggle(a.symbol)}>
                <span className="s">{a.symbol}</span><span className="d">{a.optional ? "optional" : a.name}</span>
              </button>
            ))}
          </div>
          <p className="small mt-3">Equal weight. Pick one to three. bStocks only. You deposit USDT.</p>
        </section>

        <section className="border-b border-grid p-4 md:p-6">
          <label htmlFor="amount" className="label">Deposit</label>
          <div className="input-wrap mt-3">
            <input id="amount" className="input !h-12 pr-16" inputMode="decimal" autoComplete="off" value={amountStr} onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9.,]/g, ""))} aria-invalid={!!err} aria-describedby="amount-msg" style={err ? { borderColor: "var(--negative)" } : undefined} />
            <span className="unit">USDT</span>
          </div>
          <p id="amount-msg" className={`small mt-2 ${err ? "neg" : ""}`}>
            {err ?? (balance !== null ? `Balance: ${fmt(balance)} USDT` : isConnected ? "Reading your USDT balance…" : <>Connect a wallet to see your USDT balance. <button type="button" className="prose-link" onClick={modal.open}>Connect wallet</button></>)}
          </p>
        </section>

        <FloorControl floor={floor} onChange={setFloor} floorValue={floorValue} />

        <TermControl days={termDays} onChange={setTermDays} now={now} />

        <Tradeoff floor={floor} termDays={termDays} />

        <section className="p-4 md:p-6" aria-labelledby="l-split">
          <h2 id="l-split" className="label mb-3">Starting split</h2>
          <div className="stack-bar" role="img" aria-label={`${stockPct.toFixed(0)} percent stocks, ${(100 - stockPct).toFixed(0)} percent USDT`}>
            <div className="stk" style={{ width: `${stockPct}%`, minWidth: stockPct > 0 ? 0 : undefined }}>{stockPct >= 18 && `STOCKS ${stockPct.toFixed(0)}%`}</div>
            <div className="usd">USDT {(100 - stockPct).toFixed(0)}%</div>
          </div>
          <p className="small mt-3">After the first trading window the vault holds about {fmt(stock, 0)} USDT in stocks and {fmt(amount - stock, 0)} USDT in stablecoins. It buys in that window, not at deposit.</p>
          <div id="create-issues" aria-live="polite" className="mt-3 space-y-2">
            {check.issues.map((i) => <Notice key={i.code + i.message} kind="warn">{i.message}</Notice>)}
            {limits.from === "default" && <p className="small">Checked against the default limits (minimum trade {fmt(Number(limits.minTrade / 10n ** 16n) / 100, 0)} USDT). The final check happens on the contract.</p>}
          </div>
          <button type="submit" className="btn btn-primary mt-6 w-full !h-12" disabled={!!err || !check.ok} aria-describedby="create-issues">Review <ArrowRight size={16} strokeWidth={1.5} /></button>
        </section>
      </form>

      {/* RIGHT: backtest */}
      <div className="min-w-0">
        <div className="relative m-4 border border-grid bg-surface md:m-6">
          <Xh style={{ left: 0, top: 0 }} /><Xh style={{ left: "100%", top: 0 }} /><Xh style={{ left: 0, top: "100%" }} /><Xh style={{ left: "100%", top: "100%" }} />
          {run ? (<>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-grid px-4 py-3 md:px-6">
            <h2 className="label !text-ink" data-testid="chart-title">{run.title} · Backtest</h2>
            <div className="seg !w-auto" role="group" aria-label="Which window">
              {(["worst", "median", "best"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className="!h-8 px-3 !text-[12px] capitalize">{m}</button>
              ))}
            </div>
          </div>
          <div className="px-2 py-4 md:px-4">
            <ValueChart data={run.points} height={340} yMin={axis.min} yMax={axis.max} yTicks={axis.ticks} animate label={`${run.title}, ${run.startDate} to ${run.endDate}`} />
          </div>
          <div className="border-t border-grid px-4 py-3 md:px-6">
            <p className="small" data-testid="chart-caption">
              {cap(run.mode)} {termWord(run.termDays)} window of {run.windows} (starting monthly since 2018): {run.startDate} to {run.endDate}, chosen by the lowest holding return. Holding ended {sgnPct(run.holdPct)}, the vault {sgnPct(run.vaultPct)} with a {run.floorPct}% floor (lowest value {sgnPct(run.floorPct - 100)}) and m = {BRAND.multiplier}.
              {run.lockedDays > 0 ? ` The vault sat in USDT (cash lock) for ${run.lockedDays} of ${run.steps} trading days.` : ""}
              {run.missing.length ? ` No price history for ${run.missing.join(", ")}: it is left out of this chart.` : ""}
              {run.symbols.length > 1 ? " Basket: equal weight, rebalanced daily." : ""} Simplified: daily closes, one trade a day, 6 bps per trade, 0% on USDT, token assumed to track its stock; the real vault trades only in its window. {BRAND.backtestCaption}
            </p>
          </div>
          </>) : (
            <div className="p-4 md:p-6"><Notice kind="info" title="No price history">{assets.join(", ")} has no price history here (SPCXB listed in June 2026). Add NVDAB, QQQB or SPYB to see a backtest. Your floor and term still work.</Notice></div>
          )}
        </div>

        <div className="tiles mx-4 border border-grid md:mx-6" style={{ ["--n" as string]: 3 }}>
          <Tile label="Worst case" tone="neg" value={`−${100 - floor}%`} note={`unless prices gap more than about ${BRAND.gapLimitPct}% before the vault can rebalance`} />
          <Tile label="Upside kept" value={`~${upsideKeptPct(floor)}%`} note={`of a rise in an up window: about 4 times your cushion, at a ${floor}% floor. Backtest.`} />
          <Tile label="Cost per rebalance" value={`~${cost.toFixed(1)} bps`} note="per $10k round trip, live quotes Thu 2026-10-02. Weekend cost not measured." />
        </div>
        <p className="label m-4 md:m-6">Trading window: {BRAND.tradingWindow} · no weekend trades</p>
      </div>
    </div>
  );
}
