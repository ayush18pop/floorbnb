/**
 * Background indexer scheduler: one pass at a time, next pass `intervalSec` after the previous one ends.
 * `sync` must not throw (ChainLogReader.syncAll logs one line and records the error); a throw here is still caught.
 * Starting never blocks: the first pass runs on a timer, after the HTTP server is listening.
 */
export interface IndexerLoopOpts {
  sync: () => Promise<unknown>;
  intervalSec: number;
  log?: (msg: string) => void;
}

export function createIndexerLoop(o: IndexerLoopOpts): { start(): void; stop(): void } {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = (ms: number) => {
    if (stopped) return;
    timer = setTimeout(async () => {
      try { await o.sync(); } catch (e) { (o.log ?? console.error)(`[indexer] pass failed: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`); }
      schedule(o.intervalSec * 1000);
    }, ms);
  };
  return {
    start() { schedule(0); },
    stop() { stopped = true; if (timer) clearTimeout(timer); timer = null; },
  };
}
