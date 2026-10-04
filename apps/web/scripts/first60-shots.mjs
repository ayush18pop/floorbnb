// Screenshots + fit check for /try. Usage: PW_CORE=<playwright-core dir> node scripts/first60-shots.mjs <baseUrl> <outDir>
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(resolve(process.env.PW_CORE));
const [base, out] = process.argv.slice(2);
const d = join(homedir(), ".cache/ms-playwright");
const exe = join(d, readdirSync(d).filter((x) => x.startsWith("chromium-")).sort().pop(), "chrome-linux64/chrome");
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
for (const theme of ["light", "dark"]) for (const [n, w, h] of [["1440", 1440, 900], ["1280", 1280, 720], ["375", 375, 812]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, reducedMotion: "reduce" });
  await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} document.documentElement?.setAttribute("data-theme", t); }, theme);
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(`${base}/try`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="vault"]');
  const ttn = Date.now() - t0;
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => ({ docH: document.documentElement.scrollHeight, vh: innerHeight, hold: document.querySelector('[data-testid=hold]').textContent, vault: document.querySelector('[data-testid=vault]').textContent }));
  console.log(theme, n, JSON.stringify(m), "firstNumberMs", ttn);
  await page.screenshot({ path: join(out, `try-${n}-${theme}.png`) });
  if (theme === "light" && n === "1440") {
    await page.getByRole("button", { name: "COVID crash" }).click();
    await page.waitForTimeout(300);
    console.log("covid", await page.evaluate(() => [document.querySelector('[data-testid=hold]').textContent, document.querySelector('[data-testid=vault]').textContent]));
    await page.screenshot({ path: join(out, `try-1440-light-covid.png`) });
    await page.getByRole("button", { name: "Read the full risks" }).click();
    await page.waitForTimeout(300);
    console.log("drawer", await page.locator("dialog[open]").count());
  }
  await ctx.close();
}
await browser.close();
