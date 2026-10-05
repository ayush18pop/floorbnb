import { describe, expect, it } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { signPayment } from '@floor/x402/src/testutil';
import { SelfFacilitatorClient, b64decode, b64encode, type PaymentRequired } from '@floor/x402';
import { AUDIT_STATEMENT, DISCLOSURE, loadConfig } from './config';
import { EIP3009_TOKENS } from './payments';
import { FREE_TOOLS, PAID_TOOLS } from './tools';
import { FACTORY, PAYEE, REPO_ROOT, USDT_ADDR, VAULT, buildApp, connect, fakeApi, mockedSelfFacilitator } from './testkit';

const text = (r: unknown) => JSON.parse(((r as { content: { text: string }[] }).content[0]!).text);
const structured = (r: unknown) => (r as { structuredContent: Record<string, any> }).structuredContent;
const isErr = (r: unknown) => (r as { isError?: boolean }).isError === true;
const acct = () => privateKeyToAccount(generatePrivateKey());

const floorInfo = { product: 'Floor', chainId: 56, factory: FACTORY, lens: '0x00000000000000000000000000000000000000l1', usdt: USDT_ADDR, assets: [], disclosure: 'x' };
const quoteArgs = { depositUsdt: '1000', floorBps: 9000 };

async function pay(client: Awaited<ReturnType<typeof connect>>, name: string, args: Record<string, unknown>, payer = acct()) {
  const first = await client.callTool({ name, arguments: args });
  const pr = structured(first) as unknown as PaymentRequired;
  const req = pr.accepts[0]!;
  const tok = EIP3009_TOKENS.find((t) => t.address.toLowerCase() === req.asset.toLowerCase())!;
  const payment = await signPayment(payer, req, tok);
  return { first, pr, payment, second: await client.callTool({ name, arguments: args, _meta: { 'x402/payment': payment } }) };
}

describe('tool list', () => {
  it('lists the nine tools with strict schemas, annotations and honest paid labels', async () => {
    const client = await connect(buildApp().app);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...FREE_TOOLS, ...PAID_TOOLS].sort());
    for (const t of tools) {
      expect(t.inputSchema.additionalProperties).toBe(false);
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.outputSchema).toBeDefined();
    }
    for (const n of PAID_TOOLS) expect(tools.find((t) => t.name === n)!.description).toMatch(/PAID: 0\.01 USD per call via x402\./);
    for (const n of FREE_TOOLS) expect(tools.find((t) => t.name === n)!.description).not.toMatch(/PAID/);
    expect(client.getInstructions()).toMatch(/never signs/i);
  });
});

describe('free tools (mocked API)', () => {
  it('get_floor_info adds disclosure and the exact audit wording', async () => {
    const client = await connect(buildApp({ api: fakeApi({ 'GET /v1/floor': floorInfo }) }).app);
    const r = await client.callTool({ name: 'get_floor_info', arguments: {} });
    expect(isErr(r)).toBe(false);
    const s = structured(r);
    expect(s.factory).toBe(FACTORY);
    expect(s.disclosure).toBe(DISCLOSURE);
    expect(s.disclosure).toMatch(/about 24%/);
    expect(s.disclosure).toMatch(/not a guarantee/i);
    expect(s.audit).toBe(AUDIT_STATEMENT);
    expect(JSON.stringify(s)).not.toMatch(/\baudited\b/i);
    expect(s.tools.paid.map((p: { name: string }) => p.name)).toEqual([...PAID_TOOLS]);
  });

  it('list_assets survives a missing price source and says so', async () => {
    const api = fakeApi({ 'GET /v1/assets': { assets: [{ symbol: 'NVDAB' }] } }); // /v1/market throws
    const r = await (await connect(buildApp({ api }).app)).callTool({ name: 'list_assets', arguments: {} });
    expect(structured(r).assets[0].symbol).toBe('NVDAB');
    expect(structured(r).market).toBeNull();
    expect(structured(r).marketNote).toMatch(/unavailable/);
  });

  it('get_status needs exactly one of owner or vault', async () => {
    const api = fakeApi({ [`GET /v1/positions/${VAULT}`]: { vault: VAULT, value: '1' } });
    const client = await connect(buildApp({ api }).app);
    expect(isErr(await client.callTool({ name: 'get_status', arguments: {} }))).toBe(true);
    expect(isErr(await client.callTool({ name: 'get_status', arguments: { owner: PAYEE, vault: VAULT } }))).toBe(true);
    const r = await client.callTool({ name: 'get_status', arguments: { vault: VAULT } });
    expect(structured(r).result.vault).toBe(VAULT);
  });

  it('rejects unknown keys and bad addresses before any API call', async () => {
    const api = fakeApi();
    const client = await connect(buildApp({ api }).app);
    for (const args of [{ vault: VAULT, extra: 1 }, { vault: '0x123' }]) {
      const r = await client.callTool({ name: 'get_status', arguments: args }).catch((e) => ({ isError: true, e }));
      expect(isErr(r)).toBe(true);
    }
    expect(api.calls).toEqual([]);
  });

  const createArgs = { owner: PAYEE, amount: '1000000000000000000', floorBps: 9000, termSeconds: 31_536_000, assets: ['0x02fca66c1d1afb4e2a7884261eb00f63598a7436'], weightsBps: [10000] };

  it('build_create_position_tx returns the API unsigned txs only when every `to` is USDT or the factory', async () => {
    const good = { txs: [{ to: USDT_ADDR, data: '0x' }, { to: FACTORY, data: '0x' }], checks: {} };
    const r = await (await connect(buildApp({ api: fakeApi({ 'GET /v1/floor': floorInfo, 'POST /v1/tx/create-position': good }) }).app)).callTool({ name: 'build_create_position_tx', arguments: createArgs });
    expect(isErr(r)).toBe(false);
    expect(structured(r).txs).toHaveLength(2);
    const bad = { txs: [{ to: '0x00000000000000000000000000000000000000bd', data: '0x' }] };
    const r2 = await (await connect(buildApp({ api: fakeApi({ 'GET /v1/floor': floorInfo, 'POST /v1/tx/create-position': bad }) }).app)).callTool({ name: 'build_create_position_tx', arguments: createArgs });
    expect(isErr(r2)).toBe(true);
    expect(structured(r2).error.code).toBe('guard');
  });

  it('build_exit_tx passes the kind as mode and refuses a tx aimed anywhere but the vault', async () => {
    let seen: unknown;
    const api = fakeApi({ 'POST /v1/tx/exit': (b?: unknown) => ((seen = b), { mode: 'requestClose', tx: { to: VAULT, simulation: { ok: true } } }) });
    const client = await connect(buildApp({ api }).app);
    const r = await client.callTool({ name: 'build_exit_tx', arguments: { vault: VAULT, kind: 'requestClose' } });
    expect(seen).toEqual({ vault: VAULT, mode: 'requestClose' });
    expect(structured(r).tx.simulation.ok).toBe(true);
    const evil = fakeApi({ 'POST /v1/tx/exit': { tx: { to: PAYEE } } });
    const r2 = await (await connect(buildApp({ api: evil }).app)).callTool({ name: 'build_exit_tx', arguments: { vault: VAULT, kind: 'closeToUSDT' } });
    expect(structured(r2).error.code).toBe('guard');
    const r3 = await client.callTool({ name: 'build_exit_tx', arguments: { vault: VAULT, kind: 'selfDestruct' } }).catch((e) => ({ isError: true, e }));
    expect(isErr(r3)).toBe(true);
  });
});

describe('paid tools: x402 over MCP (real signature verification, mocked chain)', () => {
  it('unpaid call returns a payment-required result, then a valid EIP-3009 payment gets the quote', async () => {
    const { f, walletClient } = mockedSelfFacilitator();
    const { app } = buildApp({ facilitator: f });
    const client = await connect(app);
    const { first, pr, second } = await pay(client, 'quote_protection', quoteArgs);
    expect(isErr(first)).toBe(true);
    expect(text(first)).toEqual(pr);
    expect(pr.x402Version).toBe(2);
    expect(pr.accepts[0]).toMatchObject({ scheme: 'exact', network: 'eip155:56', payTo: PAYEE, amount: '10000000000000000', extra: { assetTransferMethod: 'eip3009' } });
    expect(isErr(second)).toBe(false);
    const q = structured(second);
    expect(q.quote.floorValue).toBe('900000000000000000000');
    expect(q.quote.startingExposure).toBe('400000000000000000000');
    expect(q.asUsdt.startingCash).toBe('600');
    expect(q.quote.gapToleranceBps).toBe(2500);
    expect(q.disclosure).toBe(DISCLOSURE);
    expect(q.reference.pooledByGroup.length).toBeGreaterThan(0);
    const settle = (second as { _meta: Record<string, any> })._meta['x402/payment-response'];
    expect(settle).toMatchObject({ success: true, network: 'eip155:56' });
    expect(settle.transaction).toMatch(/^0x[0-9a-f]{64}$/);
    expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
  });

  it('mirrors PAYMENT-REQUIRED / PAYMENT-RESPONSE as HTTP headers, and can answer HTTP 402', async () => {
    const call = (app: ReturnType<typeof buildApp>['app'], headers: Record<string, string> = {}) =>
      app.fetch(new Request('http://mcp.test/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'quote_protection', arguments: quoteArgs } }),
      }));
    const a = buildApp();
    const res = await call(a.app);
    expect(res.status).toBe(200); // x402 MCP spec: isError result
    const hdr = b64decode<PaymentRequired>(res.headers.get('PAYMENT-REQUIRED')!);
    expect(hdr.accepts.length).toBeGreaterThan(0);
    expect((await call(buildApp({ cfg: { http402: true } }).app)).status).toBe(402);
    // PAYMENT-SIGNATURE header path (HTTP clients that pay at the transport level)
    const pr = hdr.accepts[0]!;
    const tok = EIP3009_TOKENS.find((t) => t.address.toLowerCase() === pr.asset.toLowerCase())!;
    const sig = b64encode(await signPayment(acct(), pr, tok));
    const paid = await call(a.app, { 'payment-signature': sig });
    expect(paid.status).toBe(200);
    expect(b64decode<{ success: boolean }>(paid.headers.get('PAYMENT-RESPONSE')!).success).toBe(true);
  });

  it('refuses a replayed payment, an underpayment and a forged signer', async () => {
    const { app } = buildApp();
    const client = await connect(app);
    const { payment, pr } = await pay(client, 'simulate_gap', { ...quoteArgs, gapBps: 3000 });
    const replay = await client.callTool({ name: 'simulate_gap', arguments: { ...quoteArgs, gapBps: 3000 }, _meta: { 'x402/payment': payment } });
    expect(isErr(replay)).toBe(true);
    expect(structured(replay).error).toBe('payment_already_used');

    const req = pr.accepts[0]!;
    const tok = EIP3009_TOKENS.find((t) => t.address.toLowerCase() === req.asset.toLowerCase())!;
    const under = await signPayment(acct(), req, tok, { value: '1' });
    const r1 = await client.callTool({ name: 'quote_protection', arguments: quoteArgs, _meta: { 'x402/payment': under } });
    expect(isErr(r1)).toBe(true);
    const forged = await signPayment(acct(), req, tok);
    forged.payload.authorization!.from = acct().address;
    const r2 = await client.callTool({ name: 'quote_protection', arguments: quoteArgs, _meta: { 'x402/payment': forged } });
    expect(isErr(r2)).toBe(true);
    expect(structured(r2).error).toBe('invalid_signature');
  });

  it('invalid tool input fails before any payment is requested; a failed run is not charged', async () => {
    const { f, walletClient } = mockedSelfFacilitator();
    const client = await connect(buildApp({ facilitator: f }).app);
    const r = await client.callTool({ name: 'quote_protection', arguments: { depositUsdt: '1000', floorBps: 100 } }).catch((e) => ({ isError: true, e }));
    expect(isErr(r)).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/x402Version/);
    // weights that do not sum to 10000: passes the schema, fails in the tool, payment must not settle
    const { second } = await pay(client, 'quote_protection', { ...quoteArgs, weightsBps: [5000] });
    expect(isErr(second)).toBe(true);
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it('simulate_gap: a 25% gap at 4x lands exactly on the floor, 30% falls 20 below', async () => {
    const client = await connect(buildApp().app);
    const a = await pay(client, 'simulate_gap', { ...quoteArgs, gapBps: 2500 });
    expect(structured(a.second)).toMatchObject({ valueAfterUsdt: '900', belowFloor: false, shortfallUsdt: '0' });
    const b = await pay(client, 'simulate_gap', { ...quoteArgs, gapBps: 3000 });
    expect(structured(b.second)).toMatchObject({ valueAfterUsdt: '880', belowFloor: true, shortfallUsdt: '20' });
    expect(structured(b.second).method).toMatch(/not a forecast/);
  });

  it('backtest returns the stored numbers from docs/data and research/m_study', async () => {
    const client = await connect(buildApp().app);
    const { second } = await pay(client, 'backtest', { basket: 'NVDA' });
    expect(isErr(second)).toBe(false);
    const s = structured(second);
    expect(s.stored).toMatchObject({ basket: 'NVDA', mode: 'close_only', m: 4, windows: 93, breach_pct: 0, worst_pct: -9.99, bad_yr_vault: -9.84, bad_yr_hold: -36.45 });
    expect(s.paths.worstWindow).toMatchObject({ start: '2022-01-03', holdingReturnPct: expect.any(Number) });
    expect(s.paths.worstWindow.vaultReturnPct).toBeGreaterThan(-10.5);
    const single = s.longHistory.pooledByGroup.find((g: { group: string }) => g.group === 'Single stock');
    expect(single).toMatchObject({ windows: 984, breachMaterialPct: 0.61, breachAnyPct: 4.07 });
    expect(JSON.stringify(s)).toMatch(/not bStocks/);
  });

  it('backtest reports missing data instead of inventing it', async () => {
    const client = await connect(buildApp({ cfg: { dataRoot: '/nonexistent' } }).app);
    const { second } = await pay(client, 'backtest', { basket: 'QQQ' });
    expect(isErr(second)).toBe(true);
    expect(JSON.stringify(second)).not.toMatch(/breach_pct/);
  });

  it('a settlement failure never returns the paid data (402-style error, no quote)', async () => {
    const { f, publicClient } = mockedSelfFacilitator();
    publicClient.simulateContract.mockRejectedValueOnce(new Error('execution reverted: out of gas'));
    const client = await connect(buildApp({ facilitator: f }).app);
    const { second } = await pay(client, 'quote_protection', quoteArgs);
    expect(isErr(second)).toBe(true);
    expect(structured(second).error).toMatch(/^settle_failed/);
    expect(structured(second).accepts).toBeDefined();
    expect(JSON.stringify(second)).not.toMatch(/floorValue|startingExposure|gapToleranceBps/);
    // and over HTTP with the 402 switch on: status 402, no quote in the body
    const { f: f2, publicClient: pc2 } = mockedSelfFacilitator();
    pc2.simulateContract.mockRejectedValue(new Error('boom'));
    const a = buildApp({ facilitator: f2, cfg: { http402: true } });
    const call = (headers: Record<string, string> = {}) => a.app.fetch(new Request('http://mcp.test/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'quote_protection', arguments: quoteArgs } }) }));
    const pr = b64decode<PaymentRequired>((await call()).headers.get('PAYMENT-REQUIRED')!);
    const tok = EIP3009_TOKENS.find((t) => t.address.toLowerCase() === pr.accepts[0]!.asset.toLowerCase())!;
    const res = await call({ 'payment-signature': b64encode(await signPayment(acct(), pr.accepts[0]!, tok)) });
    expect(res.status).toBe(402);
    expect(await res.text()).not.toMatch(/floorValue|startingExposure/);
  });

  it('the payment-required result states price, network, payTo and token symbol in plain form', async () => {
    const client = await connect(buildApp().app);
    const first = await client.callTool({ name: 'simulate_gap', arguments: { ...quoteArgs, gapBps: 1000 } });
    expect(structured(first).payment).toMatchObject({ tool: 'simulate_gap', priceUsd: '0.01', network: 'eip155:56', payTo: PAYEE });
    expect(structured(first).payment.options[0]).toMatchObject({ symbol: expect.stringMatching(/USD1|U/), amountAtomic: '10000000000000000', method: 'eip3009' });
  });

  it('with the default env every paid tool asks 0.01 USD per call: 10000000000000000 atomic units for USD1 and U (18 decimals)', async () => {
    const client = await connect(buildApp().app);
    const args: Record<string, Record<string, unknown>> = { quote_protection: quoteArgs, simulate_gap: { ...quoteArgs, gapBps: 1000 }, backtest: { basket: 'NVDA' } };
    for (const name of PAID_TOOLS) {
      const s = structured(await client.callTool({ name, arguments: args[name]! }));
      expect(s.payment).toMatchObject({ tool: name, priceUsd: '0.01' });
      expect(s.accepts.length).toBeGreaterThan(0);
      for (const a of s.accepts) expect(a.amount).toBe('10000000000000000');
    }
  });

  it('price, asset, decimals, network and payTo come from configuration (custom 6-decimal token)', async () => {
    const asset = '0x00000000000000000000000000000000000000aa';
    const cfg = loadConfig({ X402_PAYTO: PAYEE, X402_NETWORK: 'eip155:31337', X402_ASSET: asset, X402_ASSET_NAME: 'Test USD', X402_ASSET_SYMBOL: 'TUSD', X402_ASSET_DECIMALS: '6', PRICE_SIMULATE_GAP_USD: '0.25' }, REPO_ROOT);
    const { f } = mockedSelfFacilitator();
    const custom = new SelfFacilitatorClient({ network: 'eip155:31337', tokens: [{ address: asset, name: 'Test USD', version: '1' }], publicClient: (f as any).o.publicClient, walletClient: (f as any).o.walletClient });
    const client = await connect(buildApp({ cfg, facilitator: custom }).app);
    const first = await client.callTool({ name: 'simulate_gap', arguments: { ...quoteArgs, gapBps: 1000 } });
    const s = structured(first);
    expect(s.accepts).toHaveLength(1);
    expect(s.accepts[0]).toMatchObject({ network: 'eip155:31337', asset, payTo: PAYEE, amount: '250000' });
    expect(s.payment).toMatchObject({ priceUsd: '0.25', network: 'eip155:31337', options: [{ symbol: 'TUSD', amountAtomic: '250000' }] });
    expect(() => loadConfig({ X402_ASSET: asset }, REPO_ROOT)).toThrow(/X402_ASSET_NAME/);
    expect(() => loadConfig({ X402_PAYTO: 'nope' }, REPO_ROOT)).toThrow(/X402_PAYTO/);
  });

  it('without a payee configured paid tools refuse to run and free tools still work', async () => {
    const client = await connect(buildApp({ noGate: true, api: fakeApi({ 'GET /v1/floor': floorInfo }) }).app);
    const r = await client.callTool({ name: 'quote_protection', arguments: quoteArgs });
    expect(isErr(r)).toBe(true);
    expect(structured(r).error.code).toBe('payments_not_configured');
    expect(isErr(await client.callTool({ name: 'get_floor_info', arguments: {} }))).toBe(false);
  });
});

describe('HTTP guards', () => {
  const post = (app: ReturnType<typeof buildApp>['app'], headers: Record<string, string> = {}, body: string = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })) =>
    app.fetch(new Request('http://mcp.test/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body }));

  it('GET and DELETE /mcp answer 405 (stateless, no sessions)', async () => {
    const { app } = buildApp();
    const g = await app.fetch(new Request('http://mcp.test/mcp'));
    expect(g.status).toBe(405);
    expect(g.headers.get('allow')).toBe('POST');
    expect(((await g.json()) as { name: string }).name).toBe('floor-mcp');
    const h = await app.fetch(new Request('http://mcp.test/mcp', { headers: { accept: 'text/html' } }));
    expect(h.status).toBe(405);
    expect(h.headers.get('content-type')).toContain('text/html');
    expect(await h.text()).toContain('MCP');
    expect((await app.fetch(new Request('http://mcp.test/mcp', { method: 'DELETE' }))).status).toBe(405);
  });
  it('rejects a foreign Origin (403) but allows a listed one and no Origin', async () => {
    const { app } = buildApp({ cfg: { allowedOrigins: ['https://app.example'] } });
    expect((await post(app, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await post(app, { origin: 'https://app.example' })).status).toBe(200);
    expect((await post(app)).status).toBe(200);
  });
  it('rejects an unsupported MCP-Protocol-Version with 400', async () => {
    expect((await post(buildApp().app, { 'mcp-protocol-version': '1999-01-01' })).status).toBe(400);
  });
  it('caps the body at 64 KB (413) and rejects non-JSON (400)', async () => {
    const { app } = buildApp();
    expect((await post(app, {}, JSON.stringify({ pad: 'x'.repeat(70_000) }))).status).toBe(413);
    expect((await post(app, {}, 'nope')).status).toBe(400);
  });
  it('rate limits per IP and more tightly for paid-tool calls', async () => {
    const { app } = buildApp({ limits: { all: 3, paid: 1 } });
    const paidBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'backtest', arguments: { basket: 'NVDA' } } });
    expect((await post(app, {}, paidBody)).status).toBe(200);
    const limited = await post(app, {}, paidBody);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    await post(app);
    expect((await post(app)).status).toBe(429);
  });
});
