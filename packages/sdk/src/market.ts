/**
 * Trading window mirror of MarketHours.sol: Monday to Friday, [15:30, 19:30) UTC, minus non-trading days.
 * No daylight-saving logic by design.
 */

export const DAY_SECONDS = 86_400;
export const WINDOW_START_SECONDS = 15 * 3600 + 30 * 60;
export const WINDOW_END_SECONDS = 19 * 3600 + 30 * 60;

/**
 * Non-trading days as unix days (seconds / 86400). Copied from packages/contracts/holidays/nyse_2026_2027.json,
 * verified against nyse.com/trade/hours-calendars (2026-10-03). A test keeps this table equal to the JSON file.
 */
export const HOLIDAY_UNIX_DAYS: readonly number[] = [
  20703, 20783, 20784, 20811, 20812, 20819, 20836, 20864, 20903, 20969, 20987, 21004, 21067, 21147, 21148, 21176, 21200, 21235, 21288, 21333, 21354, 21368, 21369, 21431, 21511, 21512, 21543,
];

export function dayOf(ts: number): number {
  return Math.floor(ts / DAY_SECONDS);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekday(ts: number): number {
  return (dayOf(ts) + 3) % 7;
}

export function inWindow(ts: number): boolean {
  if (weekday(ts) >= 5) return false;
  const s = ts % DAY_SECONDS;
  return s >= WINDOW_START_SECONDS && s < WINDOW_END_SECONDS;
}

export function isNonTradingDay(ts: number, extra: readonly number[] = HOLIDAY_UNIX_DAYS): boolean {
  return extra.includes(dayOf(ts));
}

/** Window open and not a non-trading day. Does not know about on-chain pause or halt flags (use the factory). */
export function isMarketOpen(ts: number, holidays: readonly number[] = HOLIDAY_UNIX_DAYS): boolean {
  return inWindow(ts) && !isNonTradingDay(ts, holidays);
}

/** The next second at or after `ts` when the window is open. */
export function nextWindowOpen(ts: number, holidays: readonly number[] = HOLIDAY_UNIX_DAYS): number {
  if (isMarketOpen(ts, holidays)) return ts;
  let day = dayOf(ts);
  // Today still counts if its window has not started.
  if (ts % DAY_SECONDS < WINDOW_START_SECONDS) {
    const t = day * DAY_SECONDS + WINDOW_START_SECONDS;
    if (isMarketOpen(t, holidays)) return t;
  }
  for (let i = 0; i < 400; i++) {
    day += 1;
    const t = day * DAY_SECONDS + WINDOW_START_SECONDS;
    if (isMarketOpen(t, holidays)) return t;
  }
  throw new Error('no trading window found within 400 days');
}

/** Seconds until the current window closes, or 0 if closed. */
export function secondsToClose(ts: number, holidays: readonly number[] = HOLIDAY_UNIX_DAYS): number {
  if (!isMarketOpen(ts, holidays)) return 0;
  return dayOf(ts) * DAY_SECONDS + WINDOW_END_SECONDS - ts;
}
