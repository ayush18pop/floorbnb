import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import manifest from "./og-manifest.json";

/**
 * Route-specific share cards. One manifest (lib/og-manifest.json) feeds this helper, the placeholder generator
 * (scripts/generate-og-placeholders.mjs) and the tests. Each page calls pageMetadata() with its own route.
 * Images live in public/og/<file>.png (see public/og/README.md). Absolute URLs come from BRAND.siteUrl via metadataBase.
 */
export type SeoEntry = {
  route: string;
  file: string;
  headline: string;
  description: string;
  /** Mono label printed on the placeholder card only. */
  label?: string;
  /** Page robots index:false, follow:false. */
  noindex?: boolean;
};

export const SEO_MANIFEST: readonly SeoEntry[] = manifest;
export const OG_SIZE = { width: 1200, height: 630 } as const;

export function seoEntry(route: string): SeoEntry {
  const e = SEO_MANIFEST.find((m) => m.route === route);
  if (!e) throw new Error(`seo: no manifest entry for route ${route}`);
  return e;
}

/** Path of a card, relative to the site root. */
export const ogPath = (file: string) => `/og/${file}`;

/** Title used on cards. Mirrors the title templates in app/layout.tsx and app/docs/layout.tsx. */
export function shareTitle(route: string, title?: string): string {
  if (!title) return `${BRAND.name}: ${BRAND.headline}`;
  return route === "/docs" || route.startsWith("/docs/") ? `${title} | ${BRAND.name} docs` : `${title} | ${BRAND.name}`;
}

/**
 * Complete metadata for one page. Nested metadata replaces shallowly, so openGraph and twitter are complete here.
 * `title` is the page's own title (the layout template adds the suffix); omit it on the home page to keep the default.
 * Nothing here reads wallet state or query params.
 */
export function pageMetadata(route: string, title?: string): Metadata {
  const e = seoEntry(route);
  const image = ogPath(e.file);
  const alt = `${BRAND.name}: ${e.headline} ${e.description}`;
  const t = shareTitle(route, title);
  return {
    ...(title ? { title } : {}),
    description: e.description,
    alternates: { canonical: route },
    ...(e.noindex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      type: "website",
      siteName: BRAND.name,
      url: route,
      title: t,
      description: e.description,
      images: [{ url: image, width: OG_SIZE.width, height: OG_SIZE.height, type: "image/png", alt }],
    },
    twitter: {
      card: "summary_large_image",
      title: t,
      description: e.description,
      images: [{ url: image, alt }],
    },
  };
}
