import type { Metadata } from "next";
import { AppShell } from "@/components/app/shell";
import { KeeperLog } from "@/components/app/keeper-log";

export const metadata: Metadata = { title: "Keeper log" };

export default function KeeperPage() {
  return (
    <AppShell active="keeper" eyebrow="Keeper · public log" title="Every rebalance, in public.">
      <KeeperLog />
    </AppShell>
  );
}
