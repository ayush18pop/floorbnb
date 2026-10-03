import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import { LOCKUP, MARK, WORDMARK } from "@/lib/logo";
import { loadPath } from "@/lib/data";

export const alt = `${BRAND.name}: ${BRAND.headline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Light theme tokens from design/tokens.css
const C = {
  bg: "#FAFAF8", surface: "#FFFFFF", grid: "#E4E5E0", gridStrong: "#CFD0CA", xh: "#8C8E86",
  text: "#10110F", text2: "#464843", muted: "#686A63", accent: "#2440E0", soft: "#E9ECFC",
};

async function font(family: string, weight: number) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    return await (await fetch(url)).arrayBuffer();
  } catch {
    return null;
  }
}

export default async function Image() {
  const [sans, mono] = await Promise.all([font("Geist", 600), font("Geist+Mono", 500)]);
  const fonts: { name: string; data: ArrayBuffer; weight: 500 | 600; style: "normal" }[] = [];
  if (sans) fonts.push({ name: "Geist", data: sans, weight: 600, style: "normal" });
  if (mono) fonts.push({ name: "Geist Mono", data: mono, weight: 500, style: "normal" });
  const sansFam = sans ? "Geist" : "sans-serif";
  const monoFam = mono ? "Geist Mono" : "monospace";

  const path = loadPath("nvda_worst");
  // chart box
  const cx = 648, cy = 112, cw = 488, ch = 360;
  const px = cx + 24, py = cy + 40, pw = cw - 48, ph = ch - 72;
  const yMin = 30, yMax = 110;
  const X = (i: number) => px + (i / (path.length - 1)) * pw;
  const Y = (v: number) => py + (1 - (v - yMin) / (yMax - yMin)) * ph;
  const d = (k: "stock" | "vault") => path.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p[k]).toFixed(1)}`).join("");

  const vlines = Array.from({ length: 13 }, (_, i) => i * 100);
  const hlines = Array.from({ length: 7 }, (_, i) => i * 96);

  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: "flex", position: "relative", background: C.bg, fontFamily: sansFam }}>
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: "absolute", left: 0, top: 0 }}>
          {vlines.map((x) => <line key={`v${x}`} x1={x} y1="0" x2={x} y2="630" stroke={C.grid} strokeWidth="1" />)}
          {hlines.map((y) => <line key={`h${y}`} x1="0" y1={y} x2="1200" y2={y} stroke={C.grid} strokeWidth="1" />)}
          {[[100, 96], [600, 96], [1100, 96], [100, 576], [600, 576], [1100, 576]].map(([x, y]) => (
            <path key={`${x}${y}`} d={`M${x - 5} ${y}H${x + 5}M${x} ${y - 5}V${y + 5}`} stroke={C.xh} strokeWidth="1" />
          ))}
          {/* chart panel */}
          <rect x={cx} y={cy} width={cw} height={ch} fill={C.surface} stroke={C.gridStrong} />
          {[40, 60, 80, 100].map((t) => <line key={t} x1={px} x2={px + pw} y1={Y(t)} y2={Y(t)} stroke={C.grid} />)}
          <path d={`${d("vault")}L${X(path.length - 1)} ${Y(90)}L${X(0)} ${Y(90)}Z`} fill={C.soft} />
          <path d={d("stock")} fill="none" stroke={C.muted} strokeWidth="2" />
          <path d={d("vault")} fill="none" stroke={C.text} strokeWidth="2.5" />
          <line x1={px} x2={px + pw} y1={Y(90)} y2={Y(90)} stroke={C.accent} strokeWidth="3" />
          {[[cx, cy], [cx + cw, cy], [cx, cy + ch], [cx + cw, cy + ch]].map(([x, y]) => (
            <path key={`${x}${y}`} d={`M${x - 5} ${y}H${x + 5}M${x} ${y - 5}V${y + 5}`} stroke={C.xh} strokeWidth="1" />
          ))}
        </svg>

        <div style={{ position: "absolute", left: 64, top: 34, display: "flex" }}>
          <svg width={(40 * LOCKUP.width) / LOCKUP.height} height="40" viewBox={LOCKUP.viewBox}>
            <g transform={`scale(${LOCKUP.markScale})`}>
              <path d={MARK.cushion} fill={C.soft} />
              <path d={MARK.value} fill="none" stroke={C.text} strokeWidth={MARK.strokeWidth} />
              <path d={MARK.floor} fill={C.accent} />
              <path d={MARK.tick} fill={C.accent} />
            </g>
            <path transform={`translate(${LOCKUP.wordX} ${LOCKUP.wordY})`} fill={C.text} d={WORDMARK} />
          </svg>
        </div>

        <div style={{ position: "absolute", left: 64, top: 130, width: 540, display: "flex", flexDirection: "column", background: C.bg, padding: "8px 0" }}>
          <div style={{ fontSize: 68, lineHeight: 1.05, fontWeight: 600, color: C.text, letterSpacing: -2.4 }}>{BRAND.headline}</div>
          <div style={{ marginTop: 28, fontSize: 24, lineHeight: 1.4, color: C.text2, fontWeight: 600 }}>
            {`You keep part of the gain. Spot trades only on ${BRAND.chain}.`}
          </div>
        </div>

        <div style={{ position: "absolute", left: cx + 24, top: cy + 12, fontFamily: monoFam, fontSize: 13, color: C.muted, letterSpacing: 1 }}>NVDA 2022 BACKTEST</div>
        <div style={{ position: "absolute", right: 1200 - (px + pw) + 4, top: Y(90) + 8, fontFamily: monoFam, fontSize: 13, color: C.accent, letterSpacing: 1, background: C.surface, padding: "0 4px" }}>FLOOR 90%</div>
        <div style={{ position: "absolute", right: 1200 - (px + pw) + 4, top: Y(49) + 40, fontFamily: monoFam, fontSize: 14, color: C.muted, background: C.surface, padding: "0 4px" }}>HOLDING −51.0%</div>
        <div style={{ position: "absolute", right: 1200 - (px + pw) + 4, top: Y(90) - 26, fontFamily: monoFam, fontSize: 14, color: C.text, background: C.surface, padding: "0 4px" }}>WITH FLOOR −10.0%</div>

        <div style={{ position: "absolute", left: 64, bottom: 40, fontFamily: monoFam, fontSize: 14, color: C.muted, letterSpacing: 0.5 }}>
          BACKTEST, PAST DATA, NOT A PREDICTION. HOLDS UNLESS PRICES GAP MORE THAN ABOUT 24%.
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
