import { describe, expect, it } from "vitest";
import { classifyRoute, parseAppLocked, resolveAppLocked } from "./launch";
import { proxy } from "../proxy";
import { NextRequest } from "next/server";

describe("parseAppLocked", () => {
  it("is locked unless exactly '0'", () => {
    expect(parseAppLocked(undefined)).toBe(true);
    expect(parseAppLocked("")).toBe(true);
    expect(parseAppLocked("1")).toBe(true);
    expect(parseAppLocked("true")).toBe(true);
    expect(parseAppLocked(" 0")).toBe(true);
    expect(parseAppLocked("0")).toBe(false);
  });
  it("server var wins when set", () => {
    expect(resolveAppLocked(undefined, "0")).toBe(false);
    expect(resolveAppLocked("1", "0")).toBe(true);
    expect(resolveAppLocked("0", undefined)).toBe(false);
    expect(resolveAppLocked(undefined, undefined)).toBe(true);
  });
});

describe("classifyRoute", () => {
  const lock = ["/app", "/app/", "/app/review", "/app/confirmed", "/app/position", "/app/positions", "/app/keeper", "/app/states", "/agents", "/agents/run", "/dashboard", "/appx-nope"];
  const allow = ["/", "/docs", "/docs/faq", "/docs/how-it-works", "/docs/risks", "/try", "/try/anything", "/locked", "/icon.svg", "/opengraph-image", "/twitter-image", "/robots.txt", "/globe.svg", "/_next/static/x.js"];
  it.each(lock)("locks %s", (p) => expect(classifyRoute(p)).toBe("lock"));
  it.each(allow)("allows %s", (p) => expect(classifyRoute(p)).toBe("allow"));
  it("blocks api with 503", () => { expect(classifyRoute("/api")).toBe("block"); expect(classifyRoute("/api/x.json")).toBe("block"); });
  it("is not fooled by lookalike prefixes", () => { expect(classifyRoute("/docsx")).toBe("lock"); expect(classifyRoute("/tryout")).toBe("lock"); });
});

describe("proxy (flag unset in tests = locked)", () => {
  it("rewrites app routes to the lock screen", () => {
    const res = proxy(new NextRequest("http://x.test/app/review"));
    expect(res.headers.get("x-middleware-rewrite")).toBe("http://x.test/locked");
  });
  it("passes public routes", () => {
    expect(proxy(new NextRequest("http://x.test/try")).headers.get("x-middleware-rewrite")).toBeNull();
    expect(proxy(new NextRequest("http://x.test/docs/faq")).headers.get("x-middleware-rewrite")).toBeNull();
  });
  it("503 for api", () => {
    expect(proxy(new NextRequest("http://x.test/api/anything")).status).toBe(503);
  });
});
