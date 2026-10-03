# DESIGN progress

Branch agent/DESIGN. Audit: `reviews/design-audit.md`. Screenshots: `apps/web/screenshots/design/`.

## Done
- Phase 1 audit (114 screenshots, overflow measurement).
- Phase 2 P0/P1 fixes; see audit section 6.
- Phase 3: MSTUDY results arrived mid-task, so there are no placeholders. `/docs/evidence` is built from `research/m_study/REPORT.md` directly. No tier UI was built (study: floor is the dial, no case for tiers; feature not shipped, not flagged).

## Where MSTUDY numbers live (if the study is re-run)
- `apps/web/app/docs/evidence/page.tsx`: constants `BY_M`, `GROUPS`, `DROPS`, `DIAL`, three header tiles, and prose in "One-over-m", "What you give up", "What we did not build".
- `apps/web/components/landing/sections.tsx`: `ProofTiles`, first tile (0.44%, 1,581, 7 periods).
- `apps/web/app/docs/risks/page.tsx` ("not a guarantee" line), `apps/web/app/docs/trade-off/page.tsx` (median-year caveat), `apps/web/app/docs/how-it-works/page.tsx` ("The 4x rule" paragraph).
- Gap wording: `apps/web/lib/brand.ts` (`gapLimitPct`, `disclosure`).

## Claims fixed
1. "93 of 93" as headline (landing tile, backtest title/lead/toc/stat, risks) -> labelled 2018-2026 sample.
2. "gap more than 25%" / "4 x 25% = 100%" -> "about 24%" (1 / m minus costs), 11 places.
3. "42% upside kept" shown as typical -> qualified as pooled average of up-year gains.
4. Gap chart limit line 25 -> 24.

## Deferred
- Footer "(soon)" links (no deployed addresses/repo yet).
- Lighthouse run (no binary here). P2 items in audit.
