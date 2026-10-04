# Raw DX note: llms.txt (manager session). Facts only; humans write the report.

- **Source:** the "Agent Native" docs page (pasted by the team lead on 2026-10-04/05) says to run `curl -s https://web3.binance.com/en/dev-docs/llms.txt` and `.../llms-full.txt`, and lists an MCP Server as "Coming soon".
- **Test, 2026-10-04 19:01 UTC, from the team's Linux machine, plain curl:** `HTTP/2 202`, `content-length: 0`, header `x-amzn-waf-action: challenge`, server CloudFront. Same result with a browser-style User-Agent for both `llms.txt` and `llms-full.txt` (202, 0 bytes). So the documented command returned no documentation to a script. (One machine, one network, one time; a browser may get through the challenge.)
- **Earlier, 2026-10-02 21:30 (dx/raw/A02.md):** an agent's WebFetch of the dev-docs overview also came back empty (AWS WAF challenge).
- **What we can say:** we did not use llms.txt to feed docs to an agent, because we did not know it existed until the team lead found the page, and the documented fetch does not work from a script in our test. We therefore also could not check whether llms-full.txt covers b402 (`clientId`, sign access token).
