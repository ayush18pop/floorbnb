export type Level = 'info' | 'warn' | 'error';

export interface Logger {
  log(level: Level, event: string, fields?: Record<string, unknown>): void;
}

/** Replaces every occurrence of each secret (with and without 0x) in `text`. */
export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) {
    if (!s) continue;
    const bare = s.replace(/^0x/i, '');
    if (bare.length < 16) continue;
    out = out.split(s).join('[REDACTED]').split(bare).join('[REDACTED]');
  }
  return out;
}

const bigintSafe = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

/** One JSON object per line. Secrets are scrubbed from the serialised line, and fields named like keys are dropped. */
export function jsonLogger(write: (line: string) => void, secrets: string[] = []): Logger {
  return {
    log(level, event, fields = {}) {
      const safe: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (/private|secret|mnemonic|seed/i.test(k)) continue;
        safe[k] = v;
      }
      const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...safe }, bigintSafe);
      write(redact(line, secrets));
    },
  };
}
