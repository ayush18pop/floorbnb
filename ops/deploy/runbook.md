# Floor mainnet deploy runbook (BSC, chainId 56)

Written by A14 from a dry-run on a local anvil fork of BSC (see "Dry-run evidence"). Nothing here was ever sent to chain 56.
Updated 2026-10-05 (docs only): gas figures from the newer direct-only fork dry-run (section 7), `publicDelay` 3600 in the `setDefaults` and verify examples (it was 14400, which does not match `script/params/56.json`), signing via keystore or Ledger, and the owner, guardian, keeper and demo addresses.
The team lead runs every mainnet command. This file contains no keys. Signing is a Foundry keystore (`--account <name>`) or a Ledger (`--ledger`), not MetaMask.

Dry-run base commit: `a640f64` (main after FIX2); the 2026-10-05 direct-only fork dry-run used a newer commit (section 7). **The deploy commit must be the audited commit** (docs/AUDIT.md hash rule):
`AUDITED_COMMIT = <PLACEHOLDER: reviews/audit-pashov-final.md does not exist yet, fill in its first-line hash>`.
Any change under `packages/contracts/src` or `packages/contracts/script` after the audit voids it.

## 0. Human steps (the team lead must do these; no agent can)

| # | Step | Why |
|---|---|---|
| H1 | Decide the router allowlist: `variants/params-56-with-aggregator.json` or `variants/params-56-direct-only.json` (section 1). | **Decided (manager, on the team lead's delegation, 2026-10-04): direct-only.** `script/params/56.json` is the direct-only variant. Add the aggregator later with `addRouter` (24 h) after the proxy check in step 7. |
| H2 | Addresses in `script/params/56.json`: `<OWNER>` and `<GUARDIAN>` are the **same address**, `0x762c9626711BCc882050cBf06Edd610fE8b91F1A` (by choice, so the guardian gives no separation; the docs say so). `<KEEPER>` and `<DEPLOYER>` are `0x46FD797AeBD0250A2E768022AD992DF21F12e58a`. The demo wallet for the 2026-10-05 fork dry-run was `0x05BD118FDdcc892fabaE1a06d82E3b4a9C73E685` (not in the repo params; reported by the team lead, not verified here). `<KEEPER2>` (an Agentic Wallet) is optional and not set up. | P4. |
| H3 | Fund: `<DEPLOYER>`, `<OWNER>`, `<GUARDIAN>`, `<KEEPER>`, `<KEEPER2>` with BNB; a demo wallet with USDT + BNB (section 8). | Gas. |
| H4 | Sign every `--ledger` transaction on the device and read each screen. A wrong address is not recoverable. | Hardware wallet. |
| H5 | Create an Etherscan v2 API key (works for chain 56) and export `ETHERSCAN_API_KEY` in your shell. Keep it out of the repo. | Verification. |
| H6 | Provide an RPC that serves recent state reliably for `BSC_RPC_URL` (paid or your own; public RPCs were slow or flaky in the dry-run). | Deploy and pre-flight. |
| H7 | Re-read the pool TVL, cardinality and `uiMultiplier` live the day of the deploy and edit caps if needed (section 2). | G4. |
| H8 | Cross-check `holidays/nyse_2026_2027.json` with nyse.com once more (table now runs through 2028-12-31; verified 2026-10-04; `python3 holidays/gen_holidays.py --check` validates it). | Holidays. |
| H9 | DNS and web hosting for the app on `https://floor.ayush.works` (fallback host `floorbnb.vercel.app`), pointing the frontend at the new factory/lens addresses (not part of this runbook; nothing in the repo does it for you). Add the new origin to `WEB_ORIGIN` and `MCP_ALLOWED_ORIGINS` on the API and MCP hosts. | Launch. |
| H10 | Put the keeper key in the keeper host's environment (`KEEPER_PRIVATE_KEY`, env only) and the Binance keys for `--route agg`. Never in a file in the repo (the keeper refuses to start if it finds the key in the repo). | Keeper. |
| H11 | Commit `packages/contracts/deployments/56.json` after the deploy (or hand it to the manager). | Wiring. |

## 1. Router allowlist decision (decided: direct-only, see H1)

The router allowlist is set in the `FloorFactory` constructor and the routers are active at deploy time. Two params files are provided:

| Variant | `routerTargets` / `routerApproveTargets` | Keeper route |
|---|---|---|
| `ops/deploy/variants/params-56-with-aggregator.json` | `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5` and Pancake `0x1b81D678ffb9C0263b24A97847620C99d213eB14` | `--route agg` works at once; falls back to direct. A09b measured the aggregator about 0.23% better than direct on a 400 USDT buy. |
| `ops/deploy/variants/params-56-direct-only.json` | Pancake only | Direct only. Adding the aggregator later is `addRouter(0xB444..., approveTarget)` by the owner, active after **24 h**. |

Both variants deployed and ran the full sequence on the fork (run 1/3 with-aggregator, run 2 direct-only).
Considerations: the aggregator router is third-party code that the vault approves exact `amountIn` to, bounded by SwapGuard balance deltas (vault-side), so a bad route reverts rather than loses. The `approveTarget` is fixed at deploy, so re-confirm it live before choosing the first variant: call the live `/swap` and check that `tx.to` equals the `approveTarget` (A09b saw `0xB444...FdDA5` for both, for 4 to 400 USDT and both directions). If it is not the same, use the direct-only variant, or put the right pair in the params.
Suggestion only: with-aggregator if Monday's demo should show the aggregator route; otherwise direct-only is the smaller trust surface and can be extended after 24 h.

Copy the chosen file to `packages/contracts/script/params/56.json` and fill in the roles. The existing `56.json` (committed) has zero owner/guardian and `keepers: []`, which the pre-flight rejects on purpose.

## 2. Pre-flight checklist (do all before signing anything)

```bash
cd packages/contracts
export BSC_RPC_URL=<your RPC>
export USDT=0x55d398326f99059fF775485246999027B3197955
```

1. **Commit hash.** `git rev-parse HEAD` must equal `AUDITED_COMMIT` (first line of `reviews/audit-pashov-final.md`, which does not exist yet; **leave the placeholder until it does and do not deploy until it matches**). `git status` clean. `forge build --sizes` OK. `forge test` green.
2. **Params.** `script/params/56.json` has real `owner`, `guardian`, `keepers` (non-empty), the chosen router variant, holidays file path. `python3 -c "import json;json.load(open('script/params/56.json'))"` parses. No private key anywhere.
3. **Pools, TVL, cardinality, history** for each of NVDAB `0x8FB4243b553aC29BA088aCf00B9B7dA24bD6690C` (fee 2500), SPCXB `0x977DaFFC095b33872E2741c19568925015C35b4d` (2500), QQQB `0xe531fcb1F5a195de7608B9F4f9518544C2cdB693` (100):
   ```bash
   for P in 0x8FB4243b553aC29BA088aCf00B9B7dA24bD6690C 0x977DaFFC095b33872E2741c19568925015C35b4d 0xe531fcb1F5a195de7608B9F4f9518544C2cdB693; do
     echo "pool $P"
     cast call $P "liquidity()(uint128)" --rpc-url $BSC_RPC_URL
     cast call $P "slot0()(uint160,int24,uint16,uint16,uint16,uint32,bool)" --rpc-url $BSC_RPC_URL   # 4th value = observationCardinality, must be >= 200
     cast call $P "observe(uint32[])(int56[],uint160[])" "[600,0]" --rpc-url $BSC_RPC_URL           # must not revert
     cast call $USDT "balanceOf(address)(uint256)" $P --rpc-url $BSC_RPC_URL                        # USDT side of the pool = TVL proxy
   done
   ```
   Check TVL against `assetMaxTradeValue` (25k / 10k / 5k USDT) and the 1,000 USDT per-position and 5,000 USDT total caps (P5). Lower a cap in the params if the pool is thinner than assumed. The Deploy script re-checks liquidity >= `assetMinLiquidity` (1e21), cardinality >= 200 and `observe(twapWindow)` itself and aborts before any transaction.
4. **uiMultiplier re-read.** For each bStock:
   ```bash
   for T in 0x02fca66c1d1afb4e2a7884261eb00f63598a7436 0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1 0x205812cdbed920aff76c6580abd681a46d11efc7; do
     cast call $T "uiMultiplier()(uint256)" --rpc-url $BSC_RPC_URL; cast call $T "decimals()(uint8)" --rpc-url $BSC_RPC_URL; done
   ```
   Write the three values down; after the deploy, `factory.lastMultiplier(token)` must equal them (the keeper pokes it).
5. **Token beacon.** `cast call 0x156d6dce9a4f6139a3406f1f021f1a4880de93a3 "implementation()(address)" --rpc-url $BSC_RPC_URL` must equal `approvedTokenImpl` `0xCFEd6c4679297ea4889F8183bC057B4A86C64e46` (Deploy aborts if not; if the beacon has moved, stop and ask why).
6. **Pancake addresses have code**, USDT has 18 decimals (Deploy checks both).
7. **Aggregator `approveTarget`** (only for the with-aggregator variant): see section 1. Also `cast code 0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5 --rpc-url $BSC_RPC_URL | wc -c` > 2, and check it is not an upgradeable proxy you did not expect: `cast storage 0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc --rpc-url $BSC_RPC_URL` (non-zero means EIP-1967 proxy: decide if you accept that).
8. **Simulation** (reads only, sends nothing; this runs the Deploy pre-flight against the live chain):
   ```bash
   forge script script/Deploy.s.sol --fork-url $BSC_RPC_URL --sender <DEPLOYER>
   ```
9. **Gas price.** `cast gas-price --rpc-url $BSC_RPC_URL` (it was 0.05 gwei on 2026-10-03). Fund for the worst case in section 9.
10. **Time.** Do the deploy before the Monday window; the demo positions and the first rebalance are in the Monday 15:30 to 19:30 UTC window. `cast call <FACTORY> "isTradingOpen(uint256)(bool)" $(date +%s)` after the deploy.

## 3. Deploy (one script, one signer)

`Deploy.s.sol` deploys `FloorVault` (implementation), `FloorFactory` (deployer is temporary owner and guardian), `FloorLens`, then `setTokenBeacon`, 3x `addAsset`, `setKeeper` for each keeper in params, `setLimits`, `setNonTradingDays` (the holiday table from the JSON), `setGuardian(<GUARDIAN>)` and `transferOwnership(<OWNER>)`. **Ownership transfer is two-step: `<OWNER>` must call `acceptOwnership()` (step 4).** Holidays are already set by this script; the separate `SetHolidays` is only needed to re-apply or extend the table.

```bash
cd packages/contracts
export FLOOR_WRITE_DEPLOYMENT=true          # writes deployments/56.json
forge script script/Deploy.s.sol \
  --rpc-url $BSC_RPC_URL --ledger --sender <DEPLOYER> --broadcast --slow
# keystore alternative:  --account <deployer-keystore-name> --sender <DEPLOYER>
```

The script prints `FloorVault (impl)`, `FloorFactory`, `FloorLens`. Export them:
```bash
export FACTORY=<FloorFactory> LENS=<FloorLens> IMPL=<FloorVault>
```
Expected: 12 transactions. The direct-only fork dry-run of 2026-10-05 used about 15.1M gas in total (section 7); the older 9.7M figure came from an earlier commit. If the run stops half way, do not re-run blindly: read `broadcast/Deploy.s.sol/56/run-latest.json`, see what landed, and ask the team (the contracts are not upgradeable; a half-configured factory is abandoned and redeployed, which only costs gas).

## 4. Post-deploy (owner, guardian) and checks

```bash
# OWNER accepts the 2-step transfer (found by the dry-run: without this the owner role is still the deployer's)
cast send $FACTORY "acceptOwnership()" --rpc-url $BSC_RPC_URL --ledger --from <OWNER>

cast call $FACTORY "owner()(address)"        --rpc-url $BSC_RPC_URL   # == <OWNER>
cast call $FACTORY "pendingOwner()(address)" --rpc-url $BSC_RPC_URL   # == 0x0
cast call $FACTORY "guardian()(address)"     --rpc-url $BSC_RPC_URL   # == <GUARDIAN>
cast call $FACTORY "isKeeper(address)(bool)" <KEEPER>  --rpc-url $BSC_RPC_URL   # true (and <KEEPER2>)
cast call $FACTORY "maxDeposit()(uint256)"   --rpc-url $BSC_RPC_URL   # 1000e18 (shared total below; the OWNER can change both any time with setLimits, no redeploy)
cast call $FACTORY "maxTotalTvl()(uint256)"  --rpc-url $BSC_RPC_URL   # 5000e18, shared by all users
cast call $FACTORY "routerOk(address)(bool,address)" 0x1b81D678ffb9C0263b24A97847620C99d213eB14 --rpc-url $BSC_RPC_URL   # true
cast call $FACTORY "routerOk(address)(bool,address)" 0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5 --rpc-url $BSC_RPC_URL   # true only in the with-aggregator variant
cast call $FACTORY "assets(address)(address,uint24,bool,uint128,uint256,bool)" 0x02fca66c1d1afb4e2a7884261eb00f63598a7436 --rpc-url $BSC_RPC_URL
cast call $FACTORY "nonTradingDay(uint32)(bool)" $(( $(date -u -d 2026-12-25 +%s) / 86400 )) --rpc-url $BSC_RPC_URL   # true
cast call $FACTORY "lastMultiplier(address)(uint256)" 0x02fca66c1d1afb4e2a7884261eb00f63598a7436 --rpc-url $BSC_RPC_URL  # == step 2.4 value
```

Optional, only to re-apply or extend holidays (guardian signs). Extend before `horizon - 14 days - now` drops below the longest term offered (365 d): NYSE has published only through 2028, so add 2029 (edit EARLY/END in `holidays/gen_holidays.py`, regenerate) when NYSE announces it, then run this. One call sets all days and the horizon (`setHolidayHorizon`, guardian, no cap, no redeploy); about 30 days per year fits one tx:
```bash
FLOOR_FACTORY=$FACTORY forge script script/SetHolidays.s.sol --rpc-url $BSC_RPC_URL --ledger --sender <GUARDIAN> --broadcast
```

Adding the aggregator later (direct-only variant): `cast send $FACTORY "addRouter(address,address)" 0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5 <APPROVE_TARGET> --rpc-url $BSC_RPC_URL --ledger --from <OWNER>`; active 24 h later (`routers(addr).activeAt`).

## 5. Verify on BscScan (Etherscan API v2 key), Sourcify fallback

`foundry.toml` already pins solc 0.8.28, optimizer 200 runs, EVM `cancun`, `bytecode_hash = "none"`. Run from `packages/contracts` at the audited commit.
`DEPLOYER` below is the address that signed the deploy (it is the `owner_` and `guardian_` constructor arguments, not `<OWNER>`).

```bash
export CHAIN=56
# FloorVault: no constructor arguments
forge verify-contract $IMPL src/FloorVault.sol:FloorVault --chain $CHAIN --verifier etherscan \
  --etherscan-api-key $ETHERSCAN_API_KEY --watch

# FloorLens: constructor(address factory)
forge verify-contract $LENS src/FloorLens.sol:FloorLens --chain $CHAIN --verifier etherscan \
  --etherscan-api-key $ETHERSCAN_API_KEY --watch \
  --constructor-args $(cast abi-encode "constructor(address)" $FACTORY)

# FloorFactory: constructor(owner_, guardian_, usdt, v3Factory, v3SwapRouter, vaultImpl, Defaults, routers[], approveTargets[])
# Use the SAME router arrays as in the params file you deployed. Variant WITH aggregator shown.
forge verify-contract $FACTORY src/FloorFactory.sol:FloorFactory --chain $CHAIN --verifier etherscan \
  --etherscan-api-key $ETHERSCAN_API_KEY --watch \
  --constructor-args $(cast abi-encode \
  "constructor(address,address,address,address,address,address,(uint16,uint16,uint32,uint32,uint32,uint16,uint16,uint16,uint256,uint256),address[],address[])" \
  <DEPLOYER> <DEPLOYER> 0x55d398326f99059fF775485246999027B3197955 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865 \
  0x1b81D678ffb9C0263b24A97847620C99d213eB14 $IMPL \
  "(100,200,900,3600,600,300,30,100,20000000000000000000,1000000000000000000)" \
  "[0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5,0x1b81D678ffb9C0263b24A97847620C99d213eB14]" \
  "[0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5,0x1b81D678ffb9C0263b24A97847620C99d213eB14]")
# direct-only variant: replace the last two arrays with "[0x1b81D678ffb9C0263b24A97847620C99d213eB14]" each.

# Sourcify fallback (no key): add to any of the above, in place of the etherscan flags:
#   --verifier sourcify
```
The encoding above was checked on the 2026-10-03 dry-run: it equals the trailing bytes of the deploy transaction's init code (with-aggregator variant, which then used `publicDelay` 14400). The committed `script/params/56.json` has `publicDelay` 3600, so the examples now say 3600. Re-check the encoding against the real deploy transaction before you rely on it. The router arrays and `defaults` must be exactly what the script was run with (`defaults` from `script/params/56.json`).
Alternative: add `--verify --etherscan-api-key $ETHERSCAN_API_KEY` to the deploy command; the explicit commands above are easier to retry. Unverified: the Etherscan v2 route for chain 56 and BscScan's 403s to scripts (CONTRACTS.md section 14); browsing by hand is fine. Record in this file: the verified links and the commit hash.

## 6. Keepers, demo defaults, demo positions

```bash
# Spare/second keeper (if not in params). Owner signs.
cast send $FACTORY "setKeeper(address,bool)" <KEEPER2> true --rpc-url $BSC_RPC_URL --ledger --from <OWNER>

# P6: demo defaults (minTrade 6 USDT) BEFORE the demo positions. Owner signs. Shown values = params defaults (publicDelay 3600) with minTrade 6e18. The committed default minTrade is 20 USDT.
SIG="setDefaults((uint16,uint16,uint32,uint32,uint32,uint16,uint16,uint16,uint256,uint256))"
cast send $FACTORY "$SIG" "(100,200,900,3600,600,300,30,100,6000000000000000000,1000000000000000000)" \
  --rpc-url $BSC_RPC_URL --ledger --from <OWNER>

# Demo position A (Appendix A): 500 USDT, floor 95%, 365 days, NVDAB 100%. Caps: maxDeposit is 1000 USDT.
# <DEMO> = the demo wallet (holds >= 800 USDT and BNB).
cast send $USDT "approve(address,uint256)" $FACTORY 500000000000000000000 --rpc-url $BSC_RPC_URL --ledger --from <DEMO>
cast send $FACTORY "createPosition(uint256,uint16,uint32,address[],uint16[])(address)" \
  500000000000000000000 9500 31536000 "[0x02fca66c1d1afb4e2a7884261eb00f63598a7436]" "[10000]" \
  --rpc-url $BSC_RPC_URL --ledger --from <DEMO>

# RESTORE normal defaults (minTrade 20 USDT) BEFORE position B
cast send $FACTORY "$SIG" "(100,200,900,3600,600,300,30,100,20000000000000000000,1000000000000000000)" \
  --rpc-url $BSC_RPC_URL --ledger --from <OWNER>

# Demo position B: 300 USDT, floor 90%, NVDAB/SPCXB/QQQB 40/30/30 (normal defaults)
cast send $USDT "approve(address,uint256)" $FACTORY 300000000000000000000 --rpc-url $BSC_RPC_URL --ledger --from <DEMO>
cast send $FACTORY "createPosition(uint256,uint16,uint32,address[],uint16[])(address)" \
  300000000000000000000 9000 31536000 \
  "[0x02fca66c1d1afb4e2a7884261eb00f63598a7436,0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1,0x205812cdbed920aff76c6580abd681a46d11efc7]" \
  "[4000,3000,3000]" --rpc-url $BSC_RPC_URL --ledger --from <DEMO>
cast call $FACTORY "positions(uint256)(address)" 0 --rpc-url $BSC_RPC_URL     # vault A
cast call $FACTORY "positions(uint256)(address)" 1 --rpc-url $BSC_RPC_URL     # vault B
```
Smaller first test (CONTRACTS.md section 14 smoke test, about 50 USDT): `script/SmokeTest.s.sol` (`FLOOR_FACTORY`, `ASSET`, `AMOUNT`, `FLOOR_BPS`, `TERM` env) with `--ledger --sender <DEMO> --broadcast`. Do it first if you want the aggregator-from-a-contract claim tested on one small position (Monday's smoke test settles that).

Keeper in the window (Mon 15:30 to 19:30 UTC), key from the environment only, never a file in the repo:
```bash
cd apps/keeper
export BSC_RPC_URL=<RPC> FLOOR_FACTORY=$FACTORY FLOOR_LENS=$LENS KEEPER_ADDRESS=<KEEPER> KEEPER_PRIVATE_KEY=<from your secret store> FLOOR_ASSETS=0x02fca66c1d1afb4e2a7884261eb00f63598a7436,0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1,0x205812cdbed920aff76c6580abd681a46d11efc7
pnpm exec tsx src/bin.ts once --dry-run --route direct     # first: reads only
pnpm exec tsx src/bin.ts once --route direct                # then live (add BW3_API_KEY/SECRET and --route agg only for the with-aggregator variant)
```
Position B has three assets and the keeper does one asset per vault per cycle, so it needs about three `once` runs at least `minInterval` (900 s) apart (the dry-run did exactly this).

## 7. Expected gas per step (measured on the fork, identical in all three runs)

| Step | Gas | Notes |
|---|---|---|
| Deploy `FloorVault` | 4,383,008 | |
| Deploy `FloorFactory` | 3,452,704 (3,404,797 direct-only) | |
| Deploy `FloorLens` | 611,337 | |
| `setTokenBeacon` | 70,159 | |
| `addAsset` x3 | 222,694 / 185,623 / 227,802 | |
| `setKeeper` | 47,899 per keeper | |
| `setLimits` | 29,842 | |
| `setNonTradingDays` (16 days) | 412,725 | |
| `setGuardian` | 30,141 | |
| `transferOwnership` | 47,788 | |
| **Deploy script total (2026-10-03, older commit)** | **about 9.7M** | 12 transactions. Superseded: the 2026-10-05 direct-only dry-run used about 15.1M (below). |
| `acceptOwnership` | 28,346 | owner |
| `setDefaults` | 43,670 | owner, twice for the demo |
| USDT `approve` | 46,206 | per position |
| `createPosition` | 535,148 (1 asset) / 543,627 (3 assets) | |
| `rebalancePublic` | 417,646 | anyone, direct Pancake |
| keeper `rebalance` (direct) | 320,483 / 450,671 / 451,001 | first buy on a fresh vault is the cheap one |
| `rebalance` sell (direct) | 290,001 | |
| `requestClose` | 32,510 | |
| `closeToUSDT` | 116,157 | |
| `exitInKind` (USDT + 3 bStocks) | 241,879 | |

**Fork dry-run 2026-10-05 (direct-only router variant, newer commit):** deploy script about **15.1M gas**, about **0.00076 BNB at 0.05 gwei**. Roles used: owner and guardian `0x762c9626711BCc882050cBf06Edd610fE8b91F1A`, keeper and deployer `0x46FD797AeBD0250A2E768022AD992DF21F12e58a`, demo wallet `0x05BD118FDdcc892fabaE1a06d82E3b4a9C73E685`. These figures were given by the team lead. They were not re-run in this docs pass, no per-step breakdown was recorded for them, and the per-step table above is from the older commit, so its rows do not add up to 15.1M. Re-measure before you rely on a single step.

Aggregator-route gas was not measured (the live API needs the Binance keys and a real-time clock; A09b ran it separately). Expect more than the direct route.

## 8. Rollback and incident handling

There is no upgrade path: the factory and the vault implementation are immutable, vaults are clones.
- **Stop new activity:** `cast send $FACTORY "pause()" --rpc-url $BSC_RPC_URL --ledger --from <GUARDIAN>` (guardian or owner). Blocks `createPosition` and all trading. `unpause()` reverses it. `setHalted(true)` stops trading only. Exits never read factory state, so pause, halt or a removed router cannot stop them.
- **Targeted:** `removeRouter(<router>)` (guardian or owner), `disableAsset(<token>)` (guardian or owner), `setKeeper(<keeper>, false)` (owner).
- **Users get their money out regardless:** each position owner calls `vault.exitInKind(<to>)` (USDT first, then each bStock; a token that reverts is skipped and stays recoverable with `rescue`), or `requestClose()` + a keeper sell + `closeToUSDT()` for USDT only. Share this one-liner with users: `cast send <VAULT> "exitInKind(address)" <THEIR_ADDRESS> --ledger`.
- **Bad deploy (wrong parameter) before real funds:** pause, abandon, redeploy from the same audited commit with corrected params (section 3). Costs about 0.001 BNB at 0.05 gwei (about 0.045 BNB at 3 gwei).
- **Changed `uiMultiplier` / token impl:** the vault's guards suppress buys; nothing to do on-chain except `approveTokenImpl` after review (guardian).
- Write down who holds `<OWNER>` and `<GUARDIAN>`, and where each key is.

## 9. BNB needed (ESTIMATE, not a quote)

Measured gas x an assumed price. The live price on 2026-10-03 was 0.05 gwei; BSC typically sits near 0.05 to 1 gwei but can spike. Using 3 gwei as a deliberately high ceiling:

| Wallet | Operations | Gas | BNB at 3 gwei |
|---|---|---|---|
| `<DEPLOYER>` | Deploy script | 15.1M (2026-10-05 dry-run; was 9.7M) | 0.045 |
| `<OWNER>` | accept, 2x setDefaults, optional addRouter | about 0.2M | 0.001 |
| `<GUARDIAN>` | optional SetHolidays, pause | about 0.5M | 0.002 |
| `<KEEPER>` / `<KEEPER2>` | about 20 rebalances | about 9M | 0.027 each |
| `<DEMO>` | 2 approves, 2 positions, exits | about 1.5M | 0.005 |

Estimate: about 0.08 BNB at 3 gwei with the keeper funded once; at the observed 0.05 gwei the on-chain cost is below 0.01 BNB (the deploy alone is about 0.00076 BNB). Suggested funding: deployer 0.06, owner 0.01, guardian 0.01 (the same address as the owner at launch, so one wallet), each keeper 0.03, demo wallet 0.02, plus verification costs nothing. Total about 0.15 BNB with margin (matches the 0.05 BNB deployer plus 0.02 BNB smoke test budget in CONTRACTS.md section 14). USDT is separate: 800 USDT for the two demo positions (500 + 300), plus about 50 USDT for the smoke test.

## 10. Dry-run evidence and known issues

Environment: `anvil --fork-url https://bsc-mainnet.public.blastapi.io --chain-id 31337`, anvil's public dev mnemonic (keys derived at run time, none stored). Harness: `ops/deploy/dryrun.sh [with-aggregator|direct-only]`; full logs in `ops/deploy/runs/`.
Sequence per run: `Deploy.s.sol --broadcast` (params `31337.json`) -> `acceptOwnership` -> `SetHolidays` -> fund user from a USDT whale -> warp to Tue 15:35 UTC -> P6 `setDefaults` (6 USDT) -> position A (500) -> restore defaults -> position B (300) -> warp to Wed 15:35 -> `rebalancePublic(0)` on B -> keeper `once --route direct` (A buy 100 USDT of NVDAB, B buys SPCXB) -> +1000 s -> keeper again (B QQQB) -> `requestClose` A -> sell -> `closeToUSDT` A (user got back about 499.5 of 500 USDT) -> `exitInKind` on B (USDT + 3 bStocks to the user; `totalTvl` back to 0).

| Run | Variant | Result |
|---|---|---|
| 1 | with-aggregator (both routers active at deploy) | PASS 2026-10-03 06:58Z (console output only; the first log file was deleted when the log extension changed) |
| 2 | direct-only (Pancake only) | PASS 06:59Z, `ops/deploy/runs/direct-only-20261003T065817Z.txt` |
| 3 | with-aggregator, fresh fork again | PASS 07:01Z, `ops/deploy/runs/with-aggregator-20261003T065953Z.txt` (its `deployments/31337.json` is committed) |

Every run: the same gas numbers, `totalTvl` back to 0, all positions closed, anvil killed afterwards.

**Known issues found by the dry-run (no contract change needed):**
- **K-1 (keeper, apps/keeper, owner A09; not a contract finding): the keeper skips every sell.** *Status 2026-10-05: the code in `apps/keeper/src/keeper.ts` now compares a sell by its USDT value (see the comment above `below_min_trade`). Not re-run on a fork in this docs pass.* Original finding: In `keeper.ts` the check `amountIn < minTrade` compares `amountIn` with `minTrade`, but for a sell `amountIn` is in bStock wei, not USDT. The 0.4256 NVDAB sell of A (about 99.7 USDT) was skipped as `below_min_trade` (0.4256e18 < 6e18). The vault accepts the sell (the dry-run sent it by hand, 290,001 gas, same Pancake calldata). Fix: for sells compare the USDT value (`amountIn` x price, or the quoted USDT) with `minTrade`, or drop the check and let the vault decide. Until fixed the keeper cannot de-risk a position, which matters for the floor: tell the team lead before launch.
- **K-2 (cosmetic):** in `Closing` status the keeper logs `cppiMirrorMatches:false` (the SDK mirror does not model the Closing target 0). A warning, not a failure.
- **R-1:** `Deploy.s.sol` hands ownership over in two steps; without `acceptOwnership()` by `<OWNER>` the owner-only calls (`setDefaults`, `addRouter`, `setKeeper`) fail. Included in section 4.
- **R-2:** the committed `56.json` has `keepers: []` and zero roles; the pre-flight aborts on it by design.
- **R-3:** the fork warp (Sat to Tue) is fine for the Pancake direct route; a warp breaks live aggregator calldata (A09b finding 8), so the aggregator route is not part of the dry-run.
- **R-4 (fork only):** the factory deploys at block time T and the demo then runs at T+3 days. On mainnet the 24 h `addRouter` delay is real; only the constructor routers are active immediately.
