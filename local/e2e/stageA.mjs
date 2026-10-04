import { open, text, SCRATCH } from "./lib.mjs";
const { ctx, p } = await open();
const shot = (n) => p.screenshot({ path: `${SCRATCH}/${n}.png` });
await p.goto("http://localhost:3000/app", { waitUntil: "networkidle" });
if (await p.getByRole("button", { name: "Connect wallet" }).count()) {
  await p.getByRole("button", { name: "Connect wallet" }).first().click();
  await p.getByText("Dev wallet").first().click();
}
await p.waitForTimeout(2000);
await p.locator("#amount").fill("55");
await p.waitForTimeout(500);
await p.getByRole("button", { name: /^Review/ }).click();
await p.waitForURL(/review/);
for (const c of await p.locator('input[type=checkbox]').all()) await c.check();
await shot("a-review");
const btn = p.getByRole("button", { name: /Approve and create|Create position/ });
console.log("button:", await btn.textContent(), "disabled:", await btn.isDisabled());
await btn.click();
await p.waitForTimeout(6000);
await shot("a-after");
console.log(p.url());
console.log((await text(p, 2500)).slice(-1500));
await p.waitForTimeout(8000);
console.log(p.url());
console.log((await text(p, 2500)));
await shot("a-final");
await ctx.close();
