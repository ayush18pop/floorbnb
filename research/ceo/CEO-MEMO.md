# CEO memo: Floor vs cppi-vault, and how we win the next 6 days

Date: 2026-10-04. Deadline Sun 2026-10-11 12:00 UTC; we submit Sat 10 Oct.
Sources: Floor docs listed in the brief; cppi-vault cloned from https://github.com/jayeshy14/cppi-vault (all line refs below are to that clone at HEAD, last push 2026-09-24).
Things I could not verify are marked **unverified**. Contract-touching ideas are marked **[CONTRACT]** and default to NO.

---

## 1. What cppi-vault is, and how it compares

**In 5 lines**
1. A Solidity-only, Foundry repo: an ERC-7540 async CPPI vault, term-based, that holds ETH (risky) and a Pendle PT (safe leg), rebalanced through Uniswap V3 (README.md:3, :36-54).
2. Floor is computed on-chain as the present value of the protected amount, discounted at the live PT yield, with m = 2 (README.md:11-13).
3. 56 commits, 1 author, created 2026-07-12, 6 stars, no homepage/demo link set (GitHub metadata). Repo has no frontend, no docs folder, no deployment (file listing: only `src/`, `test/`, `script/`, `artifacts/`; README.md:5 "not deployed. Do not use with real funds").
4. 151 passing tests, fork tests for Pendle and execution, crash replays, fuzz and invariant suites (README.md:58; test/Invariants.t.sol, test/CrashScenarios.t.sol, test/fork/*).
5. Self-audit with 21 findings, all PR-remediated, plus an adversarial re-verification; three items still open and listed in public (README.md:66-74).

**Where it is better than us**
- **Mechanism depth.** The floor accretes (PV of the promise), so the safe leg earns bond yield while it waits. Ours is a flat floor with 0% stablecoin yield (CONTEXT.md; Venus yield is "not in v1"). Also floor policies (Fixed / Step ratchet / TIPP) as share classes (README.md:24-34).
- **Rigor of parameter derivation.** Jump model, closed-form breach probability, reconciled to the Python backtest to 1e-12 in Solidity tests (README.md:16-20, :58). Our research is strong (1,581 windows, 38 series) but our contracts are not pinned to it by a test, as far as the docs show (**unverified**).
- **Permissionless emergency path.** Anyone can de-risk if the keeper is down in a crash (src/libraries/RebalancePolicy.sol:8, :23, :64). We have `rebalancePublic` after 4 h idle, which is weaker in a crash (DECISIONS.md).
- **Security narrative.** Honest, specific self-audit with open items named. Credibility move we should copy in tone.
- **Writing/distribution.** Author builds in public on X (README.md:80). That is its only distribution that I can see.

**Where we are better**
- **It is not a product.** No UI, no deploy, no users, no demo, no agent surface. We have a web app, keeper, API, MCP, x402, SDK, a skill, mainnet plan.
- **Fit to the hackathon.** It is ETH + Pendle + Uniswap on Ethereum-style stack. Zero BNB Chain, zero bStocks, zero PancakeSwap. It could not enter our hackathon. Our "one rule: bStocks central, spot only, BSC mainnet" is met.
- **Narrative.** "Your stock portfolio doesn't go below the line you set" is one sentence a non-crypto person gets. Theirs is "ERC-7540 CPPI with Pendle PT". Ours wins Product/UX (20%) and Creativity (25%) by a wide margin.
- **Asset class evidence.** Stocks, 98 years of S&P, real worst window (NVDA 2022: -51.0% vs -10.0%) against their 104 ETH terms.
- **Gap honesty at m = 4.** Our 1/m = 25% gap bound is tighter in stock markets than ETH's 50% at m = 2 would suggest; stocks gap less than crypto except single names (research/m_study).
- **Isolation.** One clone per position, so one user's gap loss cannot touch another (DECISIONS.md). Their pooled vault shares NAV across holders; they had to build an accounting identity and found fee-mint and fee-basis bugs because of it (test/FeeFloorBreach.t.sol:12-16; README.md:71).
- **Zero protocol fee** in v1 means we avoid the exact class of bug they found (fee mints dropping holders below the protected amount).

**Where we are worse, honestly**
- Mechanism: no yield on the safe leg; flat floor; m = 4 is aggressive (their 4.3% breach at m = 2 vs ~46% at m = 4 on ETH is a crypto-vol number, but a judge will see it).
- Our audit is AI-assisted (Pashov skills), not independent (docs/AUDIT.md). Theirs is also not independent, but is documented in more depth.
- We are a week old and under time pressure; contract freeze timing is tight.

**Threat read:** low. It is a reference for credibility and structure, not a competitor. Judges who read both will see ours as the shippable one.

---

## 2. Ideas worth stealing (ranked by impact / effort)

| # | Idea | Why it matters | What it takes | Audit risk | Verdict |
|---|---|---|---|---|---|
| 1 | **"Honest state" security section**: published list of known open items and what we did NOT audit, in README and on the site's risk page. Copies README.md:64-74. | Technical judging (30%) rewards honesty; a skeptical judge disarms instantly. Costs nothing. | `README.md`, `docs/AUDIT.md`, landing risk section. Text only. | None | **DO NOW** |
| 2 | **Publish the "breach probability" as a product parameter**, not a footnote (README.md:14). We already have 0.44% (CI 0.11-0.91%), 7 breaches all from windows with a >25% one-day drop. Put this on the slider screen next to the floor. | It is the most defensible number we own; turns "we never say guaranteed" into a feature. | `apps/web` copy and one tooltip; numbers from CONTEXT.md only. | None | **DO NOW** |
| 3 | **Backtest-to-contract parity test**: assert the Solidity maths against the Python reference to tight tolerance (README.md:58). | Strong Technical signal, and it catches real bugs. | A test file only if it lives in `packages/contracts/test`. A TS/SDK-side parity test (`packages/sdk` CPPI maths vs. stored CSV paths) needs no contract change. | Test-only in contracts dir still changes the audited commit tree. **Do the SDK-side version only.** | **DO IF TIME** (SDK-side), else LATER |
| 4 | **Crash-scenario replays as a visible feature**: they replay Oct 10 2025 at 5-minute resolution (README.md:21; test/CrashScenarios.t.sol, 367 lines). We have NVDA 2022 daily paths (`docs/data/vault_path_*.csv`). Add a "replay a crash" selector (NVDA 2022, Mar 2020, Aug 2024 weekend) on the app. | It is the demo moment. Judges see the line hold. | `apps/web` only, from existing CSVs. | None | **DO NOW** |
| 5 | **Floor-policy variants (ratchet / TIPP)** (README.md:24-34). Lets users lock gains. | Real product value (their TIPP median +13.7% vs +4.1% fixed on ETH). Nice-to-have, not needed to win. | New policy logic **[CONTRACT]** | Breaks audited commit | **NO** (mention as roadmap) |
| 6 | **Accreting floor from safe-leg yield** (README.md:11). Our idle USDT earns nothing. | Real moat over time. | Venus supply = new contract surface **[CONTRACT]** | Breaks audit | **NO now; LATER** (roadmap slide) |
| 7 | **Fully permissionless emergency de-risk** (RebalancePolicy.sol:23). Ours opens only after 4 h idle. | Real robustness gain. | Vault change **[CONTRACT]** | Breaks audit | **NO** (say the 4 h and trading-window limits plainly; see Q6) |
| 8 | **ERC-7540 async requests** | Needed for their NAV pricing across a pooled vault; we do not need it with one clone per position. | **[CONTRACT]** | Breaks audit | **NO** |
| 9 | **Cite academic references** (Black-Perold, Cont-Tankov, Balder et al., README.md:76-78) in our docs and site footer. | Cheap credibility. | Text only. | None | **DO IF TIME** |

Net: steal their honesty, their parameter-as-product framing, and their crash replays. Do not steal their contracts.

---

## 3. Ideas in neither project (max 7, ranked)

1. **"First 60 seconds" onboarding with a simulated position**: land, drag the floor slider, see the backtest line and "worst case about -10%", then one button. No wallet needed to see the quote. Judges and non-crypto users both judge this first. Takes: `apps/web` only. Verdict: **DO NOW**.
2. **One-click "Proof" page for the live position**: the real mainnet vault address, a real `Rebalanced` tx on BscScan, the TWAP price it used, and the floor line, all read from chain (P7 already says the web reads chain directly). Trust is the product. Takes: `apps/web` plus `FloorLens`, existing. Verdict: **DO NOW**.
3. **Agent-as-front-door demo**: a Claude/agent session that calls MCP `quote_protection`, pays via x402/b402, then builds `build_create_position_tx` for a user to sign. This is what wins the Agentic Wallet and Agent Studio side prizes and is unique. Takes: existing `apps/mcp`, `packages/x402`. Keep it unattended-safe: the agent builds the tx, the human signs. Verdict: **DO NOW** (it is already the plan; protect it from slipping).
4. **Risk framing card, always visible on the slider**: "Holds unless a single drop over about 24-25% hits before we can rebalance. Weekends are unhedged. bStocks can be paused or blocklisted by the issuer. Not available where tokenized equities are restricted. Not financial advice." Regulatory and risk honesty, and it pre-empts the sharpest attack. Takes: copy and one component. Verdict: **DO NOW**.
5. **"Exit in kind" as a trust moment**: a button that shows you can leave at any time and take the stocks and USDT out, even if the keeper is dead. It answers "what if you disappear?". Takes: demo flow using `exitInKind` on the fork. Verdict: **DO NOW** (demo beat, no new code).
6. **Shareable position card** (image of the slider, floor, historical outcome, and vault link) for X. A cheap growth loop and good for the DX/social side. Takes: a static OG-image route in `apps/web`. Verdict: **DO IF TIME**.
7. **Public live dashboard of keeper health**: last rebalance time, next window, whether the trading window is open (Mon-Fri 15:30-19:30 UTC), keeper balance. Avoids "is it alive?" doubt on a judge's Tuesday click-through. Takes: `apps/web`, reading `FloorLens`. Verdict: **DO IF TIME**.

Not recommended: any in-app LLM (CONTEXT.md says explicitly there is none), Ondo/xStocks adds, TSLAB (46 bps), a token, leverage or "boost" modes.

---

## 4. What judges will ask: the 10 sharpest answers

Judging: Technical 30, Creativity 25, DX Report 25 (must be human-written), Product/UX 20.

1. **"Is the floor guaranteed?"** No. It holds unless a single move beyond about 24-25% lands before the vault can rebalance. In 1,581 one-year windows it missed by more than 1 point in 0.44% (95% CI 0.11-0.91%); the S&P 500 alone, 0 in 98 years. Single stocks gap worse.
2. **"What happens over a weekend?"** The vault does not trade then (trading window Mon-Fri 15:30-19:30 UTC, on-chain), so the whole weekend gap is unhedged, and the maths assumes it. Worst gaps since 2018: NVDA -19.3%, QQQ -9.5%. Weekend swap cost is not yet measured; we say so.
3. **"Why would anyone want 42% of the upside?"** Honestly, most would not in a good year (median year +1.6% vs +13.7% holding). The product is for the bad year: when holding lost more than 10%, NVDA vault -9.9% vs -36% median; worst case NVDA 2022 -10.0% vs -51.0%. It is insurance, priced in upside.
4. **"Why not just buy a stop-loss or put options?"** Options do not exist for bStocks on BSC and we cannot use derivatives under the hackathon rules. A stop-loss sells at the bottom and stays out; CPPI scales back in. In TradFi this is a bank principal-protected note with fees and minimums.
5. **"Why is this not a copy of cppi-vault?"** It shares the textbook mechanism (CPPI is 1986-92 theory, cited by both). Different asset class, chain and execution venue: stocks, BSC, PancakeSwap/aggregator, TWAP price on-chain, per-position clones, spot only, agents/MCP/x402 on top. It has no UI, deploy or demo.
6. **"What if your keeper dies?"** `rebalancePublic` opens to anyone after 4 h idle, through the direct Pancake pool, and `exitInKind` is always available to the owner. Weakness: the public path is slower than cppi-vault's emergency trigger and only works in the trading window. We say that.
7. **"What can break the vault that is not price?"** bStocks have an issuer pause, a blocklist and a sanctions list (DECISIONS.md, open item 2). `exitInKind` skips a paused token. Pool TVL is thin (NVDAB about $4.8M), which is why caps are 1,000 USDT per position and 5,000 total.
8. **"Is it audited?"** AI-assisted Pashov audit (x-ray plus solidity-auditor) with zero Critical/High open on the deployed commit, run on the frozen commit. Not a human audit; we say that, and that is why the launch caps are small.
9. **"Why a keeper and not fully on-chain?"** The keeper only triggers; it supplies no price and the vault re-validates direction, size, router and `minOut` (DECISIONS.md, A4/A5). A malicious keeper can waste gas, not set prices.
10. **"Would this bring non-crypto people on-chain?"** The first screen is one slider and one number, and a stock owner already understands "a floor under my portfolio". Deposits are USDT only today, and onboarding still needs a wallet; the agent/MCP path is the bridge. We do not claim a mass-market flow yet.

**Where we are weakest (be ready)**
- Weekend and single-stock gap risk, plus survivorship bias in the history (CONTEXT.md caveats).
- Median outcome is small: a skeptic will say "you built a slow cash vault". Lead with bad windows, not medians.
- Thin liquidity and issuer powers on bStocks; tiny caps.
- Audit is AI-only; time compression (deploy Mon 5 Oct) is visible.
- Name clash (floor.xyz, FloorDAO). Sill is the backup (DECISIONS.md).
- b402 production access is gated (DECISIONS.md open item 4): if it does not arrive, demo our own facilitator and say so.
- Contract status today is **unverified** by me: I read the plans, not the deployed state. Verify the mainnet address and one real `Rebalanced` tx before anything else.

---

## 5. The 3-minute demo script

Rules: say "simulated" aloud and show it on screen whenever the crash is replayed; never say guaranteed or can't lose; use only numbers in CONTEXT.md. Real address and real BscScan tx on screen. Fork stack for anything not on mainnet, labelled "local fork".

| Time | Screen | Say |
|---|---|---|
| 0:00-0:15 | NVDA 2022 chart: -51.0%, low at -62.7% | "This is a bad year for a tokenized stock. You can hold NVDA on BNB Chain now. You cannot cap the fall." |
| 0:15-0:35 | Floor landing, then app: connect-free quote. Drag floor slider to 90%. Number appears: "Worst case about -10%, holds unless a single drop beyond about 24% hits first." | "Floor sets the line under your portfolio. Spot trades only: no perps, options, leverage or borrowing." |
| 0:35-1:05 | Live backtest panel beside the slider: change to 85%, 95%; vault line vs holding line on NVDA 2022 (-10.0% vs -51.0%). Then the trade-off card: "You keep about 42% of gains in up years; median year +1.6% vs +13.7%." | "The price is upside. In up years you keep about forty-two percent of the gain. We show you the worst year and the median year, both." |
| 1:05-1:45 | Label "SIMULATED CRASH, local fork". Create a position (deposit USDT). Fast-forward a crash; keeper triggers `rebalance`; stock share falls, USDT share rises, value hugs the floor line. Cut to BscScan: the tx. | "The vault re-sells stock for USDT as prices fall. Plain swaps. The price comes from an on-chain 10-minute TWAP, not from our keeper." |
| 1:45-2:15 | Terminal: an agent calls MCP `quote_protection`, gets HTTP 402, signs payment (b402, or our facilitator, labelled), receives the quote, then `build_create_position_tx`. Agentic Wallet shown as a second keeper only if the Tuesday AW tx succeeded. | "Agents can use Floor too. They pay per call and build the transaction. The human or their agent wallet signs it." |
| 2:15-2:40 | Proof page: mainnet vault address, a real `Rebalanced` tx, keeper-health panel. Then "Exit in kind": press exit, receive stocks and USDT directly. | "Everything is on-chain and checkable. If our keeper vanishes, you can leave with your assets." |
| 2:40-3:00 | Risk card: issuer pause, weekend gaps, caps (1,000 per position, 5,000 total), AI-assisted audit not human, backtests do not predict. Logo, repo, URL. | "Here is what can go wrong. Floor: your stocks, with a floor." |

Cut order if over time: the second slider change, then the Agentic Wallet shot. Never cut the proof page or the risk card.

---

## 6. The decisive top 5 for the next 6 days

| # | Move | Owner | Done looks like |
|---|---|---|---|
| 1 | **Lock reality: one real mainnet position and one real `Rebalanced` tx inside a trading window (Mon-Fri 15:30-19:30 UTC), contract frozen and audit report on the deployed commit.** Nothing else matters if this slips. Human gate G3 plus deploy; then everything else reads from it. | Human (deploy, gates), agent (runbook, verify on BscScan) | Verified contract address, a `Rebalanced` tx hash, `reviews/audit-pashov-final.md` with zero Critical/High open, caps set 1,000 / 5,000. No contract edits after this; every later idea touching `packages/contracts` is a NO. |
| 2 | **The first-60-seconds screen**: connect-free slider, live backtest, crash replay selector, always-visible risk card, proof page and keeper health. All `apps/web` only. | Agent (build), human (watch a stranger use it once) | A person who has never seen Floor gets from landing to "worst case about -10%" in under 60 s without help; every number traces to CONTEXT.md. |
| 3 | **Agents track proven end to end**: MCP `quote_protection` paid via b402, or our own facilitator by Tue 6 Oct 18:00 UTC; `build_create_position_tx` works against the mainnet vault; skill published. | Agent; human applies for b402 access today | A recorded run: 402, payment settled, quote returned, tx built. If b402 is not granted by Tue, we ship the own-facilitator version and label it. |
| 4 | **Honesty pass**: claims review against CONTEXT.md, risk section (issuer pause, weekends, thin liquidity, AI-only audit), published "known open items", "93 of 93" never used alone (use 0.44% with CI), name stays Floor with a one-line rename constant. | Agent (claims review), human (final read) | Zero uses of "guaranteed", "safe", "can't lose"; each number has a source line; known-open-items list in README. |
| 5 | **Human-written DX report and the 3-minute video**: the report is 25% of the score and must be real. Record two takes in the trading window (Thu, Fri), final cut Sat, submit by Sat 18:00 UTC. | Human only (report); human with agent help for cuts | Report submitted in the team lead's own words with real friction (aggregator min order above $5, taker-contract spike, AW developer-mode limits); video under 3:00 following section 5; submission confirmed Sat 10 Oct, not Sunday. |

Stop list: no new contract features (ratchet, yield, public emergency), no in-app AI, no extra assets, no token. Fixes only after Fri 12:00 UTC.
