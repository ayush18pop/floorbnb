// Re-runnable: node capture.mjs [outDir=frames]   (server must be on :3200)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('/home/user/floorbnb/package.json');
const { chromium } = require('playwright');
const OUT = path.resolve(process.argv[2] || 'frames');
const BASE = 'http://localhost:3200';
const N = 135, DT = 1000 / 30;
fs.mkdirSync(OUT, { recursive: true });
const launch = async () => { try { return await chromium.launch(); } catch { const d = fs.readdirSync('/opt/pw-browsers').find(x => x.startsWith('chromium-')); return chromium.launch({ executablePath: `/opt/pw-browsers/${d}/chrome-linux/chrome` }); } };
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'no-preference' });
const page = await ctx.newPage();
await page.goto(BASE + '/try?theme=light', { waitUntil: 'load' });
for (let i = 0; i < 10; i++) await page.clock.runFor(50);
await page.evaluate(() => document.fonts.ready);
await page.waitForSelector('svg.chart path');
await page.addStyleTag({ content: '*,*::before,*::after{transition:none !important;animation:none !important;caret-color:transparent !important}' });
await page.mouse.move(1390, 120);
await page.evaluate(() => window.scrollTo(0, 0));
await page.clock.runFor(200);
await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100000);

const R = async (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; }, sel);
const input = await R('#try-floor');
const THUMB_W = 24, THUMB_H = 36;
// thumb rect: x = input.x + frac*(input.w - THUMB_W); y centered on input; frac=(v-80)/15
const thumbFor = (v) => ({ x: input.x + ((v - 80) / 15) * (input.w - THUMB_W), y: input.y + (input.h - THUMB_H) / 2, w: THUMB_W, h: THUMB_H });
const cx = (v) => { const t = thumbFor(v); return [t.x + t.w / 2, t.y + t.h / 2]; };
const chip = await page.getByRole('button', { name: 'COVID crash' }).boundingBox();
const chipC = [chip.x + chip.width / 2, chip.y + chip.height / 2];
const rest = [1390, 120];
const [sx, sy] = cx(90), [ex, ey] = cx(80);
const q = (t, n = 6) => { const e = 1 - Math.pow(1 - t, 3); return Math.ceil(e * n - 1e-9) / n; };
const lerp = (a, b, t) => a + (b - a) * t;
const frames = []; let down = false, mx = rest[0], my = rest[1], thumbs = [];
for (let k = 0; k < N; k++) {
  let tx = mx, ty = my, act = null;
  if (k < 15) { tx = rest[0]; ty = rest[1]; }
  else if (k <= 26) { const t = q((k - 14) / 12); tx = lerp(rest[0], sx, t); ty = lerp(rest[1], sy, t); }
  else if (k === 27) { tx = sx; ty = sy; act = 'down'; }
  else if (k <= 62) { const t = q((k - 27) / 35); tx = lerp(sx, ex - 4, t); ty = sy; }
  else if (k === 63) { act = 'up'; }
  else if (k >= 66 && k <= 71) { const t = q((k - 65) / 6); tx = lerp(ex - 4, chipC[0], t); ty = lerp(ey, chipC[1], t); }
  if (k === 72) { tx = chipC[0]; ty = chipC[1]; }
  if (tx !== mx || ty !== my) { await page.mouse.move(tx, ty); mx = tx; my = ty; }
  if (act === 'down') { await page.mouse.down(); down = true; }
  if (act === 'up') { await page.mouse.up(); down = false; }
  if (k === 72) await page.mouse.click(mx, my);
  if (k > 0) await page.clock.runFor(DT);
  const v = Number(await page.inputValue('#try-floor'));
  thumbs.push({ ...thumbFor(v), value: v });
  frames.push({ i: k, t: +(k / 30).toFixed(4), mouse: { x: +mx.toFixed(2), y: +my.toFixed(2), down }, floor: v });
  await page.screenshot({ path: path.join(OUT, `f_${String(k).padStart(4, '0')}.png`) });
}
const regions = {
  slider_track: input,
  slider_thumb_by_frame: thumbs,
  chart: await R('figure'),
  floor_readout: await R('span.mono[aria-hidden="true"]'),
};
fs.writeFileSync(path.join(path.dirname(OUT), path.basename(OUT) === 'frames' ? 'events.json' : path.basename(OUT) + '_events.json'), JSON.stringify({ fps: 30, frames: N, viewport: { w: 1440, h: 900, dpr: 2 }, frames_data: frames, regions,
  notes: 'Route /try?theme=light, production build. Slider dragged 90->80 via real mouse events (down k27, up k63). Crash replay = chip "COVID crash" clicked at k72. Thumb rect formula: x = input.x + ((value-80)/15)*(input.w-24); w=24; h=36; y = input.y+(input.h-36)/2 (matches .fs-input webkit thumb 24x36 in app.css). All CSS px page coords (page not scrolled). Mouse at k72 is the click position.' }, null, 1));
await browser.close();
