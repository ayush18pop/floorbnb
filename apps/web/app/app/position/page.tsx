import { Suspense } from "react";
import { AppShell } from "@/components/app/shell";
import { PositionScreen } from "@/components/app/position-view";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/app/position", "Position");

export default function PositionPage() {
  return (
    <AppShell active="positions" eyebrow="Position" title="Your position">
      <Suspense fallback={<div className="p-6 small">Loading…</div>}><PositionScreen /></Suspense>
    </AppShell>
  );
}
