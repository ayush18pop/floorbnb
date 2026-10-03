import { buildPancakeExactIn } from '@floor/sdk';
import type { Address, Hex } from 'viem';

/** Selector of the deployed Pancake v3 SwapRouter `exactInputSingle` (with `deadline`), verified by A02 (RESULTS-taker.md Q9). */
export const EXACT_INPUT_SINGLE_SELECTOR = '0x414bf389';

export interface DirectParams {
  router: Address;
  tokenIn: Address;
  tokenOut: Address;
  fee: number;
  vault: Address;
  amountIn: bigint;
  /** `minOutDirect` from `previewRebalance`. The vault enforces its own minOut regardless. */
  minOut: bigint;
  /** unix seconds; give slack for the block the tx lands in */
  deadline: bigint;
}

/** Calldata for the router via the SDK builder. The recipient is always the vault (SwapGuard checks the vault's balance deltas). */
export function buildDirectCalldata(p: DirectParams): Hex {
  return buildPancakeExactIn({
    router: p.router, tokenIn: p.tokenIn, tokenOut: p.tokenOut, fee: p.fee, recipient: p.vault,
    deadline: p.deadline, amountIn: p.amountIn, amountOutMinimum: p.minOut,
  }).data;
}
