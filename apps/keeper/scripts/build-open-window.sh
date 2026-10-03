#!/usr/bin/env bash
# TEST-ONLY. Builds a copy of packages/contracts whose MarketHours.inWindow() always returns true, into a scratch dir (the repo's contracts
# are NOT modified). Used to run live aggregator calldata on a fork outside the Mon-Fri 15:30-19:30 UTC window without time-warping
# (warping breaks the vendor's oracle-based adapters: "Kipseli swap fail: zero out"). Prints the artifact dir; set FLOOR_CONTRACTS_OUT to it.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/../../../packages/contracts" && pwd)"
DST="${1:-${TMPDIR:-/tmp}/floor-open-window}"
rm -rf "$DST"; mkdir -p "$DST"
cp -r "$SRC/src" "$SRC/foundry.toml" "$DST/"
ln -s "$SRC/lib" "$DST/lib"
[ -f "$SRC/remappings.txt" ] && cp "$SRC/remappings.txt" "$DST/"
python3 - "$DST/src/libs/MarketHours.sol" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
s2 = re.sub(r"(function inWindow\(uint256 ts\) internal pure returns \(bool\) \{)", r"\1 if (ts != type(uint256).max) return true;", s, count=1)
assert s2 != s, "patch failed"
open(p, 'w').write(s2)
PY
(cd "$DST" && forge build --silent >/dev/null 2>&1) || (cd "$DST" && forge build 2>&1 | tail -5 >&2)
echo "$DST/out"
