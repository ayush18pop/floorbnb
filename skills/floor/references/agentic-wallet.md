# Floor with the Binance Agentic Wallet (`baw`)

**Status: documented from Binance's official docs, not yet executed live by the Floor team (2026-10-10).** Every `baw` flag below comes from the Developer Mode page (https://web3.binance.com/en/dev-docs/products/agentic-wallet/use-cases/developer-mode.md). Output field names are listed only where that page shows them. If a real output differs, trust the real output and tell the user.

Floor never holds keys. With `baw`, the user's Binance MPC wallet signs, and only after the user has seen each preview and said yes.

## 1. Prerequisites

1. Floor MCP server connected (tools: `get_floor_info`, `build_create_position_tx`, `build_exit_tx`, `get_status`).
2. Install the Binance skill: `npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet` (registers `baw`).
3. The user enables **Developer Mode** in the Binance app (arbitrary contract calls are off otherwise). Check: `baw wallet settings --json` and read `devMode.enabled`, `devMode.expiresAt`, `devMode.dailyLimit`, `developerModeQuotaUsed`. Developer Mode is time-boxed and has its own daily quota.
4. The agent wallet holds **USDT on BNB Chain** (the deposit) and a little **BNB for gas** (Binance estimates gas; you cannot set it).
5. Buying or holding bStocks with `baw` (swaps, optional skill `binance-tokenized-securities-info` for ticker to contract and market status) is a separate activity. Floor takes a **USDT deposit** and buys the stocks itself, so the user needs no bStocks first.

## 2. Create a position

1. `get_floor_info`. Stop if paused or halted. Note `factory` and `usdt`.
2. Follow the SKILL.md safe workflow: ask for deposit, floor, term, assets; show floor in USDT, the 24% gap caveat and the verbatim disclosure; get an explicit yes to prepare transactions.
3. Get the agent wallet address from the user (`owner`). Call `build_create_position_tx` with it. Check `checks.sufficientBalance`.
4. The result has `txs[0]` = USDT approve (to = `usdt`), `txs[1]` = createPosition (to = `factory`), and `bawCommands[0..1]` in the same order. For **each tx, in order**:
   1. Verify `to` equals `usdt` (tx 0) or `factory` (tx 1) from step 1 and `value` is 0. If not, stop.
   2. Run the matching command (shape):
      `baw contract-call preview --binanceChainId 56 --from <OWNER> --to <to> --value 0 --inputData <data> --json`
      The output has a `requestId`, plus `status`, `risks`, `parsedTx.amount`, `requireConfirmation`, `tokenInfos` per the docs.
   3. Show the user the preview: target, decoded call from `txs[i].decoded`, amount, any `risks`. Ask "Execute this transaction? yes/no".
   4. Only after an explicit yes: `baw contract-call execute --requestId <requestId from the preview output> --json`. The docs list `status` (`BROADCASTED` or `PENDING_CONFIRMATION`), `txHash`, `requestId`. On `PENDING_CONFIRMATION` the user confirms in the Binance app.
5. **Wait for the approve to be mined** before previewing createPosition (the allowance must be on chain, or the call reverts). Check the approve `txHash` on BscScan or call `build_create_position_tx` again: `checks.allowance` >= amount and `checks.createSimulated` true.
6. If the approve is slow, re-run `build_create_position_tx` before step 4 for createPosition so its simulation is real, then preview its `bawCommands[1]`.

## 3. Status

`get_status {owner}` once createPosition has mined; explain value, floor, cushion and stock share as in SKILL.md.

## 4. Exit

1. Ask which: close to USDT (`requestClose`, wait for the keeper to sell, then `closeToUSDT`) or `exitInKind` (user ends up holding bStocks; set `to` to an address that can receive them).
2. `build_exit_tx {vault, kind, to?}`. Verify `tx.to` is the vault the user named. Run `bawCommands[0]` (its `--from` is the vault owner), show the preview, `execute` only after an explicit yes. The sender must be the vault owner, so the agent wallet must be that owner.
3. For close to USDT, after `requestClose` mines and the stock is sold (`get_status`), build and send `closeToUSDT` the same way.

## 5. Failures

| Symptom | What to do |
|---|---|
| Developer Mode off or expired (`devMode.enabled` false or `expiresAt` past) | Ask the user to re-enable it in the Binance app, then rerun the preview. |
| Daily quota used (`developerModeQuotaUsed` vs `devMode.dailyLimit`) | Stop; resume tomorrow or after the user raises the limit in the app. Never split to dodge it. |
| Risk interception (non-empty `risks`, blocked preview/execute) | Show the risk text verbatim. Do not retry in a loop or craft variants to get past it. The user decides. |
| createPosition reverts / simulation null | The approve is not mined yet. Wait, rebuild, preview again. |
| `PENDING_CONFIRMATION` | Waiting for the user in the Binance app. Do not re-execute. |
| Preview `--to` differs from `get_floor_info` | Refuse (the MCP server also returns `guard`). |

## 6. EXPERIMENTAL, UNTESTED: pay Floor's paid tools by signing with `baw`

Paid tools (`quote_protection`, `backtest`, `simulate_gap`) use x402 v2 with EIP-3009 `TransferWithAuthorization` on USD1 or U (`references/x402.md`). Binance documents x402 payments as **not supported** in Developer Mode, and EIP-191 `personal_sign` as unsupported. But an EIP-3009 authorization is plain EIP-712 typed data, and `baw sign-message --signType EIP712` is documented, so it might work. Nobody on the team has tried it. If the preview is refused, say so and use the free tools only. Without any signer, free tools only. Always get the user's yes for the amount and payee first (SKILL.md x402 rules).

Steps, given a PaymentRequired and one chosen `accepts[]` entry `A`, the agent wallet address `W` (must hold the asset), and a fresh random 32-byte hex `NONCE`:

1. Build the typed data. `A.extra.name` and `A.extra.version` are the token's EIP-712 domain; `chainId` 56 comes from `A.network` `eip155:56`; `verifyingContract` is `A.asset`. `validAfter` 0, `validBefore` = now + `A.maxTimeoutSeconds` (unix seconds):

```json
{
  "types": {
    "EIP712Domain": [
      {"name": "name", "type": "string"},
      {"name": "version", "type": "string"},
      {"name": "chainId", "type": "uint256"},
      {"name": "verifyingContract", "type": "address"}
    ],
    "TransferWithAuthorization": [
      {"name": "from", "type": "address"},
      {"name": "to", "type": "address"},
      {"name": "value", "type": "uint256"},
      {"name": "validAfter", "type": "uint256"},
      {"name": "validBefore", "type": "uint256"},
      {"name": "nonce", "type": "bytes32"}
    ]
  },
  "primaryType": "TransferWithAuthorization",
  "domain": {"name": "<A.extra.name>", "version": "<A.extra.version>", "chainId": 56, "verifyingContract": "<A.asset>"},
  "message": {
    "from": "<W>",
    "to": "<A.payTo>",
    "value": "<A.amount>",
    "validAfter": "0",
    "validBefore": "<unix seconds>",
    "nonce": "<NONCE>"
  }
}
```

2. Preview (the `--message` value wraps the typed data as a JSON string inside `params`):
   `baw sign-message preview --binanceChainId 56 --signType EIP712 --message '{"method":"eth_signTypedData_v4","params":["<W>","<typed data JSON as a string>"]}' --json`
   Show the user the parsed message: payee `A.payTo`, `value` (in atomic units, 18 decimals), asset, deadline. Execute only after an explicit yes.
3. `baw sign-message execute --requestId <requestId from the preview output> --json`. If it is `PENDING_CONFIRMATION`, the user confirms in the app, then `baw sign-message result --order-id <ID> --json`. The docs list `status` (`COMPLETED`, `PENDING_CONFIRMATION`, `REJECTED`, `EXPIRED`) and `signature`. Whether `signature` is a 65-byte `0x` hex that the facilitator accepts is **unverified**.
4. Wrap into the PaymentPayload and retry the same tool call with it in `params._meta["x402/payment"]`:

```json
{
  "x402Version": 2,
  "accepted": <A, copied exactly>,
  "payload": {
    "signature": "<signature from baw>",
    "authorization": {"from": "<W>", "to": "<A.payTo>", "value": "<A.amount>", "validAfter": "0", "validBefore": "<same unix seconds>", "nonce": "<NONCE>"}
  }
}
```

The `authorization` values must be identical to the signed message. The nonce is single use; never reuse a payload for another tool or params.
