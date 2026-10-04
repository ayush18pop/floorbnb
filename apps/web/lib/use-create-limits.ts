"use client";
import { getSource } from "@/lib/adapters";
import { useAsync } from "@/lib/adapters/use";
import { DEFAULT_LIMITS, type CreateLimits } from "@/lib/create-validation";

/** The chain's createPosition limits when readable; the documented defaults while loading or if the read fails. */
export function useCreateLimits(): { limits: CreateLimits; loading: boolean } {
  const r = useAsync(() => getSource().createLimits(), "limits");
  return { limits: r.data ?? DEFAULT_LIMITS, loading: r.loading };
}
