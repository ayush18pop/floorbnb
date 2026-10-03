import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app/shell";
import { Builder } from "@/components/app/builder";
import { loadPath } from "@/lib/data";

export const metadata: Metadata = { title: "Set your floor" };

export default function SetFloorPage() {
  const paths = { nvda: loadPath("nvda_worst"), basket: loadPath("basket_worst") };
  return (
    <AppShell active="app" eyebrow="New position" title="Set your floor" example={false}>
      <Suspense fallback={<div className="p-6 small">Loading…</div>}>
        <Builder paths={paths} />
      </Suspense>
    </AppShell>
  );
}
