import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getConnInfo } from '@hono/node-server/conninfo';
import { b64decode, type PaymentPayload } from '@floor/x402';
import type { FloorApi } from './api';
import type { McpConfig } from './config';
import type { Gate } from './payments';
import { PAID_TOOLS, createFloorMcpServer, type RequestCtx } from './tools';

export interface McpAppDeps {
  cfg: McpConfig;
  api: FloorApi;
  gate?: Gate;
  now?: () => number;
  limits?: { all: number; paid: number };
}

/** Fixed-window per-key counter. Returns seconds to wait, or 0. */
class Limiter {
  private w = new Map<string, { start: number; n: number }>();
  constructor(private now: () => number) {}
  hit(key: string, max: number): number {
    const t = this.now();
    const cur = this.w.get(key);
    if (!cur || t - cur.start >= 60_000) {
      this.w.set(key, { start: t, n: 1 });
      if (this.w.size > 10_000) for (const [k, v] of this.w) if (t - v.start >= 60_000) this.w.delete(k);
      return 0;
    }
    cur.n += 1;
    return cur.n > max ? Math.max(1, Math.ceil((60_000 - (t - cur.start)) / 1000)) : 0;
  }
}

const rpcError = (status: number, code: number, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }), { status, headers: { 'content-type': 'application/json', ...headers } });

function paidCall(body: unknown): boolean {
  const msgs = Array.isArray(body) ? body : [body];
  return msgs.some((m) => {
    const x = m as { method?: string; params?: { name?: string } } | null;
    return x?.method === 'tools/call' && (PAID_TOOLS as readonly string[]).includes(String(x.params?.name));
  });
}

export function createMcpApp(deps: McpAppDeps): Hono {
  const { cfg } = deps;
  const now = deps.now ?? Date.now;
  const limiter = new Limiter(now);
  const limits = deps.limits ?? { all: 120, paid: 20 };
  const app = new Hono();

  const ip = (c: Context): string => {
    if (cfg.trustProxy) {
      const x = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
      if (x) return x;
    }
    try {
      return getConnInfo(c).remote.address ?? 'unknown';
    } catch {
      return 'unknown';
    }
  };

  app.get('/healthz', (c) => c.json({ ok: true, name: 'floor-mcp', paidToolsEnabled: !!deps.gate, facilitator: cfg.facilitator }));

  // Stateless server: no sessions, no SSE stream to open. Streamable HTTP lets a server answer 405 here.
  const notAllowed = () => new Response(null, { status: 405, headers: { Allow: 'POST' } });
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);

  app.post(
    '/mcp',
    bodyLimit({ maxSize: 64 * 1024, onError: () => rpcError(413, -32000, 'body over 64 KB') }),
    async (c) => {
      // DNS-rebinding guard from the Streamable HTTP spec: a browser Origin must be on the allow-list. Non-browser clients send none.
      const origin = c.req.header('origin');
      if (origin && !cfg.allowedOrigins.includes(origin)) return rpcError(403, -32000, 'origin not allowed');
      const ver = c.req.header('mcp-protocol-version');
      if (ver && !SUPPORTED_PROTOCOL_VERSIONS.includes(ver)) return rpcError(400, -32000, `unsupported MCP-Protocol-Version ${ver}`);

      const wait = limiter.hit(`all:${ip(c)}`, limits.all);
      if (wait) return rpcError(429, -32000, 'rate limited', { 'Retry-After': String(wait) });

      let parsed: unknown;
      try {
        parsed = await c.req.json();
      } catch {
        return rpcError(400, -32700, 'parse error: body must be JSON');
      }
      if (paidCall(parsed)) {
        const w = limiter.hit(`paid:${ip(c)}`, limits.paid);
        if (w) return rpcError(429, -32000, 'rate limited (paid tools)', { 'Retry-After': String(w) });
      }

      const ctx: RequestCtx = {};
      const sig = c.req.header('payment-signature');
      if (sig) {
        try {
          ctx.headerPayment = b64decode<PaymentPayload>(sig);
        } catch {
          /* ignored: treated as no payment */
        }
      }
      const server = createFloorMcpServer({ api: deps.api, cfg, gate: deps.gate, ctx });
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      try {
        const res = await transport.handleRequest(c.req.raw, { parsedBody: parsed });
        const h = new Headers(res.headers);
        if (ctx.paymentRequired) h.set('PAYMENT-REQUIRED', ctx.paymentRequired);
        if (ctx.paymentResponse) h.set('PAYMENT-RESPONSE', ctx.paymentResponse);
        const status = cfg.http402 && ctx.paymentRequired ? 402 : res.status;
        return new Response(res.body, { status, headers: h });
      } finally {
        void transport.close();
        void server.close();
      }
    },
  );

  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  return app;
}
