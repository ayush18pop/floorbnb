#!/usr/bin/env bash
# ERC-8004 IdentityRegistry registration for Floor. DRY-RUN BY DEFAULT: sends nothing.
# Usage: FLOOR_DOMAIN=floor.example ./register.sh [--testnet] [--broadcast]
# Broadcast needs BOTH the --broadcast flag AND ERC8004_CONFIRM_BROADCAST=yes, plus a signer
# via ERC8004_SIGNER_ARGS (e.g. "--ledger" or "--account floor-reg"). No private key via env.
set -euo pipefail
NET=mainnet; BROADCAST=0
for a in "$@"; do case "$a" in --testnet) NET=testnet;; --broadcast) BROADCAST=1;; *) echo "unknown arg $a" >&2; exit 2;; esac; done
: "${FLOOR_DOMAIN:?set FLOOR_DOMAIN, e.g. floor.example (no scheme)}"
if [ "$NET" = mainnet ]; then
  REG=0x8004A169FB4a3325136EB29fA0ceB6D2e539a432; RPC=${RPC_URL:-https://bsc-dataseed.binance.org}; CHAIN=56
else
  REG=0x8004A818BFB912233c491871b3d84c89A494BD9e; RPC=${RPC_URL:-https://bsc-testnet-rpc.publicnode.com}; CHAIN=97
fi
URI="https://${FLOOR_DOMAIN}/.well-known/agent-registration.json"
FILE="$(dirname "$0")/../../apps/web/public/.well-known/agent-registration.json"
grep -q REPLACE_DOMAIN "$FILE" && echo "NOTE: $FILE still has REPLACE_DOMAIN placeholders; fix before the file is deployed." >&2
[ "$(cast chain-id --rpc-url "$RPC")" = "$CHAIN" ] || { echo "RPC chain id mismatch" >&2; exit 1; }
[ "$(cast code "$REG" --rpc-url "$RPC" | wc -c)" -gt 10 ] || { echo "no code at registry" >&2; exit 1; }
SIG='register(string)'
echo "network:   $NET (chain $CHAIN)"; echo "registry:  $REG"; echo "agentURI:  $URI"
echo "calldata:  $(cast calldata "$SIG" "$URI")"
GAS=$(cast estimate "$REG" "$SIG" "$URI" --from 0x000000000000000000000000000000000000dEaD --rpc-url "$RPC")
PRICE=$(cast gas-price --rpc-url "$RPC")
echo "gas est:   $GAS  gas price: $PRICE wei  cost ~ $(cast from-wei $((GAS*PRICE))) BNB"
CMD="cast send $REG '$SIG' '$URI' --rpc-url $RPC \${ERC8004_SIGNER_ARGS}"
echo "command:   $CMD"
if [ "$BROADCAST" != 1 ]; then echo "DRY RUN. Nothing sent."; exit 0; fi
[ "${ERC8004_CONFIRM_BROADCAST:-}" = yes ] || { echo "refusing: set ERC8004_CONFIRM_BROADCAST=yes" >&2; exit 1; }
[ -n "${ERC8004_SIGNER_ARGS:-}" ] || { echo "refusing: set ERC8004_SIGNER_ARGS (--ledger | --account NAME)" >&2; exit 1; }
grep -q REPLACE_DOMAIN "$FILE" && { echo "refusing: placeholders in registration file" >&2; exit 1; }
# shellcheck disable=SC2086
cast send "$REG" "$SIG" "$URI" --rpc-url "$RPC" $ERC8004_SIGNER_ARGS
echo "Next: read agentId from the Registered event, add it to registrations[] in the JSON, redeploy."
