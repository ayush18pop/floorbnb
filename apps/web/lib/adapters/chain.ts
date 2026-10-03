import { erc20Abi, parseEventLogs, type PublicClient } from "viem";
import { getPublicClient, sendTransaction, waitForTransactionReceipt } from "wagmi/actions";
import {
  CHAIN_BSC, buildCloseToUSDT, buildExitInKind, buildCreatePosition, buildRequestClose, floorFactoryAbi, floorVaultAbi,
  getDeployment, hasDeployment, readPosition, readPositionsOf, setDeployment, type UnsignedTx,
} from "@floor/sdk";
import { API_URL, FACTORY_ADDRESS, LENS_ADDRESS } from "../app-config";
import { wagmiConfig } from "../wagmi";
import { ASSETS, assetBySymbol, symbolOf } from "./assets";
import type {
  Address, AssetSymbol, CreateParams, CreateProgress, CreateResult, ExitKind, Hex, Holding, KeeperRun, KeeperStatus,
  PositionSource, PositionView, SignerKind, ValuePoint, VaultEvent,
} from "./types";

/**
 * Chain source: reads through @floor/sdk (FloorLens.status, vault getters, valuation) and builds every
 * transaction with the SDK builders. The wallet signs; this code never holds a key.
 * Untested against a deployment (none exists yet). Events need NEXT_PUBLIC_DEPLOY_BLOCK. Keeper runs need
 * NEXT_PUBLIC_API_URL (/v1/keeper/runs).
 */
function client(): PublicClient {
  const c = getPublicClient(wagmiConfig, { chainId: CHAIN_BSC });
  if (!c) throw new Error("No BSC client");
  return c as PublicClient;
}

function deployment() {
  if (!hasDeployment(CHAIN_BSC)) {
    if (!FACTORY_ADDRESS || !LENS_ADDRESS) throw new Error("Floor is not deployed yet: set NEXT_PUBLIC_FACTORY_ADDRESS and NEXT_PUBLIC_LENS_ADDRESS.");
    setDeployment({ chainId: CHAIN_BSC, factory: FACTORY_ADDRESS, lens: LENS_ADDRESS });
  }
  return getDeployment(CHAIN_BSC);
}

async function send(tx: UnsignedTx): Promise<Hex> {
  const hash = await sendTransaction(wagmiConfig, { chainId: CHAIN_BSC, to: tx.to, data: tx.data, value: 0n });
  return hash;
}

async function load(vault: Address): Promise<PositionView | null> {
  const c = client();
  const d = deployment();
  const p = await readPosition(c, d.lens, vault);
  const read = <T>(functionName: string, args: unknown[] = []) => c.readContract({ address: vault, abi: floorVaultAbi, functionName, args } as never) as Promise<T>;
  const [val, start, lastRebalance, block] = await Promise.all([
    read<readonly [bigint, bigint, readonly bigint[]]>("valuation").catch(() => null),
    read<number>("start"),
    read<number>("lastRebalance"),
    c.getBlock(),
  ]);
  const holdings: Holding[] = await Promise.all(
    p.assets.map(async (a, i) => {
      const amount = await c.readContract({ address: a.token, abi: erc20Abi, functionName: "balanceOf", args: [vault] });
      return { symbol: (symbolOf(a.token) ?? "NVDAB") as AssetSymbol, token: a.token, weightBps: a.weightBps, amount, value: val ? val[2][i] : 0n };
    }),
  );
  return {
    status: { vault: p.vault, V: p.V, floor: p.floor, cushion: p.cushion, exposure: p.exposure, target: p.target, needsRebalance: p.needsRebalance, tradingOpen: p.tradingOpen },
    owner: p.owner, vaultStatus: p.status, deposit: p.deposit, start: Number(start), maturity: p.maturity, asOf: Number(block.timestamp),
    usdtBalance: val ? val[1] : 0n, holdings, lastRebalance: Number(lastRebalance),
  };
}

async function events(vault: Address): Promise<VaultEvent[]> {
  const from = process.env.NEXT_PUBLIC_DEPLOY_BLOCK;
  if (!from) throw new Error("Set NEXT_PUBLIC_DEPLOY_BLOCK to read activity.");
  const c = client();
  const logs = await c.getLogs({ address: vault, fromBlock: BigInt(from), toBlock: "latest" });
  const parsed = parseEventLogs({ abi: floorVaultAbi, logs });
  const blocks = new Map<bigint, number>();
  const out: VaultEvent[] = [];
  let n = 0;
  for (const l of parsed) {
    let t = blocks.get(l.blockNumber);
    if (t === undefined) { t = Number((await c.getBlock({ blockNumber: l.blockNumber })).timestamp); blocks.set(l.blockNumber, t); }
    const tx = l.transactionHash;
    const a = l.args as Record<string, unknown>;
    switch (l.eventName) {
      case "Rebalanced": {
        const idx = Number(a.assetIdx);
        const pos = await load(vault);
        const symbol = (pos?.holdings[idx]?.symbol ?? "NVDAB") as AssetSymbol;
        out.push({ type: "Rebalanced", time: t, tx, id: ++n, symbol, buy: Boolean(a.buy), amountIn: a.amountIn as bigint, amountOut: a.amountOut as bigint, V: a.V as bigint, exposureTarget: a.exposureTarget as bigint, caller: a.caller as Address, signer: "keeper" as SignerKind });
        break;
      }
      case "CloseRequested": out.push({ type: "CloseRequested", time: t, tx }); break;
      case "Closed": out.push({ type: "Closed", time: t, tx, usdtOut: a.usdtOut as bigint }); break;
      case "ExitInKind": out.push({ type: "ExitInKind", time: t, tx, usdtOut: a.usdtOut as bigint, skipped: [...(a.skipped as Address[])] }); break;
      case "Initialized": out.push({ type: "PositionCreated", time: t, tx, deposit: a.deposit as bigint, floor: a.floor as bigint, maturity: Number(a.maturity), assets: [] }); break;
    }
  }
  return out.sort((x, y) => y.time - x.time);
}

type ApiRun = { time: number; vault: Address; symbol: AssetSymbol; buy: boolean; amountIn: number; amountInUnit: AssetSymbol | "USDT"; minOut?: number; received: number; receivedUnit: AssetSymbol | "USDT"; costBps?: number; signer: SignerKind; tx: Hex; cashLock?: boolean };
async function api<T>(path: string): Promise<T> {
  if (!API_URL) throw new Error("Set NEXT_PUBLIC_API_URL to read the keeper log.");
  const r = await fetch(`${API_URL}${path}`);
  if (!r.ok) throw new Error(`Keeper API ${r.status}`);
  return r.json() as Promise<T>;
}

export function chainSource(): PositionSource {
  return {
    kind: "chain",
    assets: async () => ASSETS,
    listPositions: async (owner) => {
      if (!owner) return [];
      const d = deployment();
      const vaults = await readPositionsOf(client(), d.factory, owner);
      const all = await Promise.all(vaults.map(load));
      return all.filter((x): x is PositionView => !!x);
    },
    getPosition: load,
    getEvents: events,
    getHistory: async (vault): Promise<ValuePoint[]> => {
      // No on-chain value series exists: use the value logged at each rebalance plus the deposit and now.
      const [ev, pos] = await Promise.all([events(vault), load(vault)]);
      const pts: ValuePoint[] = [];
      for (const e of ev) {
        if (e.type === "PositionCreated") pts.push({ t: e.time, v: Number(e.deposit / 10n ** 12n) / 1e6 });
        if (e.type === "Rebalanced") pts.push({ t: e.time, v: Number(e.V / 10n ** 12n) / 1e6 });
      }
      if (pos) pts.push({ t: pos.asOf, v: Number(pos.status.V / 10n ** 12n) / 1e6 });
      return pts.sort((a, b) => a.t - b.t);
    },
    keeperStatus: async (): Promise<KeeperStatus> => api<KeeperStatus>("/v1/keeper/status"),
    keeperRuns: async (limit = 20): Promise<KeeperRun[]> => (await api<{ runs: ApiRun[] }>(`/v1/keeper/runs?limit=${limit}`)).runs,
    createPosition: async (p: CreateParams, onProgress: (e: CreateProgress) => void): Promise<CreateResult> => {
      const d = deployment();
      const [approve, create] = buildCreatePosition({
        owner: p.owner, factory: d.factory, amount: p.amount, floorBps: p.floorBps, termSeconds: p.termSeconds,
        assets: p.assets.map((s) => assetBySymbol(s).token), weightsBps: p.weightsBps,
      });
      const c = client();
      onProgress({ step: "approve", state: "wallet" });
      const approveTx = await send(approve);
      onProgress({ step: "approve", state: "pending", tx: approveTx });
      await waitForTransactionReceipt(wagmiConfig, { hash: approveTx });
      onProgress({ step: "approve", state: "done", tx: approveTx });
      onProgress({ step: "create", state: "wallet" });
      const createTx = await send(create);
      onProgress({ step: "create", state: "pending", tx: createTx });
      const rc = await c.waitForTransactionReceipt({ hash: createTx });
      onProgress({ step: "create", state: "done", tx: createTx });
      const ev = parseEventLogs({ abi: floorFactoryAbi, logs: rc.logs, eventName: "PositionCreated" })[0];
      if (!ev) throw new Error("Position created, but the PositionCreated event was not found. Check the transaction on BscScan.");
      return { vault: ev.args.vault, approveTx, createTx };
    },
    exit: async (vault, kind: ExitKind, owner) => {
      const tx = kind === "requestClose" ? buildRequestClose(vault) : kind === "closeToUSDT" ? buildCloseToUSDT(vault) : buildExitInKind(vault, owner);
      return send(tx);
    },
  };
}
