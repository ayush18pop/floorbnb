#!/usr/bin/env bash
# Spin up a LOCAL anvil fork of BSC, deploy Floor, open one funded demo vault, and run `keeper once --dry-run`.
# Local only. Never sends to chain 56. No private keys: anvil's unlocked accounts and a public keeper address.
#   usage: bash apps/keeper/scripts/fork.sh            (RPC: BSC_FORK_RPC_URL, else https://bsc-rpc.publicnode.com)
set -euo pipefail
cd "$(dirname "$0")/.."
FORK_RPC="${BSC_FORK_RPC_URL:-https://bsc-rpc.publicnode.com}"
PORT="${ANVIL_PORT:-8545}"
LOCAL="http://127.0.0.1:${PORT}"
[ -d ../../packages/contracts/out/FloorVault.sol ] || (cd ../../packages/contracts && forge build >/dev/null)
anvil --fork-url "$FORK_RPC" --port "$PORT" --chain-id 56 --silent --retries 5 --timeout 60000 &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$LOCAL" && break; sleep 1; done
FIX="$(pnpm exec tsx scripts/fork-setup.ts "$LOCAL")"
echo "fixture: $FIX"
export BSC_RPC_URL="$LOCAL"
export FLOOR_FACTORY="$(echo "$FIX" | node -pe 'JSON.parse(require("fs").readFileSync(0)).factory')"
export FLOOR_LENS="$(echo "$FIX" | node -pe 'JSON.parse(require("fs").readFileSync(0)).lens')"
export KEEPER_ADDRESS="$(echo "$FIX" | node -pe 'JSON.parse(require("fs").readFileSync(0)).keeper')"
pnpm exec tsx src/bin.ts once --dry-run "$@"
