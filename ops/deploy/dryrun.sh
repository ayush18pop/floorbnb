#!/usr/bin/env bash
# Floor deploy dry-run on a LOCAL anvil fork of BSC (chain id 31337). Never touches chain 56 or any real network.
# Keys: derived at run time from anvil's public test mnemonic (accounts 0..4); nothing secret, nothing written to a file.
#   usage: bash ops/deploy/dryrun.sh [with-aggregator|direct-only]     (default with-aggregator)
#   env:   BSC_FORK_RPC_URL (default https://bsc-mainnet.public.blastapi.io), ANVIL_PORT (default 8645)
# Output: a step table with gas used on stdout; full log in $OUT (default ops/deploy/runs/<variant>-<utc>.txt).
set -euo pipefail
VARIANT="${1:-with-aggregator}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
C="$ROOT/packages/contracts"
FORK_RPC="${BSC_FORK_RPC_URL:-https://bsc-mainnet.public.blastapi.io}"
PORT="${ANVIL_PORT:-8645}"
RPC="http://127.0.0.1:$PORT"
MN="test test test test test test test test test test test junk"   # anvil's public default mnemonic
key() { cast wallet private-key --mnemonic "$MN" --mnemonic-index "$1"; }
addr() { cast wallet address --private-key "$(key "$1")"; }
K_DEPLOYER=$(key 0); K_OWNER=$(key 1); K_GUARD=$(key 2); K_KEEPER=$(key 3); K_USER=$(key 4)
OWNER=$(addr 1); GUARD=$(addr 2); KEEPER=$(addr 3); USER=$(addr 4)

USDT=0x55d398326f99059fF775485246999027B3197955
WHALE=0x8894E0a0c962CB723c1976a4421c95949bE2D4E3
NVDAB=0x02fca66c1d1afb4e2a7884261eb00f63598a7436
SPCXB=0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1
QQQB=0x205812cdbed920aff76c6580abd681a46d11efc7
DEF_NORMAL="(100,200,900,14400,600,300,30,100,20000000000000000000,1000000000000000000)"
DEF_DEMO="(100,200,900,14400,600,300,30,100,6000000000000000000,1000000000000000000)"
SIG_DEF="setDefaults((uint16,uint16,uint32,uint32,uint32,uint16,uint16,uint16,uint256,uint256))"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$ROOT/ops/deploy/runs"
OUT="${OUT:-$ROOT/ops/deploy/runs/$VARIANT-$STAMP.txt}"
TABLE="$(mktemp)"
exec > >(tee "$OUT") 2>&1

PARAMS="$C/script/params/31337.json"
cp "$PARAMS" "$PARAMS.orig"
ANVIL_PID=
cleanup() { mv -f "$PARAMS.orig" "$PARAMS" 2>/dev/null || true; [ -n "$ANVIL_PID" ] && kill "$ANVIL_PID" 2>/dev/null || true; }
trap cleanup EXIT
if [ "$VARIANT" = direct-only ]; then
  python3 - "$PARAMS" <<'E'
import json,sys
p=json.load(open(sys.argv[1])); r=p['v3SwapRouter']
p['routerTargets']=[r]; p['routerApproveTargets']=[r]
json.dump(p,open(sys.argv[1],'w'),indent=2)
E
fi

echo "== variant=$VARIANT fork=$FORK_RPC $(date -u +%FT%TZ)"
anvil --fork-url "$FORK_RPC" --port "$PORT" --chain-id 31337 --silent --retries 8 --timeout 120000 --mnemonic "$MN" &
ANVIL_PID=$!
for _ in $(seq 1 90); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 1; done
[ "$(cast chain-id --rpc-url "$RPC")" = 31337 ] || { echo "anvil not up on 31337"; exit 1; }
echo "fork head block $(cast block-number --rpc-url "$RPC") ts $(cast block latest --field timestamp --rpc-url "$RPC")"

# send <label> <key> <to> <sig> [args...] ; records gas
send() {
  local label=$1 k=$2; shift 2
  local j; j=$(cast send --json --rpc-url "$RPC" --private-key "$k" "$@")
  local gas st; gas=$(echo "$j" | python3 -c 'import json,sys;print(int(json.load(sys.stdin)["gasUsed"],16))'); st=$(echo "$j" | python3 -c 'import json,sys;print(json.load(sys.stdin)["status"])')
  [ "$st" = "0x1" ] || [ "$st" = "1" ] || { echo "STEP FAILED: $label"; echo "$j"; exit 1; }
  printf '%s\t%s\n' "$label" "$gas" >> "$TABLE"; echo "[ok] $label gas=$gas"
  LAST_JSON=$j
}
warp() { cast rpc --rpc-url "$RPC" evm_setNextBlockTimestamp "$1" >/dev/null; cast rpc --rpc-url "$RPC" evm_mine >/dev/null; echo "warp -> $(date -u -d @"$1" '+%a %F %T') UTC"; }
now() { cast block latest --field timestamp --rpc-url "$RPC"; }
next_weekday_time() { # next <dow 1..5 (Mon=1)> after $1 days from now, at HH:MM UTC: args dow hh mm
  python3 - "$(now)" "$1" "$2" "$3" <<'E'
import sys,datetime
t=int(sys.argv[1]); dow=int(sys.argv[2]); hh=int(sys.argv[3]); mm=int(sys.argv[4])
d=datetime.datetime.fromtimestamp(t,datetime.timezone.utc).replace(hour=hh,minute=mm,second=0,microsecond=0)
d+=datetime.timedelta(days=1)
while d.isoweekday()!=dow: d+=datetime.timedelta(days=1)
print(int(d.timestamp()))
E
}

# ---------------------------------------------------------------- 1. deploy
cd "$C"
forge build >/dev/null 2>&1
echo "== 1. Deploy.s.sol --broadcast (deployer = anvil acct0, owner acct1, guardian acct2, keeper acct3)"
FLOOR_WRITE_DEPLOYMENT=true forge script script/Deploy.s.sol --rpc-url "$RPC" --private-key "$K_DEPLOYER" --broadcast --slow 2>&1 | tail -25
BCAST="$C/broadcast/Deploy.s.sol/31337/run-latest.json"
python3 - "$BCAST" "$TABLE" <<'E'
import json,sys
j=json.load(open(sys.argv[1])); tx=j["transactions"]; rc=j["receipts"]
with open(sys.argv[2],"a") as f:
    for t,r in zip(tx,rc):
        name=(t.get("contractName") or "")+(" "+t["function"].split("(")[0] if t.get("function") else "")
        f.write(f'deploy: {name.strip()}\t{int(r["gasUsed"],16)}\n'); print("[ok] deploy:",name.strip(),int(r["gasUsed"],16))
E
FACTORY=$(python3 -c "import json;print(json.load(open('$C/deployments/31337.json'))['FloorFactory'])")
LENS=$(python3 -c "import json;print(json.load(open('$C/deployments/31337.json'))['FloorLens'])")
echo "factory=$FACTORY lens=$LENS"

# ---------------------------------------------------------------- 2. post-deploy
send "acceptOwnership (owner)" "$K_OWNER" "$FACTORY" "acceptOwnership()"
echo "owner=$(cast call $FACTORY 'owner()(address)' --rpc-url $RPC) guardian=$(cast call $FACTORY 'guardian()(address)' --rpc-url $RPC) keeper=$(cast call $FACTORY 'isKeeper(address)(bool)' $KEEPER --rpc-url $RPC)"
echo "pancake router ok: $(cast call $FACTORY 'routerOk(address)(bool,address)' 0x1b81D678ffb9C0263b24A97847620C99d213eB14 --rpc-url $RPC | tr '\n' ' ')"
echo "aggregator router ok: $(cast call $FACTORY 'routerOk(address)(bool,address)' 0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5 --rpc-url $RPC | tr '\n' ' ')"
echo "== 2. SetHolidays (re-apply; Deploy already set them; guardian signs)"
(cd "$C" && FLOOR_FACTORY=$FACTORY forge script script/SetHolidays.s.sol --rpc-url "$RPC" --private-key "$K_GUARD" --broadcast 2>&1 | tail -4)
echo "nonTradingDay(2026-12-25)=$(cast call $FACTORY 'nonTradingDay(uint32)(bool)' $(( $(date -u -d 2026-12-25 +%s) / 86400 )) --rpc-url $RPC)"

# ---------------------------------------------------------------- 3. fund user, P6 demo defaults, positions
echo "== 3. fund user with USDT from a whale (anvil impersonation), P6 setDefaults, positions"
cast rpc --rpc-url "$RPC" anvil_impersonateAccount $WHALE >/dev/null
cast rpc --rpc-url "$RPC" anvil_setBalance $WHALE 0x56BC75E2D63100000 >/dev/null
cast send --rpc-url "$RPC" --unlocked --from $WHALE $USDT "transfer(address,uint256)" "$USER" 2000000000000000000000 >/dev/null
echo "user USDT: $(cast call $USDT 'balanceOf(address)(uint256)' $USER --rpc-url $RPC)"
T1=$(next_weekday_time 2 15 35)   # next Tuesday 15:35 UTC, inside the window
warp "$T1"
send "setDefaults demo minTrade=6 (P6, owner)" "$K_OWNER" "$FACTORY" "$SIG_DEF" "$DEF_DEMO"
send "USDT approve 500 (user)" "$K_USER" $USDT "approve(address,uint256)" "$FACTORY" 500000000000000000000
send "createPosition A: 500 USDT, floor 95%, 365d, NVDAB 100%" "$K_USER" "$FACTORY" "createPosition(uint256,uint16,uint32,address[],uint16[])(address)" 500000000000000000000 9500 31536000 "[$NVDAB]" "[10000]"
VA=$(cast call $FACTORY 'positions(uint256)(address)' 0 --rpc-url $RPC)
send "setDefaults restore minTrade=20 (owner)" "$K_OWNER" "$FACTORY" "$SIG_DEF" "$DEF_NORMAL"
send "USDT approve 300 (user)" "$K_USER" $USDT "approve(address,uint256)" "$FACTORY" 300000000000000000000
send "createPosition B: 300 USDT, floor 90%, 365d, NVDAB/SPCXB/QQQB 40/30/30" "$K_USER" "$FACTORY" "createPosition(uint256,uint16,uint32,address[],uint16[])(address)" 300000000000000000000 9000 31536000 "[$NVDAB,$SPCXB,$QQQB]" "[4000,3000,3000]"
VB=$(cast call $FACTORY 'positions(uint256)(address)' 1 --rpc-url $RPC)
echo "vault A=$VA (minTrade $(cast call $VA 'minTrade()(uint256)' --rpc-url $RPC)) vault B=$VB (minTrade $(cast call $VB 'minTrade()(uint256)' --rpc-url $RPC))"
echo "A valuation/targets: $(cast call $VA 'targets()(uint256,uint256,uint256[3])' --rpc-url $RPC | tr '\n' ' ')"

# ---------------------------------------------------------------- 4. next day in the window: public rebalance on B, keeper on A and B
T2=$(next_weekday_time 3 15 35)    # Wednesday 15:35: > publicDelay (4 h) idle, window open
warp "$T2"
echo "isTradingOpen=$(cast call $FACTORY 'isTradingOpen(uint256)(bool)' $(now) --rpc-url $RPC)"
echo "== 4a. rebalancePublic(0) on B (anyone, direct Pancake): called by the USER address"
send "rebalancePublic(0) on B (anyone)" "$K_USER" "$VB" "rebalancePublic(uint8)" 0
echo "B NVDAB balance: $(cast call $NVDAB 'balanceOf(address)(uint256)' $VB --rpc-url $RPC)"

keeper_once() { # label
  echo "== keeper once --route direct ($1)"
  local kout; kout=$(cd "$ROOT/apps/keeper" && BSC_RPC_URL="$RPC" FLOOR_FACTORY="$FACTORY" FLOOR_LENS="$LENS" KEEPER_ADDRESS="$KEEPER" KEEPER_PRIVATE_KEY="$K_KEEPER" FLOOR_ASSETS="$NVDAB,$SPCXB,$QQQB" pnpm exec tsx src/bin.ts once --route direct 2>&1) || { echo "$kout"; exit 1; }
  echo "$kout" | cut -c1-400
  echo "$kout" | grep -q '"event":"rebalanced"' || { echo "NO Rebalanced from keeper ($1)"; return 1; }
  local h g
  for h in $(echo "$kout" | grep '"event":"rebalanced"' | grep -o '"hash":"0x[0-9a-fA-F]*"' | cut -d'"' -f4); do
    g=$(cast receipt "$h" gasUsed --rpc-url "$RPC" | awk '{print $1}'); printf 'keeper rebalance (%s) %s\t%s\n' "$1" "${h:0:10}" "$g" >> "$TABLE"; echo "[ok] keeper rebalance ($1) $h gas=$g"
  done
}
keeper_once "A buy + B other assets, cycle 1"
warp $(( $(now) + 1000 ))  # past minInterval 900 for the next asset on B
keeper_once "cycle 2" || true
echo "A balances: NVDAB=$(cast call $NVDAB 'balanceOf(address)(uint256)' $VA --rpc-url $RPC) USDT=$(cast call $USDT 'balanceOf(address)(uint256)' $VA --rpc-url $RPC)"
echo "B balances: NVDAB=$(cast call $NVDAB 'balanceOf(address)(uint256)' $VB --rpc-url $RPC) SPCXB=$(cast call $SPCXB 'balanceOf(address)(uint256)' $VB --rpc-url $RPC) QQQB=$(cast call $QQQB 'balanceOf(address)(uint256)' $VB --rpc-url $RPC) USDT=$(cast call $USDT 'balanceOf(address)(uint256)' $VB --rpc-url $RPC)"

# ---------------------------------------------------------------- 5. close A (requestClose, sell by keeper, closeToUSDT), exit B in kind
echo "== 5. A: requestClose, keeper sell, closeToUSDT; B: exitInKind"
warp $(( $(now) + 1000 ))
send "requestClose on A (user)" "$K_USER" "$VA" "requestClose()"
# The keeper skips this sell: it compares the sell's amountIn (bStock wei) with minTrade (USDT), see runbook "Known issues".
# The vault accepts it, so the sell goes out by hand through the same Pancake router path the keeper would use.
keeper_once "A closing sell" || echo "(keeper skipped the sell, KEEPER BUG K-1; doing the sell by hand, same calldata the keeper builds)"
if [ "$(cast call $NVDAB 'balanceOf(address)(uint256)' $VA --rpc-url $RPC)" != 0 ] && [ "$(cast call $VA 'status()(uint8)' --rpc-url $RPC)" != 2 ]; then
  read -r NEEDED IDX BUY TIN TOUT AMT MOA MOD < <(cast call $VA 'previewRebalance()(bool,uint8,bool,address,address,uint256,uint256,uint256)' --rpc-url $RPC | awk '{print $1}' | tr '\n' ' ') || true
  echo "preview: needed=$NEEDED idx=$IDX buy=$BUY amountIn=$AMT minOutDirect=$MOD"
  PR=0x1b81D678ffb9C0263b24A97847620C99d213eB14
  DL=$(( $(now) + 600 ))
  # router struct: (tokenIn, tokenOut, fee, recipient, deadline, amountIn, amountOutMinimum, sqrtPriceLimitX96)
  DATA=$(cast calldata "exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))" "($TIN,$TOUT,2500,$VA,$DL,$AMT,$MOD,0)")
  [ -n "$DATA" ] || { echo "calldata build failed"; exit 1; }
  send "rebalance (manual sell of A via Pancake, keeper key)" "$K_KEEPER" "$VA" "rebalance((uint8,bool,uint256,address,bytes))" "($IDX,false,$AMT,$PR,$DATA)"
fi
echo "A status=$(cast call $VA 'status()(uint8)' --rpc-url $RPC) NVDAB=$(cast call $NVDAB 'balanceOf(address)(uint256)' $VA --rpc-url $RPC)"
UB0=$(cast call $USDT 'balanceOf(address)(uint256)' $USER --rpc-url $RPC)
send "closeToUSDT on A (user)" "$K_USER" "$VA" "closeToUSDT()"
UB1=$(cast call $USDT 'balanceOf(address)(uint256)' $USER --rpc-url $RPC)
echo "user USDT back from A close: before=$UB0 after=$UB1"
send "exitInKind(user) on B (user)" "$K_USER" "$VB" "exitInKind(address)" "$USER"
echo "B status=$(cast call $VB 'status()(uint8)' --rpc-url $RPC); user holds NVDAB=$(cast call $NVDAB 'balanceOf(address)(uint256)' $USER --rpc-url $RPC) SPCXB=$(cast call $SPCXB 'balanceOf(address)(uint256)' $USER --rpc-url $RPC) QQQB=$(cast call $QQQB 'balanceOf(address)(uint256)' $USER --rpc-url $RPC) USDT=$(cast call $USDT 'balanceOf(address)(uint256)' $USER --rpc-url $RPC)"
echo "factory totalTvl after both closed: $(cast call $FACTORY 'totalTvl()(uint256)' --rpc-url $RPC)"

echo "== GAS TABLE (variant $VARIANT)"
column -t -s$'\t' "$TABLE"
echo "== RESULT: PASS ($VARIANT) $(date -u +%FT%TZ)"
