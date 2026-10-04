import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app/shell";
import { Builder } from "@/components/app/builder";

export const metadata: Metadata = { title: "Set your floor" };

export default function SetFloorPage() {
  return (
    <AppShell active="app" eyebrow="New position" title="Set your floor" example={false} foot={false}>
      <Suspense fallback={<div className="p-6 small">Loading…</div>}>
        <Builder />
      </Suspense>
    </AppShell>
  );
}
