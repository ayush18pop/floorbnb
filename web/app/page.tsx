import { Footer, Agents, Cta, Faq, Limits, SpotOnly } from "@/components/landing/sections-b";
import { HowItWorks, Problem, TradeOff } from "@/components/landing/sections-a";
import { Hero } from "@/components/landing/hero";
import { Nav } from "@/components/landing/nav";
import { Proof, type BadYear, type BreachRow, type Upside } from "@/components/landing/proof";
import { gapRow, loadGap, loadPath, pathSummary } from "@/lib/data";

export default function Home() {
  const worst = loadPath("nvda_worst");
  const best = loadPath("nvda_best");
  const w = pathSummary(worst);
  const b = pathSummary(best);
  const gap = loadGap();

  const bad: BadYear[] = [
    ["NVDA", "NVDA"],
    ["NVDA+TSLA+QQQ", "NVDA + TSLA + QQQ BASKET"],
    ["QQQ", "QQQ"],
    ["TSLA", "TSLA"],
  ].map(([k, name]) => {
    const r = gapRow(gap, k, 4);
    return { name, sub: `${r.nBad} OF ${r.windows} WINDOWS`, hold: r.badYrHold, vault: r.badYrVault };
  });

  const upside: Upside[] = [
    { name: "NVDA", key: "NVDA" },
    { name: "NVDA + TSLA + QQQ BASKET", key: "NVDA+TSLA+QQQ" },
    { name: "QQQ", key: "QQQ" },
    { name: "TSLA (WHIPSAW)", key: "TSLA" },
  ].map(({ name, key }) => ({ name, value: Math.round(gapRow(gap, key, 4).captureUp) }));

  const ms = [2, 3, 4, 5, 6, 8];
  const breach: BreachRow[] = ["NVDA", "TSLA", "QQQ", "SPY", "AAPL", "NVDA+TSLA+QQQ", "NVDA+AAPL+QQQ"].map((k) => ({
    name: k.replaceAll("+", " + "),
    cells: ms.map((m) => {
      const r = gapRow(gap, k, m);
      return { m, windows: r.windows, held: r.windows - Math.round((r.windows * r.breachPct) / 100) };
    }),
  }));

  return (
    <>
      <Nav />
      <main id="main" className="page">
        <Hero data={worst} />
        <Problem hold={Math.abs(w.holdingPct)} vault={Math.abs(w.vaultPct)} />
        <HowItWorks data={worst} />
        <TradeOff bestNvda={{ hold: b.holdingPct, vault: b.vaultPct }} />
        <Proof bad={bad} upside={upside} breach={breach} ms={ms} />
        <SpotOnly />
        <Agents />
        <Limits />
        <Faq />
        <Cta />
        <Footer />
      </main>
    </>
  );
}
