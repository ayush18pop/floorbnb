import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Xh } from "@/components/ui/xh";

const tabs = [
  ["Set a floor", "/app", "app"],
  ["Position", "/app/position", "position"],
  ["Agents", "/agents", "agents"],
] as const;

export function ProtoBadge({ className = "" }: { className?: string }) {
  return <span className={`badge b-warn ${className}`} role="status">Prototype: not connected to BSC</span>;
}

/** Shell for the prototype screens: header, tabs, the always-visible prototype badge. */
export function AppShell({ active, title, lead, children }: { active: "app" | "position" | "agents"; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-grid bg-bg">
        <div className="mx-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 md:h-14 md:flex-nowrap md:py-0" style={{ width: "min(calc(100% - 2 * var(--gutter-x)), 1104px)" }}>
          <Link href="/" aria-label="Home" className="inline-flex items-center"><Logo height={30} /></Link>
          <nav aria-label="App" className="order-3 flex w-full items-center gap-6 md:order-none md:w-auto">
            {tabs.map(([t, h, k]) => (
              <Link key={k} href={h} className="navlink" aria-current={active === k ? "page" : undefined} style={active === k ? { borderBottom: "2px solid var(--floor-line)", paddingBottom: 6 } : undefined}>
                {t}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ProtoBadge className="hidden lg:inline-flex" />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" className="page">
        <div className="relative border-b border-grid pad pt-8 md:pt-12">
          <Xh style={{ left: 0, top: 0 }} />
          <Xh style={{ left: "100%", top: 0 }} />
          <ProtoBadge className="mb-4 lg:hidden" />
          <p className="label mb-3">Prototype / mock state</p>
          <h1 className="h1">{title}</h1>
          {lead && <div className="body mt-3 max-w-[64ch]">{lead}</div>}
        </div>
        {children}
      </main>
      <div className="page border-b border-grid" style={{ background: "transparent" }}>
        <p className="small pad">Prototype only. No wallet connection, no contract calls, no funds move. Numbers marked mock are for layout. Backtest figures are past data, not a prediction.</p>
      </div>
    </>
  );
}
