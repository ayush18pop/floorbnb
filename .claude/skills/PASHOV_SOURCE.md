# Pashov Audit Group skills: source

- Upstream: https://github.com/pashov/skills
- Commit: 8ce544c9c9affab448d3dc4c79191d052e3a57ec
- Licence: MIT (copy in PASHOV_LICENSE)
- Installed: 2026-10-03, project-scoped. Skills: solidity-auditor, x-ray. Not installed: fizz.
- Files are unmodified copies. Update by re-copying from a fresh clone and changing the commit above.

## Review notes (read before install)

- Both skills run `curl -sf https://raw.githubusercontent.com/pashov/skills/main/<skill>/VERSION` to check for updates. This is the only network call. It sends nothing from the repo. If it fails the skill carries on.
- x-ray runs `forge coverage`, `git log`-style analysis (scripts/analyze_git_security.py, scripts/enumerate.sh, via subprocess git only) and writes to `x-ray/`.
- solidity-auditor writes a temp dir `.audit-XXXXXX` (deleted at the end). Optional `--memory`/loop mode writes `.solidity-auditor/memory.tsv`. `--file-output` copies the report into the repo.
- Neither skill reads .env, keys or other secrets. Do not run them in a directory that holds secrets you would not want an LLM to read: the auditor loads all .sol files (including deploy scripts) into agent context.
- Both skills need contracts to exist. Do not run them before the contracts are committed.
