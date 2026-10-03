import { encodeFunctionData, getAddress, type Address, type Hex } from 'viem';
import { erc20Abi } from 'viem';
import { floorFactoryAbi, floorVaultAbi, pancakeV3SwapRouterAbi } from './abis';
import { CHAIN_BSC, MAX_ASSETS, USDT } from './constants';
import { validateProtection } from './quote';

/** Unsigned transaction (ARCHITECTURE.md section 6). The SDK never signs and never sends. */
export interface UnsignedTx {
  chainId: number;
  to: Address;
  data: Hex;
  /** Wei, decimal string. Always "0" for Floor calls. */
  value: string;
  description: string;
  decoded: { function: string; args: Record<string, string | string[]> };
  simulation?: unknown | null;
  expiresAt?: number;
}

export interface BuildCreatePositionParams {
  owner: Address;
  factory: Address;
  /** USDT, 18 decimals. */
  amount: bigint;
  floorBps: number;
  termSeconds: number;
  assets: readonly Address[];
  weightsBps: readonly number[];
  chainId?: number;
  usdt?: Address;
}

/** [approve(factory, exact amount), createPosition]. Exact approval, never unlimited. */
export function buildCreatePosition(p: BuildCreatePositionParams): [UnsignedTx, UnsignedTx] {
  const errs = validateProtection({
    deposit: p.amount,
    floorBps: p.floorBps,
    termSeconds: p.termSeconds,
    weightsBps: p.weightsBps,
  });
  if (p.assets.length !== p.weightsBps.length) errs.push('assets and weights length mismatch');
  if (p.assets.length > MAX_ASSETS) errs.push('too many assets');
  const lower = p.assets.map((a) => a.toLowerCase());
  if (new Set(lower).size !== lower.length) errs.push('duplicate assets');
  if (errs.length) throw new Error(`buildCreatePosition: ${errs.join('; ')}`);

  const chainId = p.chainId ?? CHAIN_BSC;
  const usdt = getAddress(p.usdt ?? USDT);
  const factory = getAddress(p.factory);
  const assets = p.assets.map((a) => getAddress(a));

  const approve: UnsignedTx = {
    chainId,
    to: usdt,
    data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [factory, p.amount] }),
    value: '0',
    description: 'Approve the Floor factory to pull the deposit (exact amount)',
    decoded: { function: 'approve', args: { spender: factory, amount: p.amount.toString() } },
  };
  const create: UnsignedTx = {
    chainId,
    to: factory,
    data: encodeFunctionData({
      abi: floorFactoryAbi,
      functionName: 'createPosition',
      args: [p.amount, p.floorBps, p.termSeconds, assets, [...p.weightsBps]],
    }),
    value: '0',
    description: 'Create a Floor position',
    decoded: {
      function: 'createPosition',
      args: {
        amount: p.amount.toString(),
        floorBps: String(p.floorBps),
        termSeconds: String(p.termSeconds),
        assets,
        weightsBps: p.weightsBps.map(String),
      },
    },
  };
  return [approve, create];
}

function vaultCall(
  vault: Address,
  fn: 'requestClose' | 'closeToUSDT',
  description: string,
  chainId: number,
): UnsignedTx {
  return {
    chainId,
    to: getAddress(vault),
    data: encodeFunctionData({ abi: floorVaultAbi, functionName: fn }),
    value: '0',
    description,
    decoded: { function: fn, args: {} },
  };
}

/** Owner only. Sets the vault to Closing so the keeper unwinds the stock. */
export function buildRequestClose(vault: Address, chainId = CHAIN_BSC): UnsignedTx {
  return vaultCall(vault, 'requestClose', 'Request close: the vault sells its stock to USDT', chainId);
}

/** Owner only. Needs stock value at or below dust (after unwinding). Sends all USDT to the owner. */
export function buildCloseToUSDT(vault: Address, chainId = CHAIN_BSC): UnsignedTx {
  return vaultCall(vault, 'closeToUSDT', 'Close the position and receive USDT', chainId);
}

/** Owner only, always allowed. Sends USDT and every movable bStock to `to`. */
export function buildExitInKind(vault: Address, to: Address, chainId = CHAIN_BSC): UnsignedTx {
  const dest = getAddress(to);
  return {
    chainId,
    to: getAddress(vault),
    data: encodeFunctionData({ abi: floorVaultAbi, functionName: 'exitInKind', args: [dest] }),
    value: '0',
    description: 'Exit in kind: receive USDT and the stocks as they are',
    decoded: { function: 'exitInKind', args: { to: dest } },
  };
}

export interface PancakeExactInParams {
  router: Address;
  tokenIn: Address;
  tokenOut: Address;
  fee: number;
  recipient: Address;
  /** Unix seconds. */
  deadline: bigint;
  amountIn: bigint;
  amountOutMinimum: bigint;
  /** Defaults to 0 (no limit). */
  sqrtPriceLimitX96?: bigint;
  chainId?: number;
}

/** Direct Pancake v3 exactInputSingle calldata (the permissionless fallback route). */
export function buildPancakeExactIn(p: PancakeExactInParams): UnsignedTx {
  return {
    chainId: p.chainId ?? CHAIN_BSC,
    to: getAddress(p.router),
    data: encodeFunctionData({
      abi: pancakeV3SwapRouterAbi,
      functionName: 'exactInputSingle',
      args: [
        {
          tokenIn: getAddress(p.tokenIn),
          tokenOut: getAddress(p.tokenOut),
          fee: p.fee,
          recipient: getAddress(p.recipient),
          deadline: p.deadline,
          amountIn: p.amountIn,
          amountOutMinimum: p.amountOutMinimum,
          sqrtPriceLimitX96: p.sqrtPriceLimitX96 ?? 0n,
        },
      ],
    }),
    value: '0',
    description: 'Swap on Pancake v3 (direct route)',
    decoded: {
      function: 'exactInputSingle',
      args: {
        tokenIn: p.tokenIn,
        tokenOut: p.tokenOut,
        fee: String(p.fee),
        amountIn: p.amountIn.toString(),
        amountOutMinimum: p.amountOutMinimum.toString(),
      },
    },
  };
}
