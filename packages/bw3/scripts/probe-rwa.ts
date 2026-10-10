// Read-only live probe of the Binance Web3 RWA / candles endpoints; records each response (as an envelope) under
// fixtures/live-2026-10-10/. Prints no keys. Run (secrets are read from the env, never echoed):
//   pnpm --filter @floor/bw3 exec tsx --env-file=<repo>/.env scripts/probe-rwa.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { Bw3Client } from '../src/index.js';

const key = process.env.BW3_API_KEY, secret = process.env.BW3_API_SECRET;
if (!key || !secret) { console.log('SKIPPED: no BW3 keys'); process.exit(0); }
const c = new Bw3Client({ apiKey: key, apiSecret: secret, retryDelaysMs: [] });
const TOK = {
  NVDAB: '0x02fca66c1d1afb4e2a7884261eb00f63598a7436',
  SPCXB: '0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1',
  QQQB: '0x205812cdbed920aff76c6580abd681a46d11efc7',
};
const dir = new URL('../fixtures/live-2026-10-10/', import.meta.url);
mkdirSync(dir, { recursive: true });
const save = (name: string, data: unknown) => writeFileSync(new URL(`${name}.json`, dir), JSON.stringify({ code: '000000', msg: 'success', data }, null, 2) + '\n');
const show = (e: unknown) => `${(e as Error).name}: ${(e as Error).message.slice(0, 200)}`;
const P = '/api/v1/dex/market';

async function rec(name: string, run: () => Promise<unknown>, trim?: (d: unknown) => unknown) {
  try {
    const d = await run();
    save(name, trim ? trim(d) : d);
    console.log('OK ', name, Array.isArray(d) ? `rows=${d.length}` : '');
  } catch (e) { console.log('ERR', name, show(e)); }
}

for (const [sym, a] of Object.entries(TOK)) {
  await rec(`underlying-market-${sym}`, () => c.rwaUnderlyingMarket(a));
  await rec(`underlying-profile-${sym}`, () => c.rwaUnderlyingProfile(a));
}
// First 3 rows only: the full lists are hundreds of rows.
await rec('tokens-bstock', () => c.rwaTokens({ platformId: 'bstock' }), (d) => (d as unknown[]).slice(0, 3));
await rec('search-NVDA', () => c.rwaSearch('NVDA'), (d) => (d as unknown[]).slice(0, 2));
await rec('search-by-address-NVDAB', () => c.rwaSearch(TOK.NVDAB));
await rec('platforms', () => c.rwaPlatforms());
await rec('candles-1d', () => c.candles({ address: TOK.NVDAB, interval: '1d', limit: 5 }));
await rec('candles-4h', () => c.candles({ address: TOK.NVDAB, interval: '4h', limit: 5 }));
await rec('candles-1h', () => c.candles({ address: TOK.NVDAB, interval: '1h', limit: 5 }));
// Error recordings (DX findings)
for (const [name, run] of [
  ['error-missing-address', () => c.request('GET', `${P}/rwa/underlying-market`, { query: { binanceChainId: '56' } })],
  ['error-bad-bar', () => c.request('GET', `${P}/candles`, { query: { binanceChainId: '56', tokenContractAddress: TOK.NVDAB, bar: '1D' } })],
  ['error-limit-range', () => c.request('GET', `${P}/candles`, { query: { binanceChainId: '56', tokenContractAddress: TOK.NVDAB, bar: '1d', limit: '365' } })],
] as const) {
  try { await run(); console.log('unexpected OK', name); } catch (e) {
    const err = e as { code?: string; message: string };
    writeFileSync(new URL(`${name}.json`, dir), JSON.stringify({ code: err.code ?? null, msg: err.message, data: null }, null, 2) + '\n');
    console.log('ERR(expected)', name, show(e));
  }
}
