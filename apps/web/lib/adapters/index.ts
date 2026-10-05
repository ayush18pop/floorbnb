import { FACTORY_ADDRESS, LENS_ADDRESS } from "../app-config";
import { chainSource } from "./chain";
import { mockSource } from "./mock";
import type { PositionSource } from "./types";

/** Chain unless NEXT_PUBLIC_DATA_SOURCE is explicitly "mock" or no factory/lens address is known. */
export function pickSourceKind(env: { dataSource?: string; factory?: string; lens?: string }): "chain" | "mock" {
  if (env.dataSource === "mock") return "mock";
  return env.factory && env.lens ? "chain" : "mock";
}

/**
 * Single switch. The addresses default to the verified mainnet deployment (lib/app-config.ts), so the chain adapter is used
 * everywhere. The mock (labelled EXAMPLE on every screen) is for local dev and tests only: NEXT_PUBLIC_DATA_SOURCE=mock.
 */
let cached: PositionSource | null = null;
export function getSource(): PositionSource {
  if (!cached) {
    const kind = pickSourceKind({ dataSource: process.env.NEXT_PUBLIC_DATA_SOURCE, factory: FACTORY_ADDRESS, lens: LENS_ADDRESS });
    cached = kind === "chain" ? chainSource() : mockSource();
  }
  return cached;
}

export * from "./types";
export * from "./format";
export { ASSETS, assetBySymbol, symbolOf } from "./assets";
export { scanNote } from "./keeper-runs";
