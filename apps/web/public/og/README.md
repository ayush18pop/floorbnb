# Share cards (Open Graph and Twitter)

One 1200 x 630 PNG per route. Every page links its own card through `pageMetadata()` in `lib/seo.ts`. The route list, filenames, headlines and descriptions live in one file, `lib/og-manifest.json`.

## Route to file map

| Route | File | Headline | Status | Placeholder label |
|---|---|---|---|---|
| `/` | `home.png` | Set a floor under your stocks. | supplied art |  |
| `/try` | `try.png` | Try Floor. No wallet. | supplied art |  |
| `/docs` | `docs.png` | Floor, explained. | placeholder |  |
| `/docs/how-it-works` | `how-it-works.png` | The floor. The cushion. The rule. | supplied art |  |
| `/docs/trade-off` | `trade-off.png` | A floor has a trade-off. | placeholder |  |
| `/docs/backtest` | `backtest.png` | What past prices show. | supplied art | BACKTEST · Past data, not a prediction |
| `/docs/evidence` | `evidence.png` | Test the rule. Show the limits. | placeholder | BACKTEST · Past data, not a prediction |
| `/docs/spot-only` | `spot-only.png` | Only spot swaps. | placeholder |  |
| `/docs/agents` | `docs-agents.png` | How agents use Floor. | placeholder |  |
| `/docs/contracts` | `contracts.png` | The contract design. | placeholder |  |
| `/docs/risks` | `risks.png` | A floor is not a guarantee. | supplied art |  |
| `/docs/open-items` | `open-items.png` | What is still open. | placeholder |  |
| `/docs/faq` | `faq.png` | Questions worth asking. | placeholder |  |
| `/locked` | `locked.png` | The app opens at mainnet launch. | placeholder |  |
| `/app` | `app.png` | Set your floor. | placeholder | APP PREVIEW |
| `/app/review` | `review.png` | Review before you sign. | placeholder | APP PREVIEW |
| `/app/confirmed` | `confirmed.png` | The position confirmation view. | placeholder | APP PREVIEW |
| `/app/positions` | `positions.png` | Your floors, in one view. | placeholder | APP PREVIEW |
| `/app/position` | `position.png` | Inside a position. | placeholder | APP PREVIEW |
| `/app/keeper` | `keeper.png` | The keeper log. | placeholder | APP PREVIEW |
| `/app/states` | `states.png` | Interface states. | placeholder | COMPONENT DEMO |
| `/agents` | `agents.png` | Floor for agents. | placeholder | DEVELOPER PREVIEW |
| `/agents/run` | `agent-run.png` | An agent run, step by step. | placeholder | EXAMPLE FLOW |

Five cards (`home`, `try`, `risks`, `backtest`, `how-it-works`) are supplied art. They use stand-in fonts, not exact Geist, so swap in the final files at the same path when they exist. The other 18 are placeholders: off-white `#FAFAF8` background, the Floor lockup, the route headline and description, a dashed "ARTWORK PENDING" panel and the footer "Not on mainnet · No human audit". Placeholders carry no figures, addresses, balances or transaction hashes.

## Replace a card

1. Export the final art as an opaque PNG, exactly 1200 x 630.
2. Save it over `apps/web/public/og/<file>.png`. No code change is needed.
3. Run `pnpm --filter web test`. It checks the size, that the PNG has no transparency, and that the file is listed.

The generator never overwrites supplied art. It rewrites a file only when the file is missing or is still the exact placeholder it wrote (its sha256 is recorded in `scripts/og-placeholders.json`).

## Regenerate placeholders (dev only)

```bash
pnpm --filter web og:placeholders
```

It reads `lib/og-manifest.json`, the lockup paths in `lib/logo.ts` (same geometry as `design/logo/floor-lockup-light.svg`) and the Geist fonts that ship with the `geist` package. It renders with the Satori and resvg build inside Next, so there is no extra dependency. Run it after you change a headline or description in the manifest.

## Add or rename a page

Add the route to `lib/og-manifest.json`, call `pageMetadata("<route>", "<title>")` in the page, run `pnpm --filter web og:placeholders`, and add the row here. `lib/seo.test.ts` fails if the manifest and the real `page.tsx` files disagree, or if a PNG is missing, has the wrong size, or has transparency.

## Rules the cards follow

- Footer on every card: "Not on mainnet · No human audit". Keep it until both stop being true.
- The home page is the only route whose canonical is `/`. Every other page sets its own clean canonical (no query string).
- Cards never change with wallet state or query parameters.
- Do not write "safe", "guaranteed" or "never broke" on a card, and do not state a gap threshold as if it were the only way a floor can fail.
- `/locked` and `/app/states` are `noindex, nofollow`.

## Locked and unlocked

The launch lock is unchanged (`proxy.ts`, `lib/launch.ts`).

- Locked (the default): `/app/*` and `/agents/*` are rewritten to `/locked` with `X-Robots-Tag: noindex`. A crawler that asks for `/app/review` receives the `/locked` page and its `locked.png` card, never the per-route card. `/og/*.png` stays fetchable, because `.png` files are allowed through.
- Unlocked (`APP_LOCKED=0` and `NEXT_PUBLIC_APP_LOCKED=0`): each app and agent page serves its own card (`app.png`, `review.png`, and so on). To check locally: `APP_LOCKED=0 NEXT_PUBLIC_APP_LOCKED=0 pnpm --filter web dev`.

## Domain

Absolute URLs come from `BRAND.siteUrl` (`lib/brand.ts`): `NEXT_PUBLIC_SITE_URL` if set, else `https://floor.ayush.works`. Next resolves the relative `/og/<file>.png`, canonical and `og:url` values against it through `metadataBase` in `app/layout.tsx`.

The old `app/opengraph-image.tsx` and `app/twitter-image.tsx` (one global card) were removed, so `/opengraph-image` and `/twitter-image` no longer exist.
