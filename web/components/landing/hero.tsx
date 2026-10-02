import { ValueChart } from "@/components/charts/value-chart";
import { ChartPanel } from "@/components/charts/panel";
import { ButtonLink } from "@/components/ui/button";
import { Xh } from "@/components/ui/xh";
import { BRAND } from "@/lib/brand";
import type { PathPoint } from "@/lib/data";

export function Hero({ data }: { data: PathPoint[] }) {
  return (
    <section id="hero" aria-labelledby="hero-h" className="relative">
      <Xh style={{ left: 0, top: 0 }} />
      <Xh style={{ left: "100%", top: 0 }} />
      <div className="lattice relative lg:grid lg:grid-cols-12 lg:[grid-auto-rows:var(--row)]">
        <div className="flex min-h-[calc(var(--row)*4)] flex-col justify-end p-4 md:min-h-[calc(var(--row)*3)] md:p-6 lg:col-span-6 lg:row-span-4 lg:min-h-0">
          <p className="label mb-4">{BRAND.chain} · Tokenized stocks · Spot only</p>
          <h1 id="hero-h" className="display">{BRAND.headline}</h1>
        </div>

        <div className="border-y border-grid bg-bg p-4 md:p-6 lg:col-span-6 lg:row-span-3 lg:border-r">
          <p className="body-l">
            {BRAND.name} protects your tokenized stocks with a line you choose. If prices fall, the vault moves into stablecoins to stay above it. If prices rise, you keep part of the gain.
          </p>
          <div className="btn-stack mt-6 flex flex-col gap-3 sm:flex-row">
            <ButtonLink variant="primary" href="/app">Set your floor</ButtonLink>
            <ButtonLink variant="secondary" href="#proof">See the proof</ButtonLink>
          </div>
          <p className="small mt-6 max-w-[56ch]">
            Spot trades only on {BRAND.chain}. The floor holds unless prices gap more than {BRAND.gapLimitPct}% before the vault can rebalance.
          </p>
        </div>

        <div className="flex p-4 md:p-6 lg:col-span-6 lg:col-start-7 lg:row-span-7 lg:row-start-1">
          <ChartPanel
            className="flex w-full flex-col"
            fig="FIG. 01 / BACKTEST"
            title="NVDA, 4 Jan 2022 to 4 Jan 2023"
            source="docs/data/vault_path_nvda_worst.csv. Floor 90%, m = 4, full weekend gaps, 0% stablecoin yield."
            note="The worst one-year window since 2018. Hold: −51.0% (−62.7% at the low). With Floor: −10.0%."
          >
            <ValueChart data={data} height={390} animate label="NVDA 2022 backtest: holding the stock versus the Floor vault" />
          </ChartPanel>
        </div>
      </div>
    </section>
  );
}
