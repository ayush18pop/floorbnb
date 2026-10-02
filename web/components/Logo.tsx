import { BRAND } from "@/lib/brand";

/**
 * Lockup from design/logo (inline so the floor line can take --floor-line).
 * The wordmark paths spell "Floor". If BRAND.name changes, fall back to text until it is redrawn.
 */
export function Logo({ height = 24, mark = false }: { height?: number; mark?: boolean }) {
  const markOnly = mark || BRAND.name !== "Floor";
  if (markOnly) {
    return (
      <span className="inline-flex items-center gap-2" aria-label={BRAND.name}>
        <svg viewBox="0 0 32 32" height={height} width={height} fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 9h12v12H10zM12 11v8h8v-8z" />
          <rect x="0" y="21" width="32" height="2" fill="var(--floor-line)" />
        </svg>
        {!mark && <span style={{ fontWeight: 600, letterSpacing: "-0.02em", fontSize: height * 0.8 }}>{BRAND.name}</span>}
      </span>
    );
  }
  return (
    <svg viewBox="0 0 126 24" height={height} width={(height * 126) / 24} role="img" aria-label={BRAND.name}>
      <g fill="currentColor" transform="translate(0 1)">
        <path fillRule="evenodd" d="M10 9h12v12H10zM12 11v8h8v-8z" />
        <rect x="0" y="21" width="32" height="2" fill="var(--floor-line)" />
      </g>
      <g transform="translate(44 0)" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M1.5 24V1.5H16M1.5 12H13" />
        <path d="M23.5 0V24" />
        <circle cx="38" cy="16" r="6.5" />
        <circle cx="58" cy="16" r="6.5" />
        <path d="M71.5 8V24M71.5 16a6.5 6.5 0 0 1 6.5-6.5H82" />
      </g>
    </svg>
  );
}
