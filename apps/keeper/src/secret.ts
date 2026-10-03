import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const KEY_RE = /^0x[0-9a-fA-F]{64}$/;

/** Validates the shape only. The error never contains the value. */
export function parseKey(raw: string | undefined): `0x${string}` {
  if (!raw) throw new Error('KEEPER_PRIVATE_KEY is not set (run mode needs it in the environment)');
  const k = raw.trim();
  if (!KEY_RE.test(k)) throw new Error('KEEPER_PRIVATE_KEY is not a 32-byte 0x-prefixed hex string');
  return k as `0x${string}`;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'cache', 'lib', '.next', 'broadcast']);
const MAX_FILE = 2 * 1024 * 1024;

/**
 * Walks `roots` (and any extra `files`, e.g. the log file) and returns the paths whose content contains the key.
 * Never returns or logs the key itself. Used to refuse to start when the key has leaked into a file.
 */
export function findKeyLeaks(key: string, roots: string[], files: string[] = []): string[] {
  const bare = key.replace(/^0x/i, '').toLowerCase();
  const hits: string[] = [];
  const check = (p: string) => {
    try {
      const st = statSync(p);
      if (!st.isFile() || st.size > MAX_FILE) return;
      if (readFileSync(p, 'utf8').toLowerCase().includes(bare)) hits.push(p);
    } catch {
      /* unreadable or binary: ignore */
    }
  };
  const walk = (dir: string, depth: number) => {
    if (depth > 8) return;
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const n of names) {
      if (SKIP_DIRS.has(n)) continue;
      const p = join(dir, n);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p, depth + 1);
      else check(p);
    }
  };
  for (const r of roots) walk(r, 0);
  for (const f of files) check(f);
  return [...new Set(hits)];
}
