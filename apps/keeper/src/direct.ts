import { encodeFunctionData, type Address, type Hex } from 'viem';
import { pancakeRouterAbi } from './abi.js';

/** Selector of the deployed Pancake v3 SwapRouter `exactInputSingle` (with `deadline`), verified by A02 (RESULTS-taker.md Q9). */
export const EXACT_INPUT_SINGLE_SELECTOR = '0x414bf389';

export interface DirectParams {
  tokenIn: Address;
  tokenOut: Address;
  fee: number;
  vault: Address;
  amountIn: bigint;
  /** `minOutDirect` from `previewRebalance`. The vault enforces its own minOut regardless. */
  minOut: bigint;
  /** unix seconds; the vault executes in the same block as the keeper tx lands, so give it some slack */
  deadline: bigint;
}

/** Calldata for the router. The recipient is always the vault (SwapGuard checks balance deltas on the vault). */
export function buildDirectCalldata(p: DirectParams): Hex {
  return encodeFunctionData({
    abi: pancakeRouterAbi,
    functionName: 'exactInputSingle',
    args: [
      {
        tokenIn: p.tokenIn,
        tokenOut: p.tokenOut,
        fee: p.fee,
        recipient: p.vault,
        deadline: p.deadline,
        amountIn: p.amountIn,
        amountOutMinimum: p.minOut,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
}
