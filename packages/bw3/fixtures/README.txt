These fixtures are RECONSTRUCTED from the real responses quoted in afterbell/docs/EXECUTION.md section 6 (2026-09-30),
not freshly recorded: no API keys were available when A04 ran. Keys, wallet addresses and quote ids are placeholders.
Replace them with recorded responses (keys stripped) once keys exist.

live-2026-10-10/ : RECORDED LIVE from https://web3.binance.com/build on 2026-10-10 by scripts/probe-rwa.ts (BSC, binanceChainId=56),
wrapped in the usual envelope {code, msg, data}. No headers or keys are stored. Params used:
  underlying-market-*, underlying-profile-* : tokenContractAddress=<NVDAB|SPCXB|QQQB>
  tokens-bstock : platformId=bstock (first 3 of 46 rows kept)   search-* : keyword=NVDA (trimmed to 2 rows) / keyword=<NVDAB address>
  platforms     : no params                                      candles-{1d,4h,1h} : tokenContractAddress=<NVDAB>, bar=<1d|4h|1h>, limit=5
  error-*       : recorded error responses as surfaced by Bw3Client (code/msg), not raw envelopes.
