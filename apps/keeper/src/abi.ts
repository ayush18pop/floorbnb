import { parseAbi } from 'viem';

/** Floor ABIs come from @floor/sdk (generated from the Foundry build). Only the bStock pause lookup is local. */
export { floorFactoryAbi as factoryAbi, floorVaultAbi as vaultAbi, floorLensAbi as lensAbi } from '@floor/sdk';

export const tokenAbi = parseAbi(['function pauseManager() view returns (address)']);
export const pauseManagerAbi = parseAbi(['function isTokenPaused(address token) view returns (bool)']);
