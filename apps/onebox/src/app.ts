import { Hono } from 'hono';
import type { KeeperState } from './keeperLoop';

export interface ComposeDeps {
  api: Hono;
  mcp: Hono;
  keeper: () => KeeperState;
  startedAt?: number;
  now?: () => number;
}

async function probe(app: Hono): Promise<{ ok: boolean; body: unknown }> {
  try {
    const r = await app.request('/healthz');
    const body = await r.json().catch(() => null);
    return { ok: r.ok, body };
  } catch (e) {
    return { ok: false, body: { error: e instanceof Error ? e.message.split('\n')[0] : String(e) } };
  }
}

/**
 * One public port. /healthz is answered here (both inner apps own a /healthz; theirs are shown nested, not routed).
 * /mcp and /mcp/* go to the MCP app; everything else goes to the API app.
 */
export function composeApp(d: ComposeDeps): Hono {
  const now = d.now ?? Date.now;
  const startedAt = d.startedAt ?? now();
  const root = new Hono();

  root.get('/healthz', async (c) => {
    const [api, mcp] = await Promise.all([probe(d.api), probe(d.mcp)]);
    const ok = api.ok && mcp.ok;
    const k = d.keeper();
    return c.json(
      { ok, api: api.body, mcp: mcp.body, keeper: k, uptimeSec: Math.floor((now() - startedAt) / 1000) },
      ok ? 200 : 503,
    );
  });

  // c.env carries the node-server bindings (client IP for the MCP rate limiter).
  root.all('/mcp', (c) => d.mcp.fetch(c.req.raw, c.env));
  root.all('/mcp/*', (c) => d.mcp.fetch(c.req.raw, c.env));
  root.all('*', (c) => d.api.fetch(c.req.raw, c.env));
  return root;
}
