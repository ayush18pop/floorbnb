// Read-only: probes the unit of the quote `amount` (wei vs token units). Prints no keys.
//   bash -c 'set -a; . <repo>/.env; set +a; pnpm --filter @floor/bw3 exec tsx scripts/amount-probe.ts'
import { Bw3Client } from '../src/index.js';

const key = process.env.BW3_API_KEY;
const secret = process.env.BW3_API_SECRET;
if (!key || !secret) { console.log('SKIPPED: no BW3 keys'); process.exit(0); }
const c = new Bw3Client({ apiKey: key, apiSecret: secret, retryDelaysMs: [] });
const USDT = '0x55d398326f99059fF775485246999027B3197955';
const NVDAB = '0x02fca66c1d1afb4e2a7884261eb00f63598a7436';
const W = '0x000000000000000000000000000000000000dEaD';
for (const [from, to, amount] of [[USDT, NVDAB, '10000000000000000000'], [USDT, NVDAB, '10'], [USDT, NVDAB, '10.0'], [USDT, NVDAB, '100000000000000000000'], [NVDAB, USDT, '50000000000000000'], [USDT, NVDAB, '3000000000000000000']] as const) {
  try {
    const r = await c.quote({ from, to, amount, userWalletAddress: W });
    console.log(amount, '->', r.slice(0, 2).map((x) => `${x.vendorName}/${x.executionMode} from=${x.fromTokenAmount} to=${x.toTokenAmount}`).join(' | ') || 'no routes');
  } catch (e) { console.log(amount, '-> ERR', (e as Error).name, (e as Error).message.slice(0, 160)); }
}
