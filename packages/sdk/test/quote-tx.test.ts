import { decodeFunctionData, erc20Abi } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  buildCloseToUSDT,
  buildCreatePosition,
  buildExitInKind,
  buildPancakeExactIn,
  buildRequestClose,
  createPositionInputSchema,
  floorFactoryAbi,
  floorVaultAbi,
  getDeployment,
  LAUNCH_TERM_SECONDS,
  PRODUCT_NAME,
  quoteProtection,
  setDeployment,
  TOKENS,
  USDT,
  WAD,
} from '../src';

const FACTORY = '0x1111111111111111111111111111111111111111';
const VAULT = '0x2222222222222222222222222222222222222222';
const OWNER = '0x3333333333333333333333333333333333333333';

describe('quoteProtection', () => {
  it('$10,000 at 90% matches the worked example', () => {
    const q = quoteProtection({ deposit: 10_000n * WAD, floorBps: 9000, termSeconds: LAUNCH_TERM_SECONDS, now: 1000 });
    expect(q.floorValue).toBe(9000n * WAD);
    expect(q.cushion).toBe(1000n * WAD);
    expect(q.startingExposure).toBe(4000n * WAD);
    expect(q.startingExposureBps).toBe(4000);
    expect(q.startingCash).toBe(6000n * WAD);
    expect(q.gapToleranceBps).toBe(2500);
    expect(q.termEnd).toBe(1000 + LAUNCH_TERM_SECONDS);
  });
  it('splits across weights', () => {
    const q = quoteProtection({ deposit: 10_000n * WAD, floorBps: 9000, termSeconds: LAUNCH_TERM_SECONDS, weightsBps: [5000, 3000, 2000] });
    expect(q.assetTargets).toEqual([2000n * WAD, 1200n * WAD, 800n * WAD]);
  });
  it('caps exposure at deposit for low floors', () => {
    const q = quoteProtection({ deposit: 1000n * WAD, floorBps: 5000, termSeconds: LAUNCH_TERM_SECONDS });
    expect(q.startingExposure).toBe(1000n * WAD);
    expect(q.warnings.length).toBe(1);
  });
  it('rejects bad input', () => {
    expect(() => quoteProtection({ deposit: 1n, floorBps: 9900, termSeconds: LAUNCH_TERM_SECONDS })).toThrow();
    expect(() => quoteProtection({ deposit: 1n, floorBps: 9000, termSeconds: 1 })).toThrow();
    expect(() => quoteProtection({ deposit: 1n, floorBps: 9000, termSeconds: LAUNCH_TERM_SECONDS, weightsBps: [5000] })).toThrow();
  });
});

describe('tx builders', () => {
  const params = {
    owner: OWNER as `0x${string}`,
    factory: FACTORY as `0x${string}`,
    amount: 500n * WAD,
    floorBps: 9000,
    termSeconds: LAUNCH_TERM_SECONDS,
    assets: [TOKENS.NVDAB.address, TOKENS.QQQB.address],
    weightsBps: [6000, 4000],
  };
  it('createPosition returns exact approve then create', () => {
    const [approve, create] = buildCreatePosition(params);
    expect(approve.to).toBe(USDT);
    const a = decodeFunctionData({ abi: erc20Abi, data: approve.data });
    expect(a.functionName).toBe('approve');
    expect(a.args?.[1]).toBe(500n * WAD);
    const c = decodeFunctionData({ abi: floorFactoryAbi, data: create.data });
    expect(c.functionName).toBe('createPosition');
    expect(c.args?.[0]).toBe(500n * WAD);
    expect(c.args?.[1]).toBe(9000);
    expect(create.chainId).toBe(56);
    expect(create.value).toBe('0');
  });
  it('rejects duplicates and bad weights', () => {
    expect(() => buildCreatePosition({ ...params, assets: [TOKENS.NVDAB.address, TOKENS.NVDAB.address] })).toThrow();
    expect(() => buildCreatePosition({ ...params, weightsBps: [6000, 3000] })).toThrow();
  });
  it('vault calls encode', () => {
    expect(decodeFunctionData({ abi: floorVaultAbi, data: buildRequestClose(VAULT).data }).functionName).toBe('requestClose');
    expect(decodeFunctionData({ abi: floorVaultAbi, data: buildCloseToUSDT(VAULT).data }).functionName).toBe('closeToUSDT');
    const x = decodeFunctionData({ abi: floorVaultAbi, data: buildExitInKind(VAULT, OWNER).data });
    expect(x.functionName).toBe('exitInKind');
    expect((x.args?.[0] as string).toLowerCase()).toBe(OWNER);
  });
  it('pancake exactInputSingle encodes', () => {
    const tx = buildPancakeExactIn({
      router: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
      tokenIn: USDT,
      tokenOut: TOKENS.NVDAB.address,
      fee: 2500,
      recipient: VAULT,
      deadline: 1n,
      amountIn: 5n,
      amountOutMinimum: 4n,
    });
    expect(tx.data.startsWith('0x')).toBe(true);
  });
  it('schema accepts the same shape', () => {
    const ok = createPositionInputSchema.safeParse({ ...params, amount: '500', assets: [...params.assets] });
    expect(ok.success).toBe(true);
    expect(createPositionInputSchema.safeParse({ ...params, amount: '1', floorBps: 100, assets: [...params.assets] }).success).toBe(false);
  });
});

describe('addresses and constants', () => {
  it('throws clearly before deploy, works after setDeployment', () => {
    expect(() => getDeployment(56)).toThrow(/No Floor deployment/);
    setDeployment({ chainId: 56, factory: FACTORY, lens: VAULT });
    expect(getDeployment(56).factory).toBe(FACTORY);
  });
  it('product name from one constant', () => expect(PRODUCT_NAME).toBe('Floor'));
});
