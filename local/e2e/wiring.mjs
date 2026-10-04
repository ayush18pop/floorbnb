// A22: one end-to-end script on the anvil fork (run `pnpm local:up`, or LOCAL_PORT_OFFSET=10000 for a second stack). Run: pnpm local:e2e:wiring
// Dev wallet -> builder (floor 85, 30 days, 2 assets) -> review -> sign -> confirmed -> waiting state -> keeper rebalances ->
// the open position page updates by itself -> keeper tile -> close to USDT -> second position -> exit in kind.
// Small JPEG screenshots go to apps/web/screenshots/wiring/ (6 at most). Transcript: stdout and local/logs/e2e-wiring.json.
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const SHOTS = resolve(ROOT, "apps/web/screenshots/wiring");
const OFF = Number(process.env.LOCAL_PORT_OFFSET ?? 0) || 0;
const BASE = `http://localhost:${3000 + OFF}`;
const RPC = `http://127.0.0.1:${8545 + OFF}`;
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const dep = JSON.parse(readFileSync(resolve(HERE, "../deployment.json"), "utf8"));
const env = { ...process.env, LOCAL_PORT_OFFSET: String(OFF) };
const cli = (args) => {
  try { return execSync(`pnpm --silent --filter @floor/local cli ${args}`, { cwd: ROOT, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { return String(e.stdout) + String(e.stderr); }
};
const rpc = async (method, params = []) => (await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json()).result;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chainTime = async () => Number((await rpc("eth_getBlockByNumber", ["latest", false])).timestamp);
const iso = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const usdtOf = async (a) => BigInt(await rpc("eth_call", [{ to: USDT, data: "0x70a08231000000000000000000000000" + a.slice(2) }, "latest"]));
const keeperPid = () => Number(readFileSync(resolve(ROOT, "local/.run/keeper.pid"), "utf8"));

mkdirSync(SHOTS, { recursive: true });
const report = { steps: [], console: [] };
const profile = resolve(ROOT, "local/.work/pw-profile-wiring");
rmSync(profile, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(profile, { executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome", args: ["--no-sandbox"], viewport: { width: 1100, height: 780 } });
const p = ctx.pages()[0] ?? (await ctx.newPage());
p.on("console", (m) => { if (["error"].includes(m.type())) report.console.push(`${m.type()} @${p.url().replace(BASE, "")}: ${m.text().slice(0, 200)}`); });
p.on("pageerror", (e) => report.console.push(`pageerror @${p.url().replace(BASE, "")}: ${e.message.slice(0, 160)}`));
const killer = setTimeout(() => { console.log("hard timeout"); try { process.kill(-keeperPid(), "SIGCONT"); } catch {} process.exit(2); }, 14 * 60_000);

const body = async () => (await p.innerText("body")).replace(/\s+/g, " ");
const shot = (name) => p.screenshot({ path: `${SHOTS}/${name}.jpg`, type: "jpeg", quality: 45 });
async function step(name, fn) {
  const t = Date.now();
  try { const note = await Promise.race([fn(), new Promise((_, rj) => setTimeout(() => rj(new Error("step timed out after 150 s")), 150_000))]); report.steps.push({ name, ok: true, note: note ?? "", s: Math.round((Date.now() - t) / 1000) }); console.log(`PASS ${name}${note ? " :: " + note : ""}`); }
  catch (e) { report.steps.push({ name, ok: false, note: String(e.message).split("\n")[0].slice(0, 300) }); console.log(`FAIL ${name} :: ${String(e.message).split("\n")[0].slice(0, 300)}`); }
}
const expectText = async (re, what, ms = 25_000) => {
  let b = ""; const t = Date.now();
  while (Date.now() - t < ms) { b = await body(); if (re.test(b)) return b; await sleep(1000); }
  throw new Error(`${what}: expected ${re}, page says: ${b.slice(100, 500)}`);
};
const setSlider = (v) => p.locator("input.fs-input").evaluate((el, val) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, String(val)); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, v);
const toggleAssets = async (want) => { // pick exactly `want` (symbols) in the basket
  for (const s of ["NVDAB", "SPCXB", "QQQB", "SPYB"]) {
    const b = p.locator(".basket button", { hasText: s }).first();
    if (!(await b.count())) continue;
    const on = (await b.getAttribute("aria-pressed")) === "true";
    if (want.includes(s) && !on) await b.click();
  }
  for (const s of ["NVDAB", "SPCXB", "QQQB", "SPYB"]) {
    const b = p.locator(".basket button", { hasText: s }).first();
    if (!(await b.count())) continue;
    if (!want.includes(s) && (await b.getAttribute("aria-pressed")) === "true") await b.click();
  }
};
async function buildAndCreate(assets, amount) {
  await p.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await toggleAssets(assets);
  await setSlider(85);
  await p.getByRole("button", { name: "1 month" }).click();
  await p.locator("#amount").fill(String(amount));
  await sleep(800);
}
async function signAndConfirm() {
  await p.getByRole("button", { name: /^Review/ }).click();
  await p.waitForURL(/review/);
  for (const c of await p.locator("input[type=checkbox]").all()) await c.check();
  await p.getByRole("button", { name: /Approve and create/ }).click();
  await p.waitForURL(/confirmed/, { timeout: 60000 });
  return /vault=(0x[0-9a-fA-F]{40})/.exec(p.url())[1];
}
const stocksPct = async () => { const m = /IN STOCKS (\d+)%/i.exec(await body()); return m ? Number(m[1]) : null; };

let vA, vB, ctAtStart;
await step("00 reset chain to the post-deploy snapshot", async () => { const o = cli("reset"); await sleep(2000); ctAtStart = await chainTime(); return `chain time ${new Date(ctAtStart * 1000).toISOString()} (browser clock ${new Date().toISOString().slice(0, 10)})`; });

await step("01 connect the dev wallet", async () => {
  await p.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Connect wallet" }).first().click();
  await p.getByText("Dev wallet").first().click();
  await expectText(/LOCAL DEV WALLET/, "badge");
  await expectText(/200\.00 USDT/, "balance read from the fork");
});

await step("02 builder: floor 85, 1 month, NVDAB + QQQB; minimum hint equals the validation", async () => {
  await buildAndCreate(["NVDAB", "QQQB"], 100);
  const b = await body();
  const hint = /Min ([\d.,]+)/.exec(b);
  if (!hint) throw new Error("no 'Min' hint next to the balance: " + b.slice(150, 400));
  const min = Number(hint[1].replace(/,/g, ""));
  // below the hinted minimum the validation must name the same trade minimum (6 USDT on this chain), at the hinted minimum it must pass
  await p.locator("#amount").fill(String(Math.max(1, min - 1)));
  await sleep(600);
  const bad = await body();
  if (!/6 USDT minimum trade/.test(bad)) throw new Error(`below min ${min - 1}: expected '6 USDT minimum trade', got: ${bad.slice(200, 600)}`);
  if (/\b20 USDT minimum trade/.test(bad)) throw new Error("page still mentions the 20 USDT default");
  await p.locator("#amount").fill(String(min)); await sleep(600);
  if (await p.getByRole("button", { name: /^Review/ }).isDisabled()) throw new Error(`Review disabled at the hinted minimum ${min}`);
  await p.locator("#amount").fill("100"); await sleep(500);
  if ((await p.locator("input.fs-input").inputValue()) !== "85") throw new Error("slider not at 85");
  await shot("01-builder");
  return `hint ${min} USDT; message at ${min - 1} says 6 USDT minimum trade`;
});

await step("03 review shows the term end in CHAIN time, then sign -> confirmed", async () => {
  await p.getByRole("button", { name: /^Review/ }).click();
  await p.waitForURL(/review/);
  const ct = await chainTime();
  const wantEnd = iso(ct + 30 * 86400);
  await expectText(new RegExp(`ends ${wantEnd}`), `term end ${wantEnd} (chain ${iso(ct)})`);
  await shot("02-review");
  for (const c of await p.locator("input[type=checkbox]").all()) await c.check();
  await p.getByRole("button", { name: /Approve and create/ }).click();
  await p.waitForURL(/confirmed/, { timeout: 60000 });
  vA = /vault=(0x[0-9a-fA-F]{40})/.exec(p.url())[1];
  await expectText(/Your floor is set/, "confirmed");
  return `vault ${vA}, term end ${wantEnd} (chain), browser date ${iso(Date.now() / 1000)}`;
});

let paused = false;
await step("04 fresh position: 'Waiting for the first rebalance' with the window, not a silent 0%", async () => {
  try { process.kill(-keeperPid(), "SIGSTOP"); paused = true; } catch {}
  await p.goto(`${BASE}/app/position?v=${vA}`, { waitUntil: "networkidle" });
  await expectText(/Waiting for the first rebalance/, "waiting banner");
  const b = await body();
  if (!/waiting for first rebalance/i.test(b)) throw new Error("In stocks tile has no 'waiting' note");
  const pc = await stocksPct();
  await expectText(/updated (just now|\d+s ago)/i, "updated-ago label");
  await shot("03-position-waiting");
  return `in stocks ${pc}%; ${(b.match(/Waiting for the first rebalance\.[^.]*\./) ?? [""])[0]}`;
});

await step("05 keeper rebalances; the OPEN page updates by itself (no reload) and 'updated Xs ago' moves", async () => {
  const before = await stocksPct();
  try { process.kill(-keeperPid(), "SIGCONT"); paused = false; } catch {}
  const o = cli("keeper once");
  await expectText(/Buy (NVDAB|QQQB)/, "buy shows in Activity without a reload", 40_000);
  const after = await stocksPct();
  if (!(after > 0)) throw new Error(`in stocks still ${after}%`);
  if (/Waiting for the first rebalance/.test(await body())) throw new Error("waiting banner did not clear");
  await shot("04-position-after-rebalance");
  return `in stocks ${before}% -> ${after}% with no reload`;
});

await step("06 keeper tile: Online with the last scan", async () => {
  await p.goto(`${BASE}/app/keeper`, { waitUntil: "networkidle" });
  await expectText(/Online/i, "keeper online");
  await expectText(/last scan \d+ (s|min) ago/, "last scan");
  await expectText(/BUY (NVDAB|QQQB)/, "buy row");
  await shot("05-keeper");
  return (await body()).match(/last scan \d+ (s|min) ago/)?.[0];
});

await step("07 close to USDT: request, keeper sells, close; shows the USDT received", async () => {
  const before = await usdtOf(dep.roles.user);
  await p.goto(`${BASE}/app/position?v=${vA}`, { waitUntil: "networkidle" }); await sleep(2000);
  await p.getByRole("button", { name: "Close to USDT" }).first().click(); await sleep(500);
  await p.getByRole("dialog").getByRole("button", { name: /^Request close$/ }).click();
  await expectText(/Close requested/, "request close");
  await p.getByRole("dialog").getByRole("button", { name: /^Close$/ }).last().click();
  cli("time +16m"); // the vault allows one trade per asset every 15 minutes (minInterval 900 s): wait it out on the chain clock
  cli("keeper once"); cli("keeper once"); // one keeper run sells one asset: two assets, two runs
  await p.goto(`${BASE}/app/position?v=${vA}`, { waitUntil: "networkidle" });
  await expectText(/Finish: Close to USDT/, "finish button", 40_000);
  await p.getByRole("button", { name: /Finish: Close to USDT/ }).click(); await sleep(500);
  await p.getByRole("dialog").getByRole("button", { name: /^Close to USDT$/ }).click();
  try { await expectText(/Your USDT was sent to your wallet/, "closed", 40_000); }
  catch (e) { const d = await p.getByRole("dialog").innerText().catch(() => "no dialog"); const o = cli("keeper dry"); throw new Error(`${e.message.slice(0, 80)} | dialog: ${d.replace(/\s+/g, " ").slice(0, 300)} | keeper dry: ${o.replace(/\s+/g, " ").slice(-300)}`); }
  const txt = await p.locator('[data-testid="exit-received"]').innerText();
  const m = /You received ([\d,.]+) USDT/.exec(txt);
  if (!m) throw new Error("no 'You received X USDT': " + txt);
  const got = Number(m[1].replace(/,/g, ""));
  const delta = Number(((await usdtOf(dep.roles.user)) - before) / 10n ** 16n) / 100;
  if (Math.abs(got - delta) > 0.02) throw new Error(`modal says ${got} USDT, wallet received ${delta}`);
  await p.keyboard.press("Escape");
  await p.goto(`${BASE}/app/position?v=${vA}`, { waitUntil: "networkidle" });
  const b = await expectText(/This position is closed/, "closed banner");
  if (/−100\.00%/.test(b)) throw new Error("closed page still shows -100%");
  return `received ${got} USDT (wallet +${delta}); closed page: ${(b.match(/[\d.,]+ USDT was sent[^.]*\./) ?? [""])[0]}`;
});

await step("08 second position then exit in kind: stocks received with amounts and value, total, no -100%", async () => {
  await buildAndCreate(["NVDAB", "QQQB"], 100);
  vB = await signAndConfirm();
  cli("keeper once");
  await p.goto(`${BASE}/app/position?v=${vB}`, { waitUntil: "networkidle" });
  await expectText(/Buy (NVDAB|QQQB)/, "buy in activity", 40_000);
  await p.getByText(/Exit in kind/).first().click(); await sleep(500);
  await p.getByRole("dialog").getByRole("button", { name: /^Exit in kind$/ }).click();
  await expectText(/Done\./, "done");
  const txt = await p.locator('[data-testid="exit-received"]').innerText();
  if (!/(NVDAB|QQQB) \(≈ [\d.,]+ USDT at the 10-minute average\)/.test(txt) || !/Total ≈ [\d.,]+ USDT/.test(txt)) throw new Error("exit summary lacks tokens or total: " + txt);
  await shot("06-exit-in-kind");
  await p.keyboard.press("Escape");
  await p.goto(`${BASE}/app/position?v=${vB}`, { waitUntil: "networkidle" });
  const b = await expectText(/This position is closed/, "closed banner");
  if (/−100\.00%|VALUE 0\.00/i.test(b)) throw new Error("closed page shows 0.00 / -100%: " + b.slice(150, 400));
  if (!/You received .*NVDAB|You received .*QQQB/.test(b)) throw new Error("closed banner does not list the stocks: " + b.slice(150, 500));
  return txt.slice(0, 200);
});

if (paused) { try { process.kill(-keeperPid(), "SIGCONT"); } catch {} }
clearTimeout(killer);
await ctx.close();
report.console = [...new Set(report.console)];
writeFileSync(resolve(ROOT, "local/logs/e2e-wiring.json"), JSON.stringify(report, null, 2));
console.log("\n== console errors ==\n" + (report.console.join("\n") || "none"));
console.log(`\n${report.steps.filter((s) => s.ok).length}/${report.steps.length} steps passed`);
process.exit(report.steps.every((s) => s.ok) ? 0 : 1);
