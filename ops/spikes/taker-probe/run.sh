#!/usr/bin/env bash
# Reproduces the taker-probe table. Read-only: fork tests on a local EVM, no transactions to chain 56.
# Usage: bash ops/spikes/taker-probe/run.sh   (BSC_FORK_RPC_URL defaults to the public publicnode endpoint)
set -uo pipefail
cd "$(dirname "$0")"
export BSC_FORK_RPC_URL="${BSC_FORK_RPC_URL:-https://bsc-rpc.publicnode.com}"
echo "== direct Pancake route, Q9 (struct), Q10 (contract holds/moves bStocks)"
forge test --match-test 'test_direct|test_Q10' -vv 2>&1 | grep -E 'RESULT|PASS|FAIL|^ +[0-9]|Suite|Error'
echo "== aggregator replay"
shopt -s nullglob
fx=(fixtures/*.json)
if [ ${#fx[@]} -eq 0 ]; then
  echo "BLOCKED: no fixtures. Need BW3_API_KEY/BW3_API_SECRET in ~/.config/floor/secrets.env, then:"
  echo "  bash -c 'set -a; . ~/.config/floor/secrets.env; set +a; node script/fetch_fixture.mjs <USDT> <NVDAB> 10000000000000000000 <fresh X> fixtures/usdt-nvdab-10.json'"
  echo "  (run the replay within 30 s of fetching: bash run.sh)"
else
  for f in "${fx[@]}"; do echo "-- $f"; TAKER_FIXTURE="$f" forge test --match-test test_aggregator_replay -vv 2>&1 | grep -E 'RESULT|PASS|FAIL|Error|revert'; done
fi
