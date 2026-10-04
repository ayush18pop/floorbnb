import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, http, type PublicClient } from "viem";
import { DEPLOYMENT_FILE, LOGS, RPC, RUN, type Deployment } from "./env";

export const client: PublicClient = createPublicClient({ transport: http(RPC, { timeout: 180_000 }) });

export async function rpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = (await r.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result as T;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const hex = (n: bigint | number) => "0x" + BigInt(n).toString(16);

export function loadDeployment(): Deployment {
  if (!existsSync(DEPLOYMENT_FILE)) throw new Error("No local/deployment.json: run `pnpm local:up` first.");
  return JSON.parse(readFileSync(DEPLOYMENT_FILE, "utf8")) as Deployment;
}
export function saveDeployment(d: Deployment) { writeFileSync(DEPLOYMENT_FILE, JSON.stringify(d, null, 2) + "\n"); }

// ---- process management (pid files under local/.run, logs under local/logs) -------------------------------------
export const pidFile = (n: string) => resolve(RUN, `${n}.pid`);
export function alive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }
export function pidOf(n: string): number | null {
  try { const p = Number(readFileSync(pidFile(n), "utf8")); return p && alive(p) ? p : null; } catch { return null; }
}
export function startService(name: string, cmd: string, args: string[], opts: { cwd: string; env?: Record<string, string> }) {
  mkdirSync(RUN, { recursive: true }); mkdirSync(LOGS, { recursive: true });
  const log = openSync(resolve(LOGS, `${name}.log`), "w");
  const env: Record<string, string | undefined> = { ...process.env, ...opts.env };
  if (name !== "anvil") { delete env.BSC_FORK_RPC_URL; delete env.LOCAL_FORK_RPC; delete env.ETH_RPC_URL; } // the fork URL may hold a key: only anvil gets it
  const child = spawn(cmd, args, { cwd: opts.cwd, env, detached: true, stdio: ["ignore", log, log] });
  child.unref();
  writeFileSync(pidFile(name), String(child.pid));
  return child.pid!;
}
/** Kill the whole process group (pnpm/next spawn children). */
export function stopService(name: string): boolean {
  const pid = pidOf(name);
  if (pid) { for (const sig of ["SIGTERM", "SIGKILL"] as const) { try { process.kill(-pid, sig); } catch { /* gone */ } if (sig === "SIGTERM") execFileSync("sleep", ["0.5"]); } }
  rmSync(pidFile(name), { force: true });
  return !!pid;
}
export async function waitFor(what: string, fn: () => Promise<boolean>, tries = 60, ms = 1000) {
  for (let i = 0; i < tries; i++) { try { if (await fn()) return; } catch { /* retry */ } await sleep(ms); }
  throw new Error(`timed out waiting for ${what}`);
}
export const httpOk = (url: string) => async () => (await fetch(url)).status < 500;
