import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Nav } from "@/components/landing/nav";
import { Footer } from "@/components/landing/footer";
import { DocsSidebar } from "@/components/docs/sidebar";

export const metadata: Metadata = { title: { default: "Docs", template: "%s | Floor docs" } };

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <main id="main" className="page">
        <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
          <DocsSidebar />
          {children}
        </div>
        <Footer />
      </main>
    </>
  );
}
