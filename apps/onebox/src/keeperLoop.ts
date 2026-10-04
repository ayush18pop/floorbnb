/** In-process keeper scheduler. One tick at a time; a failing tick is caught and recorded, never thrown. */
export type KeeperMode = 'live' | 'dry-run' | 'disabled';

export interface KeeperState {
  mode: KeeperMode;
  running: boolean;
  /** unix seconds of the last tick that started or finished (the heartbeat the API shows as "Keeper online") */
  lastScan: number | null;
  lastError: string | null;
  note?: string;
}

export interface KeeperLoopOpts {
  tick: () => Promise<unknown>;
  intervalSec: number;
  mode: KeeperMode;
  note?: string;
  log?: (msg: string) => void;
  now?: () => number;
  /** called on a failed tick (the keeper's webhook alert); must not throw */
  onError?: (msg: string) => Promise<void> | void;
}

export interface KeeperLoop {
  start(): void;
  /** Stop scheduling and wait for an in-flight tick, at most `timeoutMs`. Resolves true if no tick was left running. */
  stop(timeoutMs: number): Promise<boolean>;
  state(): KeeperState;
}

const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? 'error';

export function createKeeperLoop(o: KeeperLoopOpts): KeeperLoop {
  const now = o.now ?? (() => Math.floor(Date.now() / 1000));
  const log = o.log ?? (() => {});
  let stopped = false;
  let running = false;
  let inflight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastScan: number | null = null;
  let lastError: string | null = null;

  const runTick = async (): Promise<void> => {
    lastScan = now();
    try {
      await o.tick();
      lastScan = now();
      lastError = null;
    } catch (e) {
      lastError = firstLine(e);
      log(`keeper tick failed: ${lastError}`);
      try { await o.onError?.(`tick failed: ${lastError}`); } catch { /* alerting is best effort */ }
    }
  };

  const schedule = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeout(() => {
      timer = null;
      inflight = runTick().finally(() => {
        inflight = null;
        schedule(o.intervalSec * 1000);
      });
    }, delayMs);
  };

  return {
    start() {
      if (running || o.mode === 'disabled') return;
      running = true;
      schedule(0);
    },
    async stop(timeoutMs) {
      stopped = true;
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
      const p = inflight;
      if (!p) return true;
      let t: ReturnType<typeof setTimeout> | undefined;
      const done = await Promise.race([p.then(() => true), new Promise<boolean>((r) => { t = setTimeout(() => r(false), timeoutMs); })]);
      if (t) clearTimeout(t);
      return done;
    },
    state: () => ({ mode: o.mode, running, lastScan, lastError, ...(o.note ? { note: o.note } : {}) }),
  };
}
