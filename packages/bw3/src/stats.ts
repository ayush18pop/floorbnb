/**
 * Process-global call statistics per upstream path (query string excluded).
 * Stores counts, timestamps (unix seconds) and the error class/code only (<= 120 chars):
 * never headers, keys, request or response bodies.
 */
export interface Bw3PathStats {
  calls: number;
  okCalls: number;
  lastOkAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
}

const MAX_ERR = 120;

export class Bw3StatsRegistry {
  private m = new Map<string, Bw3PathStats>();

  constructor(private now: () => number = Date.now) {}

  /** Call once per final outcome (after retries). `errCode` is an error class name and/or API code, nothing else. */
  record(path: string, ok: boolean, errCode?: string): void {
    const key = path.split('?')[0]!;
    let s = this.m.get(key);
    if (!s) {
      s = { calls: 0, okCalls: 0, lastOkAt: null, lastErrorAt: null, lastError: null };
      this.m.set(key, s);
    }
    const t = Math.floor(this.now() / 1000);
    s.calls += 1;
    if (ok) {
      s.okCalls += 1;
      s.lastOkAt = t;
    } else {
      s.lastErrorAt = t;
      s.lastError = (errCode ?? 'error').slice(0, MAX_ERR);
    }
  }

  snapshot(): Record<string, Bw3PathStats> {
    return Object.fromEntries([...this.m].map(([k, v]) => [k, { ...v }]));
  }

  reset(): void {
    this.m.clear();
  }
}

export const bw3Stats = new Bw3StatsRegistry();
