import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeHeartbeat } from './heartbeat.js';

describe('writeHeartbeat', () => {
  it('writes the last scan time as JSON, creating the folder', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'kb-')), 'sub', 'hb.json');
    writeHeartbeat(f, 1_790_000_000);
    expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ lastScan: 1_790_000_000 });
  });
  it('does nothing without a file and never throws on a bad path', () => {
    expect(() => writeHeartbeat(undefined)).not.toThrow();
    expect(() => writeHeartbeat('/proc/nope/hb.json')).not.toThrow();
    expect(existsSync('/proc/nope')).toBe(false);
  });
});
