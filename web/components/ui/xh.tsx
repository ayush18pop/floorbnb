import type { CSSProperties } from "react";

/** Crosshair mark (BRAND.md section 6). Place inside a position:relative box. Decorative. */
export function Xh({ style, className = "" }: { style?: CSSProperties; className?: string }) {
  return <i className={`xh ${className}`} style={style} aria-hidden="true" />;
}
