import { open, text, SCRATCH } from "./lib.mjs";
const { ctx, p } = await open();
await p.goto("http://localhost:3000/app/keeper", { waitUntil: "networkidle" });
await p.waitForTimeout(3500);
console.log((await text(p, 3000)).slice(100));
await p.screenshot({ path: `${SCRATCH}/c-keeper.png` });
await ctx.close();
