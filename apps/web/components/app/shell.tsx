"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Xh } from "@/components/ui/xh";
import { BRAND } from "@/lib/brand";
import { ConnectButton, NetworkGuard } from "./wallet";
import { ExampleBadge, isExample } from "./ui";
import "./app.css";

export type NavKey = "app" | "positions" | "keeper" | "agents";
const tabs: [string, string, NavKey][] = [
  ["Set floor", "/app", "app"],
  ["Positions", "/app/positions", "positions"],
  ["Keeper log", "/app/keeper", "keeper"],
  ["Agents", "/agents", "agents"],
];

/** Header, tab nav, wallet button and a page frame with hairline rails. Used by every app screen. */
export function AppShell({ active, eyebrow, title, action, children, example }: { active?: NavKey; eyebrow?: string; title: string; action?: ReactNode; children: ReactNode; example?: boolean }) {
  const ex = example ?? isExample();
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-grid bg-bg">
        <div className="mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 md:h-14 md:flex-nowrap md:py-0" style={{ width: "min(calc(100% - 2 * var(--gutter-x)), 1104px)" }}>
          <Link href="/" aria-label={`${BRAND.name} home`} className="inline-flex items-center"><Logo height={30} /></Link>
          <nav aria-label="App" className="nav-scroll order-3 flex w-full items-center gap-6 md:order-none md:w-auto">
            {tabs.map(([t, h, k]) => (
              <Link key={k} href={h} className="navlink whitespace-nowrap" aria-current={active === k ? "page" : undefined} style={active === k ? { borderBottom: "2px solid var(--floor-line)", paddingBottom: 6 } : undefined}>{t}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="badge b-warn hidden sm:inline-flex">{BRAND.chain}</span>
            <ConnectButton />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" className="app-frame">
        <div className="app-title">
          <Xh style={{ left: 0, top: 0 }} /><Xh style={{ left: "100%", top: 0 }} />
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="label mb-3">{eyebrow}{ex && <> · <span className="warn">Example data</span></>}</p>
              <h1 className="h1">{title}</h1>
            </div>
            {action}
          </div>
        </div>
        <div className="px-4 pt-4 empty:hidden md:px-6"><NetworkGuard /></div>
        {children}
        {ex && (
          <div className="border-t border-grid p-4 md:p-6">
            <p className="small"><ExampleBadge className="mr-2" />Positions, prices, hashes and activity on this screen are invented to show the layout. No contract is called and no funds move. {BRAND.contractsStatus}.</p>
          </div>
        )}
      </main>
      <div className="app-frame !min-h-0 border-b border-grid"><p className="small p-4 md:p-6">{BRAND.disclosure}</p></div>
    </>
  );
}
