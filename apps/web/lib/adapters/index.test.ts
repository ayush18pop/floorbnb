import { describe, expect, it } from "vitest";
import { pickSourceKind } from "./index";
import { MAINNET_FACTORY, MAINNET_LENS } from "../app-config";

const F = MAINNET_FACTORY;
const L = MAINNET_LENS;

describe("pickSourceKind", () => {
  it("uses chain when both addresses are set and the source is unset", () => {
    expect(pickSourceKind({ factory: F, lens: L })).toBe("chain");
  });
  it("uses chain when explicitly chain", () => {
    expect(pickSourceKind({ dataSource: "chain", factory: F, lens: L })).toBe("chain");
  });
  it("uses mock only when explicitly mock", () => {
    expect(pickSourceKind({ dataSource: "mock", factory: F, lens: L })).toBe("mock");
  });
  it("falls back to mock when an address is missing", () => {
    expect(pickSourceKind({ factory: F, lens: "" })).toBe("mock");
    expect(pickSourceKind({ factory: "", lens: L })).toBe("mock");
  });
  it("ships the verified mainnet addresses as defaults", () => {
    expect(F).toBe("0x1147d482fD08DDd7F377838efb610B606B3Ad765");
    expect(L).toBe("0x63Ae440B9D309959442eaD3E08cBC3A025C67780");
  });
});
