import { describe, expect, it } from "vitest";
import { parseBuilderParams } from "@/lib/builder-params";

const p = (q: string) => parseBuilderParams(new URLSearchParams(q));
describe("builder URL params", () => {
  it("defaults: 90%, one year", () => { expect(p("")).toMatchObject({ floor: 90, termDays: 365, amount: 500, assets: ["NVDAB"] }); });
  it("reads floor and term", () => { expect(p("floor=72&term=30&amount=100")).toMatchObject({ floor: 72, termDays: 30, amount: 100 }); });
  it("old links without term still work", () => { expect(p("assets=NVDAB&floor=85&amount=55")).toMatchObject({ floor: 85, termDays: 365 }); });
  it("ignores out-of-range values", () => { expect(p("floor=20&term=2")).toMatchObject({ floor: 90, termDays: 365 }); expect(p("floor=99&term=999")).toMatchObject({ floor: 90, termDays: 365 }); });
});
