import type { Metadata } from "next";
import { Nav } from "@/components/landing/nav";
import { Simulator } from "@/components/try/simulator";

export const metadata: Metadata = {
  title: "Try Floor, no wallet",
  description: "Pick a stock, a floor and a term, or replay a crash. A read-only backtest on past prices. No wallet needed.",
};

// Public and read-only: this route must stay reachable when the app is locked (see ops/progress/FIRST60.md).
export default function TryPage() {
  return (
    <>
      <Nav />
      <main id="main"><Simulator /></main>
    </>
  );
}
