import { chainSource } from "./chain";
import { mockSource } from "./mock";
import type { PositionSource } from "./types";

/**
 * Single switch. The mock (labelled EXAMPLE on every screen) is the default until a deployment exists.
 * Set NEXT_PUBLIC_DATA_SOURCE=chain with the factory and lens addresses to use @floor/sdk reads and txs.
 * Production builds must use "chain" (EXECUTION_PLAN A21 constraint).
 */
let cached: PositionSource | null = null;
export function getSource(): PositionSource {
  if (!cached) cached = process.env.NEXT_PUBLIC_DATA_SOURCE === "chain" ? chainSource() : mockSource();
  return cached;
}

export * from "./types";
export * from "./format";
export { ASSETS, assetBySymbol, symbolOf } from "./assets";
