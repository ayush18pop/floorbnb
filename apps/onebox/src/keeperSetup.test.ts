import { describe, expect, it } from 'vitest';
import { setupKeeper } from './keeperSetup';

const base = { FLOOR_FACTORY: '0x00000000000000000000000000000000000000f1', FLOOR_LENS: '0x00000000000000000000000000000000000000f2', BSC_RPC_URL: 'http://127.0.0.1:1' };
const start = (env: Record<string, string>) => {
  const lines: string[] = [];
  const k = setupKeeper(env, (l) => lines.push(l));
  const line = lines.map((l) => JSON.parse(l) as Record<string, unknown>).find((x) => x.event === 'start');
  return { k, line };
};

describe('setupKeeper binance client', () => {
  it('builds the Binance client with keys and route=direct, without enabling agg', () => {
    const { k, line } = start({ ...base, BW3_API_KEY: 'k', BW3_API_SECRET: 's', KEEPER_ROUTE: 'direct' });
    expect(k.mode).toBe('dry-run');
    expect(line).toMatchObject({ route: 'direct', aggEnabled: false, bw3Enabled: true });
  });
  it('enables agg only for route=agg with keys', () => {
    expect(start({ ...base, BW3_API_KEY: 'k', BW3_API_SECRET: 's', KEEPER_ROUTE: 'agg' }).line).toMatchObject({ aggEnabled: true, bw3Enabled: true });
    expect(start({ ...base, KEEPER_ROUTE: 'agg' }).line).toMatchObject({ aggEnabled: false, bw3Enabled: false });
  });
  it('has no client without keys', () => {
    expect(start(base).line).toMatchObject({ aggEnabled: false, bw3Enabled: false });
  });
});
