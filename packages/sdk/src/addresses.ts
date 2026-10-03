import type { Address } from 'viem';
import { CHAIN_BSC, CHAIN_LOCAL, type SupportedChainId } from './constants';

export interface Deployment {
  chainId: SupportedChainId;
  factory: Address;
  lens: Address;
  vaultImplementation?: Address;
}

const ZERO = '0x0000000000000000000000000000000000000000';

/** Placeholders until deploy (packages/contracts/deployments/<chainId>.json). Use `setDeployment` to fill. */
const registry: Record<number, Deployment | undefined> = {
  [CHAIN_BSC]: undefined,
  [CHAIN_LOCAL]: undefined,
};

export function setDeployment(d: Deployment): void {
  if (d.factory.toLowerCase() === ZERO || d.lens.toLowerCase() === ZERO) {
    throw new Error('setDeployment: zero address');
  }
  registry[d.chainId] = d;
}

export function hasDeployment(chainId: number): boolean {
  return registry[chainId] !== undefined;
}

/** Throws a clear error while the chain has no deployment. */
export function getDeployment(chainId: number): Deployment {
  const d = registry[chainId];
  if (!d) {
    throw new Error(
      `No Floor deployment registered for chain ${chainId}. Call setDeployment() with the factory and lens addresses (packages/contracts/deployments/${chainId}.json).`,
    );
  }
  return d;
}
