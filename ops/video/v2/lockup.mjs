// Floor v2: rasterise the repo lockup SVG (design/logo/floor-lockup-light.svg, unmodified) with Chromium.
// Uniform scale only (width:W, height:W*36/179). Transparent + on-paper (#FAFAF8) versions, for exact face-on
// pastes on the end card and as the texture of card planes. Usage: node ops/video/v2/lockup.mjs
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const require = createRequire('/opt/node-tools/package.json');
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const OUT = path.join(HERE, 'build', 'lockup');
fs.mkdirSync(OUT, { recursive: true });
const LOCKUP = path.join(REPO, 'design/logo/floor-lockup-light.svg');
const WIDTHS = (process.argv[2] || '358,400,448,537,716,800,896,1074').split(',').map(Number);

const browser = await chromium.launch();
const manifest = { source: 'design/logo/floor-lockup-light.svg', sha256: null, sizes: {} };
const crypto = await import('crypto');
manifest.sha256 = crypto.createHash('sha256').update(fs.readFileSync(LOCKUP)).digest('hex');
for (const W of WIDTHS) {
  const H = W * 36 / 179;
  for (const bg of ['alpha', 'paper']) {
    const page = await browser.newPage({ viewport: { width: Math.max(W + 8, 200), height: Math.ceil(H) + 8 }, deviceScaleFactor: 1 });
    const f = path.join(OUT, '_page.html');
    fs.writeFileSync(f, `<!doctype html><html><body style="margin:0;background:${bg === 'paper' ? '#FAFAF8' : 'transparent'}"><img id="l" src="${pathToFileURL(LOCKUP).href}" style="display:block;width:${W}px;height:${H}px"></body></html>`);
    await page.goto(pathToFileURL(f).href, { waitUntil: 'load' });
    await page.evaluate(() => document.getElementById('l').decode());
    const name = `lockup_${W}_${bg}.png`;
    await page.screenshot({ path: path.join(OUT, name), clip: { x: 0, y: 0, width: W, height: Math.ceil(H) }, omitBackground: bg === 'alpha' });
    await page.close();
    if (bg === 'alpha') manifest.sizes[W] = { alpha: name, paper: `lockup_${W}_paper.png`, w: W, h: Math.ceil(H), h_exact: H };
  }
}
fs.copyFileSync(LOCKUP, path.join(OUT, 'floor-lockup-light.svg'));
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
await browser.close();
console.log('lockup ok', WIDTHS.join(','));
