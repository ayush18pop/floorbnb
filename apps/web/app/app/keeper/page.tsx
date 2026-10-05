import { AppShell } from "@/components/app/shell";
import { KeeperLog } from "@/components/app/keeper-log";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/app/keeper", "Keeper log");

export default function KeeperPage() {
  return (
    <AppShell active="keeper" eyebrow="Keeper · public log" title="Every rebalance, in public.">
      <KeeperLog />
    </AppShell>
  );
}
