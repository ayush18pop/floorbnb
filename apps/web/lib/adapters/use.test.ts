import { describe, expect, it } from "vitest";
import { deriveAsync } from "./use";

describe("deriveAsync", () => {
  const res = { key: "v1-0", group: "v1", data: { n: 1 }, error: null };
  it("loading before any result", () => { expect(deriveAsync(null, "v1-0", "v1")).toEqual({ data: null, error: null, loading: true }); });
  it("shows the result for the same key", () => { expect(deriveAsync(res, "v1-0", "v1")).toEqual({ data: { n: 1 }, error: null, loading: false }); });
  it("keeps the previous data when only the key changes inside the same group (refresh after a tx)", () => {
    expect(deriveAsync(res, "v1-1", "v1")).toEqual({ data: { n: 1 }, error: null, loading: false });
  });
  it("shows a skeleton when the group changes (another vault or wallet)", () => {
    expect(deriveAsync(res, "v2-0", "v2").loading).toBe(true);
  });
  it("without a group the old behaviour holds: a new key means loading", () => { expect(deriveAsync({ ...res, group: undefined }, "k2").loading).toBe(true); });
  it("never keeps an error as data", () => { expect(deriveAsync({ ...res, data: null, error: "x" }, "v1-1", "v1").loading).toBe(true); });
});
