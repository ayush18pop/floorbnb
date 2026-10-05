import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND } from "@/lib/brand";
import { classifyRoute } from "@/lib/launch";
import { OG_SIZE, SEO_MANIFEST, ogPath, pageMetadata, seoEntry } from "@/lib/seo";
import { isOpaque, readHeader } from "../scripts/png.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const appDir = join(root, "app");
const ogDir = join(root, "public/og");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const pageFiles = walk(appDir).filter((f) => /[\\/]page\.tsx$/.test(f));
const routeOf = (f: string) => {
  const r = "/" + relative(appDir, f).replace(/\\/g, "/").replace(/(^|\/)page\.tsx$/, "");
  return r.length > 1 ? r.replace(/\/$/, "") : r;
};
const pageByRoute = new Map(pageFiles.map((f) => [routeOf(f), f]));

describe("share-card manifest", () => {
  it("covers exactly the real pages", () => {
    expect([...pageByRoute.keys()].sort()).toEqual(SEO_MANIFEST.map((m) => m.route).sort());
  });

  it("has unique routes and unique png filenames", () => {
    expect(new Set(SEO_MANIFEST.map((m) => m.route)).size).toBe(SEO_MANIFEST.length);
    expect(new Set(SEO_MANIFEST.map((m) => m.file)).size).toBe(SEO_MANIFEST.length);
    for (const m of SEO_MANIFEST) expect(m.file).toMatch(/^[a-z0-9-]+\.png$/);
  });

  it("has a 1200x630 opaque png for every entry and no stray files", () => {
    for (const m of SEO_MANIFEST) {
      const p = join(ogDir, m.file);
      expect(existsSync(p), m.file).toBe(true);
      const buf = readFileSync(p);
      const h = readHeader(buf);
      expect([h.width, h.height], m.file).toEqual([OG_SIZE.width, OG_SIZE.height]);
      expect(isOpaque(buf), `${m.file} must be opaque`).toBe(true);
    }
    const pngs = readdirSync(ogDir).filter((n) => n.endsWith(".png")).sort();
    expect(pngs).toEqual(SEO_MANIFEST.map((m) => m.file).sort());
  });

  it("keeps the copy free of figures, addresses and banned claims", () => {
    for (const m of SEO_MANIFEST) {
      const text = `${m.headline} ${m.description} ${m.label ?? ""}`;
      expect(text, m.route).not.toMatch(/\d|0x|✓|✔|\bsafe\b|guarantees?d\b|never broke|\bgap\b/i);
    }
  });
});

describe("pageMetadata", () => {
  for (const m of SEO_MANIFEST) {
    it(`${m.route} is complete`, () => {
      const md = pageMetadata(m.route, m.route === "/" ? undefined : "T");
      expect(md.alternates?.canonical).toBe(m.route);
      expect(md.description).toBe(m.description);
      const og = md.openGraph as { type: string; siteName: string; url: string; title: string; description: string; images: { url: string; width: number; height: number; type: string; alt: string }[] };
      expect(og.type).toBe("website");
      expect(og.siteName).toBe(BRAND.name);
      expect(og.url).toBe(m.route);
      expect(og.images).toHaveLength(1);
      expect(og.images[0]).toMatchObject({ url: ogPath(m.file), width: 1200, height: 630, type: "image/png" });
      expect(og.images[0].alt.length).toBeGreaterThan(10);
      const tw = md.twitter as { card: string; title: string; description: string; images: { url: string; alt: string }[] };
      expect(tw.card).toBe("summary_large_image");
      expect(tw.images).toHaveLength(1);
      expect(tw.images[0].url).toBe(og.images[0].url);
      expect(tw.images[0].alt).toBe(og.images[0].alt);
      expect(tw.title).toBe(og.title);
      expect(tw.description).toBe(og.description);
    });
  }

  it("never gives a non-home route the homepage canonical", () => {
    for (const m of SEO_MANIFEST) {
      const c = pageMetadata(m.route, "T").alternates?.canonical;
      expect(c === "/", m.route).toBe(m.route === "/");
    }
  });

  it("is noindex only for /locked and /app/states", () => {
    const noindex = SEO_MANIFEST.filter((m) => pageMetadata(m.route, "T").robots).map((m) => m.route).sort();
    expect(noindex).toEqual(["/app/states", "/locked"]);
    expect(pageMetadata("/locked", "T").robots).toEqual({ index: false, follow: false });
    expect(pageMetadata("/app/states", "T").robots).toEqual({ index: false, follow: false });
  });

  it("mirrors the docs and site title templates", () => {
    expect((pageMetadata("/docs/risks", "Risks").openGraph as { title: string }).title).toBe(`Risks | ${BRAND.name} docs`);
    expect((pageMetadata("/try", "Try").openGraph as { title: string }).title).toBe(`Try | ${BRAND.name}`);
    expect((pageMetadata("/").openGraph as { title: string }).title).toBe(`${BRAND.name}: ${BRAND.headline}`);
  });

  it("throws on an unknown route", () => {
    expect(() => seoEntry("/nope")).toThrow();
  });
});

describe("page wiring", () => {
  it("every page exports its own metadata through pageMetadata, and nothing else sets it", () => {
    for (const [route, file] of pageByRoute) {
      const src = readFileSync(file, "utf8");
      expect(src, route).toContain(`export const metadata = pageMetadata("${route}"`);
      expect(src, route).not.toMatch(/generateMetadata|alternates|canonical/);
      expect((src.match(/export const metadata/g) ?? []).length, route).toBe(1);
    }
  });

  it("sets no canonical or card image outside lib/seo.ts", () => {
    const offenders = [...walk(appDir), ...walk(join(root, "components"))]
      .filter((f) => /\.(tsx?|mjs)$/.test(f))
      .filter((f) => /alternates\s*:|canonical/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
    expect(existsSync(join(appDir, "opengraph-image.tsx"))).toBe(false);
    expect(existsSync(join(appDir, "twitter-image.tsx"))).toBe(false);
  });

  it("derives the site URL from BRAND.siteUrl and never hardcodes the Vercel host", () => {
    expect(BRAND.siteUrl).toBe(process.env.NEXT_PUBLIC_SITE_URL ?? "https://floor.ayush.works");
    for (const f of ["lib/seo.ts", "lib/og-manifest.json", "app/layout.tsx"]) expect(readFileSync(join(root, f), "utf8")).not.toMatch(/vercel\.app/);
    const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
    expect(layout).toContain("metadataBase: new URL(BRAND.siteUrl)");
    expect(layout).not.toMatch(/alternates|images/);
  });

  it("keeps /og/*.png fetchable while locked, without opening any app route", () => {
    for (const m of SEO_MANIFEST) expect(classifyRoute(ogPath(m.file)), m.file).toBe("allow");
    for (const p of ["/app", "/app/states", "/agents", "/agents/run", "/app/position"]) expect(classifyRoute(p), p).toBe("lock");
    expect(classifyRoute("/api/x")).toBe("block");
  });

  it("documents every route and file in public/og/README.md", () => {
    const readme = readFileSync(join(ogDir, "README.md"), "utf8");
    for (const m of SEO_MANIFEST) {
      expect(readme, m.route).toContain(`\`${m.route}\``);
      expect(readme, m.file).toContain(`\`${m.file}\``);
    }
  });
});
