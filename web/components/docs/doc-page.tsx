import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { DOCS } from "@/lib/docs-nav";
import { Xh } from "@/components/ui/xh";

export type Toc = [id: string, title: string][];

/** Standard docs page: title, lead, short "on this page" list, content, prev/next. */
export function DocPage({ slug, lead, toc, children }: { slug: string; lead: ReactNode; toc?: Toc; children: ReactNode }) {
  const i = DOCS.findIndex((d) => d.slug === slug);
  const cur = DOCS[i];
  const prev = DOCS[i - 1];
  const next = DOCS[i + 1];
  return (
    <article className="doc min-w-0">
      <header className="relative border-b border-grid pad pt-10 md:pt-14">
        <Xh style={{ left: 0, top: 0 }} />
        <p className="label mb-3">Docs / {cur.title}</p>
        <h1 className="h1" style={{ marginTop: 0, fontSize: "var(--fs-h1)" }}>{slug === "" ? "Floor documentation" : cur.title}</h1>
        <div className="mt-3 max-w-[64ch] text-[18px] leading-[1.55]" style={{ color: "var(--text-2)" }}>{lead}</div>
        {toc && toc.length > 0 && (
          <nav aria-label="On this page" className="mt-6 border border-grid bg-surface p-4">
            <p className="label mb-2">On this page</p>
            <ul className="flex flex-wrap gap-x-6 gap-y-1">
              {toc.map(([id, t]) => <li key={id}><a href={`#${id}`} className="navlink">{t}</a></li>)}
            </ul>
          </nav>
        )}
      </header>
      <div className="pad pb-12 md:pb-16">{children}</div>
      <nav aria-label="Previous and next" className="grid grid-cols-2 border-t border-grid">
        {prev ? (
          <Link href={prev.href} className="group block border-r border-grid p-4 no-underline md:p-6">
            <span className="label flex items-center gap-2"><ArrowLeft size={14} strokeWidth={1.5} /> Previous</span>
            <span className="mt-2 block text-[16px] font-medium group-hover:text-accent">{prev.title}</span>
          </Link>
        ) : <span />}
        {next ? (
          <Link href={next.href} className="group block p-4 text-right no-underline md:p-6">
            <span className="label flex items-center justify-end gap-2">Next <ArrowRight size={14} strokeWidth={1.5} /></span>
            <span className="mt-2 block text-[16px] font-medium group-hover:text-accent">{next.title}</span>
          </Link>
        ) : <span />}
      </nav>
    </article>
  );
}

export function L({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="prose-link">{children}</Link>;
}

export function Callout({ label = "Honest note", children }: { label?: string; children: ReactNode }) {
  return (
    <div className="callout">
      <p className="label warn" style={{ marginTop: 0 }}>{label}</p>
      {children}
    </div>
  );
}
