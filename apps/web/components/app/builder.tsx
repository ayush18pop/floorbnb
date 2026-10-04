"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { erc20Abi, parseUnits } from "viem";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { USDT, quoteProtection } from "@floor/sdk";
import { ValueChart } from "@/components/charts/value-chart";
import { buildChart, termWord, type Mode } from "@/lib/backtest";
import { useChainNow } from "@/lib/adapters/use-chain";
import { parseBuilderParams, equalWeights } from "@/lib/builder-params";
import { ASSETS, type AssetSymbol, fmt, isoDate, num } from "@/lib/adapters";
import { BRAND } from "@/lib/brand";
import { Notice } from "./ui";
import { useConnectModal } from "./wallet";
import { FloorControl, TermControl } from "./floor-term";
import { TradeoffDetail, MiniMeter } from "./tradeoff";
import { RisksLink } from "./risks";
import { InfoPopover } from "@/components/ui/info-popover";
import { DetailsDrawer } from "@/components/ui/details-drawer";
import { useViewportHeight, useViewportWidth } from "@/components/ui/use-viewport";
import { DAY, upsideKeptPct } from "@/lib/floor-config";
import { checkCreate, minAcceptedDeposit, usdtText } from "@/lib/create-validation";
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
  const now = useChainNow();
  const termSeconds = termDays * DAY;
  const { limits, ready } = useCreateLimits();

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
  const check = useMemo(() => (!ready ? { ok: false, issues: [] } : amount > 0 ? checkCreate({ amount: parseUnits(String(amount), 18), floorBps: floor * 100, termSeconds, weightsBps: weights, limits, nowSec: now }) : { ok: false, issues: [] }), [amount, floor, termSeconds, weights, limits, now, ready]);
  const minDep = useMemo(() => (ready ? minAcceptedDeposit(floor * 100, weights, limits) : null), [ready, floor, weights, limits]);

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

  const vh = useViewportHeight(), vw = useViewportWidth();
  const chartH = vw >= 1200 ? Math.max(190, Math.min(460, vh - 440)) : 260;
  const [tradeOpen, setTradeOpen] = useState(false);
  const go = () => router.push(`/app/review?assets=${assets.join(",")}&floor=${floor}&term=${termDays}&amount=${amount}`);

  const split = (
    <div>
      <p className="label mb-2">Starting split</p>
      <div className="stack-bar" role="img" aria-label={`${stockPct.toFixed(0)} percent stocks, ${(100 - stockPct).toFixed(0)} percent USDT`}>
        <div className="stk" style={{ width: `${stockPct}%`, minWidth: stockPct > 0 ? 0 : undefined }}>{stockPct >= 18 && `STOCKS ${stockPct.toFixed(0)}%`}</div>
        <div className="usd">USDT {(100 - stockPct).toFixed(0)}%</div>
      </div>
      <p className="small mt-3">After the first trading window the vault holds about {fmt(stock, 0)} USDT in stocks and {fmt(amount - stock, 0)} USDT in stablecoins. It buys in that window, not at deposit.</p>
    </div>
  );
  const firstIssue = check.issues[0];

  return (
    <div className="fill grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* LEFT: form */}
      <form className="flex flex-col border-b border-grid lg:border-b-0 lg:border-r" onSubmit={(e) => { e.preventDefault(); if (!err && check.ok) go(); }} aria-label="Floor settings" noValidate>
        <section className="border-b border-grid px-4 py-3 md:px-6" aria-labelledby="l-basket">
          <h2 id="l-basket" className="label mb-2">Basket<InfoPopover label="basket" title="Basket">
            <p>Equal weight. Pick one to three. bStocks only. You deposit USDT.</p>
            <p className="small">Trading window: {BRAND.tradingWindow} · no weekend trades</p>
          </InfoPopover></h2>
          <div className="basket basket-s" role="group" aria-labelledby="l-basket">
            {ASSETS.map((a) => (
              <button key={a.symbol} type="button" aria-pressed={assets.includes(a.symbol)} onClick={() => toggle(a.symbol)}>
                <span className="s">{a.symbol}</span><span className="d">{a.optional ? "optional" : a.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="border-b border-grid px-4 py-3 md:px-6">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="amount" className="label">Deposit</label>
            <p id="amount-msg" className={`small truncate ${err ? "neg" : ""}`}>
              {err ?? (balance !== null ? `Balance: ${fmt(balance)} USDT${minDep ? ` · Min ${usdtText(minDep)}` : ""}` : isConnected ? "Reading your USDT balance…" : <button type="button" className="prose-link" onClick={modal.open}>Connect wallet for balance</button>)}
            </p>
          </div>
          <div className="input-wrap mt-2">
            <input id="amount" className="input !h-11 pr-16" inputMode="decimal" autoComplete="off" value={amountStr} onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9.,]/g, ""))} aria-invalid={!!err} aria-describedby="amount-msg" style={err ? { borderColor: "var(--negative)" } : undefined} />
            <span className="unit">USDT</span>
          </div>
        </section>

        <FloorControl floor={floor} onChange={setFloor} floorValue={floorValue} split={split} />

        <TermControl days={termDays} onChange={setTermDays} now={now} />

        <section className="mt-auto px-4 py-3 md:px-6">
          <div id="create-issues" aria-live="polite" className="min-h-5 text-[13px] leading-5">
            {firstIssue && <p className="warn flex items-start gap-2"><AlertTriangle size={14} strokeWidth={1.5} className="mt-[3px] shrink-0" aria-hidden="true" />{firstIssue.message}</p>}
          </div>
          <button type="submit" className="btn btn-primary mt-2 w-full !h-11" disabled={!!err || !check.ok} aria-describedby="create-issues">Review <ArrowRight size={16} strokeWidth={1.5} /></button>
          <p className="small mt-2 !text-[13px]">Backtest on past prices; not a forecast; floor can break on a gap of about {BRAND.gapLimitPct}%. <RisksLink term={{ end: isoDate(((now ?? 0) + termSeconds)), days: termDays }} />
            {ready && limits.from === "default" && <InfoPopover label="the limits check" title="Limits"><p>Checked against the default limits (minimum trade {fmt(Number(limits.minTrade / 10n ** 16n) / 100, 0)} USDT). The final check happens on the contract.</p></InfoPopover>}
          </p>
        </section>
      </form>

      {/* RIGHT: backtest */}
      <div className="flex min-w-0 flex-col">
        <div className="m-3 mb-0 border border-grid bg-surface md:m-4 md:mb-0">
          {run ? (<>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-grid px-3 py-2 md:px-4">
            <h2 className="label !text-ink" data-testid="chart-title">{run.title} · Backtest</h2>
            <div className="seg !w-auto" role="group" aria-label="Which window">
              {(["worst", "median", "best"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className="!h-8 px-3 !text-[12px] capitalize">{m}</button>
              ))}
            </div>
          </div>
          <div className="px-2 py-2 md:px-3">
            <ValueChart data={run.points} height={chartH} yMin={axis.min} yMax={axis.max} yTicks={axis.ticks} animate label={`${run.title}, ${run.startDate} to ${run.endDate}`} />
          </div>
          <div className="flex items-start justify-between gap-2 border-t border-grid px-3 py-2 md:px-4">
            <p className="small" data-testid="chart-caption">{cap(run.mode)} {termWord(run.termDays)} window, {run.startDate} to {run.endDate}: holding {sgnPct(run.holdPct)}, vault {sgnPct(run.vaultPct)}.</p>
            <InfoPopover label="this chart" title="How this chart is made">
              <p>
                {cap(run.mode)} {termWord(run.termDays)} window of {run.windows} (starting monthly since 2018): {run.startDate} to {run.endDate}, chosen by the lowest holding return. Holding ended {sgnPct(run.holdPct)}, the vault {sgnPct(run.vaultPct)} with a {run.floorPct}% floor (lowest value {sgnPct(run.floorPct - 100)}) and m = {BRAND.multiplier}.
                {run.lockedDays > 0 ? ` The vault sat in USDT (cash lock) for ${run.lockedDays} of ${run.steps} trading days.` : ""}
                {run.missing.length ? ` No price history for ${run.missing.join(", ")}: it is left out of this chart.` : ""}
                {run.symbols.length > 1 ? " Basket: equal weight, rebalanced daily." : ""} Simplified: daily closes, one trade a day, 6 bps per trade, 0% on USDT, token assumed to track its stock; the real vault trades only in its window. {BRAND.backtestCaption}
              </p>
            </InfoPopover>
          </div>
          </>) : (
            <div className="p-3 md:p-4"><Notice kind="info" title="No price history">{assets.join(", ")} has no price history here (SPCXB listed in June 2026). Add NVDAB, QQQB or SPYB to see a backtest. Your floor and term still work.</Notice></div>
          )}
        </div>

        <div className="tiles tiles-3 m-3 mt-3 border border-grid md:m-4" style={{ ["--n" as string]: 3 }}>
          <div className="tile tile-s">
            <p className="stat-label !text-[11px]">Worst case<InfoPopover label="worst case" title="Worst case"><p>Unless prices gap more than about {BRAND.gapLimitPct}% before the vault can rebalance.</p><p className="small">You keep at least ~{floor} USDT of every 100, unless prices gap more than about {BRAND.gapLimitPct}% before the vault can rebalance. {100 - floor} of every 100 is at stake.</p></InfoPopover></p>
            <p className="v neg">−{100 - floor}%</p>
            <MiniMeter pct={floor} kind="floor" label={`Floor at ${floor} of every 100; ${100 - floor} of every 100 moves with the stocks`} />
          </div>
          <div className="tile tile-s">
            <p className="stat-label !text-[11px]">Upside kept<InfoPopover label="upside kept" title="Upside kept"><p>Of a rise in an up window: about 4 times your cushion, at a {floor}% floor. Backtest.</p><p className="small">In a strong up window you capture roughly {upsideKeptPct(floor)}% of the stock&apos;s gain (about 4 × your cushion). You start with {Math.min(100, 4 * (100 - floor))}% in stock.</p></InfoPopover></p>
            <p className="v">~{upsideKeptPct(floor)}%</p>
            <MiniMeter pct={upsideKeptPct(floor)} kind="upside" label={`About ${upsideKeptPct(floor)} percent of a rise kept`} />
          </div>
          <div className="tile tile-s">
            <p className="stat-label !text-[11px]">Cost per rebalance<InfoPopover label="cost per rebalance" title="Cost per rebalance"><p>Per $10k round trip, live quotes Thu 2026-10-02. Weekend cost not measured.</p></InfoPopover></p>
            <p className="v">~{cost.toFixed(1)} bps</p>
          </div>
        </div>
        <div className="mx-3 mb-3 md:mx-4">
          <button type="button" className="dd-link text-[13px]" aria-haspopup="dialog" onClick={() => setTradeOpen(true)}>See the tradeoff</button>
          <DetailsDrawer open={tradeOpen} onClose={() => setTradeOpen(false)} title="What you gain and give up"><TradeoffDetail floor={floor} termDays={termDays} /></DetailsDrawer>
        </div>
      </div>
    </div>
  );
}
