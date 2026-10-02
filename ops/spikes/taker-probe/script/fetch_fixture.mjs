// Fetches one aggregator quote+swap and writes a fixture with keys stripped. READ-ONLY API calls only, nothing is sent
// to chain. Usage: node fetch_fixture.mjs <fromToken> <toToken> <amountWei> <X address> <out.json> [vendor]
// Needs BW3_API_KEY and BW3_API_SECRET in the environment (load ~/.config/floor/secrets.env inside the command).
// UNVERIFIED: signature encoding. Docs were behind an AWS WAF challenge. Default base64; set BW3_SIGN_ENC=hex to switch.
import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const [fromToken, toToken, amount, X, out, vendor] = process.argv.slice(2);
const { BW3_API_KEY: key, BW3_API_SECRET: secret } = process.env;
if (!key || !secret) { console.error('BLOCKED: BW3_API_KEY / BW3_API_SECRET not set'); process.exit(2); }
const BASE = 'https://web3.binance.com';
async function get(path, params) {
  const qs = new URLSearchParams(params).toString();
  const signedPath = `/build${path}?${qs}`;
  const ts = new Date().toISOString();
  const sign = createHmac('sha256', secret).update(ts + 'GET' + signedPath).digest(process.env.BW3_SIGN_ENC || 'base64');
  const r = await fetch(BASE + signedPath, { headers: { 'X-OC-APIKEY': key, 'X-OC-TIMESTAMP': ts, 'X-OC-SIGN': sign } });
  return r.json();
}
const q = { binanceChainId: '56', amount, fromTokenAddress: fromToken, toTokenAddress: toToken, userWalletAddress: X };
if (vendor) q.vendor = vendor;
const quote = await get('/api/v1/dex/aggregator/quote', q);
const best = (quote.data || [])[0];
if (!best) { console.error('no route', JSON.stringify(quote).slice(0, 300)); process.exit(3); }
const swap = await get('/api/v1/dex/aggregator/swap', { ...q, quoteId: best.quoteId, slippagePercent: '1' });
const d = swap.data;
const sig = JSON.parse((d.tx.signatureData || ['{}'])[0] || '{}');
writeFileSync(out, JSON.stringify({ from: X, to: d.tx.to, data: d.tx.data, approveTarget: sig.approveContract || best.approveTarget,
  fromToken, toToken, amount, vendor: best.vendorName, executionMode: d.executionMode ?? best.executionMode, minReceiveAmount: d.tx.minReceiveAmount, toTokenAmount: best.toTokenAmount }, null, 2));
console.log('wrote', out, 'vendor', best.vendorName, 'mode', best.executionMode);
