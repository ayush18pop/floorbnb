import Link from "next/link";
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
      <div className="lattice relative grid grid-cols-1 lg:grid-cols-12">
        <div className="flex flex-col justify-end p-4 pt-12 md:p-6 md:pt-16 lg:col-span-5 lg:pb-10">
          <p className="label mb-4">{BRAND.chain} · Tokenized stocks · Spot only</p>
          <h1 id="hero-h" className="display" style={{ fontSize: "clamp(2.5rem, 1.5rem + 3vw, 4rem)" }}>{BRAND.headline}</h1>
          <p className="body-l mt-5 bg-bg">Floor keeps your tokenized stocks above a line you pick.</p>
          <div className="btn-stack mt-6 flex flex-col gap-3 sm:flex-row">
            <ButtonLink variant="primary" href="/app">Set your floor</ButtonLink>
            <ButtonLink variant="secondary" href="/docs/how-it-works">How it works</ButtonLink>
          </div>
          <p className="small mt-6 max-w-[40ch] bg-bg">
            Built on CPPI, the floor method Fischer Black published in 1987.{" "}
            <Link href="/docs/how-it-works#origin" className="prose-link">Read how</Link>
          </p>
        </div>
        <div className="p-4 md:p-6 lg:col-span-7">
          <ChartPanel
            className="flex w-full flex-col"
            fig="FIG. 01 / BACKTEST"
            title="NVDA, 4 Jan 2022 to 4 Jan 2023"
            source="docs/data/vault_path_nvda_worst.csv. Floor 90%, m = 4, full weekend gaps, 0% stablecoin yield."
            note="The worst one-year window since 2018. Hold: −51.0%. With Floor: −10.0%."
          >
            <ValueChart data={data} height={420} animate label="NVDA 2022 backtest: holding the stock versus the Floor vault" />
          </ChartPanel>
        </div>
      </div>
    </section>
  );
}
