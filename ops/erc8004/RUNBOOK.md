# ERC-8004 registration runbook (A20)

Claim to use: "Floor's MCP server is discoverable through the ERC-8004 registry". Not a "Studio listing".

## Facts (checked 2026-10-04)
- Spec: https://eips.ethereum.org/EIPS/eip-8004 . Registration file `type` is `https://eips.ethereum.org/EIPS/eip-8004#registration-v1`; `register(string agentURI)` mints an ERC-721 agentId.
- Deployed on BSC (code verified with `cast code` on bsc-dataseed.binance.org and bsc-rpc.publicnode.com; testnet on publicnode). Addresses from https://github.com/erc-8004/erc-8004-contracts:
  - Mainnet IdentityRegistry 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 (reports AgentIdentity, version 2.0.0), ReputationRegistry 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
  - Testnet IdentityRegistry 0x8004A818BFB912233c491871b3d84c89A494BD9e, ReputationRegistry 0x8004B663056A597Dffe9eCcC1965A193B7388713
- Hackathon: ERC-8004 is optional, part of the BNB Agent Studio prize (CONTEXT.md). Not a core judging item.

## Cost
`register(string)` estimates 163,243 gas; at 0.05 gwei about 0.000008 BNB. Budget 0.001 BNB for the tx plus one `setAgentURI` update (same order). Use a fresh EOA funded with ~0.002 BNB, or a hardware wallet.

## Human provides
1. Owner address (receives the agent NFT; use the hardware wallet or fund-less-then-funded EOA).
2. Final public domain (web app and `mcp.<domain>`), live over HTTPS.
3. Approval at gate G7 (external publication).

## Steps
1. Replace `floor.ayush.works` in `apps/web/public/.well-known/agent-registration.json` (3 places), deploy the web app, and confirm `curl https://<domain>/.well-known/agent-registration.json` returns the JSON. Unlock note: the path is allowlisted in `apps/web/lib/launch.ts`.
2. Dry run: `FLOOR_DOMAIN=<domain> ops/erc8004/register.sh` (add `--testnet` to rehearse on chain 97 first).
3. Send: `ERC8004_CONFIRM_BROADCAST=yes ERC8004_SIGNER_ARGS="--ledger" FLOOR_DOMAIN=<domain> ops/erc8004/register.sh --broadcast`.
4. Read agentId from the `Registered` event, add `{"agentId": N, "agentRegistry": "eip155:56:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"}` to `registrations`, redeploy. Verify with `cast call <registry> 'tokenURI(uint256)(string)' N`.

## Unverified
- Exact `agentRegistry` string format and MCP `version` value come from the spec text read via fetch; recheck against the EIP before step 4.
- The script was dry-run only; no transaction has been sent.
