import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app/shell";
import { PositionScreen } from "@/components/app/position-view";

export const metadata: Metadata = { title: "Position" };

export default function PositionPage() {
  return (
    <AppShell active="positions" eyebrow="Position" title="Your position">
      <Suspense fallback={<div className="p-6 small">Loading…</div>}><PositionScreen /></Suspense>
    </AppShell>
  );
}
