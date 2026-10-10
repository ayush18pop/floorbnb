# DX evidence index (raw facts, NOT the report)

> WARNING: this file is an EVIDENCE INDEX compiled by an AI agent (W8, 2026-10-10). It is not the Developer Experience report and must not be submitted or paraphrased as one. Hackathon rules: "Perfunctory or AI-generated reports are not accepted" (DX report = 25% of score). The humans write the report themselves, in their own words, from memory plus these pointers. Every entry below is a fact with a source; each "possible ask" is a 5-word tag, not a recommendation. Entries marked `HUMAN:` need a human answer (time lost, feelings) that no repo file contains. Check each source yourself before quoting it.

Legend. Severity guess = blocker / high / medium / low (agent guess, human to overrule). Found by = `agent probe` (an AI build agent hit it), `human` (team lead, from notes), `test` (unit/fork/live test output). Dates are from the cited file or commit. Lines refer to branch `dev` at c5dcc66.

Excluded on purpose (own friction, not Binance): keeper `heartbeat.test.ts` hanging on Linux 6.18 (mkdirSync under /proc; fixed in 38a713b). Listed once in Appendix C.

---

## 1. Onboarding friction

### 1.1
- ID: ON-01
- Fact: documented b402 production-access path (Google Form linked from the onchainpay-x402 intro) not openable from a personal Gmail: "Can't access item: the organisation that owns this item won't allow you to access it".
- Evidence: dx/raw/MANAGER-b402.md (entry "2026-10-04, application form not reachable"); URL https://developers.binance.com/docs/onchainpay-x402/introduction
- Date: 2026-10-04
- Severity: high (was a blocker until the 2026-10-05 correction, ON-03)
- Found by: human (screenshot held by team lead)
- possible ask: Public form, no org restriction
- HUMAN: How long before you gave up on the form? Who tried it?

### 1.2
- ID: ON-02
- Fact: API key editor lists permissions Trade, Transaction, Wallet, Market, B402 Payments, DeFi; ticking "B402 Payments" produced no credentials and no email; no page found explaining what the permission enables.
- Evidence: dx/raw/MANAGER-b402.md ("API key page has a 'B402 Payments' permission and no explanation")
- Date: 2026-10-04
- Severity: high
- Found by: human
- possible ask: Explain permission next to checkbox
- HUMAN: Screenshot available? How did you finally learn it was the credential path?

### 1.3
- ID: ON-03
- Fact: two b402 doc sets describe different auth. Onchainpay-x402 docs: `clientId`, sign access token, RSA signature, `X-Tesla-*` headers, `/papi/v2/b402/*`. Web3 API gateway (what actually works): normal API key, `X-OC-APIKEY/TIMESTAMP/SIGN` HMAC, `POST https://web3.binance.com/build/api/v2/b402/{supported,verify,settle}`, body wrapped `{"body": {...}}`. "the two doc sets do not say they are separate, which is what cost us a day."
- Evidence: dx/raw/MANAGER-b402.md (entries "CORRECTION" and "details", 2026-10-05); packages/x402/src/b402.ts:1-4; commit 20485eb 2026-10-05 "x402: b402 client now uses Web3 API gateway"; earlier wrong build: ops/progress/A17.md (RSA/X-Tesla, "UNTESTED-LIVE") and ops/progress/AGENTPATH.md:8 (pinned `/papi/` paths, X-Tesla headers)
- Date: 2026-10-04 to 2026-10-05
- Severity: blocker (a day lost, per team note)
- Found by: human + agent (A17 built the wrong client from the docs; commit 8fe36c9 2026-10-03)
- possible ask: Cross-link the two products
- HUMAN: Real hours lost? Who discovered the gateway route and how (search, trial, support)?

### 1.4
- ID: ON-04
- Fact: items not stated in the docs read by the team: approval time, business verification need, what the "sign access token" is and where issued, sandbox base URL ("contact us for access"), sandbox rate limits.
- Evidence: dx/raw/MANAGER-b402.md ("Not stated in the docs we read"); docs/ARCHITECTURE.md section 3.2 (item 1, superseded note at ~line 178)
- Date: 2026-10-04
- Severity: medium (moot after ON-03 for the Web3 route)
- Found by: human
- possible ask: State approval time and sandbox
- HUMAN: Did you contact Binance? Any reply?

### 1.5
- ID: ON-05
- Fact: docs site returns an empty page (AWS WAF challenge) to automated fetch; the agent could not read the overview page needed to learn the `X-OC-SIGN` encoding. Agent assumed base64 HMAC and made it configurable; base64 later verified accepted.
- Evidence: dx/raw/A02.md line 2 ("empty page (AWS WAF challenge); bw3.py not present"; file has an unlabeled column "10", likely minutes, unconfirmed); packages/bw3/src/sign.ts:14-15; ops/spikes/RESULTS-taker.md ("Signature encoding is unverified: docs were behind an AWS WAF challenge") and its 2026-10-03 update ("Signature encoding verified: base64 HMAC-SHA256 over timestamp+GET+/build/path?query is accepted")
- Date: 2026-10-02 21:30 (probe), verified 2026-10-03
- Severity: high
- Found by: agent probe (A02, A04)
- possible ask: Let scripts read docs
- HUMAN: Did a person have to copy the signing rule by hand?

### 1.6
- ID: ON-06
- Fact: the plan named a reference client `afterbell/research/bw3.py` to port; it did not exist at that path, so the signing scheme had to be guessed.
- Evidence: dx/raw/A02.md line 2; packages/bw3/src/sign.ts:14-15; ops/progress/A04.md ("fixtures are reconstructed from afterbell/docs/EXECUTION.md section 6, not recorded")
- Date: 2026-10-02
- Severity: medium (our own plan, not Binance; keep or drop at human discretion)
- Found by: agent probe
- possible ask: Publish a reference client
- HUMAN: Is afterbell a team repo or third party?

### 1.7
- ID: ON-07
- Fact: no Binance SDK or npm package for b402; the team wrote its own client (~120 lines).
- Evidence: dx/raw/MANAGER-b402.md ("No SDK"); docs/ARCHITECTURE.md section 3.2 "Node tooling" ([S13]); packages/x402/src/b402.ts (125 lines now)
- Date: 2026-10-04
- Severity: medium
- Found by: human
- possible ask: Ship official b402 TypeScript client

### 1.8
- ID: ON-08
- Fact: public BSC endpoints were flaky during onboarding: `bsc-dataseed.binance.org` timed out several times in one hour ("Connection timed out (os error 110)"), `defibit` timed out; `bsc-rpc.publicnode.com` worked every time. GitHub clones also timed out.
- Evidence: ops/spikes/RESULTS-taker.md "Fork-RPC durability (R5)"; dx/raw/A02.md line 1 ("TLS EOF / connection timed out (os error 110)", ~10 min)
- Date: 2026-10-02 21:00
- Severity: low (one machine, one network)
- Found by: agent probe
- possible ask: Reliable official public RPC

### 1.9
- ID: ON-09
- Fact: public RPCs serve only about the newest minute of state; anvil forks lazily fetch slots, so a ~40 s fork setup hit "Archive requests require a personal token" / "missing trie node". Archive-capable `bsc-mainnet.public.blastapi.io` used instead (slow).
- Evidence: ops/progress/A09b.md line 26
- Date: 2026-10-03
- Severity: low (infra, not Binance Web3 API; borderline relevance)
- Found by: test
- possible ask: (none; third-party RPC)

### 1.10
- ID: ON-10
- Fact: BNB Agent Studio free tier is bsc-testnet only and needs a GitHub account of at least 30 days; the hackathon is mainnet-only, so the team did not use it. Agentic Wallet side prize also skipped.
- Evidence: task brief for W8 citing https://www.bnbchain.org/en/blog/bnb-agent-studio-is-live-on-bnb-chain-ai-agents-from-one-prompt (not re-fetched by this agent); docs/DECISIONS.md "Docs sync" item 7; ops/submission/docs-sync-report.md line 11
- Date: 2026-10-10 (brief), 2026-10-05 (decision)
- Severity: medium
- Found by: human
- possible ask: Mainnet tier for hackathon teams
- HUMAN: Were you aware before the decision? Any rule line that confused you?

---

## 2. Documentation errors and gaps

### 2.1
- ID: DOC-01
- Fact: b402 header names disagree: quick start says return terms in `X-PAYMENT-REQUIREMENTS`; x402 v2 spec and Binance agent wallet docs use `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`. Built to v2 names; never confirmed against a live service.
- Evidence: dx/raw/MANAGER-b402.md ("Header-name inconsistency"); ops/progress/A17.md status table row `PAYMENT-REQUIRED`; docs/ARCHITECTURE.md section 3.2 "Header names"
- Date: 2026-10-04
- Severity: medium
- Found by: agent probe + human
- possible ask: Align quick start with v2

### 2.2
- ID: DOC-02
- Fact: b402 token support differs by token (U, USD1: EIP-3009 and Permit2; USDT, USDC: Permit2 only); project docs had listed all four as equal.
- Evidence: dx/raw/MANAGER-b402.md ("Token support differs by token"); docs/ARCHITECTURE.md section 3.2 ("CONTEXT.md lists all four as equal. They are not")
- Date: 2026-10-04
- Severity: low (our own doc error, Binance table was right)
- Found by: agent probe

### 2.3
- ID: DOC-03
- Fact: b402 integration guide (fetched 2026-10-10) describes settle as synchronous with `success/transaction/errorReason`, "poll or reconcile before deciding whether to retry"; does not mention the non-blocking change dated 2026-07-14 recorded in team notes; no dedicated status endpoint on that page.
- Evidence: ops/b402/README.md lines 27-29; URL https://web3.binance.com/en/dev-docs/products/b402-api/integration-guide.md; dx/raw/MANAGER-b402.md ("Settle behaviour changed (non-blocking since 2026-07-14, polling needed)"); docs/ARCHITECTURE.md section 3.2 step 6 ([S18, S20, S21])
- Date: 2026-10-10
- Severity: medium
- Found by: agent probe
- possible ask: Date and document settle change
- HUMAN: Which page first showed the 2026-07-14 change? Was it the legacy-docs page?

### 2.4
- ID: DOC-04
- Fact: Market API summary page lists RWA endpoints but no query parameter names; parameters had to be found by probing. `rwa/underlying-market` and `rwa/underlying-profile` need `binanceChainId=56&tokenContractAddress=<addr>`; the plural `tokenContractAddresses` fails with `Parameter tokenContractAddress is required` (code 40001).
- Evidence: packages/bw3/fixtures/live-2026-10-10/error-missing-address.json (`{"code":"40001","msg":"Parameter tokenContractAddress is required"}`); packages/bw3/fixtures/README.txt lines 6-9; probe script packages/bw3/scripts/probe-rwa.ts:41-45; brief for W8
- Date: 2026-10-10
- Severity: high
- Found by: agent probe
- possible ask: List parameters per endpoint

### 2.5
- ID: DOC-05
- Fact: parameter naming is inconsistent inside the same RWA family: `rwa/price` takes plural `tokenContractAddresses` (comma-separated, even for one address); `rwa/underlying-market`, `rwa/underlying-profile`, `candles` take singular `tokenContractAddress`.
- Evidence: packages/bw3/src/client.ts:118-122 (rwaPrice) versus fixtures/live-2026-10-10/error-missing-address.json
- Date: 2026-10-10 (client comment), earlier for rwaPrice
- Severity: medium
- Found by: agent probe / test
- possible ask: Consistent singular/plural parameter naming

### 2.6
- ID: DOC-06
- Fact: candles `interval` param is silently ignored (1-minute candles returned); real param is `bar`. Invalid value gives `Parameter bar error: Invalid bar value: 1D, valid values: 12h,15m,1M,1d,1h,1m,1s,1w,2h,30m,30s,3d,3m,4h,5m,5s,6h,8h` (code 40001; note `1d` valid, `1D` not; `1M` month vs `1m` minute).
- Evidence: packages/bw3/src/client.ts:211-213; fixtures/live-2026-10-10/error-bad-bar.json
- Date: 2026-10-10
- Severity: high (silent wrong data, no error)
- Found by: agent probe
- possible ask: Reject unknown query parameters

### 2.7
- ID: DOC-07
- Fact: candles `limit` 365 and 1000 give `invalid limit range` (code 40001); 300 accepted; default 100. Only 121 daily candles exist for NVDAB.
- Evidence: packages/bw3/src/client.ts:212; fixtures/live-2026-10-10/error-limit-range.json (recorded with limit=365); 121-candle count from W8 brief (not in fixtures: candles-1d.json trimmed to 5 rows)
- Date: 2026-10-10
- Severity: medium (message does not state the maximum)
- Found by: agent probe
- possible ask: State the limit in error

### 2.8
- ID: DOC-08
- Fact: candle rows are positional arrays `[open, high, low, close, volume, openTimeMs, trades]`; layout inferred from data, not documented.
- Evidence: packages/bw3/src/schemas.ts:105; packages/bw3/src/client.ts:213; fixtures/live-2026-10-10/candles-1d.json
- Date: 2026-10-10
- Severity: medium
- Found by: agent probe
- possible ask: Document candle row layout

### 2.9
- ID: DOC-09
- Fact: `rwa/tokens` accepts `sector` and `tab` params but ignores them; param name for the sector tab unknown. Without platform: 488 rows; `platformId=bstock`: 46 rows.
- Evidence: packages/bw3/src/client.ts:190; packages/bw3/fixtures/README.txt line 8 ("first 3 of 46 rows kept"); 488 count from W8 brief
- Date: 2026-10-10
- Severity: low
- Found by: agent probe

### 2.10
- ID: DOC-10
- Fact: row-count inconsistency to verify: `rwa/platforms` fixture reports bstock `tickerCount` 91 on chain 56 (`tokenCount` 91), while `rwa/tokens?platformId=bstock` returns 46 rows. ondo: tickerCount 459, chain 56 tokenCount 458.
- Evidence: fixtures/live-2026-10-10/platforms.json versus fixtures/README.txt line 8
- Date: 2026-10-10
- Severity: low (may be explained by pagination or token status; unconfirmed)
- Found by: agent probe (cross-check by W8 only)
- HUMAN: Do you know whether tokens is paged? If not, ask Binance.

### 2.11
- ID: DOC-11
- Fact: swap `signatureData` documented as `string[]`; real responses hold ONE JSON-encoded string.
- Evidence: packages/bw3/src/schemas.ts:30 (cites "DX_LOG finding, EXECUTION.md section 7.4"; those source files are not in this repo)
- Date: 2026-09-30 (EXECUTION.md date per fixtures/README.txt line 1)
- Severity: medium
- Found by: agent probe (earlier project, unrecorded here)

### 2.12
- ID: DOC-12
- Fact: API error code list is not documented; the bw3 client classifies errors by message text (regex).
- Evidence: packages/bw3/src/errors.ts:19; codes seen: `40001` (parameter errors, fixtures/live-2026-10-10/error-*.json), `50001` "Minimum order amount is 5 USD" (packages/bw3/fixtures/error-min-order.json, reconstructed not live), `000000` success
- Date: 2026-10-10
- Severity: medium
- Found by: agent probe
- possible ask: Publish error code table

### 2.13
- ID: DOC-13
- Fact: documented minimum order "5 USD" was never reproduced live: quotes for 0.1, 1 and 4 USDT from a dummy wallet were not rejected at quote or swap time.
- Evidence: dx/raw/MANAGER-bw3-edge-cases.md last bullet; ops/progress/A09b.md finding 5 and "Open"
- Date: 2026-10-03/05
- Severity: low
- Found by: test (live read-only)
- possible ask: Clarify when minimum applies

### 2.14
- ID: DOC-14
- Fact: skill hub contribution docs disagree on frontmatter: CONTRIBUTING.md says `name, description, version, license`; README.md says `title, description, metadata.version, metadata.author, license`; shipped AW skill uses `name, description, metadata.author, metadata.version`.
- Evidence: docs/ARCHITECTURE.md section 3.1 "Publishing a Floor skill" table row "Frontmatter" ([S11])
- Date: 2026-10-02
- Severity: low
- Found by: agent probe
- possible ask: One canonical skill frontmatter

### 2.15
- ID: DOC-15
- Fact: skill hub rule "no valid wallet addresses in a skill" conflicts with AW skill rule to never invent contract addresses.
- Evidence: docs/ARCHITECTURE.md section 3.1 "Rule conflict to resolve in the skill text" ([S11], [S1])
- Date: 2026-10-02
- Severity: low
- Found by: agent probe

### 2.16
- ID: DOC-16
- Fact: items the Agentic Wallet docs leave unspecified: what counts against the Developer Mode quota; what triggers `requireConfirmation=true`; whether a brand-new unverified contract trips risk error `351803 AGENT_DEV_MODE_RISK_BLOCKED`; session storage on headless Linux (`@github/keytar`, inferred).
- Evidence: docs/ARCHITECTURE.md section 3.1 table rows "What counts against...", "What triggers...", "What the risk engine checks", "Storage of session" ([S3, S4, S10])
- Date: 2026-10-02
- Severity: medium
- Found by: agent probe (doc reading only; never run)
- HUMAN: Did anyone run `baw` at all? (skills/floor/references/agentic-wallet.md line 3 says no, as of 2026-10-10.)

### 2.17
- ID: DOC-17
- Fact: Agentic Wallet sign-out is silent per the skill text: "the user otherwise only finds out when a later command fails"; docs values for `maxSigninDuration` are marked illustrative.
- Evidence: docs/ARCHITECTURE.md section 3.1 "Session lifetime" ([S2, S4, S6])
- Date: 2026-10-02
- Severity: low
- Found by: agent probe

---

## 3. API pitfalls

### 3.1
- ID: API-01
- Fact: quote `amount` is the token's smallest unit. `amount:"10"` returns `Insufficient liquidity for a quote. Please decrease the transaction amount or try again later.` (message points the wrong way: 10 wei is too small, not too large).
- Evidence: dx/raw/MANAGER-bw3-edge-cases.md (table row 3 and "Misleading messages"); ops/progress/A09b.md finding 1; probe packages/bw3/scripts/amount-probe.ts
- Date: 2026-10-03 (first), 2026-10-05 (re-run)
- Severity: high
- Found by: test (live read-only) / agent probe
- possible ask: Say "smallest unit" in errors
- HUMAN: How long until the unit was understood?

### 3.2
- ID: API-02
- Fact: `amount:"10.0"` returns `Parameter [amount] error: invalid amount, must be a positive numeric string within uint256 range (e.g. "1000000" for 1 USDT with 6 decimals)`. Example uses 6 decimals; BSC USDT has 18, so the example is off by 10^12 for this token.
- Evidence: dx/raw/MANAGER-bw3-edge-cases.md table row 4 and "Misleading messages"
- Date: 2026-10-05
- Severity: medium
- Found by: test (live read-only)

### 3.3
- ID: API-03
- Fact: quoteId reusable at 20 s, "not found or expired" at 40 s (TTL between 20 and 40 s; one message for expired and unknown).
- Evidence: ops/progress/A09b.md finding 2; dx/raw/MANAGER-bw3-edge-cases.md "Other observed behaviour"
- Date: 2026-10-03
- Severity: medium
- Found by: test (live)
- possible ask: Return TTL in quote response

### 3.4
- ID: API-04
- Fact: swap calldata embeds a deadline about quote time + 10 min (32-bit word inside vendor payload); later the router reverts `Route: expired` (on-chain, not an API error). Live calldata only executes near real time, so fork tests that warp the clock break.
- Evidence: ops/progress/A09b.md finding 3 and finding 8
- Date: 2026-10-03
- Severity: medium
- Found by: test (fork)

### 3.5
- ID: API-05
- Fact: vendor Kipseli adapter reverts `Kipseli swap fail: zero out` when the fork block clock is ahead of the vendor oracle (any warp, or ~40 s fork setup on a slow RPC).
- Evidence: ops/progress/A09b.md finding 8; dx/raw/MANAGER-bw3-edge-cases.md last section
- Date: 2026-10-03
- Severity: low (affects testing, not live use)
- Found by: test (fork)

### 3.6
- ID: API-06
- Fact: `quote.router` is a route descriptor like `tokenA--tokenB`, not an address; address to call and approve is `tx.to` / `approveTarget` in the swap response (observed `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`, LiquidMesh, mode SWAP, for 4, 5, 10, 400 USDT and reverse).
- Evidence: ops/progress/A09b.md finding 4; dx/raw/MANAGER-bw3-edge-cases.md
- Date: 2026-10-03
- Severity: medium (field name suggests an address)
- Found by: test (live)
- possible ask: Rename or document router field

### 3.7
- ID: API-07
- Fact: `POST /pre-transaction/simulate` simulates the raw router tx from the given `from`; for a contract that approves inside its own function it returns `status:"FAILED"`, `failReason:"execution reverted: BEP20: transfer amount exceeds allowance"`. Team simulates `vault.rebalance(Swap)` itself via eth_call, and uses Binance simulate only as a logged shadow. The success `status` string is unverified (only "FAILED" in fixtures).
- Evidence: ops/progress/A09b.md finding 7; packages/bw3/fixtures/simulate-failed.json; apps/keeper/src/bw3.ts:94-98 (cites "DX finding A09b #7")
- Date: 2026-10-03; shadow use 2026-10-10 (commit 77d162f)
- Severity: medium
- Found by: test
- possible ask: Allow state overrides in simulate

### 3.8
- ID: API-08
- Fact: no-route error is `No valid quote result from any vendor, please retry later` (generic, no code distinction from transient failure).
- Evidence: ops/progress/A09b.md finding 6; dx/raw/MANAGER-bw3-edge-cases.md
- Date: 2026-10-03
- Severity: low
- Found by: test (live)

### 3.9
- ID: API-09
- Fact: all requests must carry `/build` prefix both in URL and in the signed string; timestamp ISO-8601 with milliseconds; signed string = timestamp + METHOD + path(+query) + body; same string must be sent and signed. Commit message for the client records these as learned details.
- Evidence: packages/bw3/src/client.ts:17-18 (BUILD_PREFIX comment); packages/bw3/src/sign.ts:10-13; commit 2893cb1 2026-10-03 "A04: ... (HMAC signing, /build prefix, ISO-8601 ms timestamp)"; packages/x402/src/b402.ts:34,77 ("sign and send the same exact string")
- Date: 2026-10-03
- Severity: medium
- Found by: agent probe
- HUMAN: Which of these (prefix, ISO ms, base64) cost the most time?

### 3.10
- ID: API-10
- Fact: b402 returns HTTP 200 for failures: invalid payment is `data.isValid=false`; failed settle is `data.success=false`. Envelope `{status, code, errorData, data}` differs from Web3 API's `{code, msg, data}`.
- Evidence: packages/x402/src/b402.ts:101,107-111; dx/raw/MANAGER-b402.md ("Responses use an envelope ...")
- Date: 2026-10-05
- Severity: medium
- Found by: test (live: `supported`, `verify` run 2026-10-05; `settle` NOT run)
- possible ask: Use HTTP status for failures

### 3.11
- ID: API-11
- Fact: b402 settle is irreversible and non-blocking; a failure with a non-empty `transaction` means broadcast-but-unconfirmed, so the client never retries (marks `pending`). Success envelope code for Web3 API is `"000000"`; b402 code for success "0" assumed ("000000", "200" also accepted) UNVERIFIED.
- Evidence: packages/x402/src/b402.ts:107-111; ops/progress/A17.md status table; ops/b402/README.md
- Date: 2026-10-05
- Severity: medium
- Found by: test (mocks only)
- HUMAN: Was settle ever run live before submission? (ops/b402/README.md: "Nothing here has been run by an agent".)

### 3.12
- ID: API-12
- Fact: `rwa/price` sample (live 2026-10-10): NVDAB tokenPrice 230.62 vs referencePrice 230.44 (~8 bps).
- Evidence: W8 brief ("Live 2026-10-10"); no rwa/price fixture found in packages/bw3/fixtures/live-2026-10-10 (row field names tokenPrice/referencePrice are "as seen in live /v1/market data", apps/keeper/src/bw3.ts:29-33)
- Date: 2026-10-10
- Severity: low (informational)
- Found by: agent probe

### 3.13
- ID: API-13
- Fact: gas-price returns `evmLegacyGasPrice.{low,medium,high}GasPrice` in wei as strings (recorded sample low 50000000, medium 53752850, high 83416978); `eip1559GasPrice: null` on BSC. Unit is not stated in the response; keeper rejects values outside [0.5x, 3x] of the RPC price.
- Evidence: packages/bw3/fixtures/gas-price.json; packages/bw3/src/schemas.ts:42-45; apps/keeper/src/bw3.ts:70-75
- Date: 2026-10-10
- Severity: low
- Found by: agent probe

### 3.14
- ID: API-14
- Fact: `Bw3Client` retries 5xx/429/network errors with backoff 2 s, 4 s, 8 s and 10 s timeout; b402 client retries 429 from 500 ms, max 3. Rate limits per Binance docs: 100 verify/s, 20 settle/s per merchant. API latency distribution not measured (see Appendix A).
- Evidence: packages/bw3/src/client.ts:10; packages/x402/src/b402.ts:23-24,82-85; docs/ARCHITECTURE.md section 3.2 step 8 ([S18, S20])
- Date: 2026-10-03
- Severity: low

---

## 4. AI stack feedback (llms.txt, agents reading docs, MCP, skills)

### 4.1
- ID: AI-01
- Fact: documented command `curl -s https://web3.binance.com/en/dev-docs/llms.txt` (from the "Agent Native" page) returned `HTTP/2 202`, `content-length: 0`, header `x-amzn-waf-action: challenge`, server CloudFront. Same for `llms-full.txt`, also with a browser-style User-Agent.
- Evidence: dx/raw/MANAGER-llms-txt.md (test 2026-10-04 19:01 UTC, one machine/network)
- Date: 2026-10-04
- Severity: high
- Found by: human (team lead pasted the page) + test
- possible ask: Exempt llms.txt from WAF
- HUMAN: Did you try from another network or a real browser? Result?

### 4.2
- ID: AI-02
- Fact: on 2026-10-10 Anthropic WebFetch could read `llms.txt` and `llms-full.txt` (451,593 chars), while plain curl with a browser User-Agent still got HTTP 202, 0 bytes, WAF challenge, same day. Behaviour depends on the client.
- Evidence: W8 brief (build agents, 2026-10-10); compare AI-01 and dx/raw/A02.md (WebFetch failed 2026-10-02 21:30)
- Date: 2026-10-10
- Severity: medium
- Found by: agent probe
- possible ask: Document supported fetch clients
- HUMAN: Can you reproduce curl 202 now? Keep a log.

### 4.3
- ID: AI-03
- Fact: same agent tool (WebFetch) failed on 2026-10-02 (dev-docs/overview, empty, WAF) and worked 2026-10-10 (llms.txt). Different URLs; cause of change not established.
- Evidence: dx/raw/A02.md line 2; W8 brief
- Date: 2026-10-02 vs 2026-10-10
- Severity: low
- Found by: agent probe

### 4.4
- ID: AI-04
- Fact: team did not know llms.txt existed until the team lead found the Agent Native page; could not check whether llms-full.txt covers b402 (`clientId`, sign access token).
- Evidence: dx/raw/MANAGER-llms-txt.md "What we can say"
- Date: 2026-10-04
- Severity: medium
- Found by: human
- HUMAN: Did the 451,593-char file answer the b402 two-doc-set confusion (ON-03)? Check it.

### 4.5
- ID: AI-05
- Fact: llms.txt index (read 2026-10-10) lists Agent Native, MCP Server ("Coming soon"), Wallet Skills, Agentic Wallet, b402 pages.
- Evidence: W8 brief; dx/raw/MANAGER-llms-txt.md (MCP Server "Coming soon" on the Agent Native page, 2026-10-04/05)
- Date: 2026-10-10
- Severity: medium
- Found by: agent probe
- possible ask: Ship the MCP server

### 4.6
- ID: AI-06
- Fact: Wallet Skills page documents no third-party contribution path or skill file format; the team inferred format from the `binance-skills-hub` repo (CONTRIBUTING.md, README.md, existing skills). Hub had 60 open PRs on 2026-10-02; recent community PRs still open, incl. #337 opened 2026-09-08. Team decided not to plan on a merge before 2026-10-11. Install of arbitrary repos via `npx skills add <repo url>` is unverified.
- Evidence: W8 brief; docs/ARCHITECTURE.md section 3.1 "Reality check" and "Plan" rows ([S11], via `gh pr list`)
- Date: 2026-10-02 / 2026-10-10
- Severity: medium
- Found by: agent probe
- possible ask: Publish skill contribution guide
- HUMAN: Was a PR actually opened to the hub? (not evidenced in this repo)

### 4.7
- ID: AI-07
- Fact: Agentic Wallet Developer Mode doc: arbitrary contract calls and EIP-712 signing allowed; x402 payments and EIP-191 explicitly NOT supported. b402 is Binance's own x402 facilitator. Team wrote an EXPERIMENTAL, UNTESTED path to pay x402 with `baw sign-message --signType EIP712` (EIP-3009 is EIP-712 typed data).
- Evidence: https://web3.binance.com/en/dev-docs/products/agentic-wallet/use-cases/developer-mode.md (cited in skills/floor/references/agentic-wallet.md lines 3 and 53, fetched by build agents 2026-10-10); skills/floor/references/agentic-wallet.md section 6
- Date: 2026-10-10
- Severity: medium
- Found by: agent probe
- possible ask: Reconcile AW with b402

### 4.8
- ID: AI-08
- Fact: AW buyer-side x402 exists elsewhere in the docs: `baw x402-payment preview/sign`, v2 only, `exact`, `eip3009`/`permit2`, chains BSC/Base/Solana; signature single-use and short-lived (~30 s "per the campaign notes"). Developer Mode (needed for `contract-call`) is time-boxed with its own daily quota and can only be enabled in the Binance app.
- Evidence: docs/ARCHITECTURE.md section 3.2 "How an agent pays" ([S5, S7]) and section 3.1 table ([S3, S4])
- Date: 2026-10-02
- Severity: medium
- Found by: agent probe
- HUMAN: Did any teammate sign in to `baw`? Notes say "not set up".

### 4.9
- ID: AI-09
- Fact: for an unattended keeper, AW constraints recorded: QR pairing sign-in needing the Binance app, session expiry, Developer Mode expiry and daily limit, risk engine can hard-block (351803) and fails closed. Decision: EOA primary keeper, AW optional second keeper, not set up.
- Evidence: docs/ARCHITECTURE.md lines ~487-491 (risk table); docs/DECISIONS.md "Other decisions" and Docs sync item 7
- Date: 2026-10-02 / 2026-10-05
- Severity: medium
- Found by: agent probe
- possible ask: Headless agent wallet auth

### 4.10
- ID: AI-10
- Fact: team shipped its own MCP server (9 tools, Streamable HTTP, stateless) and a skill (`skills/floor/`, with `references/agentic-wallet.md`); MCP `bawCommands` field added to tx builders (commit 41c4644, 2026-10-10). Unverified: whether Claude Code / Cursor surface `_meta["x402/payment"]` retries without a payment-aware client; MCP Inspector / real client connection not run by agent.
- Evidence: ops/progress/A18.md "Verified vs not"; commits 41c4644, 8695996 (2026-10-10), c20bd42 (2026-10-03)
- Date: 2026-10-03 to 2026-10-10
- Severity: low (our product, context for AI stack discussion)
- Found by: test
- HUMAN: Did a real agent client ever call the MCP server end to end?

### 4.11
- ID: AI-11
- Fact: AI-agent build process itself ran on 40+ agent logs (A01..A18, FIX1-5, etc.) with docs sometimes stale across agents; later superseded b402 notes needed banners. Examples: A17.md, A18.md, AGENTPATH.md carry the line "Superseded 2026-10-05 (commit 20485eb)".
- Evidence: ops/progress/A17.md:1, A18.md:1, AGENTPATH.md:1; ops/submission/docs-sync-report.md mismatch 10 (old logs still contain "untested live", X-Tesla, clientId)
- Date: 2026-10-05
- Severity: low (context)
- Found by: human
- HUMAN: Which Binance doc misled an agent into the wrong implementation (A17 built RSA/X-Tesla)?

---

## 5. Tokenized-stock specifics

### 5.1
- ID: TS-01
- Fact: `rwa/underlying-market` for bStocks: `marketData.referencePrice` is null; no 24h change or updatedAt fields; `statusInfo.marketStatus` null (`openState:true`, `reasonCode:"TRADING"`, `nextOpenTime`/`nextCloseTime` null for NVDAB on 2026-10-10). Same null status in `rwa/price` ("upstream row has no statusInfo for bStocks today").
- Evidence: packages/bw3/fixtures/live-2026-10-10/underlying-market-NVDAB.json (also -QQQB, -SPCXB); packages/bw3/src/schemas.ts:55 ("bStocks return many nulls"); ops/progress/A16.md line 26 ("DX_LOG")
- Date: 2026-10-10 (fixtures), 2026-10-03 (A16)
- Severity: high (market-open signal unusable for bStocks)
- Found by: agent probe
- possible ask: Populate market status for bStocks
- HUMAN: Does `openState:true` on a Saturday/overnight make sense to you? (2026-10-10 is a Saturday; recorded "TRADING".) Check the fixture timestamp before claiming it.

### 5.2
- ID: TS-02
- Fact: `rwa/underlying-profile` has no logo field (`rwa/tokens` has `tokenLogoUrl`).
- Evidence: packages/bw3/src/schemas.ts:65-89 (profile vs token row); W8 brief
- Date: 2026-10-10
- Severity: low

### 5.3
- ID: TS-03
- Fact: bStock vs Ondo quoting: Ondo tokens returned no quote or absurd round-trip cost via the aggregator (AAPLon 2,354 bps at $1k, NVDAon 8,689 bps at $10k; "the issuer RFQ never quoted"). No AAPL bStock exists. Whether Ondo RFQ fills for a contract (vault) address not tested.
- Evidence: docs/RESEARCH_RESULTS.md lines 18, 21, 45; bw3 `RfqRequired` error class (packages/bw3/src/errors.ts:10-11)
- Date: 2026-10-02
- Severity: high (excluded Ondo from product)
- Found by: test (live quotes, one run)
- possible ask: Contract-taker RFQ support

### 5.4
- ID: TS-04
- Fact: bStock issuer controls: bStocks have an issuer pause, per-token blocklist and sanctions list (found by CONTRACTS.md; contradicted an earlier EXECUTION.md claim). On-chain compliance state can change; fork test could not cover real blocklist state.
- Evidence: docs/DECISIONS.md "Open, needs follow-up" item 2; ops/spikes/RESULTS-taker.md Q10 ("Real-chain compliance state can change (issuer pause/blocklist)")
- Date: 2026-10-02
- Severity: high
- Found by: agent probe (contract reading)
- HUMAN: Where did the issuer-pause source live (Binance docs vs token contract)? Was it surprising?

### 5.5
- ID: TS-05
- Fact: aggregator route from a contract taker worked on a fork, both directions: 10 USDT -> 0.04264 NVDAB; 0.0426 NVDAB -> 9.9869 USDT (LiquidMesh, SWAP); full vault run 400 USDT -> 1.706163 NVDAB via aggregator vs 1.702278 direct Pancake (+0.23%). Mainnet with real vault as taker unproven at that time.
- Evidence: ops/spikes/RESULTS-taker.md "Update 2026-10-03"; ops/progress/A09b.md "Result 2026-10-03"
- Date: 2026-10-03
- Severity: (informational)
- Found by: test (fork, nothing sent to chain 56)
- HUMAN: Was a mainnet smoke test with the vault ever done? Result?

### 5.6
- ID: TS-06
- Fact: direct Pancake v3 round-trip on fork at 100 USDT: NVDAB 49 bps (0.25% pool), SPCXB 49 bps, QQQB 1 bp (0.01% pool). Pool TVL NVDAB ~4.8M USD (measured 2026-10-02) vs 3.35M (2026-09-30).
- Evidence: ops/spikes/RESULTS-taker.md table; docs/DECISIONS.md open item 3
- Date: 2026-10-02
- Severity: (informational)
- Found by: test

### 5.7
- ID: TS-07
- Fact: aggregator round-trip cost (live quotes, "Thursday 12:06 UTC" US pre-market, date not stated, file dated 2026-10-02; bps): QQQB ~0 / 0.7 / no quote at $1k/$10k/$50k; NVDAB 2.8 / 5.9 / 10.1; SPCXB 3.1 / 6.0 / 7.7; SPYB 1.1 / 6.6 / 13.6; TSLAB 18 / 46 / 27; CRCLB 53 / 38 / 132; MUB 137 / 406 / 2,124.
- Evidence: docs/RESEARCH_RESULTS.md lines 7-18 (file dated 2026-10-02; "Thursday 12:06 UTC")
- Date: 2026-10-02
- Severity: (informational)
- Found by: test (script slippage_probe.py; not in this repo)

### 5.8
- ID: TS-08
- Fact: price comparison used by keeper guard: on-chain `tokenPrice` vs `referencePrice` from `rwa/price`; skip only buys when deviation exceeds 500 bps; sells never blocked; fail open on any Binance error; row fields not schema-verified.
- Evidence: apps/keeper/src/bw3.ts:6-11,29-40; commits 06731ca, 77d162f (2026-10-10)
- Date: 2026-10-10
- Severity: (design note)
- Found by: test
- possible ask: Documented price field semantics

### 5.9
- ID: TS-09
- Fact: trading hours: contract uses its own on-chain window Mon-Fri 15:30-19:30 UTC with a guardian holiday table (through 2028-12-31) because Binance statusInfo was null for bStocks (see TS-01). Backtest assumes full weekend gaps.
- Evidence: docs/DECISIONS.md rows A7 and open item 1; commits 83a6872, 0d6013d (2026-10-04); ops/submission/docs-sync-report.md "Checked and consistent"
- Date: 2026-10-02/04
- Severity: medium
- Found by: human decision
- HUMAN: Was the reason for the own calendar the null status, or the lack of a Binance calendar endpoint? Confirm.

---

## 6. Redesign suggestions (tags only)

Each tag points at the entry above; human to write the actual sentences.

- RD-01 (ON-02, ON-03): possible ask: Explain permissions, cross-link products
- RD-02 (ON-01): possible ask: Open public access form
- RD-03 (ON-05, AI-01): possible ask: WAF allowlist for docs
- RD-04 (DOC-04, DOC-05): possible ask: Parameter table per endpoint
- RD-05 (DOC-06): possible ask: Reject unknown parameters
- RD-06 (API-01, API-02): possible ask: Units in error messages
- RD-07 (API-03): possible ask: Expose quote expiry time
- RD-08 (API-07): possible ask: Simulate with state overrides
- RD-09 (API-10): possible ask: Real HTTP error statuses
- RD-10 (TS-01): possible ask: Fill bStock market status
- RD-11 (DOC-03): possible ask: Changelog for b402 settle
- RD-12 (AI-05): possible ask: Release MCP server
- RD-13 (AI-06): possible ask: Skill contribution guide
- RD-14 (AI-07): possible ask: Allow x402 in Developer Mode

(Count: 14 tags.)

---

## 7. Requested capabilities

### 7.1
- ID: CAP-01
- Fact: no bStock-aware market calendar / open-close times from Binance (fields null); team built its own on-chain calendar.
- Evidence: TS-01, TS-09
- Date: 2026-10-10
- Severity: high
- Found by: agent probe
- possible ask: Market calendar endpoint for bStocks

### 7.2
- ID: CAP-02
- Fact: no way to run the aggregator `simulate` against a contract that approves internally (needs prior allowance).
- Evidence: API-07
- Date: 2026-10-03
- Severity: medium
- possible ask: Simulate with state overrides

### 7.3
- ID: CAP-03
- Fact: no documented RFQ path for contract takers (Ondo RFQ never quoted; behaviour for vault address untested).
- Evidence: TS-03; packages/bw3/src/errors.ts:10
- Date: 2026-10-02
- Severity: high
- possible ask: Contract-taker RFQ quotes

### 7.4
- ID: CAP-04
- Fact: candles history limited (300 per request; 121 daily candles for NVDAB), so a gap/volatility study could not use Binance candles for long history; backtests used yfinance (~2 years of 1h bars; 2018-2026 daily).
- Evidence: packages/bw3/src/client.ts:212; docs/DECISIONS.md open item 1; docs/RESEARCH_RESULTS.md line 23
- Date: 2026-10-10
- Severity: medium
- possible ask: Longer bStock candle history
- HUMAN: Confirm this was a real need, not just a note.

### 7.5
- ID: CAP-05
- Fact: sandbox / testnet for aggregator with bStocks absent; all live checks used mainnet read-only quotes plus local forks. b402 sandbox base URL "contact us for access".
- Evidence: dx/raw/MANAGER-b402.md ("sandbox base URL"); ops/progress/A09b.md ("nothing sent to chain 56")
- Date: 2026-10-04
- Severity: medium
- possible ask: Public testnet bStock sandbox

### 7.6
- ID: CAP-06
- Fact: wanted: a headless / non-QR auth for Agentic Wallet keepers; session sign-out silent; Developer Mode expiry human-renewed. Team kept EOA keeper.
- Evidence: AI-09
- Date: 2026-10-02
- Severity: medium
- possible ask: Service-account agent wallets

### 7.7
- ID: CAP-07
- Fact: wanted: documented b402 status/reconcile endpoint (settle non-blocking, but guide lists none).
- Evidence: ops/b402/README.md line 29 ("We found no dedicated status endpoint on that page")
- Date: 2026-10-10
- Severity: medium
- possible ask: b402 settlement status endpoint

---

## Appendix A. Measured vs not measured (tokenized-stock behaviour)

| Item | Measured? | Number / result | Date | Source |
|---|---|---|---|---|
| Aggregator round-trip cost, QQQB/NVDAB/SPCXB/SPYB/TSLAB, $1k/$10k/$50k | yes, one run | e.g. NVDAB 2.8 / 5.9 / 10.1 bps | Thu 12:06 UTC (US pre-market), file dated 2026-10-02 | docs/RESEARCH_RESULTS.md |
| Direct Pancake round trip at 100 USDT | yes, fork, one block | NVDAB 49, SPCXB 49, QQQB 1 bp | 2026-10-02 ~21:00 UTC | ops/spikes/RESULTS-taker.md |
| Aggregator vs direct, 400 USDT -> NVDAB, fork | yes | agg 1.706163 vs direct 1.702278 NVDAB (+0.23%) | 2026-10-03 Sat 06:30 UTC | ops/progress/A09b.md |
| Aggregator both directions from contract taker, 10 USDT | yes, fork | 0.04264 NVDAB; 9.9869 USDT back | 2026-10-03 | ops/spikes/RESULTS-taker.md |
| Quote TTL | yes, coarse | 20 s ok, 40 s expired | 2026-10-03 | ops/progress/A09b.md |
| Calldata deadline | yes | quote time + ~10 min | 2026-10-03 | ops/progress/A09b.md |
| onchain tokenPrice vs referencePrice deviation | one sample | NVDAB 230.62 vs 230.44, ~8 bps | 2026-10-10 | W8 brief |
| NVDAB pool TVL | yes | ~4.8M USD | 2026-10-02 | docs/DECISIONS.md |
| Weekend execution cost / slippage | NOT measured ("Weekend cost run still missing") | | | docs/RESEARCH_RESULTS.md line 4 |
| Crash-time slippage (thin liquidity) | NOT measured | | | RESEARCH_RESULTS.md "Not yet tested" |
| Out-of-hours deviation (tokenPrice vs reference) over time | NOT measured (single sample only) | | | no time-series file found |
| API latency distribution (quote/swap/price/candles) | NOT measured (a process-global call stats registry exists: packages/bw3/src/stats.ts; no recorded results found) | | | commit 8b5909e |
| On-chain gaps / issuer pauses differing from real stock | NOT tested | | | RESEARCH_RESULTS.md |
| xStocks (Backed) tokens | NOT measured in any file read | | | no source found |
| Ondo RFQ for contract (vault) address | NOT tested | | | RESEARCH_RESULTS.md line 45 |
| Mainnet real-vault aggregator swap | NOT proven in logs read | | | ops/progress/A09b.md "Open" |
| b402 `settle` live | NOT run | | | dx/raw/MANAGER-b402.md; ops/b402/README.md |
| b402 `supported` / `verify` live | yes | 200, United Stables and World Liberty Financial USD kinds (eip3009, permit2-exact, permit2-upto) on eip155:56 | 2026-10-05 | dx/raw/MANAGER-b402.md |
| Sell direction through the vault; QQQB, SPCXB via aggregator in vault | NOT exercised live | | | ops/progress/A09b.md |
| History for gap backtest | yes | 93 one-year windows 2018 to 2026-10; worst gaps NVDA -19.3% 2018-11-16 | 2026-10-02 | docs/RESEARCH_RESULTS.md |

## Appendix B. Source files not found / empty

- `dx/human/` exists but is empty (.gitkeep only); no human-written DX notes found.
- `DX_LOG`, `afterbell/docs/EXECUTION.md` section 6 and 7.4, `afterbell/research/bw3.py`: referenced in code comments, not present in this repo.
- No rwa/price fixture in `packages/bw3/fixtures/live-2026-10-10/` (NVDAB 230.62 vs 230.44 comes from the brief only).
- Candle count (121 daily NVDAB), 488 vs 46 `rwa/tokens` row counts, llms-full.txt 451,593 chars: from the brief only; fixtures trimmed.
- `research/slippage_probe.py` / `slippage_runs.jsonl` named in RESEARCH_RESULTS.md: not read.
- Web pages (developers.binance.com, web3.binance.com docs, bnbchain.org blog): NOT re-fetched by this agent; quoted via repo files and the brief.
- Not read in depth: docs/ARCHITECTURE.md beyond sections 3.1, 3.2 and the risk table (84 KB file).
- ops/progress/A09.md lines 1-17 skimmed only.

## Appendix C. Our own friction (not Binance)

- Keeper `heartbeat.test.ts` hung on Linux 6.18 (mkdirSync under /proc). Fixed commit 38a713b. Not Binance.
- Fork-clock sensitivities of vendor adapters (API-05) are testing issues.
- Stale plans/logs after the b402 correction (AI-11); docs-sync mismatches listed in ops/submission/docs-sync-report.md.

## Appendix D. Questions only the humans can answer

- [ ] Time lost per incident: form access (ON-01), two b402 doc sets (ON-03, "a day"), WAF/docs access (ON-05), amount units (API-01), `bar` vs `interval` (DOC-06), param probing (DOC-04), hub/skill format (AI-06).
- [ ] Emotional low points: which moment nearly made you drop b402/Binance integration? When did you decide on a self facilitator?
- [ ] What would you tell Binance's product manager in one sentence per area (onboarding, docs, API, AI stack, tokenized stocks)?
- [ ] Which doc page do you wish existed (e.g. one page for "which b402 am I using")?
- [ ] Which Binance surface worked well and should be praised (e.g. live `supported`/`verify`, aggregator from contract taker)? None is recorded as praise in the files read.
- [ ] Did anyone contact Binance support or the hackathon channel? Replies?
- [ ] Was `settle` run live before the deadline? Result, latency, whether `transaction` is set on success.
- [ ] Was the llms.txt/llms-full.txt content (451,593 chars) used by an agent, and did it answer questions the HTML pages did not?
- [ ] Was a PR opened to binance-skills-hub? Link.
- [ ] Anything not in git (chat, screenshots, Telegram) that belongs in the report?
