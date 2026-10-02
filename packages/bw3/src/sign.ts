import { createHmac } from 'node:crypto';

export type SignEncoding = 'base64' | 'hex';

/** ISO-8601 with milliseconds, UTC (not epoch ms). Example: 2026-10-02T12:06:00.123Z */
export function isoTimestamp(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * HMAC-SHA256 over `timestamp + method + path + body`.
 * `path` is the full request path INCLUDING the `/build` prefix and the query string, exactly as sent.
 * `body` is the exact JSON string sent, or '' for GET.
 * UNVERIFIED: the digest encoding. The docs sit behind an AWS WAF challenge and the reference client
 * (afterbell/research/bw3.py) was not found, so base64 is an assumption; use `encoding: 'hex'` if the API rejects it.
 */
export function sign(opts: { secret: string; timestamp: string; method: string; path: string; body?: string; encoding?: SignEncoding }): string {
  const { secret, timestamp, method, path, body = '', encoding = 'base64' } = opts;
  return createHmac('sha256', secret).update(timestamp + method.toUpperCase() + path + body).digest(encoding);
}
