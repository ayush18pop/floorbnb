// Headless end-to-end click-through of the real UX against the local stack (pnpm local:up). Run: pnpm local:e2e
// It resets the chain to the post-deploy snapshot first. Screenshots: local/screens/*.jpg. Issues: printed and written to local/logs/e2e-report.json
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const SCREENS = resolve(HERE, "../screens");
const BASE = "http://localhost:3000";
const RPC = "http://127.0.0.1:8545";
const dep = JSON.parse(readFileSync(resolve(HERE, "../deployment.json"), "utf8"));
const cli = (args) => {
  try { return execSync(`pnpm --silent --filter @floor/local cli ${args}`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { throw new Error(`cli ${args} failed: ${String(e.stderr || e.stdout).split("\n").filter((l) => /ERROR|Error/.test(l))[0] ?? e.message}`); }
};
const rpc = async (method, params = []) => (await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json()).result;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(SCREENS, { recursive: true });
const report = { steps: [], console: [] };
const profile = resolve(ROOT, "local/.work/pw-profile");
rmSync(profile, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(profile, { executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome", args: ["--no-sandbox"], viewport: { width: 1100, height: 780 } });
const p = ctx.pages()[0] ?? (await ctx.newPage());
p.on("console", (m) => { if (["error", "warning"].includes(m.type()) && !/scroll-behavior/.test(m.text())) report.console.push(`${m.type()} @${p.url().replace(BASE, "")}: ${m.text().slice(0, 200)}`); });
p.on("pageerror", (e) => report.console.push(`pageerror @${p.url().replace(BASE, "")}: ${e.message.slice(0, 160)}`));
const killer = setTimeout(() => { console.log("hard timeout"); process.exit(2); }, 14 * 60_000);

const body = async () => (await p.innerText("body")).replace(/\s+/g, " ");
const shot = (name, full = false) => p.screenshot({ path: `${SCREENS}/${name}.jpg`, type: "jpeg", quality: 50, fullPage: full });
async function step(name, fn) {
  if (process.env.ONLY && !process.env.ONLY.split(",").includes(name.slice(0, 2))) return; // e.g. ONLY=01,11 runs just those steps
  const t = Date.now();
  try { const note = await fn(); report.steps.push({ name, ok: true, note: note ?? "", s: Math.round((Date.now() - t) / 1000) }); console.log(`PASS ${name}${note ? " :: " + note : ""}`); }
  catch (e) { report.steps.push({ name, ok: false, note: String(e.message).split("\n")[0].slice(0, 220) }); console.log(`FAIL ${name} :: ${String(e.message).split("\n")[0]}`); try { await shot("fail-" + name.replace(/\W+/g, "-").slice(0, 40)); } catch {} }
}
const expectText = async (re, what, ms = 25_000) => {
  let b = ""; const t = Date.now();
  while (Date.now() - t < ms) { b = await body(); if (re.test(b)) return; await sleep(1000); }
  throw new Error(`${what}: expected ${re}, page says: ${b.slice(150, 450)}`);
};
async function until(what, fn, ms = 150_000) { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(2500); } throw new Error(`timeout waiting for ${what}`); }
const lastKeeperLog = (re) => { try { return readFileSync(resolve(ROOT, "local/logs/keeper.log"), "utf8").split("\n").filter((l) => re.test(l)); } catch { return []; } };

async function openFirstDetail(idx = 0) {
  await p.goto(`${BASE}/app/positions`, { waitUntil: "networkidle" });
  await p.waitForSelector('a[href*="/app/position?v="]', { timeout: 20000 });
  await p.locator('a[href*="/app/position?v="]').nth(idx).click();
  await p.waitForSelector("text=Holdings", { timeout: 20000 }).catch(() => {});
  await sleep(1500);
}
async function createPosition(symbol, amount) {
  await p.goto(`${BASE}/app?assets=${symbol}&floor=90&amount=${amount}`, { waitUntil: "networkidle" });
  await sleep(1500);
  await p.getByRole("button", { name: /^Review/ }).click();
  await p.waitForURL(/review/);
  for (const c of await p.locator("input[type=checkbox]").all()) await c.check();
  const go = p.getByRole("button", { name: /Approve and create|Create position/ });
  if (await go.isDisabled()) throw new Error("create button disabled");
  await go.click();
  await p.waitForURL(/confirmed/, { timeout: 60000 });
  const m = /vault=(0x[0-9a-fA-F]{40})/.exec(p.url());
  return m[1];
}
const keeperOnce = () => { try { return execSync(`pnpm --silent --filter @floor/local cli keeper once`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { return String(e.stdout) + String(e.stderr); } };
const exposurePct = async () => { await p.reload({ waitUntil: "networkidle" }); await sleep(2000); const b = await body(); const m = /IN STOCKS (\d+)%/i.exec(b); return m ? Number(m[1]) : null; };

await step("00 reset chain to snapshot", async () => { const o = cli("reset"); await sleep(1500); return o.trim().split("\n").pop(); });

let v1, v2, v3;
await step("01 connect dev wallet", async () => {
  await p.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Connect wallet" }).first().click();
  await p.waitForTimeout(600);
  await shot("01-connect-modal");
  await p.getByText("Dev wallet").first().click();
  await expectText(/LOCAL DEV WALLET/, "badge");
  await until("USDT balance", async () => /Balance: 200\.00 USDT|You have 200\.00 USDT/.test(await body()), 20000);
  await shot("02-builder-connected");
  return "badge + 200.00 USDT balance read from the fork";
});

await step("02 builder -> review (NVDAB, 55 USDT, floor 90%)", async () => {
  await p.locator("#amount").fill("55");
  await p.getByRole("button", { name: /^Review/ }).click();
  await p.waitForURL(/review/);
  await expectText(/55\.00 USDT/, "deposit"); await expectText(/49\.50 USDT \(90%\)/, "floor");
  await shot("03-review");
});

await step("03 approve + create position -> Confirmed", async () => {
  for (const c of await p.locator("input[type=checkbox]").all()) await c.check();
  await p.getByRole("button", { name: /Approve and create/ }).click();
  await p.waitForURL(/confirmed/, { timeout: 60000 });
  v1 = /vault=(0x[0-9a-fA-F]{40})/.exec(p.url())[1];
  await expectText(/Your floor is set/, "confirmed");
  await shot("04-confirmed");
  return `vault ${v1}`;
});

await step("04 positions list + detail show chain data", async () => {
  await p.goto(`${BASE}/app/positions`, { waitUntil: "networkidle" }); await sleep(2500);
  await expectText(/55\.00/, "deposit in list"); await shot("05-positions");
  await openFirstDetail();
  await expectText(/FLOOR 49\.50|49\.50/, "floor"); await expectText(/55\.00 USDT|Deposit/, "activity deposit");
  await shot("06-detail-before-keeper", true);
  return (await body()).match(/VALUE ([\d.]+)/i)?.[0];
});

await step("05 keeper buys inside the window (Rebalanced event, keeper log)", async () => {
  const before = lastKeeperLog(/"event":"rebalanced"/).length;
  await until("keeper buy", async () => lastKeeperLog(/"event":"rebalanced"/).length > before, 130_000);
  await openFirstDetail();
  await expectText(/Buy NVDAB/, "activity shows the buy");
  const pct = (await body()).match(/IN STOCKS (\d+)%/i)?.[1];
  await shot("07-detail-after-buy", true);
  return `in stocks ${pct}% (target 40% at deposit 55, floor 90%)`;
});

await step("06 scenario crash NVDAB 15 -> keeper sells -> detail updates", async () => {
  const out = cli("scenario crash NVDAB 15"); const priceLine = out.split("\n").find((l) => l.startsWith("NVDAB"));
  const before = lastKeeperLog(/"event":"rebalanced"/).length;
  await until("keeper sell", async () => lastKeeperLog(/"event":"rebalanced"/).length > before, 130_000);
  await openFirstDetail();
  await expectText(/Sell [\d.]+ NVDAB/, "activity shows a sell");
  await shot("08-detail-after-crash", true);
  return `${priceLine}; ${(await body()).match(/IN STOCKS (\d+)%/i)?.[0]}`;
});

await step("07 keeper page lists the rebalances", async () => {
  await p.goto(`${BASE}/app/keeper`, { waitUntil: "networkidle" }); await sleep(3500);
  await expectText(/BUY NVDAB/, "buy row"); await expectText(/SELL NVDAB/, "sell row");
  await shot("09-keeper-log");
  return (await body()).match(/KEEPER (ONLINE|OFFLINE)/i)?.[0];
});

await step("08 weekend: banner and disabled trading", async () => {
  cli("time weekend");
  await openFirstDetail();
  await expectText(/Market closed/i, "banner"); await expectText(/does not trade on weekends/i, "weekend text");
  await shot("10-weekend-banner");
  cli("time closed"); await openFirstDetail(); await expectText(/Market closed/i, "closed banner"); await shot("11-closed-after-hours");
  cli("time window");
  return "weekend + after-hours banners shown; window restored";
});

await step("09 second position (QQQB 55) then Exit in kind", async () => {
  v2 = await createPosition("QQQB", 55);
  await until("keeper buys QQQB", async () => { const k = lastKeeperLog(/"event":"rebalanced"/).filter((l) => l.includes(v2)); return k.length > 0; }, 130_000);
  await p.goto(`${BASE}/app/position?v=${v2}`, { waitUntil: "networkidle" }); await sleep(2500);
  await p.getByText(/Exit in kind/).first().click(); await sleep(700);
  await shot("12-exit-in-kind-modal");
  await p.getByRole("dialog").getByRole("button", { name: /^Exit in kind$/ }).click();
  await expectText(/Done\./, "done notice"); await expectText(/This position is closed/, "closed state");
  await shot("13-exit-in-kind-done");
  return (await body()).match(/Done\.[^.]*\./)?.[0];
});

await step("10 Close to USDT: request, keeper sells, close, USDT back in wallet", async () => {
  const usdtBefore = BigInt(await rpc("eth_call", [{ to: "0x55d398326f99059fF775485246999027B3197955", data: "0x70a08231000000000000000000000000" + dep.roles.user.slice(2) }, "latest"]));
  await p.goto(`${BASE}/app/position?v=${v1}`, { waitUntil: "networkidle" }); await sleep(2500);
  await p.getByRole("button", { name: "Close to USDT" }).first().click(); await sleep(600);
  await shot("14-close-modal");
  await p.getByRole("dialog").getByRole("button", { name: /^Request close$/ }).click();
  await expectText(/Close requested/, "request confirmation stays visible"); await shot("15-close-requested");
  await p.getByRole("dialog").getByRole("button", { name: /^Close$/ }).last().click();
  const before = lastKeeperLog(/"event":"rebalanced"/).length;
  await until("keeper sells the stock", async () => lastKeeperLog(/"event":"rebalanced"/).length > before, 130_000);
  await p.goto(`${BASE}/app/position?v=${v1}`, { waitUntil: "networkidle" }); await sleep(2500);
  await expectText(/Finish: Close to USDT/, "finish button");
  await p.getByRole("button", { name: /Finish: Close to USDT/ }).click(); await sleep(600);
  await p.getByRole("dialog").getByRole("button", { name: /^Close to USDT$/ }).click();
  await expectText(/Your USDT was sent to your wallet/, "closed to USDT"); await shot("16-closed-to-usdt");
  const usdtAfter = BigInt(await rpc("eth_call", [{ to: "0x55d398326f99059fF775485246999027B3197955", data: "0x70a08231000000000000000000000000" + dep.roles.user.slice(2) }, "latest"]));
  return `wallet USDT +${(Number(usdtAfter - usdtBefore) / 1e18).toFixed(2)}`;
});

await step("11 deep crash -> cash lock (fresh chain: a 26% gap on a 40%-stock position; beyond ~27% the NVDAB pool is below minLiquidity and the vault cannot trade)", async () => {
  cli("reset"); await sleep(2000); // earlier crashes thinned the NVDAB pool; start from the clean fork so the pool is still liquid after the gap
  v3 = await createPosition("NVDAB", 55);
  const base = lastKeeperLog(/"event":"rebalanced"/).length;
  await until("keeper buys", async () => lastKeeperLog(/"event":"rebalanced"/).filter((l) => l.includes(v3)).length > 0, 130_000);
  const out = cli("scenario crash NVDAB 26"); const priceLine = out.split("\n").find((l) => l.startsWith("NVDAB"));
  const b2 = lastKeeperLog(/"event":"rebalanced"/).length;
  await until("keeper sells all", async () => lastKeeperLog(/"event":"rebalanced"/).length > b2, 130_000);
  await p.goto(`${BASE}/app/position?v=${v3}`, { waitUntil: "networkidle" }); await sleep(3000);
  await shot("17-cash-lock", true);
  const b = await body();
  if (!/Cash lock/i.test(b)) throw new Error("no Cash lock notice. Page: " + b.slice(150, 600));
  return `${priceLine}; ${b.match(/Cash lock[^.]*\./i)?.[0]}`;
});

clearTimeout(killer);
await ctx.close();
report.console = [...new Set(report.console)];
writeFileSync(resolve(ROOT, "local/logs/e2e-report.json"), JSON.stringify(report, null, 2));
console.log("\n== console issues ==\n" + (report.console.join("\n") || "none"));
console.log(`\n${report.steps.filter((s) => s.ok).length}/${report.steps.length} steps passed`);
process.exit(report.steps.every((s) => s.ok) ? 0 : 1);
