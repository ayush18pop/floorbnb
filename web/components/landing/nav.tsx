"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ButtonLink } from "@/components/ui/button";

const links = [
  ["How it works", "/docs/how-it-works"],
  ["Backtest", "/docs/backtest"],
  ["Agents", "/docs/agents"],
  ["Risks", "/docs/risks"],
  ["Docs", "/docs"],
];

export function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-grid bg-bg">
      <div className="mx-auto flex h-14 items-center justify-between gap-4" style={{ width: "min(calc(100% - 2 * var(--gutter-x)), 1104px)" }}>
        <Link href="/" aria-label="Home" className="inline-flex items-center"><Logo height={24} /></Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
          {links.map(([t, h]) => <Link key={h} href={h} className="navlink">{t}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ButtonLink variant="primary" href="/app" className="hidden sm:inline-flex">Set your floor</ButtonLink>
          <button type="button" className="inline-flex h-10 w-10 items-center justify-center border border-grid-strong bg-surface md:hidden" aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
            {open ? <X size={16} strokeWidth={1.5} /> : <Menu size={16} strokeWidth={1.5} />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-grid bg-bg md:hidden">
          <div className="mx-auto flex flex-col" style={{ width: "min(calc(100% - 2 * var(--gutter-x)), 1104px)" }}>
            {links.map(([t, h]) => <Link key={h} href={h} onClick={() => setOpen(false)} className="navlink border-b border-grid py-3">{t}</Link>)}
            <div className="py-3"><ButtonLink variant="primary" href="/app" className="w-full">Set your floor</ButtonLink></div>
          </div>
        </nav>
      )}
    </header>
  );
}
