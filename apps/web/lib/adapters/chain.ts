import { erc20Abi, parseEventLogs, type PublicClient } from "viem";
import { getPublicClient, sendTransaction, waitForTransactionReceipt } from "wagmi/actions";
import {
  buildCloseToUSDT, buildExitInKind, buildCreatePosition, buildRequestClose, floorFactoryAbi, floorVaultAbi,
  getDeployment, hasDeployment, readPosition, readPositionsOf, readIsTradingOpen, setDeployment, type UnsignedTx,
} from "@floor/sdk";
import { API_URL, APP_CHAIN_ID, FACTORY_ADDRESS, LENS_ADDRESS } from "../app-config";
import { wagmiConfig } from "../wagmi";
import { ASSETS, assetBySymbol, symbolOf } from "./assets";
import { toKeeperRun, toKeeperStatus, type RebalanceLog } from "./keeper-runs";
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
  const c = getPublicClient(wagmiConfig, { chainId: APP_CHAIN_ID as 56 });
  if (!c) throw new Error("No BSC client");
  return c as PublicClient;
}

function deployment() {
  if (!hasDeployment(APP_CHAIN_ID)) {
    if (!FACTORY_ADDRESS || !LENS_ADDRESS) throw new Error("Floor is not deployed yet: set NEXT_PUBLIC_FACTORY_ADDRESS and NEXT_PUBLIC_LENS_ADDRESS.");
    setDeployment({ chainId: APP_CHAIN_ID, factory: FACTORY_ADDRESS, lens: LENS_ADDRESS });
  }
  return getDeployment(APP_CHAIN_ID);
}

async function send(tx: UnsignedTx): Promise<Hex> {
  const hash = await sendTransaction(wagmiConfig, { chainId: APP_CHAIN_ID as 56, to: tx.to, data: tx.data, value: 0n });
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
  // A closed vault holds nothing, so the lens reports V = 0. Show what was paid out instead of "0.00 USDT, -100%".
  let V = p.V;
  if (p.status === "Closed") {
    const from = process.env.NEXT_PUBLIC_DEPLOY_BLOCK ? BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK) : 0n;
    const closed = parseEventLogs({ abi: floorVaultAbi, eventName: "Closed", logs: await c.getLogs({ address: vault, fromBlock: from, toBlock: "latest" }).catch(() => []) });
    if (closed[0]) V = closed[0].args.usdtOut;
  }
  return {
    status: { vault: p.vault, V, floor: p.floor, cushion: p.cushion, exposure: p.exposure, target: p.target, needsRebalance: p.needsRebalance, tradingOpen: p.tradingOpen },
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
  const keepers = await keeperSet(parsed.filter((l) => l.eventName === "Rebalanced").map((l) => (l.args as { caller: Address }).caller));
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
        out.push({ type: "Rebalanced", time: t, tx, id: ++n, symbol, buy: Boolean(a.buy), amountIn: a.amountIn as bigint, amountOut: a.amountOut as bigint, V: a.V as bigint, exposureTarget: a.exposureTarget as bigint, caller: a.caller as Address, signer: (keepers.has((a.caller as Address).toLowerCase()) ? "keeper" : "public") as SignerKind });
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

/**
 * The keeper log, built from the chain. The API's /v1/keeper/runs is an empty in-memory store until a keeper writes to it,
 * and /v1/keeper/status does not exist, so the page used to fail with "Keeper API 404".
 */
async function rebalanceLogs(): Promise<RebalanceLog[]> {
  const c = client(); const d = deployment();
  const total = await c.readContract({ address: d.factory, abi: floorFactoryAbi, functionName: "positionsCount" }).catch(() => null) as bigint | null;
  const vaults: Address[] = [];
  const n = total === null ? 0n : total;
  for (let i = 0n; i < n; i++) vaults.push(await c.readContract({ address: d.factory, abi: floorFactoryAbi, functionName: "positions", args: [i] }) as Address);
  if (!vaults.length) return [];
  const from = process.env.NEXT_PUBLIC_DEPLOY_BLOCK ? BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK) : 0n;
  const logs = parseEventLogs({ abi: floorVaultAbi, eventName: "Rebalanced", logs: await c.getLogs({ address: vaults, fromBlock: from, toBlock: "latest" }) });
  const tokens = new Map<string, Address[]>();
  const times = new Map<bigint, number>();
  const out: RebalanceLog[] = [];
  for (const l of logs) {
    if (!tokens.has(l.address)) tokens.set(l.address, (await readPosition(c, d.lens, l.address)).assets.map((a) => a.token));
    if (!times.has(l.blockNumber)) times.set(l.blockNumber, Number((await c.getBlock({ blockNumber: l.blockNumber })).timestamp));
    const tok = tokens.get(l.address)![Number(l.args.assetIdx)];
    out.push({ vault: l.address, symbol: (symbolOf(tok) ?? "NVDAB") as AssetSymbol, buy: l.args.buy, amountIn: l.args.amountIn, amountOut: l.args.amountOut, caller: l.args.caller, tx: l.transactionHash, time: times.get(l.blockNumber)! });
  }
  return out;
}
async function keeperSet(callers: Address[]): Promise<Set<string>> {
  const c = client(); const d = deployment();
  const uniq = [...new Set(callers.map((x) => x.toLowerCase()))] as Address[];
  const flags = await Promise.all(uniq.map((k) => c.readContract({ address: d.factory, abi: floorFactoryAbi, functionName: "isKeeper", args: [k] })));
  return new Set(uniq.filter((_, i) => flags[i]));
}
async function chainKeeperRuns(): Promise<KeeperRun[]> {
  const logs = await rebalanceLogs();
  const keepers = await keeperSet(logs.map((l) => l.caller));
  return logs.map((l) => toKeeperRun(l, keepers)).sort((a, b) => b.time - a.time);
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
    keeperStatus: async (): Promise<KeeperStatus> => {
      const c = client(); const d = deployment();
      const block = await c.getBlock();
      const [runs, open, hb] = await Promise.all([
        chainKeeperRuns(),
        readIsTradingOpen(c, d.factory, block.timestamp),
        API_URL ? fetch(`${API_URL}/healthz`).then((r) => r.json() as Promise<{ keeper?: { heartbeatAgeSeconds: number | null } }>).then((j) => j.keeper?.heartbeatAgeSeconds ?? null).catch(() => null) : Promise.resolve(null),
      ]);
      return toKeeperStatus(runs, Number(block.timestamp), open, hb);
    },
    keeperRuns: async (limit = 20): Promise<KeeperRun[]> => (await chainKeeperRuns()).slice(0, limit),
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
      const arc = await waitForTransactionReceipt(wagmiConfig, { hash: approveTx });
      if (arc.status !== "success") throw new Error("The USDT approval reverted on chain. Nothing was created.");
      onProgress({ step: "approve", state: "done", tx: approveTx });
      onProgress({ step: "create", state: "wallet" });
      const createTx = await send(create);
      onProgress({ step: "create", state: "pending", tx: createTx });
      const rc = await c.waitForTransactionReceipt({ hash: createTx });
      if (rc.status !== "success") throw new Error("createPosition reverted on chain (the position was not created). Check the transaction on the block explorer.");
      onProgress({ step: "create", state: "done", tx: createTx });
      const ev = parseEventLogs({ abi: floorFactoryAbi, logs: rc.logs, eventName: "PositionCreated" })[0];
      if (!ev) throw new Error("Position created, but the PositionCreated event was not found. Check the transaction on BscScan.");
      return { vault: ev.args.vault, approveTx, createTx };
    },
    exit: async (vault, kind: ExitKind, owner) => {
      const tx = kind === "requestClose" ? buildRequestClose(vault) : kind === "closeToUSDT" ? buildCloseToUSDT(vault) : buildExitInKind(vault, owner);
      const hash = await send(tx);
      const rc = await waitForTransactionReceipt(wagmiConfig, { hash }); // refresh only once mined; a stale read right after the click showed the old state
      if (rc.status !== "success") throw new Error("The transaction reverted on chain. Nothing changed. Check it on the block explorer.");
      return hash;
    },
  };
}
