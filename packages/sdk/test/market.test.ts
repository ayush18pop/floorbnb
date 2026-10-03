import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DAY_SECONDS,
  HOLIDAY_UNIX_DAYS,
  inWindow,
  isMarketOpen,
  nextWindowOpen,
  secondsToClose,
  weekday,
} from '../src';

const FRI = 20000 * DAY_SECONDS; // day 20000 is a Friday
const h = (hh: number, mm = 0, ss = 0) => hh * 3600 + mm * 60 + ss;

describe('market window', () => {
  it('day 20000 is a Friday', () => expect(weekday(FRI)).toBe(4));
  it('boundaries [15:30, 19:30)', () => {
    expect(inWindow(FRI + h(15, 29, 59))).toBe(false);
    expect(inWindow(FRI + h(15, 30))).toBe(true);
    expect(inWindow(FRI + h(19, 29, 59))).toBe(true);
    expect(inWindow(FRI + h(19, 30))).toBe(false);
  });
  it('weekend is closed', () => {
    expect(inWindow(FRI + DAY_SECONDS + h(16))).toBe(false);
    expect(inWindow(FRI + 2 * DAY_SECONDS + h(16))).toBe(false);
    expect(inWindow(FRI + 3 * DAY_SECONDS + h(16))).toBe(true);
  });
  it('holiday table equals the contracts JSON', () => {
    const j = JSON.parse(readFileSync(new URL('../../contracts/holidays/nyse_2026_2027.json', import.meta.url), 'utf8'));
    expect([...HOLIDAY_UNIX_DAYS]).toEqual(j.unixDays);
    for (const d of j.unixDays) expect(isMarketOpen(d * DAY_SECONDS + h(16))).toBe(false);
  });
  it('nextWindowOpen skips weekend and holiday', () => {
    expect(nextWindowOpen(FRI + h(19, 30))).toBe(FRI + 3 * DAY_SECONDS + h(15, 30));
    expect(nextWindowOpen(FRI + h(16))).toBe(FRI + h(16));
    expect(nextWindowOpen(FRI + h(9))).toBe(FRI + h(15, 30));
    // 2026-09-07 (Labour Day, day 20703) is a Monday: next open is Tuesday
    expect(nextWindowOpen(20703 * DAY_SECONDS + h(10))).toBe(20704 * DAY_SECONDS + h(15, 30));
  });
  it('secondsToClose', () => {
    expect(secondsToClose(FRI + h(19))).toBe(1800);
    expect(secondsToClose(FRI + h(20))).toBe(0);
  });
});
