import type { Metadata } from "next";
import { LockScreen } from "@/components/locked/lock-screen";

export const metadata: Metadata = { title: "Opens at mainnet launch", robots: { index: false, follow: false } };

/** Served in place of every app route while NEXT_PUBLIC_APP_LOCKED is not "0" (see proxy.ts). No wallet providers here. */
export default function LockedPage() {
  return <LockScreen />;
}
