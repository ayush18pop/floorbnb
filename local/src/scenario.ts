import { createWalletClient, encodeAbiParameters, http, keccak256, pad, parseAbi, parseUnits, type Address } from "viem";
import { ASSETS, PANCAKE_ROUTER, ROLE, RPC, USDT, acct, type AssetCfg } from "./env";
import { fund } from "./deploy";
import { chainNow, inWindow, warpTo } from "./time";
import { client, hex, rpc } from "./util";

const pool = parseAbi([
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint32,bool)",
  "function token0() view returns (address)",
]);
const erc20 = parseAbi(["function transfer(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)"]);
const router = parseAbi(["function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) returns (uint256)"]);
const Q96 = 2n ** 96n;

/** Pure: USDT price of the asset from the pool's sqrtPriceX96 (token ordering decides the direction). */
export function usdtPrice(sqrtX96: bigint, assetIsToken0: boolean): number {
  const r = Number(sqrtX96) / Number(Q96); const p = r * r; // token1 per token0
  return assetIsToken0 ? p : 1 / p;
}
/** Pure: the pool sqrtPrice that puts the asset price at `1 + pctChange/100` of now. */
export function targetSqrt(sqrtX96: bigint, assetIsToken0: boolean, pctChange: number): bigint {
  const f = Math.sqrt(1 + pctChange / 100); // sqrt of the asset price ratio
  const scaled = BigInt(Math.round((assetIsToken0 ? f : 1 / f) * 1e12));
  return (sqrtX96 * scaled) / 10n ** 12n;
}

async function spot(a: AssetCfg) {
  const [s, t0] = await Promise.all([
    client.readContract({ address: a.pool, abi: pool, functionName: "slot0" }),
    client.readContract({ address: a.pool, abi: pool, functionName: "token0" }),
  ]);
  const isT0 = t0.toLowerCase() === a.token.toLowerCase();
  return { sqrt: s[0], isT0, price: usdtPrice(s[0], isT0) };
}

/** bStocks use the OpenZeppelin ERC-7201 ERC20 storage: balances live at keccak(holder . base). */
const ERC20_BASE = "0x52c63247e1f47db19d5ce0460030c497f067ca4cebf71ba98eeadabe20bace00";
export async function setTokenBalance(token: Address, holder: Address, amount: bigint) {
  const slot = keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [holder, ERC20_BASE]));
  await rpc("anvil_setStorageAt", [token, slot, pad(hex(amount) as `0x${string}`, { size: 32 })]);
  const got = await client.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [holder] });
  if (got !== amount) throw new Error(`could not set the token balance (got ${got}); the storage layout differs`);
}
const trader = () => createWalletClient({ account: acct(ROLE.trader), transport: http(RPC), chain: undefined });
async function wait(hash: `0x${string}`) { const r = await client.waitForTransactionReceipt({ hash }); if (r.status !== "success") throw new Error(`tx reverted ${hash}`); return r; }

/** Move one pool's price by pctChange (negative = crash) with a price-limited swap. Returns before/after USDT prices. */
export async function movePrice(symbol: string, pctChange: number) {
  const a = ASSETS.find((x) => x.symbol === symbol.toUpperCase());
  if (!a) throw new Error(`unknown asset ${symbol}; use ${ASSETS.map((x) => x.symbol).join(", ")}`);
  const before = await spot(a);
  const limit = targetSqrt(before.sqrt, before.isT0, pctChange);
  const me = acct(ROLE.trader).address;
  const w = trader();
  const sellAsset = pctChange < 0;
  let tokenIn: Address; let tokenOut: Address; let amountIn: bigint;
  if (sellAsset) {
    // The fork has no free bStock supply and the pool holds too few tokens to move the price: write a large balance for the
    // trader straight into the token's storage (ERC-7201 ERC20 layout, verified on the fork), sell it through the real router,
    // then zero the leftover. Local fork only.
    tokenIn = a.token; tokenOut = USDT; amountIn = 5_000_000n * 10n ** 18n;
    await setTokenBalance(a.token, me, amountIn);
  } else {
    tokenIn = USDT; tokenOut = a.token; amountIn = parseUnits("3000000", 18);
    await fund(me, "3000000", "1000");
  }
  await wait(await w.writeContract({ address: tokenIn, abi: erc20, functionName: "approve", args: [PANCAKE_ROUTER, amountIn], chain: null }));
  const dl = BigInt((await chainNow()) + 3600);
  await wait(await w.writeContract({ address: PANCAKE_ROUTER, abi: router, functionName: "exactInputSingle", args: [{ tokenIn, tokenOut, fee: a.fee, recipient: me, deadline: dl, amountIn, amountOutMinimum: 0n, sqrtPriceLimitX96: limit } as never] as never, chain: null } as never));
  if (sellAsset) await setTokenBalance(a.token, me, 0n);
  const after = await spot(a);
  return { symbol: a.symbol, before: before.price, after: after.price, pct: (after.price / before.price - 1) * 100, wanted: pctChange };
}

/** Let the 10-minute TWAP follow the new spot price, and clear the vault's minInterval (900 s). */
export async function settleTwap(): Promise<number> {
  const t = await warpTo((await chainNow()) + 16 * 60);
  return t;
}

export async function scenario(kind: string, symbol?: string, pctArg?: string) {
  const pct = pctArg ? Number(pctArg) : kind === "gap" ? 20 : 15;
  if (!(pct > 0 && pct < 100)) throw new Error("percent must be between 0 and 100");
  let results: Awaited<ReturnType<typeof movePrice>>[];
  if (kind === "gap") {
    results = []; for (const a of ASSETS) results.push(await movePrice(a.symbol, -pct));
  } else if (kind === "crash" || kind === "rally") {
    if (!symbol) throw new Error(`usage: local:scenario ${kind} <NVDAB|SPCXB|QQQB> [pct=15]`);
    results = [await movePrice(symbol, kind === "crash" ? -pct : pct)];
  } else throw new Error("scenario: crash <SYM> [pct] | rally <SYM> [pct] | gap [pct=20]");
  for (const r of results) console.log(`${r.symbol}: ${r.before.toFixed(2)} -> ${r.after.toFixed(2)} USDT (${r.pct.toFixed(1)}%, wanted ${r.wanted}%)`);
  const t = await settleTwap();
  console.log(`advanced chain time 16 min so the 10-minute TWAP follows; chain time now ${new Date(t * 1000).toUTCString()}, window ${inWindow(t) ? "OPEN" : "CLOSED (use pnpm local:time window)"}`);
  console.log("The keeper loop acts within 60 s, or run: pnpm local:keeper once");
}
