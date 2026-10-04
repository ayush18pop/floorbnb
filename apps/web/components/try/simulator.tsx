"use client";

import { useMemo, useState } from "react";
import { ValueChart } from "@/components/charts/value-chart";
import { ButtonLink } from "@/components/ui/button";
import { DetailsDrawer } from "@/components/ui/details-drawer";
import { InfoPopover } from "@/components/ui/info-popover";
import { useViewportHeight, useViewportWidth } from "@/components/ui/use-viewport";
import { RisksBody } from "@/components/app/risks";
import { BRAND } from "@/lib/brand";
import { FLOOR_CONFIG, TERM_CONFIG } from "@/lib/floor-config";
import { EPISODES, TRY_ASSETS, runEpisode, runWorst } from "@/lib/try";
import "@/components/app/app.css";

const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;
const span = FLOOR_CONFIG.max - FLOOR_CONFIG.min;
const at = (v: number) => `${((v - FLOOR_CONFIG.min) / span) * 100}%`;
const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function Simulator() {
  const [asset, setAsset] = useState("nvda");
  const [floor, setFloor] = useState<number>(FLOOR_CONFIG.default);
  const [days, setDays] = useState<number>(TERM_CONFIG.defaultDays);
  const [episode, setEpisode] = useState<string | null>(null);
  const vh = useViewportHeight(800);
  const vw = useViewportWidth(1280);

  const symbols = TRY_ASSETS.find((a) => a.id === asset)!.symbols;
  const ep = EPISODES.find((e) => e.id === episode) ?? null;
  const run = useMemo(() => (ep ? runEpisode(symbols, floor, ep) : runWorst(symbols, floor, days)), [symbols, floor, days, ep]);

  const chartH = vw < 1024 ? 240 : Math.max(200, Math.min(430, vh - 57 - 400));
  const yMin = run ? Math.max(0, Math.floor((Math.min(...run.points.map((p) => Math.min(p.stock, p.vault))) - 8) / 10) * 10) : 30;
  const ticks = [yMin + 10, ...[40, 60, 80, 100].filter((t) => t > yMin + 10)].filter((t, i, a) => a.indexOf(t) === i);
  const cap = ep ? `${ep.label}, ${ep.blurb}` : `Worst ${TERM_CONFIG.presets.find((p) => p.days === days)?.label} window since 2018`;
  const lossAim = 100 - floor;

  return (
    <div className="mx-auto grid grid-cols-1 lg:h-[calc(100dvh-57px)] lg:grid-cols-[360px_1fr]" style={{ width: "min(calc(100% - 2 * var(--gutter-x)), 1104px)" }}>
      <section aria-label="Choices" className="flex flex-col gap-4 border-grid py-4 lg:border-r lg:py-5 lg:pr-6">
        <div>
          <h1 className="h3">Try Floor. No wallet.</h1>
          <p className="small mt-1">Pick a stock and a floor. See what holding did, and what the vault did.</p>
        </div>

        <fieldset className="m-0 border-0 p-0">
          <legend className="label mb-2">Stock</legend>
          <div className="seg seg-s" role="group" aria-label="Stock or basket">
            {TRY_ASSETS.map((a) => <button key={a.id} type="button" aria-pressed={asset === a.id} onClick={() => setAsset(a.id)}>{a.label}</button>)}
          </div>
        </fieldset>

        <div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="try-floor" className="label">Floor<InfoPopover label="floor" title="Floor">
              <p>The line the vault tries to keep your value above. Higher means less loss in a fall and less of the rise kept. The slider covers 80% to 95%, the range we have tested.</p>
            </InfoPopover></label>
            <span className="mono text-ink" style={{ fontSize: 22, lineHeight: 1 }} aria-hidden="true">{floor}%</span>
          </div>
          <div className="fs mt-1">
            <div className="fs-track" aria-hidden="true"><span className="fs-line" style={{ left: at(floor) }} /></div>
            <input id="try-floor" type="range" className="fs-input" min={FLOOR_CONFIG.min} max={FLOOR_CONFIG.max} step={FLOOR_CONFIG.step} value={floor}
              onChange={(e) => setFloor(Number(e.target.value))} aria-valuetext={`${floor} percent floor`} />
            <div className="fs-scale mono" aria-hidden="true">{FLOOR_CONFIG.presets.map((v) => <span key={v} style={{ left: at(v) }}>{v}</span>)}</div>
          </div>
        </div>

        <fieldset className="m-0 border-0 p-0">
          <legend className="label mb-2">Term<InfoPopover label="term" title="Term">
            <p>How long the floor lasts. We replay the worst stretch of that length since 2018. Pick a crash below to replay an exact window instead.</p>
          </InfoPopover></legend>
          <div className="seg seg-s" role="group" aria-label="Term">
            {TERM_CONFIG.presets.map((p) => (
              <button key={p.id} type="button" aria-pressed={!ep && days === p.days} onClick={() => { setEpisode(null); setDays(p.days); }}>{p.label}</button>
            ))}
          </div>
        </fieldset>

        <fieldset className="m-0 border-0 p-0">
          <legend className="label mb-2">Replay a crash</legend>
          <div className="flex flex-wrap gap-2">
            {EPISODES.map((e) => (
              <button key={e.id} type="button" className="chip" aria-pressed={episode === e.id} onClick={() => setEpisode(episode === e.id ? null : e.id)}>{e.label}</button>
            ))}
          </div>
        </fieldset>
      </section>

      <section aria-label="Result" className="flex min-h-0 flex-col gap-3 py-4 lg:py-5 lg:pl-6">
        {run ? (
          <>
            <div role="status" aria-live="polite" data-testid="headline">
              <p className="label">{cap}<span className="mono"> · {fmtDate(run.startDate)} to {fmtDate(run.endDate)}</span></p>
              <div className="mt-1 grid grid-cols-2 gap-4">
                <p><span className="label block">Holding the stock</span><span data-testid="hold" className={`mono block ${run.holdPct < 0 ? "neg" : "pos"}`} style={{ fontSize: "clamp(2rem, 1.2rem + 2.6vw, 3.25rem)", lineHeight: 1.05 }}>{pct(run.holdPct)}</span></p>
                <p><span className="label block">With the Floor vault</span><span data-testid="vault" className={`mono block ${run.vaultPct < 0 ? "neg" : "pos"}`} style={{ fontSize: "clamp(2rem, 1.2rem + 2.6vw, 3.25rem)", lineHeight: 1.05 }}>{pct(run.vaultPct)}</span></p>
              </div>
              <p className="small mt-1">A {floor}% floor aims to keep a loss near −{lossAim}%, unless prices gap past it.</p>
            </div>
            <figure className="m-0 shrink-0 border border-grid bg-surface p-2">
              <ValueChart data={run.points} height={chartH} yMin={yMin} yMax={110} yTicks={ticks} lockBand label={`${cap}: holding versus the Floor vault and the ${floor}% floor line`} />
              <figcaption className="small mono px-1 pt-1">Hold vs vault vs {floor}% floor · 100 = start · backtest on past prices</figcaption>
            </figure>
          </>
        ) : <p role="alert" className="small">No price history for this choice.</p>}

        <aside aria-label="Risk" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border border-grid bg-surface-sunken px-3 py-2" style={{ borderLeft: "3px solid var(--warning)" }}>
          <p className="small max-w-[62ch] !text-ink">
            <strong>Not a guarantee.</strong> A floor can break if prices gap more than about {BRAND.gapLimitPct}% before the vault can rebalance. Backtest on past prices.
          </p>
          <DetailsDrawer trigger="Read the full risks" triggerClassName="dd-link" title="Risks and disclosure"><RisksBody /></DetailsDrawer>
        </aside>

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <ButtonLink variant="primary" href="/app">Open the app</ButtonLink>
          <ButtonLink variant="ghost" href="/docs/how-it-works">How it works</ButtonLink>
        </div>
      </section>
    </div>
  );
}
