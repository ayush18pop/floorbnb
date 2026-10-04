/**
 * Launch lock. One flag decides whether the app pages (/app, /agents, API handlers) are usable.
 * DEFAULT = LOCKED. Unlocked only when the value is exactly the string "0".
 * Server code and the proxy read APP_LOCKED first (runtime), then NEXT_PUBLIC_APP_LOCKED (inlined at build).
 */
export function parseAppLocked(value: string | undefined | null): boolean {
  return value !== "0";
}

/** Server-side precedence: APP_LOCKED if it is set at all, else NEXT_PUBLIC_APP_LOCKED. Static env refs so Next can inline. */
export function resolveAppLocked(server: string | undefined, pub: string | undefined): boolean {
  return parseAppLocked(server !== undefined ? server : pub);
}

export const APP_LOCKED = resolveAppLocked(process.env.APP_LOCKED, process.env.NEXT_PUBLIC_APP_LOCKED);

export type RouteDecision = "allow" | "lock" | "block";

const under = (p: string, base: string) => p === base || p.startsWith(base + "/");

/** Public pages that stay open while locked. Everything not listed here is locked (allowlist, safe by default). */
const ALLOW_EXACT = new Set(["/", "/locked", "/robots.txt", "/sitemap.xml", "/favicon.ico", "/icon.svg", "/opengraph-image", "/twitter-image", "/manifest.webmanifest"]);
const ALLOW_PREFIX = ["/docs", "/try", "/legal", "/_next"];
const STATIC_FILE = /\.(svg|png|jpe?g|webp|avif|gif|ico|txt|xml|woff2?|css|js|map)$/i;

/** Decide a path while the app is locked. "lock" = serve the lock screen, "block" = 503 JSON, "allow" = pass through. */
export function classifyRoute(pathname: string): RouteDecision {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (under(p, "/api")) return "block";
  if (under(p, "/app") || under(p, "/agents")) return "lock";
  if (ALLOW_EXACT.has(p) || ALLOW_PREFIX.some((b) => under(p, b))) return "allow";
  if (STATIC_FILE.test(p)) return "allow";
  return "lock";
}
