import type { Metadata } from "next";
import { AppShell } from "@/components/app/shell";
import { PositionView } from "@/components/app/position-view";
import { loadPath } from "@/lib/data";
import { replay } from "@/lib/replay";

export const metadata: Metadata = { title: "Position" };

export default function PositionPage() {
  const path = loadPath("nvda_worst");
  const { rows, events } = replay(path);
  return (
    <AppShell active="position" title="Your position: value, floor and cushion." lead={<p>The status screen for one vault. It shows how far above the floor you are, what the vault holds, and how to leave.</p>}>
      <PositionView path={path} rows={rows} events={events} />
    </AppShell>
  );
}
