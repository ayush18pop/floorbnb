# A02 taker spike: results (partial, aggregator part BLOCKED)

Run: 2026-10-02 ~21:00 UTC, Anvil-style fork (forge `createSelectFork`) of BSC latest via https://bsc-rpc.publicnode.com.
No transactions sent to chain 56. Reproduce: `bash ops/spikes/taker-probe/run.sh`.

## Verdict (one line)
Direct Pancake route works from a contract taker (verified). Aggregator-from-contract: **not tested, blocked on Binance Web3 API keys** (`~/.config/floor/secrets.env` does not exist).

## Table
| Token | Direction | Size | Route | Result | Round trip cost |
|---|---|---|---|---|---|
| NVDAB | USDT -> NVDAB -> USDT | 100 USDT | Pancake v3 direct, 0.25% pool | PASS | 49 bps (100 -> 99.5006) |
| SPCXB | same | 100 USDT | Pancake v3 direct, 0.25% pool | PASS | 49 bps (100 -> 99.5006) |
| QQQB | same | 100 USDT | Pancake v3 direct, 0.01% pool | PASS | 1 bp (100 -> 99.9800) |
| NVDAB/SPCXB/QQQB | aggregator `/swap` calldata, contract taker | 10 and 100 USDT | Binance aggregator | **BLOCKED (no keys)** | n/a |
| any | `vendor` filter AMM-only | | | **BLOCKED (no keys)** | n/a |

Costs are for 100 USDT only, one block, on a fork. Not comparable with the CONTEXT.md $10k numbers. Weekend cost not measured.

## Answers
- **Q9 (Pancake SwapRouter struct):** the deployed router `0x1b81...eB14` contains selector `0x414bf389`
  (`exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))`, WITH `deadline`) and does not
  contain `0x04e45aaf` (no-deadline variant). Calls with the deadline struct succeed on the fork. A01's
  `IPancakeV3SwapRouter` already uses this layout. Reproduce: `cast code 0x1b81D678ffb9C0263b24A97847620C99d213eB14 --rpc-url $R | grep -c 414bf389`.
- **Q10 (contract can hold and move bStocks):** yes for NVDAB, SPCXB, QQQB on the fork: a contract received a bStock
  from its pool (`vm.prank(pool)`), held it, bought and sold via the router, and forwarded it to another address
  (`test_Q10_contractHoldsAndMovesBStock`). Real-chain compliance state can change (issuer pause/blocklist).
- **Fork-RPC durability (R5):** the public endpoints are flaky from this machine. `bsc-dataseed.binance.org` timed out
  several times in one hour (`Connection timed out (os error 110)`); `defibit` timed out; `bsc-rpc.publicnode.com` worked
  every time. The 4-test fork run took ~13 s. GitHub clones (OpenZeppelin, v4-core) also timed out; npm worked.
  Recommend a paid or dedicated RPC for A11 and A14.
- **Q1/T17 (aggregator calldata from a contract taker):** UNKNOWN. Needs keys. Known limit: on mainnet X will have code,
  and the API may treat that differently; only Monday's smoke test settles it.

## What is blocked and what the human must supply
1. Create `~/.config/floor/secrets.env` (chmod 600) with `BW3_API_KEY` and `BW3_API_SECRET`.
2. Then run, per case, within 30 s of each other (quote TTL): 
   `bash -c 'set -a; . ~/.config/floor/secrets.env; set +a; node ops/spikes/taker-probe/script/fetch_fixture.mjs <from> <to> <amountWei> <fresh X> ops/spikes/taker-probe/fixtures/<name>.json'`
   then `bash ops/spikes/taker-probe/run.sh` (it replays every fixture with the probe etched at X).
3. Signature encoding is **unverified**: docs were behind an AWS WAF challenge and `afterbell/research/bw3.py`, which the plan says to port, does not exist at that path. `fetch_fixture.mjs` assumes base64 HMAC-SHA256 over `timestamp+GET+/build/path?query`; set `BW3_SIGN_ENC=hex` if the API rejects it. A04's client has the same open point.
4. Fixtures of sells (bStock -> USDT) need the fixture `fromToken` set to a bStock; the test moves it in from the pool.

## Update 2026-10-03: aggregator replay run with live keys (read-only, local fork)
- Signature encoding **verified**: base64 HMAC-SHA256 over `timestamp+GET+/build/path?query` is accepted (`packages/bw3 live-check`, and `fetch_fixture.mjs`).
- **Q1/T17 on a fork:** aggregator calldata (vendor LiquidMesh, mode SWAP) executed from a contract taker (probe etched at a fresh address X), both directions:
  - USDT -> NVDAB: spent 10 USDT, got 0.04264 NVDAB.
  - NVDAB -> USDT: spent 0.0426 NVDAB, got 9.9869 USDT.
- Not yet shown: execution on mainnet with the real factory-created vault as taker, quote TTL timing in the keeper, other vendors, QQQB and SPCXB. Monday's smoke test settles the mainnet case.
- Fixtures contain no keys (grep checked).
