// Floor launch video v2 capture. Deterministic 30 fps frame sequences from the real Floor UI.
//
//   node capture.mjs [--base-url http://localhost:3200] [--mode example|live] [--out <dir>]
//                    [--shots L1_landing,T1_try,A1,A2,G1_agents] [--limit N] [--headed]
//                    [--storage-state wallet-state.json]
//
// Method: Playwright clock installed before load, paused after first paint, clock.runFor(33.333 ms) per
// frame, so every JS timer / rAF / Date.now is virtual and frames are reproducible. All input is real
// mouse and keyboard events (eased, per frame). CSS animations/transitions run on the compositor clock, which the
// virtual clock does not control, so every frame they are paused and seeked (Web Animations API) to the virtual time
// since they first appeared: the app's own draw-in and hover transitions play, deterministically.
//
// --mode example : app served in its built-in example mode (NEXT_PUBLIC_DATA_SOURCE=mock). Fixed virtual date.
// --mode live    : the live app. Nothing is mocked, nothing is skipped; the date is the real date. The user
//                  supplies the wallet (run --headed with --storage-state of a profile that is connected, or
//                  connect by hand during the 'A1a' pause with --headed --pause-for-wallet). Wallet popups
//                  are real-time, so the A1b/A1c frames of a live run are real-time paced and not bit-exact.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/home/user/floorbnb/package.json');
const { chromium } = require('playwright');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const BASE = String(arg('base-url', 'http://localhost:3200')).replace(/\/$/, '');
const MODE = arg('mode', 'example');
if (!['example', 'live'].includes(MODE)) throw new Error('--mode must be example or live');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTROOT = path.resolve(arg('out', HERE));
const WANT = String(arg('shots', 'L1_landing,T1_try,A1,A2,G1_agents')).split(',');
const LIMIT = Number(arg('limit', 0)) || 0; // debugging: cap frames per shot
const DT = 1000 / 30;
const LIVE = MODE === 'live';
const FIXED_TIME = new Date('2026-10-05T16:00:00Z'); // example mode only: Monday, trading window open

const launch = async () => {
  const o = { headless: !arg('headed', false) };
  try { return await chromium.launch(o); } catch {
    const d = fs.readdirSync('/opt/pw-browsers').find(x => x.startsWith('chromium-'));
    return chromium.launch({ ...o, executablePath: `/opt/pw-browsers/${d}/chrome-linux/chrome` });
  }
};

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // ease-in-out cubic
const lerp = (a, b, t) => a + (b - a) * t;
// keys: [[frame, x, y], ...] sorted; eased glide between consecutive keys, held before first / after last.
const pathAt = (keys, k) => {
  if (k <= keys[0][0]) return [keys[0][1], keys[0][2]];
  for (let i = 1; i < keys.length; i++) {
    if (k <= keys[i][0]) { const [k0, x0, y0] = keys[i - 1], [k1, x1, y1] = keys[i]; const t = ease((k - k0) / (k1 - k0)); return [lerp(x0, x1, t), lerp(y0, y1, t)]; }
  }
  const l = keys[keys.length - 1]; return [l[1], l[2]];
};

async function newSession(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'no-preference',
    ...(arg('storage-state', false) ? { storageState: String(arg('storage-state')) } : {}),
  });
  const page = await ctx.newPage();
  await page.clock.install(LIVE ? {} : { time: FIXED_TIME });
  return { ctx, page };
}

const drive = (page) => page.evaluate((vt) => {
  const m = (window.__drv ||= new WeakMap());
  for (const a of document.getAnimations()) {
    let s = m.get(a); if (s === undefined) { s = vt; m.set(a, s); }
    a.pause(); a.currentTime = vt - s;
  }
}, page.__vt);
const adv = async (page, ms) => { await page.clock.runFor(ms); page.__vt += ms; await drive(page); };

async function open(page, route, readySel, settleMs = 3000) {
  page.__vt = 0;
  await page.goto(`${BASE}${route}${route.includes('?') ? '&' : '?'}theme=light`, { waitUntil: 'load' });
  await page.addStyleTag({ content: '*,*::before,*::after{caret-color:transparent !important;scroll-behavior:auto !important}::-webkit-scrollbar{display:none !important}html{scrollbar-width:none !important}' });
  await page.evaluate(() => document.fonts.ready);
  if (readySel) await page.waitForSelector(readySel, { timeout: 15000 });
  await page.mouse.move(1390, 700);
  await page.evaluate(() => window.scrollTo(0, 0));
  for (let t = 0; t < settleMs; t += 50) await adv(page, 50);
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1e8);
}

// rect in viewport CSS px (= frame pixels / 2). sel may be a CSS selector or a function string run in page.
const measure = (page, map) => page.evaluate((m) => {
  const out = {};
  for (const [name, spec] of Object.entries(m)) {
    let el = null;
    try {
      if (spec.startsWith('js:')) el = (0, eval)(spec.slice(3));
      else el = document.querySelector(spec);
    } catch { el = null; }
    if (!el) { out[name] = null; continue; }
    const r = el.getBoundingClientRect();
    const hh = r.height < 1 ? 2 : r.height, yy = r.height < 1 ? r.y - 1 : r.y; // hairline SVG lines get their 2 px stroke height
    out[name] = { x: +r.x.toFixed(2), y: +yy.toFixed(2), w: +r.width.toFixed(2), h: +hh.toFixed(2) };
  }
  return out;
}, map);

const byText = (sel, text) => `js:[...document.querySelectorAll(${JSON.stringify(sel)})].find(e=>e.textContent.trim().startsWith(${JSON.stringify(text)}))`;

class Shot {
  constructor(name, N) {
    this.name = name; this.N = LIMIT ? Math.min(N, LIMIT) : N; this.full = N;
    this.dir = path.join(OUTROOT, name); this.fdir = path.join(this.dir, 'frames');
    fs.rmSync(this.dir, { recursive: true, force: true }); fs.mkdirSync(this.fdir, { recursive: true });
    this.fd = []; this.reg = []; this.extra = {};
  }
}

const finalize = (shot, regionMap, notes, extra = {}) => {
  const regions = {};
  for (const name of Object.keys(regionMap)) {
    const arr = shot.reg.map((r) => r[name]);
    const first = arr.find((r) => r) || null;
    regions[name] = first;
    const varies = arr.some((r) => r && first && (r.x !== first.x || r.y !== first.y || r.w !== first.w || r.h !== first.h));
    if (varies) regions[name + '_by_frame'] = arr;
  }
  Object.assign(regions, extra);
  fs.writeFileSync(path.join(shot.dir, 'events.json'), JSON.stringify({
    fps: 30, frames: shot.N, viewport: { w: 1440, h: 900, dpr: 2 }, mode: MODE, base_url: BASE,
    frames_data: shot.fd, regions, notes,
  }, null, 1));
};

// Capture one frame of a shot: apply mouse position, run `act`, advance virtual time, shoot, measure.
async function frame(page, shot, k, state, regionMap, extraFd = {}) {
  if (k > 0) await adv(page, DT); else await drive(page);
  const m = await measure(page, regionMap);
  shot.reg.push(m);
  const sy = await page.evaluate(() => scrollY);
  shot.fd.push({ i: k, t: +(k / 30).toFixed(4), mouse: { x: +state.x.toFixed(2), y: +state.y.toFixed(2), down: state.down }, click: !!state.click, scrollY: +sy.toFixed(2), ...extraFd });
  state.click = false;
  await page.screenshot({ path: path.join(shot.fdir, `f_${String(k).padStart(4, '0')}.png`) });
}
const moveTo = async (page, state, [x, y]) => { if (x !== state.x || y !== state.y) { await page.mouse.move(x, y); state.x = x; state.y = y; } };
const center = (r) => { const w = r.w ?? r.width, h = r.h ?? r.height; return [r.x + w / 2, r.y + h / 2]; };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- L1 landing
async function L1(browser) {
  const { ctx, page } = await newSession(browser);
  await open(page, '/', 'svg.chart path, figure svg path', 500);
  const shot = new Shot('L1_landing', 190);
  const RM = {
    hero_chart: '#hero .lattice > div:nth-child(2) > *', hero_headline: '#hero-h',
    nav_try_link: byText('header nav a', 'Try it'), hero_cta_try: byText('#hero a', 'Try it'),
    moment: '#moment', how_it_works: '#how-it-works', nav: 'header',
  };
  const S = await page.evaluate(() => {
    const st = document.querySelector('#how-it-works').getBoundingClientRect(); const max = document.documentElement.scrollHeight - innerHeight;
    return { target: Math.min(max, scrollY + st.bottom - innerHeight + 24), max };
  });
  const tryLink = (await measure(page, { l: RM.nav_try_link })).l;
  const park = [600, 470], land = [tryLink.x + tryLink.w * 0.5, tryLink.y + tryLink.h * 0.5];
  const keys = [[0, ...park], [40, ...park], [140, ...park], [172, ...land], [189, ...land]];
  const st = { x: park[0], y: park[1], down: false };
  for (let k = 0; k < shot.N; k++) {
    const sy = k <= 40 ? 0 : k >= 150 ? S.target : S.target * ease((k - 40) / 110);
    await page.evaluate((y) => window.scrollTo(0, y), sy);
    await moveTo(page, st, pathAt(keys, k));
    await pause(25); // let IntersectionObserver reveal callbacks land before the virtual clock moves
    await frame(page, shot, k, st, RM);
  }
  finalize(shot, RM, `Route /, production build. k0-39 hold, k40-149 eased (ease-in-out cubic) window.scrollTo per frame from 0 to ${S.target.toFixed(1)} px (end of the "Three steps" section), k140-171 mouse glides (eased) to nav "Try it", k172-189 hold hovering it (no click). Rects are viewport CSS px per frame (page scrolls); scrollY per frame in frames_data.`, { scroll_target: S.target });
  await ctx.close();
}

// ---------------------------------------------------------------- T1 try
async function T1(browser) {
  const { ctx, page } = await newSession(browser);
  await open(page, '/try', 'svg.chart path');
  const shot = new Shot('T1_try', 290);
  const RM = {
    slider_track: '#try-floor', floor_readout: 'span.mono[aria-hidden="true"]', chart: 'figure',
    crash_chips: js_chips('Replay a crash'), term_chips: '[role=group][aria-label="Term"]',
    headline_numbers: '[data-testid=headline]',
  };
  const input = (await measure(page, { i: '#try-floor' })).i;
  const TW = 24, TH = 44;
  const thumbFor = (v) => ({ x: input.x + ((v - 80) / 15) * (input.w - TW), y: input.y + (input.h - TH) / 2, w: TW, h: TH });
  const cx = (x) => x; const c90 = center(thumbFor(90)), c80 = center(thumbFor(80));
  const chip = async (name) => center((await page.getByRole('button', { name }).boundingBox()));
  const chipA = await chip('COVID crash'), chipB = await chip('2022 bear market');
  // mouse parked on the 90 thumb during the idle; press at k30; eased drag to 80 over k30..100; release at 100
  const keys = [[0, ...c90], [30, ...c90], [100, c80[0], c90[1]], [130, c80[0], c90[1]], [155, ...chipA], [205, ...chipA], [230, ...chipB], [289, ...chipB]];
  const st = { x: c90[0], y: c90[1], down: false };
  await page.mouse.move(st.x, st.y);
  const smooth = [];
  for (let k = 0; k < shot.N; k++) {
    await moveTo(page, st, pathAt(keys, k));
    if (k === 30) { await page.mouse.down(); st.down = true; }
    if (k === 100) { await page.mouse.up(); st.down = false; }
    if (k === 155) { await page.mouse.click(st.x, st.y); st.click = true; }
    if (k === 230) { await page.mouse.click(st.x, st.y); st.click = true; }
    const v = Number(await page.inputValue('#try-floor'));
    const dragFrac = k < 30 ? 0 : k > 100 ? 1 : ease((k - 30) / 70);
    // unsnapped (what the eased pointer would give) thumb center x, for camera follow; real thumb snaps to whole percents
    const sx = lerp(c90[0], c80[0], dragFrac);
    smooth.push({ x: +(sx - TW / 2).toFixed(2), y: thumbFor(90).y, w: TW, h: TH });
    await frame(page, shot, k, st, RM, { floor: v });
    shot.reg[k].slider_thumb = { ...thumbFor(v), value: v };
  }
  const fin = shot.reg.map((r) => r.slider_thumb);
  finalize(shot, RM, 'Route /try, production build. k0-29 idle (mouse parked on the 90% thumb), k30 mouse down, k30-100 eased ease-in-out cubic drag 90 -> 80, k100 mouse up, k100-129 hold, k130-154 glide to chip, k155 real click "COVID crash", k155-204 hold, k205-229 glide, k230 real click "2022 bear market", k230-289 hold. IMPORTANT: the native range input snaps to whole percents (step 1), so slider_thumb_by_frame is stepped by design of the real control (about 25 px per percent). slider_thumb_smooth_by_frame is the unsnapped eased pointer path (thumb-sized rect) for camera follow; mouse in frames_data is the smooth eased path. Thumb 24x44 CSS px (app.css .fs-input).', { slider_thumb_by_frame: fin, slider_thumb_smooth_by_frame: smooth });
  await ctx.close();
}
function js_chips(legend) {
  return `js:[...document.querySelectorAll('legend')].find(l=>l.textContent.trim().startsWith(${JSON.stringify(legend)})).parentElement.querySelector('div')`;
}

// ---------------------------------------------------------------- A1 builder -> review -> confirmed (one session)
async function A1(browser) {
  const { ctx, page } = await newSession(browser);
  await open(page, '/app', '.basket');
  const a = new Shot('A1a_builder', 200), b = new Shot('A1b_review', 90), c = new Shot('A1c_confirmed', 70);
  const total = LIMIT ? Math.min(360, LIMIT * 3) : 360;
  const RMB = {
    basket_picker: '.basket', floor_slider: '.fs', term_picker: '.terms', amount_input: '.input-wrap',
    review_button: 'button[type=submit].btn-primary', summary_card: '.tiles-3',
    chart_panel: '.fill > div:last-child > div:first-child', tiles: '.tiles-3',
    floor_value: 'span.mono[aria-hidden="true"]',
  };
  const RMR = {
    summary_card: 'dl.kvc', acks: 'fieldset', confirm_button: '.btn-stack button.btn-primary', stepper: 'ol.stepper', back_button: byText('a.btn', 'Back'),
    flow_rail: 'nav[aria-label=Progress]', basket_picker: null,
  };
  delete RMR.basket_picker;
  RMR.summary_card = 'js:document.querySelector("dl.kvc").closest("div.relative")';
  const RMC = {
    summary_card: 'js:document.querySelector("dl.kvc").closest("div.relative")', confirmed_badge: '.badge.b-pos', headline: 'h2.h1',
    open_position_button: byText('a.btn', 'Open position'), vault_cell: 'dl.kvc > div:first-child', flow_rail: 'nav[aria-label=Progress]',
  };
  // geometry of the controls we touch (builder page, unscrolled)
  const g = await measure(page, { basket: '.basket', slider: '#__none', fs: '.fs', terms: '.terms', amt: '#amount', rev: 'button[type=submit].btn-primary' });
  const tgt = {};
  tgt.qqq = center(await page.locator('.basket button', { hasText: 'QQQB' }).boundingBox());
  const inputR = await page.locator('.fs-input').boundingBox();
  const TW = 24, TH = 44;
  const thumbFor = (v, r = inputR) => ({ x: r.x + ((v - 80) / 15) * (r.width - TW), y: r.y + (r.height - TH) / 2, w: TW, h: TH });
  const t90 = center(thumbFor(90)), t85 = center(thumbFor(85));
  tgt.term6 = center(await page.locator('.terms button', { hasText: '6 months' }).boundingBox());
  tgt.amt = center(await page.locator('#amount').boundingBox());
  tgt.rev = center(await page.locator('button[type=submit].btn-primary').boundingBox());
  const park = [330, 640];
  // global frame g: 0..199 = A1a, 200..289 = A1b, 290..359 = A1c.
  // Timeline is planned so every glide lasts about sqrt(distance) frames (ease-in-out cubic peak acceleration 12*d/T^2 <= ~12 px/frame^2).
  // Builder: basket click, drag 90->85, term click, deposit triple-click + type 1000, Review click. Review page: 3 ack clicks, glide to
  // "Run mock flow", click at g=200 (= A1b k0). Mock flow runs ~3.4 s virtual -> /app/confirmed at about g 300.
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const dur = (p, q, f = 1.0) => Math.max(8, Math.ceil(f * Math.sqrt(dist(p, q))));
  const plan = {}; const keysA = [[0, ...park]]; let f = 4, cur = park;
  const glide = (name, to, ff) => { keysA.push([f, ...cur]); f += dur(cur, to, ff); keysA.push([f, ...to]); cur = to; plan[name] = f; };
  glide('basket', tgt.qqq); f += 2; plan.basketClick = plan.basket;
  glide('thumb', t90); plan.down = f; f += 2;
  keysA.push([f, ...t90]); keysA.push([f + 22, t85[0], t90[1]]); f += 22; cur = [t85[0], t90[1]]; plan.up = f; f += 2; keysA.push([f, ...cur]);
  glide('term', tgt.term6); f += 2; keysA.push([f, ...cur]); plan.termClick = plan.term;
  glide('amt', tgt.amt, 0.9); plan.type0 = f + 2; f += 14; keysA.push([f, ...cur]);
  glide('rev', tgt.rev, 0.9); plan.revClick = f; f += 1; keysA.push([f, ...cur]);
  console.log('A1 plan', JSON.stringify(plan));
  if (plan.revClick > 140) throw new Error('A1 builder timeline too long: ' + plan.revClick);
  const st = { x: park[0], y: park[1], down: false };
  await page.mouse.move(...park);
  let ackPos = null, confirmPos = null, clickG = null, keysB = null;
  const shotOf = (gk) => (gk < 200 ? [a, gk, RMB] : gk < 290 ? [b, gk - 200, RMR] : [c, gk - 290, RMC]);
  for (let gk = 0; gk < 360; gk++) {
    const [shot, k, RM] = shotOf(gk);
    if (LIMIT && k >= shot.N) continue;
    if (gk <= plan.revClick) {
      await moveTo(page, st, pathAt(keysA, gk));
      if (gk === plan.basketClick) { await page.mouse.click(st.x, st.y); st.click = true; }
      if (gk === plan.down) { await page.mouse.down(); st.down = true; }
      if (gk === plan.up) { await page.mouse.up(); st.down = false; }
      if (gk === plan.termClick) { await page.mouse.click(st.x, st.y); st.click = true; }
      if (gk === plan.amt + 1) { await page.mouse.click(st.x, st.y, { clickCount: 3 }); st.click = true; }
      if (gk === plan.type0) await page.keyboard.type('1');
      if (gk === plan.type0 + 3) await page.keyboard.type('0');
      if (gk === plan.type0 + 6) await page.keyboard.type('0');
      if (gk === plan.type0 + 9) await page.keyboard.type('0');
      if (gk === plan.revClick) { await page.mouse.click(st.x, st.y); st.click = true; }
    } else {
      if (gk === plan.revClick + 2) await page.waitForSelector('ol.stepper'); // review page: client navigation, settled by the virtual clock
      if (keysB === null && gk >= plan.revClick + 4) {
        const boxes = await page.locator('fieldset input[type=checkbox]').all();
        ackPos = []; for (const bx of boxes) ackPos.push(center(await bx.boundingBox()));
        confirmPos = center(await page.locator('button.btn-primary', { hasText: LIVE ? /./ : 'Run mock flow' }).last().boundingBox());
        const r0 = gk, T0 = Math.max(8, Math.ceil(0.9 * Math.sqrt(dist([st.x, st.y], ackPos[0]))));
        plan.ack = [r0 + T0, r0 + T0 + 8, r0 + T0 + 16];
        keysB = [[r0, st.x, st.y], [plan.ack[0], ...ackPos[0]], [plan.ack[0] + 2, ...ackPos[0]], [plan.ack[1], ...ackPos[1]], [plan.ack[1] + 2, ...ackPos[1]], [plan.ack[2], ...ackPos[2]], [plan.ack[2] + 2, ...ackPos[2]], [199, ...confirmPos], [330, ...confirmPos]];
        console.log('A1 review plan', JSON.stringify(plan.ack), 'confirm glide frames', 199 - plan.ack[2] - 2);
      }
      if (keysB) await moveTo(page, st, pathAt(keysB, gk));
      if (plan.ack && plan.ack.includes(gk)) { await page.mouse.click(st.x, st.y); st.click = true; }
      if (gk === 200) { await page.mouse.click(st.x, st.y); st.click = true; clickG = gk; }
    }
    if (LIVE && clickG !== null && gk > clickG) await pause(30);
    await frame(page, shot, k, st, RM);
    if (gk <= plan.revClick) { const v = Number(await page.inputValue('.fs-input').catch(() => NaN)); if (!isNaN(v)) { shot.reg[k].slider_thumb = { ...thumbFor(v), value: v }; shot.fd[k].floor = v; } }
    if (gk >= 134 && gk < 320 && page.url().includes('/confirmed') && !a.extra.confirmed_at_g) a.extra.confirmed_at_g = gk;
    if (gk === plan.revClick || gk === plan.revClick + 1 || gk === 289 || gk === 290) shot.extra['url_g' + gk] = page.url();
  }
  finalize(a, RMB, 'Route /app (example mode). One continuous session A1a+A1b+A1c (global frames 0-359, state carries over). A1a k0-7 hold, k8-22 glide, k22 real click basket QQQB (NVDAB + QQQB), k32-36 glide onto the 90 thumb, k36 mouse down, k36-66 eased drag to 85 (native range input snaps to whole percent), k66 up, k80 click term "6 months", k90 triple-click into Deposit, keys 1,0,0,0 at k94,98,102,106 (1000 USDT), k108-131 glide to Review, k132 real click on Review: client navigation to /app/review (basket, floor, term, amount carried in the URL). A1a k134-199 is therefore the REVIEW page: acknowledgement checkboxes clicked at k156, k164, k172, mouse glides to "Run mock flow" (k176-198), click at k200 (= A1b k0) starts the app\'s mock flow (stepper Approve USDT, Create position, about 3.4 s virtual); A1a ends on "Approving USDT...".', { slider_thumb_by_frame: a.reg.map((r) => r.slider_thumb || null), session_urls: a.extra });
  finalize(b, RMR, 'Route /app/review (example mode, same session, global frames 200-289). Continues the two-step stepper started by the click at A1b k0: Approving USDT, approval hash shown, Creating position, create hash shown. The mouse rests on the button. The app navigates to /app/confirmed at about A1c k10. Review page content (basket NVDAB + QQQB, 1,000.00 USDT, floor 850.00 USDT (85%), 6 months) is the user-chosen state from A1a. The UI itself says "Local dev mock: invented hashes, nothing is sent to BNB Chain." in example mode; keep that line out of crops or leave it, it is the real UI text.');
  finalize(c, RMC, 'Route /app/confirmed (example mode, same session, global frames 290-359): "Your floor is set.", vault 0x7a3f.. with the EXAMPLE badge, example transaction hash, floor 850.00 USDT, 6 months, first rebalance. Static hold; mouse rests at the old button position.');
  await ctx.close();
}

// ---------------------------------------------------------------- A2 position -> keeper (one session)
async function A2(browser) {
  const { ctx, page } = await newSession(browser);
  await open(page, '/app/position', '.tiles');
  const a = new Shot('A2a_position', 100), b = new Shot('A2b_keeper', 100);
  const RMA = {
    position_value: '.num-xl', floor_line: 'section[aria-labelledby=chart-h] line.floor-line', floor_tile: 'js:[...document.querySelectorAll(".tiles .tile, .tiles > div")].find(e=>/^\\s*Floor/i.test(e.textContent))', cushion: 'js:[...document.querySelectorAll(".tiles .tile, .tiles > div")].find(e=>/^\\s*Cushion/i.test(e.textContent))',
    tiles: '.tiles', value_chart: '#chart-h', chart_section: 'section[aria-labelledby=chart-h]', activity_panel: 'section[aria-label="Activity and holdings"]',
    nav_keeper_link: byText('header nav a', 'Keeper log'),
  };
  const RMK = {
    keeper_log_table: 'table.tbl', status_tiles: '.tiles', table_wrap: '.tbl-wrap', headline: 'h2, h1',
  };
  const R = async (sel) => (await measure(page, { r: sel })).r;
  const cush = center(await R(RMA.cushion)), flo = center(await R(RMA.floor_tile)), val = center(await R(RMA.position_value));
  const chartR = await R(RMA.chart_section); const chartPt = [chartR.x + chartR.w * 0.5, chartR.y + chartR.h * 0.55];
  const keeperLink = center(await R(RMA.nav_keeper_link));
  const park = [900, 130];
  // global 0-99 A2a, 100-199 A2b. A2a: hold 15, glide to Value 15-35, Floor 40-55, Cushion 58-72, glide to Keeper log 72-96, hold; click at 100 (A2b k0 +2)
  const keys = [[0, ...park], [4, ...park], [30, val[0] + 60, val[1]], [36, val[0] + 60, val[1]], [50, ...flo], [54, ...flo], [72, ...cush], [76, ...cush], [96, ...keeperLink], [102, ...keeperLink]];
  const st = { x: park[0], y: park[1], down: false };
  await page.mouse.move(...park);
  let tbl = null, kkeys = null;
  for (let gk = 0; gk < 200; gk++) {
    const shot = gk < 100 ? a : b, k = gk < 100 ? gk : gk - 100;
    if (gk <= 102) await moveTo(page, st, pathAt(keys, gk));
    if (gk === 102) { await page.mouse.click(st.x, st.y); st.click = true; }
    if (gk === 106) { await page.waitForSelector('table.tbl'); const t = await R(RMK.table_wrap); kkeys = [[106, st.x, st.y], [116, st.x, st.y], [150, 760, 400], [175, 760, 400], [199, 900, 520]]; }
    if (gk >= 106) await moveTo(page, st, pathAt(kkeys, gk));
    await frame(page, shot, k, st, gk < 100 ? RMA : RMK);
  }
  finalize(a, RMA, 'Route /app/position (example mode; the app\'s own EXAMPLE position). k0-7 hold, k8-35 eased glide over the value, k44-55 floor tile, k62-71 cushion tile, k78-95 glide to nav "Keeper log" (the click lands in A2b k2).');
  finalize(b, RMK, 'Route /app/keeper (example mode, same session; reached by really clicking the nav "Keeper log" link at A2b k2). Mouse then glides gently over the public log table.');
  await ctx.close();
}

// ---------------------------------------------------------------- G1 agents
async function G1(browser) {
  const { ctx, page } = await newSession(browser);
  await open(page, '/agents', 'table.tbl');
  const shot = new Shot('G1_agents', 160);
  const RM = { tool_list: 'table.tbl', tool_names_col: 'table.tbl tbody tr:first-child td:first-child', tabs: '[role=tablist]', headline: 'h1' };
  const tl = (await measure(page, { t: RM.tool_list })).t;
  const park = [900, 330];
  const keys = [[0, ...park], [30, ...park], [70, tl.x + 120, tl.y + 60], [100, tl.x + 120, tl.y + 60], [145, tl.x + 520, tl.y + tl.h * 0.6], [159, tl.x + 520, tl.y + tl.h * 0.6]];
  const st = { x: park[0], y: park[1], down: false };
  await page.mouse.move(...park);
  for (let k = 0; k < shot.N; k++) { await moveTo(page, st, pathAt(keys, k)); await frame(page, shot, k, st, RM); }
  finalize(shot, RM, 'Route /agents (example mode), default tab "MCP tools". k0-29 hold, glides over the tool list afterwards (hover only, no clicks).');
  await ctx.close();
}

// ---------------------------------------------------------------- main
const browser = await launch();
const run = { L1_landing: L1, T1_try: T1, A1, A2, G1_agents: G1 };
for (const name of WANT) {
  if (!run[name]) throw new Error('unknown shot ' + name);
  console.log('shot', name, new Date().toISOString());
  await run[name](browser);
}
await browser.close();
console.log('done');
