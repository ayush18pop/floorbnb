# Floor: AI-assisted audit (Pashov Audit Group skills)

Floor's contracts are checked with two Pashov Audit Group skills before any mainnet deploy. This is a hard blocker (EXECUTION_PLAN.md §6.4a, gate G3).
It is an AI-assisted audit. It is not a human audit and it gives no guarantee of security.

Source and licence of the skills: `.claude/skills/PASHOV_SOURCE.md` (upstream https://github.com/pashov/skills, MIT).

## Run

Both skills are project-scoped. Start Claude Code in the repo root, on the commit you want to audit.

1. `/x-ray` on `packages/contracts`. It writes an `x-ray/` folder (`x-ray.md`, `invariants.md`, `architecture.json`). Copy `x-ray.md` to `reviews/audit-pashov-xray.md`.
2. `/solidity-auditor` (default mode, all files). It prints a report with confidence scores and writes it under `.solidity-auditor/runs/<stamp>/full-report.md`. Copy it to `reviews/audit-pashov-NN.md` with the commit hash on the first line.
3. After each fix batch, re-run step 2 and number the report up. The last one on the commit to deploy is `reviews/audit-pashov-final.md`.

Notes:
- `x-ray` runs `forge coverage`, so run `forge build` first.
- Both skills make one network call, a version check against raw.githubusercontent.com. Nothing from the repo is sent by it.
- Do not run them where `.env` or key files sit in the audited tree. The auditor reads every `.sol` file into model context.
- `x-ray/`, `.solidity-auditor/` and `.audit-*` are scratch. They stay out of git. Only `reviews/audit-pashov-*.md` is committed.

## Scope

In scope: `packages/contracts/src`, `packages/contracts/script`. Out of scope: everything under `ops/` (research spikes such as
`ops/spikes/taker-probe`, never deployed) and test code. The 02 run included `ops/spikes/taker-probe/src/TakerProbe.sol`
by accident; its findings 1-3 are fixed there anyway (owner-only, `minOut > 0`, router is not a token). Next run: pass
`packages/contracts/src` and `packages/contracts/script` only.

## Who does what

- A12a runs x-ray. A12b runs solidity-auditor and writes the reports.
- The auditor does not fix code. Fixes go through the contracts owner (A05 for the vault, A06 for factory, lens and scripts).
- The manager reads the reports and records accept or fix decisions.

## Triage

- Critical, High, Medium: **fix**, or **accept in writing**. An acceptance is a line in the report: finding id, why it is not exploitable or not worth fixing, the cap or guard that limits loss, and the team lead's name and date. Only the team lead can accept.
- Critical and High cannot be accepted for the deploy (G3 needs zero open). Fix them.
- Low and Info: fix if cheap, else list them. They do not block.
- Confidence score under 75 and no PoC: check by hand. Keep it as a note if it is not real.
- Re-run until clean: no open High or Medium on the final run.
- Any change to `src/` or `script/` after the final run voids it. Run again.

## Commit hash rule

The audited commit hash must equal the deployed commit hash. The final report names the hash. The deploy runs from that commit. The source is verified on BscScan from the same commit, and the runbook records the hash.

## Claim wording

Allowed, exactly:

> AI-assisted audit by Pashov Audit Group skills, not a formal audit.

Rules:
- Never write "audited", "secure", "safe" or "verified by Pashov" without that sentence next to it.
- Do not use the Pashov Audit Group name or logo as an endorsement. They did not review Floor. Their open-source skills did.
- Do not claim a number of bugs found or a score.
- State the commit hash the claim applies to, when space allows.
- The claims reviews (A03, A24, A25) check this wording on the site, README, video script and submission text.

## Run 06 (2026-10-05)
Report: `floorbnb-pashov-ai-audit-report-20261005-051324.md` at the repo root on `main` (repo head `84706ee`, 1 pass, 12 agents). It was not copied to `reviews/audit-pashov-NN.md` and `reviews/audit-pashov-final.md` still does not exist, so the `AUDITED_COMMIT` placeholder in `ops/deploy/runbook.md` stays. The acceptance for it is only PROPOSED in `reviews/acceptances.md`. The public surfaces describe it without a bug count, per the claim rules above.
