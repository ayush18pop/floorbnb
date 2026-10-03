import type { PositionSource } from "./types";

/**
 * Chain source: A21 fills this in (FloorLens.status, valuation, targets, events via chunked getLogs,
 * factory.createPosition, vault exits). It throws on purpose so a missing wiring is never silent.
 */
export function chainSource(): PositionSource {
  const nope = (): never => {
    throw new Error("chain source not wired yet (A21)");
  };
  return {
    kind: "chain",
    assets: async () => nope(),
    listPositions: async () => nope(),
    getPosition: async () => nope(),
    getEvents: async () => nope(),
    getHistory: async () => nope(),
    keeperStatus: async () => nope(),
    keeperRuns: async () => nope(),
    createPosition: async () => nope(),
    exit: async () => nope(),
  };
}
