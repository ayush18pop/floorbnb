"use client";
import { getSource } from "@/lib/adapters";
import { useAsync } from "@/lib/adapters/use";
import { DEFAULT_LIMITS, type CreateLimits } from "@/lib/create-validation";

/** The chain's createPosition limits when readable; the documented defaults while loading or if the read fails. */
export function useCreateLimits(): { limits: CreateLimits; loading: boolean; /** True once real limits are known (or the read failed and the defaults are all there is). Do not show a minimum before this. */ ready: boolean } {
  const r = useAsync(() => getSource().createLimits(), "limits");
  return { limits: r.data ?? DEFAULT_LIMITS, loading: r.loading, ready: !r.loading };
}
