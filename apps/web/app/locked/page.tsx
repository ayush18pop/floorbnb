import { LockScreen } from "@/components/locked/lock-screen";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/locked", "Opens at mainnet launch");

/** Served in place of every app route while NEXT_PUBLIC_APP_LOCKED is not "0" (see proxy.ts). No wallet providers here. */
export default function LockedPage() {
  return <LockScreen />;
}
