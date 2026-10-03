import type { Metadata } from "next";
import { AppShell } from "@/components/app/shell";
import { EmptyPositions, NotEnoughUsdt, OutsideWindow, PriceCheckFailed, TokenPaused, WrongNetwork } from "@/components/app/states";

export const metadata: Metadata = { title: "States" };

const cells: [string, React.ReactNode][] = [
  ["01 / Wrong network", <WrongNetwork key="a" />],
  ["02 / Not enough USDT", <NotEnoughUsdt key="b" have="812.40" />],
  ["03 / Outside trading window", <OutsideWindow key="c" />],
  ["04 / Price check failed", <PriceCheckFailed key="d" />],
  ["05 / Token paused by issuer", <TokenPaused key="e" />],
  ["06 / Empty: no positions", <EmptyPositions key="f" />],
];

/** Gallery of the error, info and empty states used across the app (E01). */
export default function StatesPage() {
  return (
    <AppShell eyebrow="Components · states" title="Error and empty states" example={false}>
      <div className="grid gap-px bg-grid md:grid-cols-2 lg:grid-cols-3">
        {cells.map(([t, n]) => (
          <section key={t} className="bg-surface p-4 md:p-6"><h2 className="label mb-4">{t}</h2>{n}</section>
        ))}
      </div>
    </AppShell>
  );
}
