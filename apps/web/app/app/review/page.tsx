import { Suspense } from "react";
import { AppShell } from "@/components/app/shell";
import { Review } from "@/components/app/review";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/app/review", "Review your floor");

export default function ReviewPage() {
  return (
    <AppShell active="app" eyebrow="New position · review" title="Review your floor">
      <Suspense fallback={<div className="p-6 small">Loading…</div>}><Review /></Suspense>
    </AppShell>
  );
}
