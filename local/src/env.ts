import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mnemonicToAccount } from "viem/accounts";
import type { Address } from "viem";

/** Repo root of THIS checkout (works from any worktree). */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const LOCAL = resolve(ROOT, "local");
export const RUN = resolve(LOCAL, ".run");
export const LOGS = resolve(LOCAL, "logs");
export const WORK = resolve(LOCAL, ".work");
export const DEPLOYMENT_FILE = resolve(LOCAL, "deployment.json");

/** LOCAL_PORT_OFFSET (e.g. 10000) lets a second stack run beside the team one: all four ports shift together. */
const OFF = Number(process.env.LOCAL_PORT_OFFSET ?? 0) || 0;
export const PORTS = { anvil: 8545 + OFF, api: 8787 + OFF, mcp: 8788 + OFF, web: 3000 + OFF } as const;
export const RPC = `http://127.0.0.1:${PORTS.anvil}`;
export const CHAIN_ID = 31337;

/**
 * Archive-capable free BSC endpoints, tested 2026-10-04 (state 1,000,000 blocks old still served).
 * publicnode answers 403 for old state, 1rpc / dataseed / blxr / blockrazor are non-archive. Override: LOCAL_FORK_RPC.
 */
export const FORK_RPCS = [
  "https://bsc-mainnet.public.blastapi.io",
  "https://bnb.api.onfinality.io/public",
];

/** Anvil's public default mnemonic: well known, local use only. Keys are derived at run time, never stored in a file. */
const MNEMONIC = "test test test test test test test test test test test junk";
export const acct = (i: number) => mnemonicToAccount(MNEMONIC, { addressIndex: i });
export const ROLE = {
  deployer: 0,
  owner: 1,
  guardian: 2,
  keeper: 3, // the loop keeper (set in params)
  user: 4, // the demo user, the 'Dev wallet' in the web app
  keeper2: 5, // manual keeper for `pnpm local:keeper once` (no nonce clash with the loop)
  trader: 9, // scenario trader that moves pool prices
} as const;

export const USDT: Address = "0x55d398326f99059fF775485246999027B3197955";
export const USDT_WHALE: Address = "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3"; // Binance hot wallet, impersonated on the fork only
export const PANCAKE_ROUTER: Address = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";

export interface AssetCfg { symbol: string; token: Address; pool: Address; fee: number }
export const ASSETS: AssetCfg[] = [
  { symbol: "NVDAB", token: "0x02fca66c1d1afb4e2a7884261eb00f63598a7436", pool: "0x8FB4243b553aC29BA088aCf00B9B7dA24bD6690C", fee: 2500 },
  { symbol: "SPCXB", token: "0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1", pool: "0x977DaFFC095b33872E2741c19568925015C35b4d", fee: 2500 },
  { symbol: "QQQB", token: "0x205812cdbed920aff76c6580abd681a46d11efc7", pool: "0xe531fcb1F5a195de7608B9F4f9518544C2cdB693", fee: 100 },
];

export interface Deployment {
  chainId: number;
  rpc: string;
  forkRpc: string;
  forkBlock: number;
  deployBlock: number;
  factory: Address;
  lens: Address;
  vaultImpl: Address;
  roles: Record<string, Address>;
  startedAt: string;
  snapshot?: string;
}
