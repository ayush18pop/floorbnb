import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { vi } from 'vitest';
import { MemoryReceiptStore } from '@floor/db/src/x402Receipts';
import { SelfFacilitatorClient } from '@floor/x402';
import type { FloorApi } from './api';
import { loadConfig, type McpConfig } from './config';
import { createMcpApp } from './http';
import { EIP3009_TOKENS, gateFromConfig } from './payments';

export const REPO_ROOT = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
export const PAYEE = '0x00000000000000000000000000000000000000c3';
export const FACTORY = '0x00000000000000000000000000000000000000f1';
export const USDT_ADDR = '0x55d398326f99059fF775485246999027B3197955';
export const VAULT = '0x00000000000000000000000000000000000000a9';

export function testConfig(over: Partial<McpConfig> = {}): McpConfig {
  return { ...loadConfig({ X402_PAYTO: PAYEE, MCP_PUBLIC_URL: 'http://mcp.test/mcp' }, REPO_ROOT), ...over };
}

export function fakeApi(routes: Record<string, unknown | ((body?: unknown) => unknown)> = {}): FloorApi & { calls: string[] } {
  const calls: string[] = [];
  const handle = (key: string, body?: unknown) => {
    calls.push(key);
    if (!(key in routes)) throw Object.assign(new Error('no route ' + key), { status: 404 });
    const r = routes[key];
    return typeof r === 'function' ? (r as (b?: unknown) => unknown)(body) : r;
  };
  return { calls, get: async (p) => handle('GET ' + p), post: async (p, b) => handle('POST ' + p, b) };
}

/** SelfFacilitatorClient with REAL signature verification and a mocked chain (no network). */
export function mockedSelfFacilitator(state: { used?: boolean; balance?: bigint } = {}) {
  const publicClient = {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => (functionName === 'authorizationState' ? !!state.used : (state.balance ?? 10n ** 18n))),
    simulateContract: vi.fn(async (a: object) => ({ request: a })),
    waitForTransactionReceipt: vi.fn(async () => ({ status: 'success' })),
  };
  const walletClient = { account: { address: '0x0000000000000000000000000000000000000001' }, writeContract: vi.fn(async () => '0x' + 'ab'.repeat(32)) };
  const f = new SelfFacilitatorClient({ network: 'eip155:56', tokens: EIP3009_TOKENS, publicClient: publicClient as never, walletClient: walletClient as never });
  return { f, publicClient, walletClient };
}

export async function connect(app: ReturnType<typeof createMcpApp>) {
  const client = new Client({ name: 'test', version: '0' });
  const transport = new StreamableHTTPClientTransport(new URL('http://mcp.test/mcp'), {
    fetch: (async (u: string | URL, init?: RequestInit) => app.fetch(new Request(u, init))) as typeof fetch,
  });
  await client.connect(transport);
  return client;
}

export function buildApp(o: { api?: FloorApi; cfg?: Partial<McpConfig>; facilitator?: SelfFacilitatorClient; receipts?: MemoryReceiptStore; noGate?: boolean; limits?: { all: number; paid: number } } = {}) {
  const cfg = testConfig(o.cfg);
  const receipts = o.receipts ?? new MemoryReceiptStore();
  const gate = o.noGate ? undefined : gateFromConfig(cfg, {}, { facilitator: o.facilitator ?? mockedSelfFacilitator().f, receipts });
  return { app: createMcpApp({ cfg, api: o.api ?? fakeApi(), gate, limits: o.limits }), cfg, receipts };
}
