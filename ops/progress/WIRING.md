# WIRING (agent/WIRING): A21/A22 and local UX bugs

Verified on an own anvil-fork stack (`LOCAL_PORT_OFFSET=10000 pnpm local:up`), `pnpm local:e2e:wiring`: 9/9 steps passed.

1. Position page polls every 10 s while visible (and on tab focus, and after a tx); "updated Xs ago" shown. Failed refresh keeps the last data.
2. Keeper heartbeat: keeper loop writes `KEEPER_HEARTBEAT_FILE`; API `/healthz` serves it (`FLOOR_KEEPER_HEARTBEAT_FILE`, same host); Keeper page shows Online + "last scan N s ago".
3. Exit: closed positions show what was paid out (exit in kind: each token, amount and value at the 10-minute average before the exit, USDT, total; close to USDT: the USDT). Modal confirmation shows the same.
4. Minimum deposit: one function (`minAcceptedDeposit`) feeds the "Min X" hint and the message; nothing is checked until the chain limits are read (the 20 vs 6 USDT came from the default shown while loading).
5. Chain clock: term end, days left, next window use the latest block time (`useChainNow`); tooltip "Chain time" on local only.
6. Fresh position: "Waiting for the first rebalance" banner with the next window; tile note.
7. Holiday horizon: read from `factory.holidayHorizonDay()` (public getter, one-line ABI in the adapter, 0 = none); constant kept as fallback.
8. e2e: `local/e2e/wiring.mjs`, 6 screenshots in apps/web/screenshots/wiring/.

Left: heartbeat is a same-host file (production needs the keeper to report to the API store); hydration warning on wallet reconnect is the old LOCAL.md item 15; `keeper once` x2 and a 16 minute warp are used in the e2e because the vault trades each asset at most every 15 minutes.
