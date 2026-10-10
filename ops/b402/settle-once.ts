// Run by a HUMAN. Default: b402 `supported` + `verify` for one tiny EIP-3009 payment (no broadcast).
// With --settle: call b402 `settle` ONCE (moves real funds, irreversible). Never prints keys.
import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { B402FacilitatorClient } from '../../packages/x402/src/b402';
import { signPayment } from '../../packages/x402/src/testutil';
import type { PaymentRequirements } from '../../packages/x402/src/types';

const env = process.env;
const need = (k: string): string => {
  const v = env[k]?.trim();
  if (!v) {
    console.error(`missing env ${k}`);
    process.exit(2);
  }
  return v;
};

const doSettle = process.argv.includes('--settle');
const apiKey = need('BW3_API_KEY');
const apiSecret = need('BW3_API_SECRET');
const payerKey = need('B402_TEST_PAYER_KEY');
const asset = need('X402_ASSET');
const payTo = need('X402_PAYTO');
const amountDec = env.B402_TEST_AMOUNT?.trim() || '0.01';
if (!/^\d+(\.\d{1,18})?$/.test(amountDec)) {
  console.error('B402_TEST_AMOUNT must be a decimal number');
  process.exit(2);
}
const [whole = '0', frac = ''] = amountDec.split('.');
const amount = (BigInt(whole) * 10n ** 18n + BigInt(frac.padEnd(18, '0'))).toString(); // 18-decimal token (USD1 / U)
const network = env.X402_NETWORK?.trim() || 'eip155:56';

const client = new B402FacilitatorClient({ apiKey, apiSecret });
const payer = privateKeyToAccount((payerKey.startsWith('0x') ? payerKey : `0x${payerKey}`) as `0x${string}`);

async function main() {
  console.log(`mode: ${doSettle ? 'SETTLE (real funds)' : 'supported + verify only'}`);
  console.log(`payer ${payer.address} -> payTo ${payTo}, asset ${asset}, amount ${amountDec} (${amount} atomic), network ${network}`);

  const supported = await client.getSupported();
  console.log('supported:', JSON.stringify(supported, null, 2));

  // EIP-712 domain of the token: from `supported` if it lists this asset, else env override.
  const kind = supported.kinds.find((k) => k.asset?.toLowerCase() === asset.toLowerCase() && (!k.network || k.network === network));
  const name = env.X402_TOKEN_NAME?.trim() || (kind?.extra.name as string | undefined);
  const version = env.X402_TOKEN_VERSION?.trim() || (kind?.extra.version as string | undefined) || '1';
  if (!name) {
    console.error('token EIP-712 name unknown: not in `supported` for this asset; set X402_TOKEN_NAME (and X402_TOKEN_VERSION)');
    process.exit(2);
  }

  const requirements: PaymentRequirements = {
    scheme: 'exact',
    network,
    asset,
    amount,
    payTo,
    maxTimeoutSeconds: 300,
    extra: { name, version, assetTransferMethod: 'eip3009' },
  };
  const payment = await signPayment(payer, requirements, { name, version });

  const v = await client.verify(payment, requirements);
  console.log('verify:', JSON.stringify(v));
  if (!v.isValid) {
    console.error('verify says invalid; not settling');
    process.exit(1);
  }
  if (!doSettle) {
    console.log('done (no settle). Re-run with --settle to move funds once.');
    return;
  }

  const s = await client.settle(payment, requirements); // exactly once, never retried
  console.log('settle:', JSON.stringify(s));
  if (!s.transaction) {
    console.log(s.success ? 'success but no transaction hash returned' : `terminal failure before broadcast: ${s.errorReason ?? 'no reason given'}`);
    process.exit(s.success ? 0 : 1);
  }
  console.log(`tx ${s.transaction}\nhttps://bscscan.com/tx/${s.transaction}`);

  // The docs describe no status endpoint (see README). Wait for the receipt on chain. Do not call settle again.
  const rpc = createPublicClient({ transport: http(env.BSC_RPC_URL?.trim() || 'https://bsc-dataseed.binance.org') });
  try {
    const r = await rpc.waitForTransactionReceipt({ hash: s.transaction as `0x${string}`, timeout: 90_000 });
    console.log(`receipt: ${r.status} in block ${r.blockNumber}`);
  } catch {
    console.log('no receipt within 90 s; check the BscScan link above. Do NOT settle again.');
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : 'failed');
  process.exit(1);
});
