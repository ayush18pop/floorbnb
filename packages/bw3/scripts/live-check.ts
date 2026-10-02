// One live read-only quote, USDT -> NVDAB, 10 USDT. Runs only if BW3_API_KEY and BW3_API_SECRET are set.
// Prints route vendor and toTokenAmount, never keys. Load secrets inside the command:
//   bash -c 'set -a; . ~/.config/floor/secrets.env; set +a; pnpm --filter @floor/bw3 live-check'
import { Bw3Client } from '../src/index.js';

const key = process.env.BW3_API_KEY;
const secret = process.env.BW3_API_SECRET;
if (!key || !secret) {
  console.log('SKIPPED: BW3_API_KEY / BW3_API_SECRET not set (no keys in this environment).');
  process.exit(0);
}
const client = new Bw3Client({ apiKey: key, apiSecret: secret, signEncoding: process.env.BW3_SIGN_ENC === 'hex' ? 'hex' : 'base64' });
const routes = await client.quote({
  from: '0x55d398326f99059fF775485246999027B3197955', // USDT
  to: '0x02fca66c1d1afb4e2a7884261eb00f63598a7436', // NVDAB
  amount: '10000000000000000000',
  userWalletAddress: '0x000000000000000000000000000000000000dEaD',
});
const best = routes[0];
console.log(best ? `vendor=${best.vendorName} toTokenAmount=${best.toTokenAmount} executionMode=${best.executionMode}` : 'no routes');
