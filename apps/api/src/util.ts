/** Recursively turn bigints into decimal strings so JSON.stringify never throws. */
export function ser<T>(x: T): unknown {
  if (typeof x === 'bigint') return x.toString();
  if (Array.isArray(x)) return x.map(ser);
  if (x && typeof x === 'object') {
    return Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, v]) => [k, ser(v)]));
  }
  return x;
}

export class ApiError extends Error {
  constructor(
    public readonly status: 400 | 404 | 413 | 429 | 501 | 502 | 503,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** TTL memo with in-flight de-duplication. Failures are not cached. */
export class TtlCache {
  private m = new Map<string, { at: number; v: Promise<unknown> }>();
  constructor(private now: () => number = Date.now) {}
  get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.m.get(key);
    const t = this.now();
    if (hit && t - hit.at < ttlMs) return hit.v as Promise<T>;
    const v = load();
    this.m.set(key, { at: t, v });
    v.catch(() => {
      if (this.m.get(key)?.v === v) this.m.delete(key);
    });
    return v;
  }
}

/** Fixed-window in-memory counter per (bucket, ip). Single process only (ARCHITECTURE section 8.3). */
export class RateLimiter {
  private m = new Map<string, { start: number; n: number }>();
  constructor(
    private now: () => number = Date.now,
    private windowMs = 60_000,
  ) {}
  /** Returns 0 when allowed, else the seconds to wait. */
  hit(bucket: string, ip: string, limit: number): number {
    const t = this.now();
    if (this.m.size > 20_000) {
      for (const [k, v] of this.m) if (t - v.start >= this.windowMs) this.m.delete(k);
    }
    const k = `${bucket}|${ip}`;
    const e = this.m.get(k);
    if (!e || t - e.start >= this.windowMs) {
      this.m.set(k, { start: t, n: 1 });
      return 0;
    }
    e.n += 1;
    return e.n > limit ? Math.max(1, Math.ceil((e.start + this.windowMs - t) / 1000)) : 0;
  }
}
