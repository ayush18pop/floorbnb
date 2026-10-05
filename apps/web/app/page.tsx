import { Hero } from "@/components/landing/hero";
import { Nav } from "@/components/landing/nav";
import { Footer } from "@/components/landing/footer";
import { LiveContracts } from "@/components/landing/live-contracts";
import { Agents, Cta, Moment, NotAGuarantee, ProofTiles, SpotOnly, Steps } from "@/components/landing/sections";
import { loadPath, pathSummary } from "@/lib/data";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/");

export default function Home() {
  const worst = loadPath("nvda_worst");
  const w = pathSummary(worst);
  return (
    <>
      <Nav />
      <main id="main" className="page">
        <Hero data={worst} />
        <Moment hold={Math.abs(w.holdingPct)} vault={Math.abs(w.vaultPct)} />
        <Steps />
        <ProofTiles />
        <SpotOnly />
        <Agents />
        <LiveContracts />
        <NotAGuarantee />
        <Cta />
        <Footer />
      </main>
    </>
  );
}
