import { describe, expect, it } from "vitest";
import { inWindow, targetFor } from "./time";

const ts = (s: string) => Math.floor(Date.parse(s) / 1000);
describe("time targets", () => {
  it("Sunday -> window is Monday 16:00 UTC", () => {
    expect(targetFor("window", ts("2026-10-04T06:00:00Z"))).toBe(ts("2026-10-05T16:00:00Z"));
  });
  it("inside the window is a no-op", () => { expect(targetFor("window", ts("2026-10-06T16:00:00Z"))).toBeNull(); });
  it("Tuesday 20:00 -> next window is Wednesday", () => {
    expect(targetFor("window", ts("2026-10-06T20:00:00Z"))).toBe(ts("2026-10-07T16:00:00Z"));
  });
  it("closed from the window goes to 21:00 same day", () => {
    expect(targetFor("closed", ts("2026-10-06T16:00:00Z"))).toBe(ts("2026-10-06T21:00:00Z"));
  });
  it("weekend from Tuesday is Saturday 12:00", () => {
    expect(targetFor("weekend", ts("2026-10-06T16:00:00Z"))).toBe(ts("2026-10-10T12:00:00Z"));
  });
  it("+1h adds", () => { expect(targetFor("+1h", 1000)).toBe(4600); });
  it("window edges", () => {
    expect(inWindow(ts("2026-10-06T15:29:00Z"))).toBe(false);
    expect(inWindow(ts("2026-10-06T15:30:00Z"))).toBe(true);
    expect(inWindow(ts("2026-10-06T19:30:00Z"))).toBe(false);
    expect(inWindow(ts("2026-10-10T16:00:00Z"))).toBe(false);
  });
  it("rejects garbage", () => { expect(() => targetFor("nope", 0)).toThrow(); });
});
