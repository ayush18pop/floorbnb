import type { Metadata } from "next";
import { Builder } from "@/components/app/builder";
import { AppShell } from "@/components/app/shell";

export const metadata: Metadata = { title: "Set your floor" };

export default function AppHome() {
  return (
    <AppShell active="app" title="Choose a floor and see what the vault would do." lead={<p>Pick stocks, a floor and an amount. The preview uses the real rule (stock held = 4 × cushion, never more than your value). Nothing is sent.</p>}>
      <Builder />
    </AppShell>
  );
}
