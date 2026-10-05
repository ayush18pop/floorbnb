#!/usr/bin/env node
// Dev-only: renders placeholder share cards to public/og/<file>.png from lib/og-manifest.json.
// Run from apps/web:  pnpm og:placeholders   (or: node scripts/generate-og-placeholders.mjs [--only=file.png])
// Reproducible: same manifest, same fonts, same bytes. Uses the Satori/resvg build that ships inside Next (next/og). No new dependency.
//
// Supplied final art is never overwritten. A file is regenerated only when it is missing, or when it is still the exact
// placeholder this script wrote (its sha256 is recorded in scripts/og-placeholders.json). Replace a card by dropping your
// PNG at the same path; the script then leaves it alone.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toOpaqueRgb } from "./png.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { ImageResponse } = await import(join(dirname(require.resolve("next/package.json")), "dist/compiled/@vercel/og/index.node.js"));

const outDir = join(root, "public/og");
const recordPath = join(root, "scripts/og-placeholders.json");
const manifest = JSON.parse(readFileSync(join(root, "lib/og-manifest.json"), "utf8"));
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

// Tokens from design/tokens.css (light) and the exact lockup from lib/logo.ts (copied from design/logo/floor-lockup-light.svg).
const C = { bg: "#FAFAF8", text: "#10110F", text2: "#464843", muted: "#686A63", accent: "#2440E0", soft: "#E9ECFC", grid: "#CFD0CA" };
const logoSrc = readFileSync(join(root, "lib/logo.ts"), "utf8");
const grab = (re) => logoSrc.match(re)[1];
const MARK = {
  cushion: grab(/cushion: "([^"]+)"/), value: grab(/value: "([^"]+)"/), floor: grab(/floor: "([^"]+)"/), tick: grab(/tick: "([^"]+)"/),
  strokeWidth: Number(grab(/strokeWidth: ([0-9.]+)/)),
};
const WORDMARK = grab(/WORDMARK = "([^"]+)"/);
const LOCKUP = { w: 179, h: 36, markScale: Number(grab(/markScale: ([0-9.]+)/)), wordX: Number(grab(/wordX: ([0-9.]+)/)), wordY: Number(grab(/wordY: ([0-9.]+)/)) };

const fontDir = join(root, "node_modules/geist/dist/fonts");
const fonts = [
  { name: "Geist", data: readFileSync(join(fontDir, "geist-sans/Geist-Bold.ttf")), weight: 700, style: "normal" },
  { name: "Geist", data: readFileSync(join(fontDir, "geist-sans/Geist-Medium.ttf")), weight: 500, style: "normal" },
  { name: "Geist Mono", data: readFileSync(join(fontDir, "geist-mono/GeistMono-Medium.ttf")), weight: 500, style: "normal" },
];

const h = (type, style, children, extra = {}) => ({ type, props: { style, children, ...extra } });
const FOOTER = "Not on mainnet · No human audit";

function card(e) {
  const len = e.headline.length;
  const size = len <= 20 ? 84 : len <= 27 ? 72 : 62;
  const lockupH = 44;
  const lockup = {
    type: "svg",
    props: {
      width: Math.round((lockupH * LOCKUP.w) / LOCKUP.h), height: lockupH, viewBox: `0 0 ${LOCKUP.w} ${LOCKUP.h}`,
      children: [
        { type: "g", props: { transform: `scale(${LOCKUP.markScale})`, children: [
          { type: "path", props: { d: MARK.cushion, fill: C.soft } },
          { type: "path", props: { d: MARK.value, fill: "none", stroke: C.text, strokeWidth: MARK.strokeWidth } },
          { type: "path", props: { d: MARK.floor, fill: C.accent } },
          { type: "path", props: { d: MARK.tick, fill: C.accent } },
        ] } },
        { type: "path", props: { transform: `translate(${LOCKUP.wordX} ${LOCKUP.wordY})`, fill: C.text, d: WORDMARK } },
      ],
    },
  };
  const mono = (t, color, top) => h("div", { position: "absolute", left: 64, top, fontFamily: "Geist Mono", fontWeight: 500, fontSize: 21, color, letterSpacing: 0.4 }, t);
  return h("div", { width: 1200, height: 630, display: "flex", position: "relative", background: C.bg, fontFamily: "Geist" }, [
    h("div", { position: "absolute", left: 64, top: 48, display: "flex" }, lockup),
    h("div", { position: "absolute", left: 64, top: 150, width: 590, display: "flex", flexDirection: "column" }, [
      h("div", { display: "flex", fontWeight: 700, fontSize: size, lineHeight: 1.04, letterSpacing: -2, color: C.text }, e.headline),
      h("div", { display: "flex", marginTop: 28, fontWeight: 500, fontSize: 28, lineHeight: 1.35, color: C.text2 }, e.description),
    ]),
    h("div", { position: "absolute", left: 700, top: 145, width: 436, height: 342, display: "flex", alignItems: "center", justifyContent: "center", border: `2px dashed ${C.grid}`, background: "#FFFFFF" },
      h("div", { display: "flex", fontFamily: "Geist Mono", fontWeight: 500, fontSize: 22, letterSpacing: 2, color: C.muted }, "ARTWORK PENDING")),
    ...(e.label ? [mono(e.label, C.accent, 526)] : []),
    mono(FOOTER, C.muted, 562),
  ]);
}

const record = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, "utf8")) : {};
const sha = (b) => createHash("sha256").update(b).digest("hex");
mkdirSync(outDir, { recursive: true });
let wrote = 0, kept = 0;
for (const e of manifest) {
  if (only && e.file !== only) continue;
  const path = join(outDir, e.file);
  if (existsSync(path) && record[e.file] !== sha(readFileSync(path))) {
    console.log(`keep   ${e.file} (supplied art)`);
    kept++;
    continue;
  }
  const rgba = Buffer.from(await new ImageResponse(card(e), { width: 1200, height: 630, fonts }).arrayBuffer());
  const png = toOpaqueRgb(rgba);
  writeFileSync(path, png);
  record[e.file] = sha(png);
  console.log(`write  ${e.file}`);
  wrote++;
}
writeFileSync(recordPath, JSON.stringify(Object.fromEntries(Object.entries(record).sort()), null, 2) + "\n");
console.log(`${wrote} written, ${kept} kept`);
