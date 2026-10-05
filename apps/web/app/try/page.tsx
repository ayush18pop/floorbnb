import { Nav } from "@/components/landing/nav";
import { Simulator } from "@/components/try/simulator";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/try", "Try Floor, no wallet");

// Public and read-only: this route must stay reachable when the app is locked (see ops/progress/FIRST60.md).
export default function TryPage() {
  return (
    <>
      <Nav />
      <main id="main"><Simulator /></main>
    </>
  );
}
