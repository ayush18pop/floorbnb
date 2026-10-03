import type { Address, PublicClient } from 'viem';
import { floorFactoryAbi, floorLensAbi, floorVaultAbi } from './abis';
import { BPS } from './constants';

export type VaultStatusCode = 'Active' | 'Closing' | 'Closed';
const STATUS_NAMES: VaultStatusCode[] = ['Active', 'Closing', 'Closed'];

export interface LensStatus {
  vault: Address;
  V: bigint;
  floor: bigint;
  cushion: bigint;
  exposure: bigint;
  target: bigint;
  needsRebalance: boolean;
  tradingOpen: boolean;
}

export interface PositionView extends LensStatus {
  owner: Address;
  deposit: bigint;
  maturity: number;
  status: VaultStatusCode;
  /** Exposure as bps of V (0 if V = 0). */
  exposureBps: number;
  /** Cushion as bps of V (0 if V = 0). */
  cushionBps: number;
  /** True when the cushion is zero and V > 0 or the vault holds only USDT: the cash lock. */
  cashLocked: boolean;
  assets: { token: Address; weightBps: number }[];
}

/** Lens status for one vault. Fields the Lens could not read are 0. */
export async function readLensStatus(client: PublicClient, lens: Address, vault: Address): Promise<LensStatus> {
  const s = await client.readContract({ address: lens, abi: floorLensAbi, functionName: 'status', args: [vault] });
  return {
    vault: s.vault,
    V: s.V,
    floor: s.floor,
    cushion: s.cushion,
    exposure: s.exposure,
    target: s.target,
    needsRebalance: s.needsRebalance,
    tradingOpen: s.tradingOpen,
  };
}

/** Vaults in [from, to) of the factory's list that need a rebalance now. */
export async function scanVaults(client: PublicClient, lens: Address, from: bigint, to: bigint): Promise<Address[]> {
  const r = await client.readContract({ address: lens, abi: floorLensAbi, functionName: 'scan', args: [from, to] });
  return [...r];
}

export async function readPositionsOf(client: PublicClient, factory: Address, owner: Address): Promise<Address[]> {
  const r = await client.readContract({ address: factory, abi: floorFactoryAbi, functionName: 'positionsOf', args: [owner] });
  return [...r];
}

export async function readIsTradingOpen(client: PublicClient, factory: Address, ts: bigint): Promise<boolean> {
  return client.readContract({ address: factory, abi: floorFactoryAbi, functionName: 'isTradingOpen', args: [ts] });
}

/** Full position view: Lens status plus vault getters. */
export async function readPosition(client: PublicClient, lens: Address, vault: Address): Promise<PositionView> {
  const base = await readLensStatus(client, lens, vault);
  const read = <T>(functionName: string, args: unknown[] = []) =>
    client.readContract({ address: vault, abi: floorVaultAbi, functionName, args } as never) as Promise<T>;
  const [owner, deposit, maturity, status, n] = await Promise.all([
    read<Address>('owner'),
    read<bigint>('deposit'),
    read<number>('maturity'),
    read<number>('status'),
    read<number>('nAssets'),
  ]);
  const assets: PositionView['assets'] = [];
  for (let i = 0; i < Number(n); i++) {
    const [token, weightBps] = await Promise.all([read<Address>('assetAt', [BigInt(i)]), read<number>('weightBps', [BigInt(i)])]);
    assets.push({ token, weightBps: Number(weightBps) });
  }
  const bps = (x: bigint) => (base.V > 0n ? Number((x * BPS) / base.V) : 0);
  return {
    ...base,
    owner,
    deposit,
    maturity: Number(maturity),
    status: STATUS_NAMES[Number(status)] ?? 'Active',
    exposureBps: bps(base.exposure),
    cushionBps: bps(base.cushion),
    cashLocked: base.floor > 0n && base.V > 0n && base.cushion === 0n,
    assets,
  };
}
