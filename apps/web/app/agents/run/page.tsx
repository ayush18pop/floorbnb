import type { Metadata } from "next";
import { AppShell } from "@/components/app/shell";
import { AgentRun } from "@/components/app/agent-run";

export const metadata: Metadata = { title: "Agent run" };

export default function AgentRunPage() {
  return (
    <AppShell active="agents" eyebrow="Agent run · example" title="An agent sets a floor for its user" action={<span className="badge b-warn">Building</span>} example={false}>
      <AgentRun />
    </AppShell>
  );
}
