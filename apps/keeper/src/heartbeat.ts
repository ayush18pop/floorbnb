import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Read-only liveness signal: the unix time of the last scan, written each tick when KEEPER_HEARTBEAT_FILE is set (the API serves it on /healthz). */
export function writeHeartbeat(file: string | undefined, nowSec = Math.floor(Date.now() / 1000)): void {
  if (!file) return;
  try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify({ lastScan: nowSec }) + '\n'); } catch { /* liveness is best effort */ }
}
