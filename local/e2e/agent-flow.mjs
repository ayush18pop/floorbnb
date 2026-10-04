// Agent path, end to end, on your OWN anvil fork of BSC. Run: pnpm local:agent-demo
//
// An MCP client calls a paid tool -> HTTP 402 (x402 v2) -> signs an EIP-3009 authorization with a throwaway key ->
// retries with PAYMENT-SIGNATURE -> gets the data -> calls the free build_create_position_tx -> sends the tx on the fork ->
// checks a position exists. Floor's own SELF facilitator settles the payment on a local test token.
//
// It starts its OWN anvil (:19545), API (:19787) and MCP (:19788) and never touches the team stack (:8545/:8787/:8788/:3000).
// Override the ports with AGENT_ANVIL_PORT / AGENT_API_PORT / AGENT_MCP_PORT. Keys: anvil's public dev mnemonic (derived at run
// time, never stored) for the roles and the facilitator gas account; the paying agent is a fresh random key each run.
// Nothing here is a real secret and nothing is sent to a real network. The payee is a local dev address, not the team's wallet.
//
// Fork URL: BSC_FORK_RPC_URL (env only, never printed) or LOCAL_FORK_RPC, else public archive endpoints (see local/README.md).
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, openSync } from "node:fs";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, decodeFunctionData, formatUnits, http, parseAbi, parseEther, parseUnits, toHex } from "viem";
import { generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from "viem/accounts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const WORK = resolve(ROOT, "local/.work/agent");
const LOGS = resolve(ROOT, "local/logs");
const P = { anvil: Number(process.env.AGENT_ANVIL_PORT ?? 19545), api: Number(process.env.AGENT_API_PORT ?? 19787), mcp: Number(process.env.AGENT_MCP_PORT ?? 19788) };
const RPC = `http://127.0.0.1:${P.anvil}`;
const API = `http://127.0.0.1:${P.api}`;
const MCP = `http://127.0.0.1:${P.mcp}/mcp`;
const CHAIN_ID = 31337;
const NETWORK = `eip155:${CHAIN_ID}`;
const FORK_RPCS = ["https://bsc-mainnet.public.blastapi.io", "https://bnb.api.onfinality.io/public"];
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const USDT_WHALE = "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3"; // impersonated on the fork only
const MNEMONIC = "test test test test test test test test test test test junk"; // anvil's public mnemonic
const dev = (i) => mnemonicToAccount(MNEMONIC, { addressIndex: i });
const devKey = (i) => "0x" + Buffer.from(dev(i).getHdKey().privateKey).toString("hex");
const ROLE = { deployer: 0, owner: 1, guardian: 2, user: 4, facilitator: 7, payee: 8 };

// Prices differ per tool on purpose: proves price is configuration, and the payee balance check is then exact.
const PRICES = { quote_protection: "0.01", backtest: "0.02", simulate_gap: "0.03" };
const TOKEN = { name: "Test USD", symbol: "TUSD", version: "1", decimals: 6 };

const t0 = Date.now();
const say = (s = "") => console.log(s);
const step = (s) => say(`\n[${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s] ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => { throw new Error(m); };
const check = (cond, m) => { if (!cond) fail(m); say(`      ok  ${m}`); };

const children = [];
function cleanup() {
  for (const c of children.splice(0)) { try { process.kill(-c.pid, "SIGTERM"); } catch { /* gone */ } }
}
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { cleanup(); process.exit(130); });

function portFree(port) {
  return new Promise((ok) => {
    const s = net.createServer().once("error", () => ok(false)).once("listening", () => s.close(() => ok(true))).listen(port, "127.0.0.1");
  });
}
async function waitFor(what, fn, sec) {
  const t = Date.now();
  while (Date.now() - t < sec * 1000) { try { if (await fn()) return; } catch { /* retry */ } await sleep(500); }
  fail(`timeout waiting for ${what} (see local/logs/agent-*.log)`);
}
function start(name, cmd, args, opts) {
  mkdirSync(LOGS, { recursive: true });
  const out = openSync(resolve(LOGS, `agent-${name}.log`), "w");
  const c = spawn(cmd, args, { ...opts, detached: true, stdio: ["ignore", out, out] });
  c.on("exit", (code) => { if (code && !c.killed && !cleaning) console.error(`      ! ${name} exited with code ${code}`); });
  children.push(c);
  return c;
}
let cleaning = false;

const rpcCall = async (method, params = []) => {
  const r = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
  if (r.error) fail(`${method}: ${r.error.message}`);
  return r.result;
};
const pub = createPublicClient({ transport: http(RPC) });
const wallet = (account) => createWalletClient({ account, transport: http(RPC, { timeout: 180_000 }), chain: undefined });
const forge = (cwd, args, env = {}) => execFileSync("forge", args, { cwd, env: { ...process.env, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });
async function send(account, tx) {
  const hash = await wallet(account).sendTransaction({ ...tx, chain: null });
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") fail(`tx reverted: ${hash}`);
  return rc;
}
async function write(account, p) {
  const hash = await wallet(account).writeContract({ ...p, chain: null });
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") fail(`${p.functionName} reverted: ${hash}`);
  return rc;
}

// ---------------------------------------------------------------- local contracts + test token
const TEST_USD = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
/// LOCAL TEST TOKEN for the x402 demo. EIP-3009 transferWithAuthorization (v,r,s overload), open mint. Never deploy anywhere real.
contract TestUSD {
    string public constant name = "${TOKEN.name}";
    string public constant version = "${TOKEN.version}";
    string public constant symbol = "${TOKEN.symbol}";
    uint8 public constant decimals = ${TOKEN.decimals};
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;
    bytes32 constant TYPEHASH = keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"), keccak256(bytes(name)), keccak256(bytes(version)), block.chainid, address(this)));
    }
    function mint(address to, uint256 v) external { balanceOf[to] += v; }
    function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external {
        require(block.timestamp > validAfter, "not yet valid");
        require(block.timestamp < validBefore, "expired");
        require(!authorizationState[from][nonce], "nonce used");
        bytes32 digest = keccak256(abi.encodePacked("\\x19\\x01", DOMAIN_SEPARATOR(), keccak256(abi.encode(TYPEHASH, from, to, value, validAfter, validBefore, nonce))));
        address who = ecrecover(digest, v, r, s);
        require(who != address(0) && who == from, "bad signature");
        authorizationState[from][nonce] = true;
        balanceOf[from] -= value;
        balanceOf[to] += value;
    }
}
`;

async function deployToken() {
  const dir = resolve(WORK, "token");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(resolve(dir, "src"), { recursive: true });
  writeFileSync(resolve(dir, "foundry.toml"), `[profile.default]\nsrc = "src"\nout = "out"\nsolc = "0.8.28"\nevm_version = "paris"\nbytecode_hash = "none"\n`);
  writeFileSync(resolve(dir, "src/TestUSD.sol"), TEST_USD);
  forge(dir, ["build", "--root", dir]);
  const art = JSON.parse(readFileSync(resolve(dir, "out/TestUSD.sol/TestUSD.json"), "utf8"));
  const hash = await wallet(dev(ROLE.deployer)).deployContract({ abi: art.abi, bytecode: art.bytecode.object, chain: null });
  const rc = await pub.waitForTransactionReceipt({ hash });
  return { address: rc.contractAddress, abi: art.abi };
}

/** Same scratch-project trick as local/src/deploy.ts (audited scripts, direct router only), on this run's own RPC. packages/contracts is not touched. */
async function deployFloor() {
  const C = resolve(ROOT, "packages/contracts");
  const WC = resolve(WORK, "contracts");
  rmSync(WC, { recursive: true, force: true });
  mkdirSync(resolve(WC, "script/params"), { recursive: true });
  mkdirSync(resolve(WC, "deployments"), { recursive: true });
  for (const f of ["foundry.toml", "remappings.txt"]) cpSync(resolve(C, f), resolve(WC, f));
  for (const d of ["src", "lib", "holidays"]) symlinkSync(resolve(C, d), resolve(WC, d));
  for (const s of ["Deploy.s.sol", "SetHolidays.s.sol"]) symlinkSync(resolve(C, "script", s), resolve(WC, "script", s));
  const p = JSON.parse(readFileSync(resolve(C, "script/params/31337.json"), "utf8"));
  p.routerTargets = [p.v3SwapRouter];
  p.routerApproveTargets = [p.v3SwapRouter];
  writeFileSync(resolve(WC, "script/params/31337.json"), JSON.stringify(p, null, 2));
  for (const i of Object.values(ROLE)) await rpcCall("anvil_setBalance", [dev(i).address, toHex(parseEther("1000"))]);
  forge(WC, ["script", "script/Deploy.s.sol", "--rpc-url", RPC, "--private-key", devKey(ROLE.deployer), "--broadcast", "--slow"], { FLOOR_WRITE_DEPLOYMENT: "true" });
  const d = JSON.parse(readFileSync(resolve(WC, "deployments/31337.json"), "utf8"));
  const factory = d.FloorFactory;
  const abi = parseAbi([
    "function acceptOwnership()",
    "function setDefaults((uint16 sellBandBps,uint16 buyBandBps,uint32 minInterval,uint32 publicDelay,uint32 twapWindow,uint16 maxTickDev,uint16 tolAggBps,uint16 tolDirectBps,uint256 minTrade,uint256 dust))",
    "function positionsCount() view returns (uint256)",
  ]);
  await write(dev(ROLE.owner), { address: factory, abi, functionName: "acceptOwnership" });
  await write(dev(ROLE.owner), {
    address: factory, abi, functionName: "setDefaults",
    args: [{ sellBandBps: 100, buyBandBps: 200, minInterval: 900, publicDelay: 14400, twapWindow: 600, maxTickDev: 300, tolAggBps: 30, tolDirectBps: 100, minTrade: parseUnits("6", 18), dust: parseUnits("1", 18) }],
  });
  forge(WC, ["script", "script/SetHolidays.s.sol", "--rpc-url", RPC, "--private-key", devKey(ROLE.guardian), "--broadcast"], { FLOOR_FACTORY: factory });
  return { factory, lens: d.FloorLens, deployBlock: d.block, abi };
}

// ---------------------------------------------------------------- MCP client (plain JSON-RPC over HTTP, stateless server)
let rpcId = 1;
async function mcpCall(name, args, headers = {}) {
  const res = await fetch(MCP, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method: "tools/call", params: { name, arguments: args } }),
  });
  const json = await res.json();
  return { status: res.status, headers: res.headers, result: json.result, error: json.error };
}
const b64 = { enc: (o) => Buffer.from(JSON.stringify(o)).toString("base64"), dec: (s) => JSON.parse(Buffer.from(s, "base64").toString("utf8")) };

/** EIP-3009 TransferWithAuthorization, x402 v2 "exact" payload. */
async function signPayment(account, accepted, chainNow) {
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const auth = { from: account.address, to: accepted.payTo, value: accepted.amount, validAfter: "0", validBefore: String(Math.max(chainNow, Math.floor(Date.now() / 1000)) + 600), nonce };
  const signature = await account.signTypedData({
    domain: { name: accepted.extra.name, version: accepted.extra.version, chainId: Number(accepted.network.split(":")[1]), verifyingContract: accepted.asset },
    types: { TransferWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    ] },
    primaryType: "TransferWithAuthorization",
    message: { from: auth.from, to: auth.to, value: BigInt(auth.value), validAfter: 0n, validBefore: BigInt(auth.validBefore), nonce },
  });
  return { x402Version: 2, accepted, payload: { signature, authorization: auth } };
}

// ---------------------------------------------------------------- main
async function main() {
  for (const [n, port] of Object.entries(P)) if (!(await portFree(port))) fail(`port ${port} (${n}) is busy: set AGENT_${n.toUpperCase()}_PORT to another port. This demo never reuses the team stack.`);
  for (const bin of ["anvil", "forge"]) { try { execFileSync(bin, ["--version"], { stdio: "ignore" }); } catch { fail(`${bin} not found: install Foundry (https://getfoundry.sh)`); } }
  mkdirSync(WORK, { recursive: true });

  step(`anvil fork of BSC on :${P.anvil} (own instance, chain ${CHAIN_ID})`);
  const fromEnv = process.env.BSC_FORK_RPC_URL || process.env.LOCAL_FORK_RPC;
  let forked = false;
  for (const f of fromEnv ? [fromEnv] : FORK_RPCS) {
    start("anvil", "anvil", ["--fork-url", f, "--port", String(P.anvil), "--chain-id", String(CHAIN_ID), "--retries", "8", "--timeout", "120000", "--no-rate-limit", "--silent"], { cwd: ROOT });
    try { await waitFor("anvil", async () => (await rpcCall("eth_chainId")) === "0x7a69", 90); forked = true; break; } catch { cleanup(); await sleep(500); }
  }
  if (!forked) fail("anvil could not fork a BSC RPC. Set BSC_FORK_RPC_URL to an archive-capable endpoint.");
  say(`      fork block ${BigInt(await rpcCall("eth_blockNumber"))}`);

  step("deploy Floor contracts (audited scripts, direct router) and a local EIP-3009 test token");
  const floor = await deployFloor();
  const token = await deployToken();
  say(`      factory ${floor.factory}`);
  say(`      test token ${TOKEN.symbol} ${token.address} (${TOKEN.decimals} decimals)`);

  // The paying agent: a fresh throwaway key, funded with 1 TUSD of test money. It holds no BNB: the self facilitator pays gas.
  const agent = privateKeyToAccount(generatePrivateKey());
  const payTo = dev(ROLE.payee).address;
  await write(dev(ROLE.deployer), { address: token.address, abi: token.abi, functionName: "mint", args: [agent.address, parseUnits("1", TOKEN.decimals)] });
  // The position owner: demo user with 200 USDT (impersonated whale on the fork) and BNB for gas.
  const user = dev(ROLE.user);
  await rpcCall("anvil_impersonateAccount", [USDT_WHALE]);
  await rpcCall("anvil_setBalance", [USDT_WHALE, toHex(parseEther("100"))]);
  await wallet(USDT_WHALE).writeContract({ address: USDT, abi: parseAbi(["function transfer(address,uint256) returns (bool)"]), functionName: "transfer", args: [user.address, parseUnits("200", 18)], chain: null }).then((h) => pub.waitForTransactionReceipt({ hash: h }));
  await rpcCall("anvil_stopImpersonatingAccount", [USDT_WHALE]);
  await rpcCall("anvil_setBalance", [user.address, toHex(parseEther("10"))]);

  step(`start API :${P.api} and MCP :${P.mcp} (paid tools: self facilitator, HTTP 402 on)`);
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(BSC_FORK_RPC_URL|LOCAL_FORK_RPC|X402_|SELF_FACILITATOR_KEY|B402_|PRICE_|PORT$|MCP_)/.test(k)));
  start("api", "pnpm", ["exec", "tsx", "src/server.ts"], {
    cwd: resolve(ROOT, "apps/api"),
    env: { ...clean, FLOOR_CHAIN_ID: String(CHAIN_ID), FLOOR_FACTORY: floor.factory, FLOOR_LENS: floor.lens, FLOOR_RPC_URL: RPC, FLOOR_RUNS_FROM_BLOCK: String(floor.deployBlock), PORT: String(P.api) },
  });
  await waitFor("api", async () => (await fetch(`${API}/healthz`)).ok, 60);
  const mcpEnv = {
    ...clean,
    API_BASE_URL: API, MCP_PORT: String(P.mcp), MCP_HTTP_402: "1", MCP_PUBLIC_URL: MCP,
    X402_FACILITATOR: "self", SELF_FACILITATOR_KEY: devKey(ROLE.facilitator), // anvil dev key, this run only, never written to a file
    X402_NETWORK: NETWORK, X402_RPC_URL: RPC, X402_PAYTO: payTo,
    X402_ASSET: token.address, X402_ASSET_NAME: TOKEN.name, X402_ASSET_VERSION: TOKEN.version, X402_ASSET_SYMBOL: TOKEN.symbol, X402_ASSET_DECIMALS: String(TOKEN.decimals),
    PRICE_QUOTE_PROTECTION_USD: PRICES.quote_protection, PRICE_BACKTEST_USD: PRICES.backtest, PRICE_SIMULATE_GAP_USD: PRICES.simulate_gap,
  };
  start("mcp", "pnpm", ["exec", "tsx", "src/server.ts"], { cwd: resolve(ROOT, "apps/mcp"), env: mcpEnv });
  await waitFor("mcp", async () => (await fetch(`http://127.0.0.1:${P.mcp}/healthz`)).ok, 60);
  const health = await (await fetch(`http://127.0.0.1:${P.mcp}/healthz`)).json();
  check(health.paidToolsEnabled && health.facilitator === "self", `MCP up, paid tools on, facilitator=${health.facilitator}`);

  const balance = (who) => pub.readContract({ address: token.address, abi: token.abi, functionName: "balanceOf", args: [who] });
  const chainNow = async () => Number((await pub.getBlock()).timestamp);
  const agentStart = await balance(agent.address);
  let spent = 0n;

  const paidArgs = {
    quote_protection: { depositUsdt: "1000", floorBps: 9000 },
    backtest: { basket: "NVDA" },
    simulate_gap: { depositUsdt: "1000", floorBps: 9000, gapBps: 3000 },
  };

  step("paid tools: 402 -> sign EIP-3009 -> PAYMENT-SIGNATURE -> data");
  say(`      agent ${agent.address} (throwaway), payTo ${payTo}, balance ${formatUnits(agentStart, TOKEN.decimals)} ${TOKEN.symbol}`);
  const answers = {};
  for (const tool of Object.keys(PRICES)) {
    const first = await mcpCall(tool, paidArgs[tool]);
    check(first.status === 402, `${tool}: unpaid call -> HTTP ${first.status} (402 expected)`);
    const body = first.result.structuredContent;
    const required = b64.dec(first.headers.get("payment-required"));
    check(required.x402Version === 2 && JSON.stringify(required.accepts) === JSON.stringify(body.accepts), `${tool}: PAYMENT-REQUIRED header matches the body, x402Version 2`);
    const acc = body.accepts[0];
    const want = parseUnits(PRICES[tool], TOKEN.decimals).toString();
    check(acc.amount === want && acc.payTo.toLowerCase() === payTo.toLowerCase() && acc.asset.toLowerCase() === token.address.toLowerCase() && acc.network === NETWORK,
      `${tool}: asks ${body.payment.priceUsd} USD = ${acc.amount} atomic ${body.payment.options[0].symbol} (${acc.asset.slice(0, 10)}...) to ${acc.payTo.slice(0, 10)}... on ${acc.network}`);
    check(!JSON.stringify(first.result).match(/floorValue|worstWindow|valueAfterUsdt/), `${tool}: the 402 carries no paid data`);

    const payment = await signPayment(agent, acc, await chainNow());
    const paid = await mcpCall(tool, paidArgs[tool], { "payment-signature": b64.enc(payment) });
    check(paid.status === 200 && !paid.result.isError, `${tool}: retry with PAYMENT-SIGNATURE -> HTTP ${paid.status}`);
    const settle = b64.dec(paid.headers.get("payment-response"));
    check(settle.success === true && /^0x[0-9a-f]{64}$/.test(settle.transaction), `${tool}: settled on chain, tx ${settle.transaction.slice(0, 14)}...`);
    const r = await pub.getTransactionReceipt({ hash: settle.transaction });
    check(r.status === "success" && r.from.toLowerCase() === dev(ROLE.facilitator).address.toLowerCase(), `${tool}: gas paid by the facilitator, not the agent`);
    spent += BigInt(want);
    answers[tool] = paid.result.structuredContent;
    // replay of the same signature must not pay again nor return data
    const replay = await mcpCall(tool, paidArgs[tool], { "payment-signature": b64.enc(payment) });
    check(replay.status === 402 && /^(payment_already_used|nonce_already_used)$/.test(replay.result.structuredContent.error) && !JSON.stringify(replay.result).match(/floorValue|worstWindow|valueAfterUsdt/), `${tool}: replaying the same payment -> 402 ${replay.result.structuredContent.error}, no data`);
  }
  const q = answers.quote_protection;
  check(q.quote.floorValue === "900000000000000000000" && q.quote.startingExposure === "400000000000000000000", `quote_protection: 1000 USDT, floor 90% -> floor ${q.asUsdt.floor}, stock exposure ${q.asUsdt.startingExposure}, cash ${q.asUsdt.startingCash}`);
  check(answers.simulate_gap.valueAfterUsdt === "880" && answers.simulate_gap.belowFloor === true, `simulate_gap: 30% gap -> value ${answers.simulate_gap.valueAfterUsdt}, below floor by ${answers.simulate_gap.shortfallUsdt}`);
  check(answers.backtest.stored?.basket === "NVDA", `backtest: stored NVDA results (breach ${answers.backtest.stored.breach_pct}%, worst ${answers.backtest.stored.worst_pct}%)`);
  check((await balance(agent.address)) === agentStart - spent && (await balance(payTo)) === spent, `balances: agent paid ${formatUnits(spent, TOKEN.decimals)} ${TOKEN.symbol} in total, payTo received exactly that`);

  step("settlement failure never returns paid data");
  // verify passes (read-only) but the facilitator cannot pay gas: the settle step fails.
  const fac = dev(ROLE.facilitator).address;
  const gasBefore = await rpcCall("eth_getBalance", [fac, "latest"]);
  const beforeFail = await balance(agent.address);
  const first = await mcpCall("quote_protection", paidArgs.quote_protection);
  const sigFail = await signPayment(agent, first.result.structuredContent.accepts[0], await chainNow());
  await rpcCall("anvil_setBalance", [fac, "0x0"]);
  const bad = await mcpCall("quote_protection", paidArgs.quote_protection, { "payment-signature": b64.enc(sigFail) });
  await rpcCall("anvil_setBalance", [fac, gasBefore]);
  check(bad.status === 402 && bad.result.isError && /^settle/.test(bad.result.structuredContent.error), `settle fails (facilitator has no gas) -> HTTP ${bad.status}, error "${bad.result.structuredContent.error.slice(0, 40)}..."`);
  check(!JSON.stringify(bad.result).match(/floorValue|startingExposure|gapTolerance/) && (await balance(agent.address)) === beforeFail, "no quote in the response, and the agent was not charged");
  const again = await mcpCall("quote_protection", paidArgs.quote_protection, { "payment-signature": b64.enc(sigFail) });
  check(again.status === 200 && again.result.structuredContent.quote.floorValue === "900000000000000000000", "same authorization retried after the facilitator is funded again -> paid once, data returned");
  spent += parseUnits(PRICES.quote_protection, TOKEN.decimals);
  check((await balance(payTo)) === spent, `payTo total ${formatUnits(spent, TOKEN.decimals)} ${TOKEN.symbol}: one charge for the failed-then-retried call`);

  step("free tools: build_create_position_tx, then the owner sends it on the fork");
  const info = (await mcpCall("get_floor_info", {})).result.structuredContent;
  const asset = info.assets.find((a) => a.active !== false) ?? info.assets[0];
  check(info.factory.toLowerCase() === floor.factory.toLowerCase(), `get_floor_info: factory ${info.factory.slice(0, 10)}..., ${info.assets.length} assets, first ${asset.symbol ?? asset.address}`);
  const amount = parseUnits("55", 18);
  const build = await mcpCall("build_create_position_tx", { owner: user.address, amount: amount.toString(), floorBps: 9000, termSeconds: 31_536_000, assets: [asset.address], weightsBps: [10000] });
  check(!build.result.isError && build.result.structuredContent.txs.length === 2, "build_create_position_tx: 2 unsigned txs (approve USDT, createPosition), nothing signed by Floor");
  const [approve, create] = build.result.structuredContent.txs;
  check(approve.to.toLowerCase() === USDT.toLowerCase() && create.to.toLowerCase() === floor.factory.toLowerCase(), "every `to` is USDT or the factory (the guard Floor applies)");
  const count0 = await pub.readContract({ address: floor.factory, abi: floor.abi, functionName: "positionsCount" });
  for (const [label, tx] of [["approve", approve], ["createPosition", create]]) {
    const rc = await send(user, { to: tx.to, data: tx.data, value: BigInt(tx.value ?? 0) });
    say(`      sent ${label}: block ${rc.blockNumber}, gas ${rc.gasUsed}`);
  }
  const count1 = await pub.readContract({ address: floor.factory, abi: floor.abi, functionName: "positionsCount" });
  check(count1 === count0 + 1n, `factory.positionsCount ${count0} -> ${count1}`);
  const status = (await mcpCall("get_status", { owner: user.address })).result.structuredContent;
  const positions = status.result.positions ?? status.result;
  check(Array.isArray(positions) && positions.length === 1, `get_status(owner): position exists, vault ${positions[0]?.vault ?? positions[0]?.address ?? "?"}`);
  void decodeFunctionData;

  say("\nAGENT FLOW OK: paid tools settled with the self facilitator (not b402), position created on the local fork.");
}

let code = 0;
try { await main(); } catch (e) { code = 1; console.error(`\nAGENT FLOW FAILED: ${e instanceof Error ? e.message : e}`); if (process.env.DEBUG) console.error(e); }
cleaning = true;
cleanup();
process.exit(code);
void existsSync;
