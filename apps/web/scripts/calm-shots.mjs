// Measure document height vs viewport and visible word count, and take screenshots, for the app pages.
// Usage: node scripts/calm-shots.mjs <baseUrl> <outJson> [shotsDir]   (no shotsDir: measure only, light theme)
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
// playwright-core is not a dependency of this repo: set PW_CORE to its install dir (e.g. .../node_modules/.pnpm/playwright-core@x/node_modules/playwright-core).
const { chromium } = require(process.env.PW_CORE ?? "playwright-core");
const [base, outJson, shotsDir] = process.argv.slice(2);
const exe = (() => { const d = join(homedir(), ".cache/ms-playwright"); const c = readdirSync(d).filter((x) => x.startsWith("chromium-")).sort().pop(); return join(d, c, "chrome-linux64/chrome"); })();

const sizes = [["1440", 1440, 900], ["1280", 1280, 720], ["375", 375, 812]];
const themes = shotsDir ? ["light", "dark"] : ["light"];
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const results = [];

async function vaultIds(page) {
  await page.goto(`${base}/app/positions`, { waitUntil: "networkidle" });
  return page.$$eval('a[href^="/app/position?v="]', (as) => [...new Set(as.map((a) => a.getAttribute("href").split("v=")[1]))]);
}
const probe = () => ({ docH: document.documentElement.scrollHeight, vh: innerHeight, words: (document.body.innerText.match(/\S+/g) || []).length });

for (const theme of themes) for (const [sn, w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, reducedMotion: "reduce" });
  await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} document.documentElement?.setAttribute("data-theme", t); }, theme);
  const page = await ctx.newPage();
  const ids = await vaultIds(page);
  const v = ids[0];
  const pages = [
    ["builder", "/app?assets=NVDAB,SPCXB,QQQB&floor=90&term=90&amount=10000"],
    ["review", "/app/review?assets=NVDAB,SPCXB,QQQB&floor=90&term=90&amount=10000"],
    ["confirmed", `/app/confirmed?vault=${v}&tx=0x${"ab".repeat(32)}&amount=10000&floor=9000&term=90&end=1791000000`],
    ["positions", "/app/positions"],
    ["position", `/app/position?v=${v}`],
    ["keeper", "/app/keeper"],
    ["agents", "/agents"],
    ["agents-run", "/agents/run"],
  ];
  for (const [name, path] of pages) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    const m = await page.evaluate(probe);
    results.push({ page: name, size: sn, theme, ...m });
    if (shotsDir) { mkdirSync(shotsDir, { recursive: true }); await page.screenshot({ path: join(shotsDir, `${name}-${sn}-${theme}.png`), fullPage: true }); }
    if (name === "position") {
      const btn = page.getByRole("button", { name: /Close to USDT/i }).first();
      if (await btn.count()) {
        await btn.click(); await page.waitForTimeout(500);
        const m2 = await page.evaluate(() => { const d = document.querySelector("dialog[open]"); const r = d?.getBoundingClientRect(); return { words: ((d?.innerText ?? "").match(/\S+/g) || []).length, docH: Math.round(r?.height ?? 0), vh: innerHeight, scrollH: d?.scrollHeight ?? 0 }; });
        results.push({ page: "close-modal", size: sn, theme, ...m2 });
        if (shotsDir) await page.screenshot({ path: join(shotsDir, `close-modal-${sn}-${theme}.png`) });
        await page.keyboard.press("Escape");
      }
    }
  }
  await ctx.close();
}
await browser.close();
writeFileSync(outJson, JSON.stringify(results, null, 1));
for (const r of results.filter((r) => r.theme === "light")) console.log(r.page.padEnd(12), r.size.padEnd(5), `docH ${r.docH} vh ${r.vh} words ${r.words}`, r.docH > r.vh ? "SCROLLS" : "fits");
