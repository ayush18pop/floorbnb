import { open } from "./lib.mjs";
const { ctx, p } = await open();
p.on("pageerror", (e) => console.log("FULL:", e.message.slice(1800, 4200)));
await p.goto(process.argv[2] ?? "http://localhost:3000/app", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
await ctx.close();
