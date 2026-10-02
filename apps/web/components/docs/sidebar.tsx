"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { DOCS } from "@/lib/docs-nav";

function List({ onPick }: { onPick?: () => void }) {
  const path = usePathname().replace(/\/$/, "") || "/";
  return (
    <ul>
      {DOCS.map((d) => {
        const active = path === d.href;
        return (
          <li key={d.href}>
            <Link
              href={d.href}
              onClick={onPick}
              aria-current={active ? "page" : undefined}
              className="flex items-center gap-3 border-l-2 px-4 py-2 text-[14px] no-underline"
              style={{ borderColor: active ? "var(--floor-line)" : "transparent", color: active ? "var(--text)" : "var(--text-2)", background: active ? "var(--surface-sunken)" : undefined }}
            >
              {d.title}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function DocsSidebar() {
  const [open, setOpen] = useState(false);
  const path = usePathname().replace(/\/$/, "") || "/";
  const current = DOCS.find((d) => d.href === path)?.title ?? "Docs";
  return (
    <>
      {/* phone and tablet: a top menu */}
      <div className="border-b border-grid lg:hidden">
        <button type="button" aria-expanded={open} aria-controls="docs-menu" onClick={() => setOpen(!open)} className="flex h-12 w-full items-center justify-between px-4 md:px-6">
          <span className="label text-ink!">Docs / {current}</span>
          {open ? <X size={16} strokeWidth={1.5} /> : <Menu size={16} strokeWidth={1.5} />}
        </button>
        {open && <nav id="docs-menu" aria-label="Docs" className="border-t border-grid pb-2"><List onPick={() => setOpen(false)} /></nav>}
      </div>
      {/* desktop: left rail */}
      <nav aria-label="Docs" className="hidden border-r border-grid lg:sticky lg:top-14 lg:block lg:self-start lg:py-8">
        <p className="label mb-3 px-4">Documentation</p>
        <List />
      </nav>
    </>
  );
}
