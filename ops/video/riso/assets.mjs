// Floor riso compositor: one-time asset rasterizer (Playwright / Chromium).
// Renders type masks, the lockup (from the unmodified SVG file) and crisp caption/footer
// layers to ops/video/riso/build/assets/ plus manifest.json. Deterministic, no network.
// Usage: node ops/video/riso/assets.mjs
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const require = createRequire('/home/user/floorbnb/package.json');
const { chromium } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const OUT = path.join(HERE, 'build/assets');
fs.mkdirSync(OUT, { recursive: true });

const F = (p) => pathToFileURL(p).href;
const GEIST = path.join(REPO, 'apps/web/node_modules/geist/dist/fonts');
const FONTS = {
  anton: path.join(HERE, 'node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2'),
  serifIt: path.join(HERE, 'node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2'),
  mono400: path.join(GEIST, 'geist-mono/GeistMono-Regular.woff2'),
  mono500: path.join(GEIST, 'geist-mono/GeistMono-Medium.woff2'),
};
const LOCKUP = path.join(REPO, 'design/logo/floor-lockup-light.svg');

// Allowed strings (BRIEF.md) - nothing else is ever rendered.
const T = {
  h1: 'Set a floor', h2: 'under your', h3: 'stocks.',
  l1: 'Spot swaps.', l2: 'BNB Chain.',
  caption: 'SIMULATOR · BACKTEST ON PAST DATA, NOT A PREDICTION',
  footer: 'Not on mainnet · No human audit',
};

const CSS = `
@font-face{font-family:Anton;src:url(${F(FONTS.anton)}) format('woff2');}
@font-face{font-family:ISerif;font-style:italic;src:url(${F(FONTS.serifIt)}) format('woff2');}
@font-face{font-family:GMono;font-weight:400;src:url(${F(FONTS.mono400)}) format('woff2');}
@font-face{font-family:GMono;font-weight:500;src:url(${F(FONTS.mono500)}) format('woff2');}
html,body{margin:0;padding:0;background:transparent;}
.g{position:absolute;white-space:nowrap;color:#0B0C0E;}
.anton{font-family:Anton;font-weight:400;letter-spacing:-0.005em;}
`;

// Headline layout (frame px). Anton size and positions are the poster grid.
const HL = { x: 96, top: 168, size: 214, lead: 200 };
const LC = { x: 120, top: 250, size: 236, lead: 226 };

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<div id="stage" style="position:relative;width:1920px;height:1080px;">
  <div id="h1" class="g anton" style="left:${HL.x}px;top:${HL.top}px;font-size:${HL.size}px;line-height:${HL.lead}px">${T.h1}</div>
  <div id="h2" class="g anton" style="left:${HL.x}px;top:${HL.top + HL.lead}px;font-size:${HL.size}px;line-height:${HL.lead}px">${T.h2}</div>
  <div id="h3probe" class="g anton" style="left:${HL.x}px;top:${HL.top + 2 * HL.lead}px;font-size:${HL.size}px;line-height:${HL.lead}px;visibility:hidden">x<span id="bl" style="display:inline-block;width:1px;height:0"></span></div>
  <canvas id="h3" class="g" style="image-rendering:pixelated"></canvas>
  <div id="l1" class="g anton" style="left:${LC.x}px;top:${LC.top}px;font-size:${LC.size}px;line-height:${LC.lead}px">${T.l1}</div>
  <div id="l2" class="g anton" style="left:${LC.x}px;top:${LC.top + LC.lead}px;font-size:${LC.size}px;line-height:${LC.lead}px">${T.l2}</div>
  <div id="caption" class="g" style="left:0;top:0;padding:9px 16px 8px 16px;background:#FAFAF8;border:2px solid #0B0C0E;
       font-family:GMono;font-weight:500;font-size:21px;line-height:26px;letter-spacing:0.08em;color:#2440E0">${T.caption}</div>
  <div id="footer" class="g" style="left:0;top:200px;font-family:GMono;font-weight:400;font-size:30px;line-height:40px;color:#0B0C0E">${T.footer}</div>
</div></body></html>`;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const pageFile = path.join(OUT, '_assets_page.html');
  fs.writeFileSync(pageFile, PAGE);
  await page.goto(F(pageFile), { waitUntil: 'load' });
  await page.evaluate(async () => { await document.fonts.load('214px Anton'); await document.fonts.load('italic 40px ISerif');
    await document.fonts.load('500 21px GMono'); await document.fonts.load('400 30px GMono'); await document.fonts.ready; });

  // Pixel-serif italic accent: Instrument Serif Italic rasterised small, hard-thresholded, scaled up with
  // nearest neighbour (true pixel blocks), baseline-aligned to the Anton line.
  const acc = await page.evaluate(({ word, size, px }) => {
    const probe = document.getElementById('h3probe');
    const bl = document.getElementById('bl');
    const baseline = probe.getBoundingClientRect().top + bl.getBoundingClientRect().top - probe.getBoundingClientRect().top;
    const fs = size * 1.22 / px;                       // accent a touch larger than the grotesque, as on home.png
    const c0 = document.createElement('canvas'); const x0 = c0.getContext('2d');
    x0.font = `italic 400 ${fs}px ISerif`;
    const m = x0.measureText(word);
    const w = Math.ceil(m.actualBoundingBoxRight + m.actualBoundingBoxLeft) + 4;
    const asc = Math.ceil(m.actualBoundingBoxAscent) + 2, desc = Math.ceil(m.actualBoundingBoxDescent) + 2;
    c0.width = w; c0.height = asc + desc;
    x0.font = `italic 400 ${fs}px ISerif`; x0.fillStyle = '#0B0C0E';
    x0.fillText(word, m.actualBoundingBoxLeft + 2, asc);
    const id = x0.getImageData(0, 0, c0.width, c0.height);
    for (let i = 0; i < id.data.length; i += 4) { const on = id.data[i + 3] >= 104; id.data[i] = 11; id.data[i+1] = 12; id.data[i+2] = 14; id.data[i + 3] = on ? 255 : 0; }
    x0.putImageData(id, 0, 0);
    const c = document.getElementById('h3'); c.width = c0.width * px; c.height = c0.height * px;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(c0, 0, 0, c.width, c.height);
    c.style.left = (96 - 2 * px) + 'px'; c.style.top = Math.round(baseline - asc * px) + 'px';
    c.style.width = c.width + 'px'; c.style.height = c.height + 'px';
    return { baseline, px, fs };
  }, { word: T.h3, size: HL.size, px: 5 });

  const ids = ['h1', 'h2', 'h3', 'l1', 'l2', 'caption', 'footer'];
  const manifest = { fonts: {
      headline: '@fontsource/anton 5.x (Anton Regular, SIL OFL)',
      accent: '@fontsource/instrument-serif italic, rasterised at 1/5 and nearest-neighbour upscaled (pixel serif italic)',
      mono: 'Geist Mono 400/500 from apps/web/node_modules/geist' },
    accent: acc, layers: {} };
  // full-frame alpha masks for type groups (layout from the browser), cropped to their bbox
  for (const id of ids) {
    await page.evaluate((keep) => { for (const e of document.querySelectorAll('.g')) e.style.visibility = (e.id === keep) ? 'visible' : 'hidden'; }, id);
    const bb = await page.evaluate((k) => { const r = document.getElementById(k).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, id);
    const clip = { x: Math.floor(bb.x) , y: Math.floor(bb.y), width: Math.ceil(bb.x + bb.w) - Math.floor(bb.x), height: Math.ceil(bb.y + bb.h) - Math.floor(bb.y) };
    // pad a little for glyph overhang
    const pad = (id === 'caption' || id === 'footer') ? 0 : 24;
    clip.x -= pad; clip.y -= pad; clip.width += 2 * pad; clip.height += 2 * pad;
    if (id === 'footer' || id === 'caption') { clip.x = Math.max(0, clip.x); clip.y = Math.max(0, clip.y); }
    await page.screenshot({ path: path.join(OUT, `${id}.png`), clip, omitBackground: true });
    manifest.layers[id] = { file: `${id}.png`, x: clip.x, y: clip.y, w: clip.width, h: clip.height };
  }

  // Lockup: the SVG file itself, uniformly scaled by the browser. Transparent and on-paper versions.
  manifest.lockup = {};
  const svgUrl = F(LOCKUP);
  for (const W of [640, 659, 678, 300]) {
    const H = W * 36 / 179;
    for (const bg of ['alpha', 'paper']) {
      const p2 = await browser.newPage({ viewport: { width: 800, height: 300 }, deviceScaleFactor: 1 });
      const lf = path.join(OUT, '_lockup_page.html');
      fs.writeFileSync(lf, `<!doctype html><html><body style="margin:0;background:${bg === 'paper' ? '#FAFAF8' : 'transparent'}"><img id="l" src="${svgUrl}" style="display:block;width:${W}px;height:${H}px"></body></html>`);
      await p2.goto(F(lf), { waitUntil: 'load' });
      await p2.evaluate(() => document.getElementById('l').decode());
      const name = `lockup_${W}_${bg}.png`;
      await p2.screenshot({ path: path.join(OUT, name), clip: { x: 0, y: 0, width: W, height: Math.ceil(H) }, omitBackground: bg === 'alpha' });
      await p2.close();
      if (bg === 'alpha') manifest.lockup[W] = { file: name, w: W, h: Math.ceil(H), h_exact: H };
    }
  }
  fs.copyFileSync(LOCKUP, path.join(OUT, 'floor-lockup-light.svg'));
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await browser.close();
  console.log('assets ok', Object.keys(manifest.layers).join(','));
}
main().catch((e) => { console.error(e); process.exit(1); });
