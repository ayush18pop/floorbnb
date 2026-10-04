import type { KeeperLoop } from './keeperLoop';

interface Closable { close(cb?: (err?: Error) => void): unknown; closeIdleConnections?: () => void }
interface Proc { on(ev: 'SIGTERM' | 'SIGINT', fn: () => void): unknown; exit(code?: number): unknown }

/** SIGTERM/SIGINT: stop the keeper loop (waiting a bounded time for an in-flight tick), close the HTTP server, exit. */
export function installShutdown(o: { server: Closable; loop: KeeperLoop; proc?: Proc; tickTimeoutMs?: number; log?: (m: string) => void; extraStop?: () => void }): () => Promise<void> {
  const proc = o.proc ?? (process as unknown as Proc);
  const log = o.log ?? console.log;
  let once: Promise<void> | null = null;
  const shutdown = (): Promise<void> => {
    once ??= (async () => {
      log('[onebox] shutting down');
      o.extraStop?.();
      const clean = await o.loop.stop(o.tickTimeoutMs ?? 20_000);
      if (!clean) log('[onebox] keeper tick still running after timeout; exiting anyway');
      await new Promise<void>((r) => {
        try { o.server.close(() => r()); o.server.closeIdleConnections?.(); } catch { r(); }
        setTimeout(r, 3000).unref?.();
      });
      proc.exit(0);
    })();
    return once;
  };
  proc.on('SIGTERM', () => void shutdown());
  proc.on('SIGINT', () => void shutdown());
  return shutdown;
}

/** Free-tier keep-alive: GET `${base}/healthz` every `everyMs`. Returns a stop function. */
export function startKeepAlive(base: string, everyMs = 10 * 60_000, log: (m: string) => void = console.log, fetchImpl: typeof fetch = fetch): () => void {
  const url = `${base.replace(/\/$/, '')}/healthz`;
  const ping = async () => {
    try {
      const r = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
      log(`[onebox] keep-alive ${url} -> ${r.status}`);
    } catch (e) {
      log(`[onebox] keep-alive ${url} failed: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    }
  };
  const t = setInterval(() => void ping(), everyMs);
  t.unref?.();
  return () => clearInterval(t);
}
