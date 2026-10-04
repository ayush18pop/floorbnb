import { NextResponse, type NextRequest } from "next/server";
import { APP_LOCKED, classifyRoute } from "@/lib/launch";

/** Server-side launch lock (Next 16 "proxy", formerly middleware). Runs before any page renders. See docs/BRANCHING.md. */
export function proxy(req: NextRequest) {
  if (!APP_LOCKED) return NextResponse.next();
  const decision = classifyRoute(req.nextUrl.pathname);
  if (decision === "allow") return NextResponse.next();
  if (decision === "block") {
    return NextResponse.json({ error: "locked", message: "The Floor app opens at mainnet launch." }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "86400" } });
  }
  const res = NextResponse.rewrite(new URL("/locked", req.url));
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
