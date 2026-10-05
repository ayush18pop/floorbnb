import { AppShell } from "@/components/app/shell";
import { AgentRun } from "@/components/app/agent-run";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/agents/run", "Agent run");

export default function AgentRunPage() {
  return (
    <AppShell active="agents" eyebrow="Agent run · example" title="An agent sets a floor for its user" action={<span className="badge b-pos">Live server</span>} example={false}>
      <AgentRun />
    </AppShell>
  );
}
