import { ASSETS } from "@/lib/adapters/assets";
import type { AssetSymbol } from "@/lib/adapters/types";
import { parseFloorPct, parseTermDays } from "./floor-config";

export function parseBuilderParams(sp: URLSearchParams) {
  const raw = (sp.get("assets") ?? "NVDAB").split(",").filter((s): s is AssetSymbol => ASSETS.some((a) => a.symbol === s));
  const assets = raw.length ? [...new Set(raw)].slice(0, 3) : (["NVDAB"] as AssetSymbol[]);
  const amount = Number(sp.get("amount")) || 500;
  return { assets, floor: parseFloorPct(sp.get("floor")), termDays: parseTermDays(sp.get("term")), amount };
}

export function equalWeights(n: number) {
  const base = Math.floor(10_000 / n);
  return Array.from({ length: n }, (_, i) => (i === 0 ? 10_000 - base * (n - 1) : base));
}
