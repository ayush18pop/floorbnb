import { describe, expect, it } from "vitest";
import { acksFor } from "./acks";

describe("review acknowledgements stay true for the term", () => {
  it("names the end date and term in the cash-lock ack", () => {
    const a = acksFor("2026-11-03", 30);
    expect(a).toHaveLength(3);
    expect(a[1]).toMatch(/until the term ends on 2026-11-03 \(1 month\)/);
    expect(acksFor("2027-10-04", 365)[1]).toMatch(/\(1 year\)/);
  });
  it("keeps the gap limit at about 24% and the partial-upside ack", () => {
    const a = acksFor("2026-11-03", 30);
    expect(a[0]).toMatch(/about 24%/); expect(a[2]).toMatch(/only part of the upside/);
    expect(a.join(" ")).not.toMatch(/guarantee/i);
  });
});

describe("short ack labels", () => {
  it("has one short label per full acknowledgement and never says guaranteed", async () => {
    const { acksShort } = await import("./acks");
    const s = acksShort();
    expect(s).toHaveLength(acksFor("2026-11-03", 30).length);
    expect(s[0]).toMatch(/about 24%/);
    s.forEach((t) => { expect(t.split(/\s+/).length).toBeLessThan(16); expect(t).not.toMatch(/guarantee/i); });
  });
});
