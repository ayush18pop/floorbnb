/**
 * Mirror of the on-chain trading window (docs/CONTRACTS.md section 6, MarketHours.isOpen). The chain stays the
 * authority (`factory.isTradingOpen`); this mirror only explains WHY a window is closed and lets tests run offline.
 */
export const OPEN_SEC = 15 * 3600 + 30 * 60; // 15:30 UTC
export const CLOSE_SEC = 19 * 3600 + 30 * 60; // 19:30 UTC, exclusive

export type ClosedReason = 'paused' | 'halted' | 'weekend' | 'holiday' | 'outside_hours';

export function dayOf(ts: number): number {
  return Math.floor(ts / 86400);
}

/** 0 = Monday .. 6 = Sunday (day 20000 is a Friday: (20000+3)%7 = 4). */
export function weekdayOf(ts: number): number {
  return (dayOf(ts) + 3) % 7;
}

export interface WindowState {
  paused: boolean;
  halted: boolean;
  holiday: boolean;
}

export function closedReason(ts: number, s: WindowState): ClosedReason | null {
  if (s.paused) return 'paused';
  if (s.halted) return 'halted';
  if (weekdayOf(ts) >= 5) return 'weekend';
  if (s.holiday) return 'holiday';
  const sod = ts % 86400;
  if (sod < OPEN_SEC || sod >= CLOSE_SEC) return 'outside_hours';
  return null;
}
