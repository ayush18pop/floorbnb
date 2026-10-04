import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, http } from "viem";
import { ASSETS, CHAIN_ID, FORK_RPCS, LOGS, PORTS, ROLE, ROOT, RPC, RUN, acct, DEPLOYMENT_FILE, type Deployment } from "./env";
import { deployAll, keyHex } from "./deploy";
import { scenario } from "./scenario";
import { chainNow, inWindow, nextDowAt, timeCmd, warpTo } from "./time";
import { client, httpOk, loadDeployment, pidOf, rpc, saveDeployment, sleep, startService, stopService, waitFor } from "./util";

const SERVICES = ["anvil", "api", "keeper", "mcp", "web"] as const;
const say = (s: string) => console.log(s);
const utc = (t: number) => new Date(t * 1000).toUTCString().replace("GMT", "UTC");

async function up(opts: { noWeb: boolean }) {
  if (SERVICES.some((s) => pidOf(s))) throw new Error("The stack is already running. `pnpm local:down` first (or `pnpm local:status`).");
  if (spawnSync("anvil", ["--version"]).status !== 0) throw new Error("anvil not found: install Foundry (https://getfoundry.sh)");
  mkdirSync(RUN, { recursive: true });

  // 1. anvil forking BSC mainnet, chain id 31337, a block every 2 s so chain time keeps moving after a warp
  // BSC_FORK_RPC_URL (env only, e.g. a private Alchemy URL) wins; LOCAL_FORK_RPC is the older name; else the public archive endpoints.
  // The URL may contain a key: it is passed to anvil as --fork-url (anvil has no env var for it, so it is visible in `ps` to your own user), and never printed or saved.
  const fromEnv = process.env.BSC_FORK_RPC_URL || process.env.LOCAL_FORK_RPC;
  const forks = fromEnv ? [fromEnv] : FORK_RPCS;
  let forkRpc = "";
  let forkLabel = "";
  for (const f of forks) {
    forkLabel = fromEnv ? "BSC_FORK_RPC_URL (from env, not shown)" : new URL(f).host;
    say(`anvil: forking BSC from ${forkLabel}`);
    startService("anvil", "anvil", ["--fork-url", f, "--port", String(PORTS.anvil), "--chain-id", String(CHAIN_ID), "--block-time", "2", "--retries", "8", "--timeout", "120000", "--no-rate-limit", "--silent"], { cwd: ROOT });
    try { await waitFor("anvil", async () => (await rpc<string>("eth_chainId")) === "0x7a69", 90); forkRpc = forkLabel; break; } catch { stopService("anvil"); }
  }
  if (!forkRpc) throw new Error("anvil could not fork any BSC RPC. Set BSC_FORK_RPC_URL to an archive-capable endpoint.");
  const forkBlock = Number(await rpc<string>("eth_blockNumber").then(BigInt));
  say(`anvil up on ${RPC} (chain ${CHAIN_ID}), fork block ${forkBlock}, chain time ${utc(await chainNow())}`);

  // 2-3. deploy with the audited scripts, fund
  const dep = await deployAll(say);

  // time: next Tuesday 16:00 UTC (trading window open)
  const now = await chainNow();
  const t = await warpTo(nextDowAt(now, 2, 16, 0));
  say(`clock set to ${utc(t)} (inside the Mon-Fri 15:30-19:30 UTC window)`);

  const roles = Object.fromEntries(Object.entries(ROLE).map(([k, i]) => [k, acct(i).address])) as Deployment["roles"];
  const snap = await rpc<string>("evm_snapshot");
  const d: Deployment = { chainId: CHAIN_ID, rpc: RPC, forkRpc, forkBlock, deployBlock: dep.deployBlock, factory: dep.factory, lens: dep.lens, vaultImpl: dep.vaultImpl, roles, startedAt: new Date().toISOString(), snapshot: snap };
  saveDeployment(d);

  // 4. services
  const env = serviceEnv(d);
  startService("api", "pnpm", ["exec", "tsx", "src/server.ts"], { cwd: resolve(ROOT, "apps/api"), env: env.api });
  await waitFor("api", httpOk(`http://127.0.0.1:${PORTS.api}/healthz`), 40);
  startService("keeper", "pnpm", ["exec", "tsx", "src/bin.ts", "run", "--route", "direct"], { cwd: resolve(ROOT, "apps/keeper"), env: { ...env.keeper, KEEPER_PRIVATE_KEY: await keyHex(ROLE.keeper) } });
  startService("mcp", "pnpm", ["exec", "tsx", "src/server.ts"], { cwd: resolve(ROOT, "apps/mcp"), env: env.mcp });
  if (!opts.noWeb) startService("web", "pnpm", ["exec", "next", "dev", "-p", String(PORTS.web)], { cwd: resolve(ROOT, "apps/web"), env: env.web });
  await sleep(1500);
  if (!opts.noWeb) await waitFor("web", httpOk(`http://127.0.0.1:${PORTS.web}/app`), 120);
  summary(d);
}

/** Env for each service. Only public dev addresses; the keeper key is derived from the public anvil mnemonic at start. */
function serviceEnv(d: Deployment) {
  const assets = ASSETS.map((a) => a.token).join(",");
  const common = { FLOOR_CHAIN_ID: String(CHAIN_ID), FLOOR_FACTORY: d.factory, FLOOR_LENS: d.lens };
  return {
    api: { ...common, FLOOR_RPC_URL: RPC, FLOOR_RUNS_FROM_BLOCK: String(d.deployBlock), PORT: String(PORTS.api), WEB_ORIGIN: `http://localhost:${PORTS.web},http://127.0.0.1:${PORTS.web}` },
    keeper: { BSC_RPC_URL: RPC, FLOOR_FACTORY: d.factory, FLOOR_LENS: d.lens, KEEPER_ADDRESS: d.roles.keeper, FLOOR_ASSETS: assets, KEEPER_INTERVAL_SEC: "60", KEEPER_ROUTE: "direct" },
    mcp: { API_BASE_URL: `http://127.0.0.1:${PORTS.api}`, MCP_PORT: String(PORTS.mcp) },
    web: {
      NEXT_PUBLIC_APP_LOCKED: "0", APP_LOCKED: "0", NEXT_PUBLIC_LOCAL_DEV: "1", NEXT_PUBLIC_DATA_SOURCE: "chain", NEXT_PUBLIC_RPC_URL: RPC, NEXT_PUBLIC_API_URL: `http://127.0.0.1:${PORTS.api}`,
      NEXT_PUBLIC_MCP_URL: `http://127.0.0.1:${PORTS.mcp}/mcp`, NEXT_PUBLIC_FACTORY_ADDRESS: d.factory, NEXT_PUBLIC_LENS_ADDRESS: d.lens,
      NEXT_PUBLIC_DEPLOY_BLOCK: String(d.deployBlock), NEXT_PUBLIC_LOCAL_USER: d.roles.user, NEXT_TELEMETRY_DISABLED: "1",
    },
  };
}

function summary(d: Deployment) {
  say(`
================ FLOOR LOCAL STACK (anvil fork of BSC, chain ${CHAIN_ID}; nothing touches a real network) ================
Web      http://localhost:${PORTS.web}/app      (Dev wallet button = LOCAL DEV WALLET, no MetaMask needed)
API      http://127.0.0.1:${PORTS.api}/v1/keeper/status      MCP  http://127.0.0.1:${PORTS.mcp}/mcp      RPC  ${RPC}
Factory  ${d.factory}
Lens     ${d.lens}
Roles    owner ${d.roles.owner}  guardian ${d.roles.guardian}  keeper ${d.roles.keeper} (loop, 60 s)  keeper2 ${d.roles.keeper2} (manual)
Demo user ${d.roles.user}  (anvil account #4, public dev key; 200 USDT + 10 BNB)
Clock    chain time is a Tuesday 16:00 UTC trading window; \`pnpm local:time\` shows it
Router   direct PancakeSwap only (aggregator disabled)      Logs  local/logs/*.log   (pnpm local:logs [svc])

5 flows to try
 1. Create:  /app -> Dev wallet -> Set floor (NVDAB, 55 USDT, floor 90%) -> Review -> approve USDT -> create -> Confirmed
 2. Watch:   /app/positions -> position detail (value, floor, cushion, split); keeper buys within 60 s (pnpm local:logs keeper)
 3. Crash:   pnpm local:scenario crash NVDAB 15   -> keeper sells; detail updates (pnpm local:keeper once to force it)
 4. Closed:  pnpm local:time weekend  (or closed) -> banner / disabled trading state; pnpm local:time window to reopen
 5. Exit:    close modal: Close to USDT (needs a keeper sell) and Exit in kind; pnpm local:reset returns to the clean snapshot
`);
}

async function down() {
  for (const s of [...SERVICES].reverse()) { const was = stopService(s); say(`${s}: ${was ? "stopped" : "not running"}`); }
}

async function status() {
  const rows: string[] = [];
  for (const s of SERVICES) rows.push(`${s.padEnd(7)} ${pidOf(s) ? "running pid " + pidOf(s) : "stopped"}`);
  say(rows.join("\n"));
  if (!pidOf("anvil")) return;
  const d = loadDeployment(); const t = await chainNow();
  say(`chain    block ${await client.getBlockNumber()}  time ${utc(t)}  window ${inWindow(t) ? "OPEN" : "closed"}`);
  say(`factory  ${d.factory}   deployed at block ${d.deployBlock}`);
  const probe = async (n: string, u: string) => say(`${n.padEnd(8)} ${await fetch(u).then((r) => `HTTP ${r.status}`).catch(() => "no answer")}  ${u}`);
  await probe("api", `http://127.0.0.1:${PORTS.api}/healthz`);
  await probe("web", `http://127.0.0.1:${PORTS.web}/app`);
  await probe("mcp", `http://127.0.0.1:${PORTS.mcp}/healthz`);
}

function logs(svc?: string) {
  const files = (svc ? [svc] : [...SERVICES]).map((s) => resolve(LOGS, `${s}.log`)).filter(existsSync);
  if (!files.length) throw new Error("no log files yet");
  spawn("tail", ["-n", "40", "-F", ...files], { stdio: "inherit" });
}

async function keeperCmd(sub: string | undefined) {
  const d = loadDeployment();
  const e = serviceEnv(d).keeper;
  const args = ["exec", "tsx", "src/bin.ts", "once", "--route", "direct", ...(sub === "dry" ? ["--dry-run"] : [])];
  const r = spawnSync("pnpm", args, { cwd: resolve(ROOT, "apps/keeper"), stdio: "inherit", env: { ...process.env, ...e, KEEPER_ADDRESS: d.roles.keeper2, KEEPER_PRIVATE_KEY: await keyHex(ROLE.keeper2) } });
  process.exitCode = r.status ?? 1;
}

async function restartKeeper(d: Deployment) {
  stopService("keeper");
  startService("keeper", "pnpm", ["exec", "tsx", "src/bin.ts", "run", "--route", "direct"], { cwd: resolve(ROOT, "apps/keeper"), env: { ...serviceEnv(d).keeper, KEEPER_PRIVATE_KEY: await keyHex(ROLE.keeper) } });
}

async function reset() {
  const d = loadDeployment();
  const ok = await rpc<boolean>("evm_revert", [d.snapshot]);
  if (!ok) throw new Error("evm_revert failed: snapshot is gone (anvil restarted?). Run `pnpm local:down && pnpm local:up`.");
  d.snapshot = await rpc<string>("evm_snapshot");
  saveDeployment(d);
  // The keeper keeps a local nonce counter; after a revert it is ahead of the chain and its txs would never mine. Restart it.
  if (pidOf("keeper")) await restartKeeper(d);
  say(`reverted to the post-deploy snapshot; chain time ${utc(await chainNow())}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const run = async () => {
  switch (cmd) {
    case "up": return up({ noWeb: rest.includes("--no-web") });
    case "down": return down();
    case "status": return status();
    case "logs": return logs(rest[0]);
    case "time": return timeCmd(rest[0]);
    case "scenario": return scenario(rest[0] ?? "", rest[1], rest[2]);
    case "keeper": return keeperCmd(rest[0]);
    case "reset": return reset();
    case "web": { const d = loadDeployment(); stopService("web"); startService("web", "pnpm", ["exec", "next", "dev", "-p", String(PORTS.web)], { cwd: resolve(ROOT, "apps/web"), env: serviceEnv(d).web }); await waitFor("web", httpOk(`http://127.0.0.1:${PORTS.web}/app`), 120); say("web restarted"); return; }
    case "summary": return summary(loadDeployment());
    default: say("usage: local:up | local:down | local:status | local:logs [svc] | local:time [window|closed|weekend|+1h] | local:scenario crash|rally <SYM> [pct] | gap [pct] | local:keeper once|dry | local:reset");
  }
};
run().catch((e) => { console.error("ERROR:", e instanceof Error ? e.message : e); if (process.env.DEBUG) console.error(e); process.exitCode = 1; });
void DEPLOYMENT_FILE; void readFileSync; void writeFileSync; void createPublicClient; void http;
