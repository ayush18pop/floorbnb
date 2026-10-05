import Link from "next/link";
import { AppShell } from "@/components/app/shell";
import { Positions } from "@/components/app/positions";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/app/positions", "Your floors");

export default function PositionsPage() {
  return (
    <AppShell active="positions" eyebrow="Positions" title="Your floors" action={<Link href="/app" className="btn btn-primary">Set a new floor</Link>}>
      <Positions />
    </AppShell>
  );
}
