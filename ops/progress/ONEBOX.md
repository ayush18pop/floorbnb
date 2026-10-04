# ONEBOX

Done: apps/onebox (API + MCP + keeper loop in one process on $PORT), render.yaml now one free `floor-server` service, old three-service file at ops/deploy/render-three-services.yaml, docs/DEPLOY_RENDER.md, root script `pnpm onebox`.
Verified on an own anvil fork (offset 10000): combined /healthz, /v1/floor, MCP initialize + tools/list, keeper tick rebalanced a test position (buy 22 USDT of NVDAB), SIGTERM clean exit. RSS after a tick about 135 MB. 8 vitest tests.
Caveats: free tier sleeps after 15 min (keeper stops); use an external pinger; not production grade.
