import { chromium } from "playwright-core";
export const SCRATCH = "/tmp/claude-1001/-home-hyprayush-Documents-Projects/02424c9d-833b-416a-9442-3d67076208de/scratchpad";
export const exe = process.env.HOME + "/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
export async function open(userDir = SCRATCH + "/pwprofile") {
  const ctx = await chromium.launchPersistentContext(userDir, { executablePath: exe, args: ["--no-sandbox"], viewport: { width: 1280, height: 900 } });
  const p = ctx.pages()[0] ?? (await ctx.newPage());
  const issues = [];
  p.on("console", (m) => { if (["error", "warning"].includes(m.type())) { const t = m.text().slice(0, 300); issues.push(`${m.type()}: ${t}`); console.log("CONSOLE", m.type(), t); } });
  p.on("pageerror", (e) => { issues.push("pageerror: " + e.message.slice(0, 300)); console.log("PAGEERROR", e.message.slice(0, 300)); });
  p.on("requestfailed", (r) => console.log("REQFAIL", r.url().slice(0, 100), r.failure()?.errorText));
  return { ctx, p, issues };
}
export const text = async (p, n = 2500) => (await p.innerText("body")).slice(0, n);
