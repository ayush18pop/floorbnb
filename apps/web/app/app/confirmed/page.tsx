import { Suspense } from "react";
import { AppShell } from "@/components/app/shell";
import { Confirmed } from "@/components/app/confirmed";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/app/confirmed", "Floor set");

export default function ConfirmedPage() {
  return (
    <AppShell active="app" eyebrow="New position · confirmed" title="Position created">
      <Suspense fallback={<div className="p-6 small">Loading…</div>}><Confirmed /></Suspense>
    </AppShell>
  );
}
