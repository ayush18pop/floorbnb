"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { erc20Abi, parseUnits } from "viem";
import { ArrowRight } from "lucide-react";
import { LAUNCH_TERM_SECONDS, USDT, quoteProtection } from "@floor/sdk";
import { ValueChart } from "@/components/charts/value-chart";
import { Xh } from "@/components/ui/xh";
import type { PathPoint } from "@/lib/data";
import { useNow } from "@/lib/adapters/use";
import { ASSETS, type AssetSymbol, fmt, isoDate, num } from "@/lib/adapters";
import { BRAND } from "@/lib/brand";
import { Notice, Tile } from "./ui";
import { useConnectModal } from "./wallet";

export type BuilderPaths = { nvda: PathPoint[]; basket: PathPoint[] };
const FLOORS = [80, 85, 90, 95] as const;
/** CONTRACTS.md / EXECUTION_PLAN Appendix A: default minTrade 20 USDT. */
const MIN_TRADE = 20;

export function parseBuilderParams(sp: URLSearchParams) {
  const raw = (sp.get("assets") ?? "NVDAB").split(",").filter((s): s is AssetSymbol => ASSETS.some((a) => a.symbol === s));
  const assets = raw.length ? [...new Set(raw)].slice(0, 3) : (["NVDAB"] as AssetSymbol[]);
  const floor = Number(sp.get("floor")) || 90;
  const amount = Number(sp.get("amount")) || 500;
  return { assets, floor: FLOORS.includes(floor as 80) ? floor : 90, amount };
}

export function equalWeights(n: number) {
  const base = Math.floor(10_000 / n);
  return Array.from({ length: n }, (_, i) => (i === 0 ? 10_000 - base * (n - 1) : base));
}

export function Builder({ paths }: { paths: BuilderPaths }) {
  const router = useRouter();
  const sp = useSearchParams();
  const init = useMemo(() => parseBuilderParams(new URLSearchParams(sp.toString())), [sp]);
  const [assets, setAssets] = useState<AssetSymbol[]>(init.assets);
  const [floor, setFloor] = useState<number>(init.floor);
  const [amountStr, setAmountStr] = useState(String(init.amount));
  const [chartKey, setChartKey] = useState<"nvda" | "basket">("nvda");
  const now = useNow();
  const termEnd = now ? isoDate(now + LAUNCH_TERM_SECONDS) : null;

  const { address, isConnected } = useAccount();
  const modal = useConnectModal();
  const bal = useReadContract({ address: USDT, abi: erc20Abi, functionName: "balanceOf", args: address ? [address] : undefined, query: { enabled: !!address } });
  const balance = bal.data !== undefined ? num(bal.data) : null;

  const amount = Number(amountStr.replace(/,/g, "")) || 0;
  const cap = BRAND.launchCapPerPosition;
  const err =
    amount <= 0 ? "Enter an amount in USDT." :
    amount > cap ? `Launch limit: ${fmt(cap, 0)} USDT per position.` :
    balance !== null && amount > balance ? `You have ${fmt(balance)} USDT. Lower the amount or add USDT.` : null;

  const weights = useMemo(() => equalWeights(assets.length), [assets.length]);
  const q = useMemo(() => {
    if (amount <= 0) return null;
    try { return quoteProtection({ deposit: parseUnits(String(amount), 18), floorBps: floor * 100, termSeconds: LAUNCH_TERM_SECONDS, weightsBps: weights }); } catch { return null; }
  }, [amount, floor, weights]);

  const toggle = (s: AssetSymbol) => setAssets((p) => {
    if (p.includes(s)) return p.length === 1 ? p : p.filter((x) => x !== s);
    if (p.length >= 3) return p;
    return ASSETS.map((a) => a.symbol).filter((x) => p.includes(x) || x === s);
  });

  const cost = assets.reduce((acc, s, i) => acc + (ASSETS.find((a) => a.symbol === s)!.roundTripBps * weights[i]) / 10_000, 0);
  const floorValue = q ? num(q.floorValue) : 0;
  const stock = q ? num(q.startingExposure) : 0;
  const stockPct = q ? q.startingExposureBps / 100 : 0;
  const smallTrade = q ? q.assetTargets.some((t) => num(t) < MIN_TRADE) : false;
  const data = paths[chartKey];
  const last = data[data.length - 1];

  const go = () => router.push(`/app/review?assets=${assets.join(",")}&floor=${floor}&amount=${amount}`);

  return (
    <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* LEFT: form */}
      <form className="border-b border-grid lg:border-b-0 lg:border-r" onSubmit={(e) => { e.preventDefault(); if (!err) go(); }} aria-label="Floor settings" noValidate>
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

        <section className="border-b border-grid p-4 md:p-6" aria-labelledby="l-floor">
          <h2 id="l-floor" className="label mb-3">Floor</h2>
          <div className="seg" role="group" aria-labelledby="l-floor">
            {FLOORS.map((f) => <button key={f} type="button" aria-pressed={floor === f} onClick={() => setFloor(f)}>{f}%</button>)}
          </div>
          <p className="label mt-3">Lowest value: <span className="mono text-ink">{fmt(floorValue)} USDT</span></p>
        </section>

        <section className="border-b border-grid p-4 md:p-6">
          <h2 className="label mb-3">Term</h2>
          <p className="input flex items-center !h-12 !text-[14px] tracking-wide uppercase">1 year · ends {termEnd ?? "…"}</p>
          <p className="small mt-2">One year at launch. Leaving early removes the floor. Exit in kind is always allowed.</p>
        </section>

        <section className="p-4 md:p-6" aria-labelledby="l-split">
          <h2 id="l-split" className="label mb-3">Starting split</h2>
          <div className="stack-bar" role="img" aria-label={`${stockPct.toFixed(0)} percent stocks, ${(100 - stockPct).toFixed(0)} percent USDT`}>
            <div className="stk" style={{ width: `${stockPct}%`, minWidth: stockPct > 0 ? 0 : undefined }}>{stockPct >= 18 && `STOCKS ${stockPct.toFixed(0)}%`}</div>
            <div className="usd">USDT {(100 - stockPct).toFixed(0)}%</div>
          </div>
          <p className="small mt-3">After the first trading window the vault holds about {fmt(stock, 0)} USDT in stocks and {fmt(amount - stock, 0)} USDT in stablecoins. It buys in that window, not at deposit.</p>
          {smallTrade && <div className="mt-3"><Notice kind="warn">One of the starting buys is under the {MIN_TRADE} USDT default minimum trade. Raise the amount or pick fewer stocks.</Notice></div>}
          <button type="submit" className="btn btn-primary mt-6 w-full !h-12" disabled={!!err}>Review <ArrowRight size={16} strokeWidth={1.5} /></button>
        </section>
      </form>

      {/* RIGHT: backtest */}
      <div className="min-w-0">
        <div className="relative m-4 border border-grid bg-surface md:m-6">
          <Xh style={{ left: 0, top: 0 }} /><Xh style={{ left: "100%", top: 0 }} /><Xh style={{ left: 0, top: "100%" }} /><Xh style={{ left: "100%", top: "100%" }} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-grid px-4 py-3 md:px-6">
            <h2 className="label !text-ink">What a 90% floor did · {chartKey === "nvda" ? "NVDA" : "NVDA + TSLA + QQQ"} {data[0].date.slice(0, 4)} · Backtest</h2>
            <div className="seg !w-auto" role="group" aria-label="Backtest window">
              <button type="button" aria-pressed={chartKey === "nvda"} onClick={() => setChartKey("nvda")} className="!h-8 px-3 !text-[12px]">NVDA</button>
              <button type="button" aria-pressed={chartKey === "basket"} onClick={() => setChartKey("basket")} className="!h-8 px-3 !text-[12px]">Basket</button>
            </div>
          </div>
          <div className="px-2 py-4 md:px-4">
            <ValueChart data={data} height={340} yMin={30} yMax={110} yTicks={[40, 60, 80, 100]} animate label={`${chartKey === "nvda" ? "NVDA" : "NVDA, TSLA and QQQ basket"} worst one-year window, ${data[0].date} to ${last.date}`} />
          </div>
          <div className="border-t border-grid px-4 py-3 md:px-6">
            <p className="small">Worst one-year window since 2018: {data[0].date} to {last.date}. Holding ended {(last.stock - 100).toFixed(1).replace("-", "−")}%, the vault {(last.vault - 100).toFixed(1).replace("-", "−")}%. The chart is drawn at a 90% floor and m = {BRAND.multiplier}, whatever floor you pick. {BRAND.backtestCaption} Source: docs/data/vault_path_{chartKey === "nvda" ? "nvda" : "basket"}_worst.csv.</p>
          </div>
        </div>

        <div className="tiles mx-4 border border-grid md:mx-6" style={{ ["--n" as string]: 3 }}>
          <Tile label="Worst case" tone="neg" value={`−${100 - floor}%`} note={`unless prices gap more than about ${BRAND.gapLimitPct}% before the vault can rebalance`} />
          <Tile label="Upside kept" value="~42%" note="of a basket's gain in a median up year (NVDA ~45%, QQQ ~32%). Backtest." />
          <Tile label="Cost per rebalance" value={`~${cost.toFixed(1)} bps`} note="per $10k round trip, live quotes Thu 2026-10-02. Weekend cost not measured." />
        </div>
        <p className="label m-4 md:m-6">Trading window: {BRAND.tradingWindow} · no weekend trades</p>
      </div>
    </div>
  );
}
