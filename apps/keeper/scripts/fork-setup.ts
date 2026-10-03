/**
 * Fork fixture: deploys Floor on a LOCAL anvil fork of BSC and opens one funded demo position.
 * Local only: it refuses any RPC that is not 127.0.0.1/localhost. Uses anvil's unlocked accounts (no keys in this file).
 * Usage (anvil already running):  tsx scripts/fork-setup.ts [rpcUrl]   -> prints JSON with addresses.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createTestClient, createWalletClient, encodeAbiParameters, getAddress, http, keccak256, pad, parseAbi, toHex, type Address, type Hex } from 'viem';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = () => process.env.FLOOR_CONTRACTS_OUT ?? resolve(here, '../../../packages/contracts/out');

export const BSC = {
  USDT: '0x55d398326f99059fF775485246999027B3197955' as Address,
  V3_FACTORY: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865' as Address,
  PANCAKE_ROUTER: '0x1b81D678ffb9C0263b24A97847620C99d213eB14' as Address,
  AGG_ROUTER: '0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5' as Address,
  BEACON: '0x156D6dce9a4f6139a3406F1f021F1A4880De93a3' as Address,
  NVDAB: '0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436' as Address,
  POOL_NVDAB: '0x8FB4243b553aC29BA088aCf00B9B7dA24bD6690C' as Address,
};

const artifact = (name: string) => {
  const j = JSON.parse(readFileSync(resolve(outDir(), `${name}.sol/${name}.json`), 'utf8')) as { abi: never; bytecode: { object: Hex } };
  return { abi: j.abi, bytecode: j.bytecode.object };
};

export interface ForkFixture {
  factory: Address;
  lens: Address;
  vault: Address;
  owner: Address;
  user: Address;
  keeper: Address;
  chainTime: number;
  /** block timestamp of the factory deploy (routers are active from then on) */
  factoryDeployedAt: number;
}

export async function setupFork(rpc: string, keeper?: Address, opts: { allowAggRouter?: boolean; warp?: boolean } = {}): Promise<ForkFixture> {
  const host = new URL(rpc).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error('fork-setup only talks to a local anvil');
  const pub = createPublicClient({ transport: http(rpc) });
  const test = createTestClient({ mode: 'anvil', transport: http(rpc) });
  const wallet = createWalletClient({ transport: http(rpc) });
  const [owner, anvilKeeper, user] = (await wallet.getAddresses()) as [Address, Address, Address];
  const keeperAddr = keeper ?? anvilKeeper;

  // 1. warp to the next Tuesday 15:35 UTC (inside the window, 4 h of room), as the Foundry fork tests do
  const head = Number((await pub.getBlock()).timestamp);
  let day = Math.floor(head / 86400) + 1;
  while ((day + 3) % 7 !== 1) day++;
  const t = day * 86400 + 15 * 3600 + 35 * 60;
  if (opts.warp !== false) {
    await test.setNextBlockTimestamp({ timestamp: BigInt(t) });
    await test.mine({ blocks: 1 });
  }

  const send = async (to: Address | undefined, data: Hex, from: Address) => {
    const hash = await wallet.sendTransaction({ account: from, chain: null, to, data, gas: 12_000_000n });
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== 'success') throw new Error('tx failed');
    return r;
  };
  const deploy = async (name: string, ctorTypes: readonly { type: string }[] = [], args: readonly unknown[] = []) => {
    const a = artifact(name);
    const data = ctorTypes.length ? ((a.bytecode + encodeAbiParameters(ctorTypes as never, args as never).slice(2)) as Hex) : a.bytecode;
    const r = await send(undefined, data, owner);
    return r.contractAddress as Address;
  };
  const call = async (to: Address, abiName: string, sig: string, args: unknown[], from: Address) => {
    const a = parseAbi([sig]);
    const { encodeFunctionData } = await import('viem');
    return send(to, encodeFunctionData({ abi: a, functionName: abiName, args } as never), from);
  };

  // 2. deploy (same wiring as the Foundry ForkBase). Owner and guardian are anvil account 0.
  const impl = await deploy('FloorVault');
  const defaults = { type: 'tuple', components: [
    { name: 'sellBandBps', type: 'uint16' }, { name: 'buyBandBps', type: 'uint16' }, { name: 'minInterval', type: 'uint32' },
    { name: 'publicDelay', type: 'uint32' }, { name: 'twapWindow', type: 'uint32' }, { name: 'maxTickDev', type: 'uint16' },
    { name: 'tolAggBps', type: 'uint16' }, { name: 'tolDirectBps', type: 'uint16' }, { name: 'minTrade', type: 'uint256' }, { name: 'dust', type: 'uint256' },
  ] };
  const factory = await deploy(
    'FloorFactory',
    [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'address' }, defaults, { type: 'address[]' }, { type: 'address[]' }],
    [owner, owner, BSC.USDT, BSC.V3_FACTORY, BSC.PANCAKE_ROUTER, impl,
      { sellBandBps: 100, buyBandBps: 200, minInterval: 900, publicDelay: 3600, twapWindow: 600, maxTickDev: 300, tolAggBps: 30, tolDirectBps: 100, minTrade: 20n * 10n ** 18n, dust: 10n ** 18n },
      opts.allowAggRouter === false ? [BSC.PANCAKE_ROUTER] : [BSC.AGG_ROUTER, BSC.PANCAKE_ROUTER],
      opts.allowAggRouter === false ? [BSC.PANCAKE_ROUTER] : [BSC.AGG_ROUTER, BSC.PANCAKE_ROUTER]],
  );
  const factoryDeployedAt = Number((await pub.getBlock()).timestamp); // latest block is the factory deploy
  const lens = await deploy('FloorLens', [{ type: 'address' }], [factory]);

  const impl0 = (await pub.readContract({ address: BSC.BEACON, abi: parseAbi(['function implementation() view returns (address)']), functionName: 'implementation' })) as Address;
  await call(factory, 'setTokenBeacon', 'function setTokenBeacon(address,address)', [BSC.BEACON, impl0], owner);
  await call(factory, 'addAsset', 'function addAsset(address,address,uint24,uint128,uint256)', [BSC.NVDAB, BSC.POOL_NVDAB, 2500, 10n ** 21n, 25_000n * 10n ** 18n], owner);
  await call(factory, 'setKeeper', 'function setKeeper(address,bool)', [keeperAddr, true], owner);
  await call(factory, 'setLimits', 'function setLimits(uint256,uint256)', [1000n * 10n ** 18n, 5000n * 10n ** 18n], owner);

  // 3. fund the demo user with USDT by writing the balance slot (USDT BEP20 keeps `_balances` at slot 1), then check it
  const amt = 1000n * 10n ** 18n;
  const slot = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [user, 1n]));
  await test.setStorageAt({ address: BSC.USDT, index: slot, value: pad(toHex(amt)) });
  const bal = (await pub.readContract({ address: BSC.USDT, abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [user] })) as bigint;
  if (bal !== amt) throw new Error('USDT balance slot guess was wrong');

  // 4. open the position: 1000 USDT, floor 90%, 365 days, 100% NVDAB
  await call(BSC.USDT, 'approve', 'function approve(address,uint256)', [factory, amt], user);
  const r = await call(factory, 'createPosition', 'function createPosition(uint256,uint16,uint32,address[],uint16[]) returns (address)', [amt, 9000, 365 * 86400, [BSC.NVDAB], [10_000]], user);
  const vault = (await pub.readContract({ address: factory, abi: parseAbi(['function positions(uint256) view returns (address)']), functionName: 'positions', args: [0n] })) as Address;
  void r;
  return { factory, lens, vault: getAddress(vault), owner, user, keeper: keeperAddr, chainTime: opts.warp === false ? head : t, factoryDeployedAt };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rpc = process.argv[2] ?? 'http://127.0.0.1:8545';
  setupFork(rpc).then((f) => console.log(JSON.stringify(f)), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
