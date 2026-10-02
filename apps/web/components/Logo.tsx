import { BRAND } from "@/lib/brand";
import { LOCKUP, MARK, MARK_VIEWBOX, WORDMARK } from "@/lib/logo";

/** The mark's paths, coloured from theme tokens (value line = currentColor). */
function MarkPaths() {
  return (
    <>
      <path d={MARK.cushion} fill="var(--accent-soft)" />
      <path d={MARK.value} fill="none" stroke="currentColor" strokeWidth={MARK.strokeWidth} />
      <path d={MARK.floor} fill="var(--floor-line)" />
      <path d={MARK.tick} fill="var(--floor-line)" />
    </>
  );
}

/**
 * Lockup from design/logo (inline so the floor line can take --floor-line).
 * The wordmark paths spell "Floor". If BRAND.name changes, fall back to text until it is redrawn.
 */
export function Logo({ height = 24, mark = false }: { height?: number; mark?: boolean }) {
  const markOnly = mark || BRAND.name !== "Floor";
  if (markOnly) {
    const markHeight = (height * 21) / 36;
    return (
      <span className="inline-flex items-center gap-2" aria-label={BRAND.name}>
        <svg viewBox={MARK_VIEWBOX} height={markHeight} width={(markHeight * 48) / 21} aria-hidden="true">
          <MarkPaths />
        </svg>
        {!mark && <span style={{ fontWeight: 700, letterSpacing: "-0.02em", fontSize: height * 0.8 }}>{BRAND.name}</span>}
      </span>
    );
  }
  return (
    <svg viewBox={LOCKUP.viewBox} height={height} width={(height * LOCKUP.width) / LOCKUP.height} role="img" aria-label={BRAND.name}>
      <g transform={`scale(${LOCKUP.markScale})`}>
        <MarkPaths />
      </g>
      <path transform={`translate(${LOCKUP.wordX} ${LOCKUP.wordY})`} fill="currentColor" d={WORDMARK} />
    </svg>
  );
}
