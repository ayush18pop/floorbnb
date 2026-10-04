# Branching and the launch lock

Status: proposal implemented in code (agent LOCK). The Vercel and branch steps at the end are for the manager.

## Plan

- `main` is what Vercel production (project floorbnb, root `apps/web`) serves. The code is **locked by default**, so `main` is always safe to deploy.
- `dev` is the integration branch. Agent work lands on `dev` first. The team tests locally with the lock off (`local:up` sets it).
- Promote `dev` to `main` by fast-forward (or a merge commit if main moved) after the gates: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, `pnpm --filter web build`.
- At mainnet launch: in Vercel set `NEXT_PUBLIC_APP_LOCKED=0` for the **Production** scope, then redeploy. No branch swap.

Why not a long-lived divergent "locked" branch: every feature would have to be merged into two branches (conflicts, drift), unlocking means a risky branch swap, and it is easy to forget which branch is live. One flag means one code line, a one-variable unlock, and a missing variable fails closed (locked).

## The flag

`apps/web/lib/launch.ts`. `APP_LOCKED` is true unless the value is exactly the string `0` (unset, empty, `1`, `true`, ` 0` all lock). Read order: server `APP_LOCKED` if set, else `NEXT_PUBLIC_APP_LOCKED`. `NEXT_PUBLIC_*` is inlined at build, so changing it on Vercel needs a redeploy.

Enforcement is server-side in `apps/web/proxy.ts` (Next 16 name for middleware), before any page renders. App routes are rewritten to `/locked` (HTTP 200, `no-store`, `noindex`), which is a static mock behind a blur. It has no wallet providers (they live only in `app/app/layout.tsx` and `app/agents/layout.tsx`), no RPC calls, no live data. `/api/*` answers 503 JSON. The classifier is an allowlist: a new route is locked until someone adds it to `lib/launch.ts`.

## Route table

| Route | Locked | Why |
|---|---|---|
| `/` | allow | landing |
| `/docs`, `/docs/*` (agents, backtest, contracts, evidence, faq, how-it-works, risks, spot-only, trade-off) | allow | public docs |
| `/try`, `/try/*` | allow | public simulator (FIRST60) |
| `/locked` | allow | the lock screen itself |
| `/legal`, `/legal/*` | allow | reserved for legal pages (none exist yet) |
| `/opengraph-image`, `/twitter-image`, `/icon.svg`, `/robots.txt`, `/sitemap.xml`, `/favicon.ico`, `/manifest.webmanifest`, `/_next/*`, files in `public/` | allow | assets |
| `/app` (builder) | lock | app |
| `/app/review`, `/app/confirmed`, `/app/position`, `/app/positions`, `/app/keeper`, `/app/states` | lock | app |
| `/agents`, `/agents/run` | lock | app (wallet providers, agent run pages) |
| `/api`, `/api/*` (none exist today) | 503 | any handler acting for the app |
| anything else | lock | allowlist default |

Tests: `apps/web/lib/launch.test.ts`.

## Local

`pnpm local:up` starts the web process with `NEXT_PUBLIC_APP_LOCKED=0` and `APP_LOCKED=0` (`local/src/cli.ts`). For a plain `next dev`: `NEXT_PUBLIC_APP_LOCKED=0 pnpm --filter web dev`. Without it you see the lock, which is the same as production.

## Preview deployments

Recommendation: Previews stay **locked** (leave `NEXT_PUBLIC_APP_LOCKED` unset or 1 in the Preview scope). Preview URLs are public by default, so unlocked previews would expose the app. Only unlock Preview for the `dev` branch if Vercel Deployment Protection (Vercel Authentication, or Password Protection) is on for Preview deployments. Then set `NEXT_PUBLIC_APP_LOCKED=0` for Preview, branch `dev` only.

## Steps for the manager (not run by LOCK)

1. Review and merge `agent/LOCK` into `main` (so production is locked). Create `dev` from `main`: `git branch dev main && git push -u origin dev`.
2. Production must be locked before the merge deploys: confirm `NEXT_PUBLIC_APP_LOCKED` is NOT set in Vercel (Settings, Environment Variables). Check: `vercel env ls production`.
3. After deploy, verify: `curl -s https://<prod-domain>/app | grep -c "opens at mainnet launch"` gives 1, `/` and `/docs` load.
4. Optional, protect previews: Vercel dashboard, project floorbnb, Settings, Deployment Protection, enable Vercel Authentication for Preview (or Standard Protection). Then optionally add the env var for dev previews: dashboard, Environment Variables, add `NEXT_PUBLIC_APP_LOCKED` = `0`, environment Preview only, branch `dev`. CLI: `vercel env add NEXT_PUBLIC_APP_LOCKED preview dev` then enter `0`.
5. Git settings: Settings, Git, Production Branch = `main` (should already be).
6. At launch: `vercel env add NEXT_PUBLIC_APP_LOCKED production` (value `0`), then redeploy: `vercel --prod` or dashboard Deployments, Redeploy (without build cache is not needed, but the redeploy must rebuild). Verify `/app` shows the builder. To re-lock: remove the variable and redeploy.
