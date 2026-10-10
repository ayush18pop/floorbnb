# ops/b402: settle-once

Human-run check of Binance b402 `supported`, `verify` and (optionally) `settle` using `packages/x402`'s `B402FacilitatorClient`. Nothing here has been run by an agent.

## Run

Needs a Web3 API key with the "B402 Payments" permission, and a throwaway payer key (an EIP-3009 token such as USD1 or U on BSC; the payer needs a little of the token, no BNB, because the facilitator submits the transaction).

```
export BW3_API_KEY=... BW3_API_SECRET=...        # from your shell, never committed
export B402_TEST_PAYER_KEY=0x...                  # throwaway key
export X402_ASSET=0x...                           # USD1 or U address
export X402_PAYTO=0x...                           # payee (the project's payee address)
# optional: B402_TEST_AMOUNT=0.01  X402_NETWORK=eip155:56  X402_TOKEN_NAME / X402_TOKEN_VERSION  BSC_RPC_URL

cd apps/mcp
pnpm exec tsx --tsconfig ../../ops/b402/tsconfig.json ../../ops/b402/settle-once.ts            # supported + verify only
pnpm exec tsx --tsconfig ../../ops/b402/tsconfig.json ../../ops/b402/settle-once.ts --settle   # ONE real settle
```

Typecheck: `cd ops/b402 && ../../node_modules/.bin/tsc -p tsconfig.json`.

## Cost

Default mode: free (verify does not broadcast, per Binance's docs). `--settle` moves `B402_TEST_AMOUNT` (default 0.01 token, about 0.01 USD) from the payer to `payTo`; irreversible. The facilitator pays gas.

## Settle behaviour in the docs

The integration guide (https://web3.binance.com/en/dev-docs/products/b402-api/integration-guide.md, read 2026-10-10) describes settle as a call that "submits an on-chain transaction and is irreversible", returning `data.success`, `transaction`, `payer`, `network`, `amount`, `errorReason`. `success: false` with a `transaction` means broadcast: "poll or reconcile before deciding whether to retry"; `success: false` with an empty `transaction` is a terminal pre-broadcast failure. We found no dedicated status endpoint on that page, and the page does not mention the non-blocking change of 2026-07-14 that our notes record. So the script settles once, then waits for the receipt on BSC itself and never calls settle again. Record in the DX report what you actually observe (latency, whether `transaction` is set on success).

## Output feeds the DX report

Copy the printed `supported`, `verify` and `settle` JSON (no keys are printed), the tx hash, BscScan link and timings into the DX report (`dx/raw/MANAGER-b402.md` style). Say plainly if settle was not run.
