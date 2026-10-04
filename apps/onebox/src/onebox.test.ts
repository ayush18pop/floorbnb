import { EventEmitter } from 'node:events';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { composeApp } from './app';
import { createKeeperLoop } from './keeperLoop';
import { installShutdown, startKeepAlive } from './lifecycle';

const innerApp = (name: string, ok = true) => {
  const a = new Hono();
  a.get('/healthz', (c) => c.json({ ok, name }, ok ? 200 : 500));
  a.get('/v1/floor', (c) => c.json({ from: name }));
  a.post('/mcp', (c) => c.json({ from: name }));
  a.get('/mcp', () => new Response(null, { status: 405 }));
  a.notFound((c) => c.json({ from: name, error: 'not_found' }, 404));
  return a;
};
const state = () => ({ mode: 'live' as const, running: true, lastScan: 123, lastError: null });

describe('composeApp', () => {
  const app = composeApp({ api: innerApp('api'), mcp: innerApp('mcp'), keeper: state, startedAt: 0, now: () => 5000 });
  it('routes /mcp to MCP and the rest to the API', async () => {
    expect(await (await app.request('/mcp', { method: 'POST' })).json()).toEqual({ from: 'mcp' });
    expect((await app.request('/mcp')).status).toBe(405);
    expect(await (await app.request('/v1/floor')).json()).toEqual({ from: 'api' });
    expect(await (await app.request('/nope')).json()).toEqual({ from: 'api', error: 'not_found' });
  });
  it('answers one combined /healthz and does not forward it', async () => {
    const r = await app.request('/healthz');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, api: { ok: true, name: 'api' }, mcp: { ok: true, name: 'mcp' }, keeper: state(), uptimeSec: 5 });
  });
  it('is 503 when a part is unhealthy, but a keeper error alone is not', async () => {
    const bad = composeApp({ api: innerApp('api', false), mcp: innerApp('mcp'), keeper: state });
    expect((await bad.request('/healthz')).status).toBe(503);
    const kerr = composeApp({ api: innerApp('api'), mcp: innerApp('mcp'), keeper: () => ({ mode: 'live', running: true, lastScan: 1, lastError: 'boom' }) });
    expect((await kerr.request('/healthz')).status).toBe(200);
  });
});

describe('keeper loop', () => {
  it('survives a failing tick, records it, and keeps ticking', async () => {
    vi.useFakeTimers();
    let n = 0;
    const onError = vi.fn();
    const loop = createKeeperLoop({
      mode: 'live', intervalSec: 10, onError,
      tick: async () => { n++; if (n === 1) throw new Error('rpc down\nstack'); },
      now: () => Math.floor(Date.now() / 1000),
    });
    loop.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(loop.state()).toMatchObject({ running: true, lastError: 'rpc down' });
    expect(onError).toHaveBeenCalledWith('tick failed: rpc down');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(n).toBe(2);
    expect(loop.state().lastError).toBeNull();
    expect(loop.state().lastScan).not.toBeNull();
    await loop.stop(100);
    vi.useRealTimers();
  });
  it('a disabled loop never ticks', async () => {
    const tick = vi.fn();
    const loop = createKeeperLoop({ mode: 'disabled', intervalSec: 1, tick, note: 'x' });
    loop.start();
    await new Promise((r) => setTimeout(r, 20));
    expect(tick).not.toHaveBeenCalled();
    expect(loop.state()).toMatchObject({ running: false, mode: 'disabled', note: 'x' });
  });
  it('stop waits for an in-flight tick, bounded', async () => {
    let release!: () => void;
    const loop = createKeeperLoop({ mode: 'live', intervalSec: 60, tick: () => new Promise<void>((r) => { release = r; }) });
    loop.start();
    await new Promise((r) => setTimeout(r, 10));
    expect(await loop.stop(30)).toBe(false); // tick still running: gave up after the bound
    release();
    const loop2 = createKeeperLoop({ mode: 'live', intervalSec: 60, tick: () => new Promise<void>((r) => setTimeout(r, 30)) });
    loop2.start();
    await new Promise((r) => setTimeout(r, 10));
    expect(await loop2.stop(1000)).toBe(true); // finished within the bound
  });
});

describe('lifecycle', () => {
  it('SIGTERM stops the loop, closes the server, exits 0 (once)', async () => {
    const proc = Object.assign(new EventEmitter(), { exit: vi.fn() });
    const server = { close: vi.fn((cb?: () => void) => cb?.()), closeIdleConnections: vi.fn() };
    const stop = vi.fn(async () => true);
    installShutdown({ server, loop: { start() {}, stop, state: state }, proc, log: () => {} });
    proc.emit('SIGTERM');
    proc.emit('SIGTERM');
    await new Promise((r) => setTimeout(r, 20));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(proc.exit).toHaveBeenCalledWith(0);
  });
  it('keep-alive pings /healthz and logs failures without throwing', async () => {
    vi.useFakeTimers();
    const logs: string[] = [];
    const f = vi.fn().mockResolvedValueOnce({ status: 200 }).mockRejectedValueOnce(new Error('timeout'));
    const stop = startKeepAlive('https://x.onrender.com/', 600_000, (m) => logs.push(m), f as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(600_000);
    await vi.advanceTimersByTimeAsync(600_000);
    stop();
    expect(f.mock.calls[0]?.[0]).toBe('https://x.onrender.com/healthz');
    expect(logs[0]).toContain('-> 200');
    expect(logs[1]).toContain('failed: timeout');
    vi.useRealTimers();
  });
});
