import type { ReactNode } from "react";
import { Xh } from "@/components/ui/xh";
import { BRAND } from "@/lib/brand";

/**
 * Chart panel: square, 1px border, crosshairs on the four corners (BRAND.md section 6),
 * mono figure label on top, backtest caption and source underneath.
 */
export function ChartPanel({
  fig,
  title,
  children,
  source,
  caption = "Backtest, past data, not a prediction.",
  note,
  className = "",
  corners = true,
}: {
  fig: string;
  title: string;
  children: ReactNode;
  source?: string;
  caption?: string | null;
  note?: ReactNode;
  className?: string;
  corners?: boolean;
}) {
  return (
    <figure className={`relative m-0 border border-grid bg-surface ${className}`}>
      {corners && (
        <>
          <Xh style={{ left: 0, top: 0 }} />
          <Xh style={{ left: "100%", top: 0 }} />
          <Xh style={{ left: 0, top: "100%" }} />
          <Xh style={{ left: "100%", top: "100%" }} />
        </>
      )}
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-grid px-4 py-3 md:px-6">
        <span className="label">{fig}</span>
        <span className="label text-ink!">{title}</span>
      </figcaption>
      <div className="px-4 py-4 md:px-6 md:py-5">{children}</div>
      {(caption || source || note) && (
        <div className="border-t border-grid px-4 py-3 md:px-6">
          {note && <p className="small mb-1">{note}</p>}
          {caption && <p className="label text-ink-2!" style={{ textTransform: "none", letterSpacing: "0.02em" }}>{caption}</p>}
          {source && <p className="label mt-1 [overflow-wrap:anywhere]" style={{ textTransform: "none", letterSpacing: "0.02em" }}>Source: {source}</p>}
        </div>
      )}
    </figure>
  );
}

export { BRAND };
