import { dayOf, inWindow, weekday } from '@floor/sdk';

/**
 * Names WHY the window is closed. The chain stays the authority (`factory.isTradingOpen`); the window rule itself
 * comes from the SDK mirror of MarketHours.sol (docs/CONTRACTS.md section 6).
 */
export type ClosedReason = 'paused' | 'halted' | 'weekend' | 'holiday' | 'outside_hours';

export interface WindowState {
  paused: boolean;
  halted: boolean;
  /** `factory.nonTradingDay(day)` read from chain */
  holiday: boolean;
}

export { dayOf };

export function closedReason(ts: number, s: WindowState): ClosedReason | null {
  if (s.paused) return 'paused';
  if (s.halted) return 'halted';
  if (weekday(ts) >= 5) return 'weekend';
  if (s.holiday) return 'holiday';
  if (!inWindow(ts)) return 'outside_hours';
  return null;
}
