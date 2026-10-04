import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createWalletClient, http, parseAbi, parseEther, parseUnits, type Address } from "viem";
import { ASSETS, CHAIN_ID, ROOT, ROLE, RPC, USDT, USDT_WHALE, WORK, acct } from "./env";
import { client, hex, rpc } from "./util";

const C = resolve(ROOT, "packages/contracts");
const WC = resolve(WORK, "contracts");

/**
 * The audited Deploy/SetHolidays scripts read params from script/params/<chainId>.json inside the Foundry project root.
 * To change the router allowlist WITHOUT touching packages/contracts, build a scratch project whose src, lib, holidays and
 * scripts are symlinks to the real ones and whose params file is ours. Bytecode is identical (bytecode_hash = none).
 */
export function prepareWorkProject(): string {
  rmSync(WC, { recursive: true, force: true });
  mkdirSync(resolve(WC, "script/params"), { recursive: true });
  mkdirSync(resolve(WC, "deployments"), { recursive: true });
  for (const f of ["foundry.toml", "remappings.txt"]) cpSync(resolve(C, f), resolve(WC, f));
  for (const d of ["src", "lib", "holidays"]) symlinkSync(resolve(C, d), resolve(WC, d));
  for (const s of ["Deploy.s.sol", "SetHolidays.s.sol"]) symlinkSync(resolve(C, "script", s), resolve(WC, "script", s));
  const p = JSON.parse(readFileSync(resolve(C, "script/params/31337.json"), "utf8"));
  const router = p.v3SwapRouter as string;
  p.routerTargets = [router]; // DIRECT PancakeSwap router only: aggregator disabled locally
  p.routerApproveTargets = [router];
  p._comment = "local stack: direct Pancake router only; roles are anvil dev accounts";
  writeFileSync(resolve(WC, "script/params/31337.json"), JSON.stringify(p, null, 2));
  return p.holidaysFile as string;
}

function forge(args: string[], env: Record<string, string> = {}): string {
  return execFileSync("forge", args, { cwd: WC, env: { ...process.env, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });
}

const factoryAbi = parseAbi([
  "function acceptOwnership()",
  "function setKeeper(address,bool)",
  "function setDefaults((uint16 sellBandBps,uint16 buyBandBps,uint32 minInterval,uint32 publicDelay,uint32 twapWindow,uint16 maxTickDev,uint16 tolAggBps,uint16 tolDirectBps,uint256 minTrade,uint256 dust))",
  "function owner() view returns (address)",
  "function isKeeper(address) view returns (bool)",
  "function routerOk(address) view returns (bool,address)",
]);
const erc20 = parseAbi(["function transfer(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]);

export const wallet = (i: number) => createWalletClient({ account: acct(i), transport: http(RPC), chain: undefined });
async function send(i: number, params: { address: Address; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] }) {
  const hash = await wallet(i).writeContract({ ...params, chain: null } as never);
  const rc = await client.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error(`${params.functionName} reverted (${hash})`);
  return rc;
}

export async function fund(user: Address, usdt: string, bnb: string) {
  await rpc("anvil_impersonateAccount", [USDT_WHALE]);
  await rpc("anvil_setBalance", [USDT_WHALE, hex(parseEther("100"))]);
  const hash = await createWalletClient({ account: USDT_WHALE, transport: http(RPC), chain: undefined }).writeContract({
    address: USDT, abi: erc20, functionName: "transfer", args: [user, parseUnits(usdt, 18)], chain: null,
  });
  await client.waitForTransactionReceipt({ hash });
  await rpc("anvil_stopImpersonatingAccount", [USDT_WHALE]);
  await rpc("anvil_setBalance", [user, hex(parseEther(bnb))]);
}

/** Demo defaults: minTrade 6 USDT (EXECUTION_PLAN P6) so a 55 USDT position reaches the minimum trade. */
const DEF_DEMO = { sellBandBps: 100, buyBandBps: 200, minInterval: 900, publicDelay: 14400, twapWindow: 600, maxTickDev: 300, tolAggBps: 30, tolDirectBps: 100, minTrade: parseUnits("6", 18), dust: parseUnits("1", 18) };

export async function deployAll(log: (s: string) => void) {
  const holidays = prepareWorkProject(); void holidays;
  const A = (i: number) => acct(i).address;
  for (const i of Object.values(ROLE)) await rpc("anvil_setBalance", [A(i), hex(parseEther("1000"))]);

  log("forge build + Deploy.s.sol (audited script, direct router only)");
  const K0 = await keyHex(ROLE.deployer);
  const out = forge(["script", "script/Deploy.s.sol", "--rpc-url", RPC, "--private-key", K0, "--broadcast", "--slow"], { FLOOR_WRITE_DEPLOYMENT: "true" });
  if (!existsSync(resolve(WC, "deployments/31337.json"))) throw new Error("Deploy wrote no deployments/31337.json:\n" + out.slice(-1500));
  const d = JSON.parse(readFileSync(resolve(WC, "deployments/31337.json"), "utf8")) as { FloorFactory: Address; FloorLens: Address; FloorVault: Address; block: number };
  const factory = d.FloorFactory;

  log("owner acceptOwnership, keepers, demo defaults");
  await send(ROLE.owner, { address: factory, abi: factoryAbi, functionName: "acceptOwnership" });
  await send(ROLE.owner, { address: factory, abi: factoryAbi, functionName: "setKeeper", args: [A(ROLE.keeper2), true] });
  await send(ROLE.owner, { address: factory, abi: factoryAbi, functionName: "setDefaults", args: [DEF_DEMO] });

  log("SetHolidays.s.sol (guardian)");
  forge(["script", "script/SetHolidays.s.sol", "--rpc-url", RPC, "--private-key", await keyHex(ROLE.guardian), "--broadcast"], { FLOOR_FACTORY: factory });

  const owner = await client.readContract({ address: factory, abi: factoryAbi, functionName: "owner" });
  if (owner.toLowerCase() !== A(ROLE.owner).toLowerCase()) throw new Error("owner handover failed");
  const [okPancake] = await client.readContract({ address: factory, abi: factoryAbi, functionName: "routerOk", args: ["0x1b81D678ffb9C0263b24A97847620C99d213eB14"] });
  const [okAgg] = await client.readContract({ address: factory, abi: factoryAbi, functionName: "routerOk", args: ["0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5"] });
  if (!okPancake || okAgg) throw new Error(`router allowlist wrong: pancake=${okPancake} aggregator=${okAgg}`);

  log("fund demo user (200 USDT + 10 BNB)");
  await fund(A(ROLE.user), "200", "10");
  void ASSETS; void CHAIN_ID;
  return { factory, lens: d.FloorLens, vaultImpl: d.FloorVault, deployBlock: d.block };
}

/** Hex private key of a dev account, derived from the public anvil mnemonic at call time, never written anywhere. */
export async function keyHex(i: number): Promise<string> {
  const k = acct(i).getHdKey().privateKey;
  if (!k) throw new Error("no key");
  return "0x" + Buffer.from(k).toString("hex");
}
