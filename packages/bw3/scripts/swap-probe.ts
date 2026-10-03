// Read-only: min-order, no-route and simulate-endpoint probes. Nothing is sent to chain. Prints no keys.
import { Bw3Client } from '../src/index.js';
const key = process.env.BW3_API_KEY, secret = process.env.BW3_API_SECRET;
if (!key || !secret) { console.log('SKIPPED: no BW3 keys'); process.exit(0); }
const c = new Bw3Client({ apiKey: key, apiSecret: secret, retryDelaysMs: [] });
const USDT = '0x55d398326f99059fF775485246999027B3197955';
const NVDAB = '0x02fca66c1d1afb4e2a7884261eb00f63598a7436';
const W = '0x000000000000000000000000000000000000dEaD';
const show = (e: unknown) => `${(e as Error).name}: ${(e as Error).message.slice(0, 200)}`;
for (const amount of ['4000000000000000000', '5000000000000000000', '10000000000000000000']) {
  try {
    const r = await c.quote({ from: USDT, to: NVDAB, amount, userWalletAddress: W });
    const s = await c.swap({ from: USDT, to: NVDAB, amount, userWalletAddress: W, quoteId: r[0]!.quoteId, slippagePercent: '1' });
    console.log(amount, 'swap ok router', s.to, 'approve', s.approveTarget, 'mode', s.executionMode, 'minRecv', s.minReceiveAmount, 'quoteKeys', Object.keys(r[0]!).join(','));
    if (amount.startsWith('10')) {
      try { console.log('simulate', JSON.stringify(await c.simulate({ from: W, to: s.to, data: s.data })).slice(0, 400)); } catch (e) { console.log('simulate ERR', show(e)); }
    }
  } catch (e) { console.log(amount, 'ERR', show(e)); }
}
try { console.log('noroute', JSON.stringify(await c.quote({ from: USDT, to: '0x000000000000000000000000000000000000dEaD', amount: '10000000000000000000', userWalletAddress: W }))); } catch (e) { console.log('noroute ERR', show(e)); }
// quote ttl: reuse a quoteId after a delay
const r = await c.quote({ from: USDT, to: NVDAB, amount: '10000000000000000000', userWalletAddress: W });
for (const wait of [0, 20, 40]) {
  await new Promise((x) => setTimeout(x, wait * 1000));
  try { await c.swap({ from: USDT, to: NVDAB, amount: '10000000000000000000', userWalletAddress: W, quoteId: r[0]!.quoteId, slippagePercent: '1' }); console.log('quoteId reuse after cumulative wait', wait, 'ok'); } catch (e) { console.log('quoteId reuse after', wait, 'ERR', show(e)); }
}
