import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
    // a regular file as the parent folder makes mkdir fail (ENOTDIR). The old path /proc/nope/hb.json hung mkdirSync({recursive}) on Linux 6.18.
    const blocker = join(mkdtempSync(join(tmpdir(), 'kb-')), 'file');
    writeFileSync(blocker, 'x');
    expect(() => writeHeartbeat(join(blocker, 'sub', 'hb.json'))).not.toThrow();
  });
});
