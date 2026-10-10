import { DocPage, L } from "@/components/docs/doc-page";
import { BRAND } from "@/lib/brand";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/docs/contracts", "Contracts");

export default function Page() {
  return (
    <DocPage
      slug="contracts"
      lead={<p>The on-chain design in plain words. Live on BNB Chain mainnet. AI-assisted reviews only, no formal audit.</p>}
      toc={[["vault", "One vault per position"], ["deposit", "Deposits"], ["price", "Price"], ["window", "Trading window"], ["roles", "Roles"], ["exits", "Exits"]]}
    >
      <h2 id="vault" style={{ marginTop: 0 }}>One vault per position</h2>
      <p>A factory contract creates one small vault contract for each position. Your USDT goes into that vault and nowhere else. One user&apos;s gap loss cannot touch another user&apos;s money. Your position id is the vault&apos;s address.</p>

      <h2 id="deposit">Deposits</h2>
      <p>You deposit USDT only, up to the launch caps: 1,000 USDT per position and 5,000 USDT in total across all users. The owner can change both caps at any time, with no redeploy; positions that already exist are not affected. You approve USDT to the factory, then create the position with an amount, a floor and a term. The app offers floors from 80% to 95% and terms from 30 days to 1 year. The contract accepts floors from 50% to 98% and terms from 7 to 400 days. There is no protocol fee in v1. You pay gas in BNB. The rule the vault follows is on <L href="/docs/how-it-works">How it works</L>.</p>

      <h2 id="price">Price</h2>
      <p>The vault reads a 10-minute time-weighted average price (TWAP) from the PancakeSwap v3 pool, on-chain. The keeper supplies no price. Each asset has a trade cap, with QQQB the lowest, so a small pool cannot be pushed around cheaply.</p>

      <h2 id="window">Trading window</h2>
      <p>The vault trades only Monday to Friday, 15:30 to 19:30 UTC. A guardian sets a holiday table and can halt trading. There is no keeper flag for &ldquo;market open&rdquo;. We checked this window against the backtest: see the <L href="/docs/backtest#trading-window">trading-window check</L>.</p>

      <h2 id="roles">Roles</h2>
      <ul className="list">
        <li><strong>Keeper.</strong> Calls rebalance, one swap per call, through allowlisted routers. The vault re-validates direction, size, router and minimum out. The keeper cannot withdraw or set prices. An EOA is the primary keeper. A Binance Agentic Wallet is an optional second keeper; it is not set up yet. See <L href="/docs/agents#keeper">Agents</L>.</li>
        <li><strong>Anyone.</strong> After the public delay (3,600 seconds of open-market time at launch, counted from that stock&apos;s last trade), anyone can call a public rebalance through the direct Pancake pool. It can be sandwiched within the 1% slippage bound.</li>
        <li><strong>Guardian.</strong> Can pause, halt trading, set holidays, remove a router, disable an asset and approve a new token implementation. It cannot move funds or add a router. A pause or halt stops rebalances and de-risking sells, never exits.</li>
        <li><strong>Owner (a single wallet; a multisig is not set up).</strong> Adds assets, adds routers (active after 24 hours), sets keepers and the guardian, sets defaults for new positions and the launch caps (at any time, with no redeploy; existing positions are unaffected). At launch the owner and the guardian are the same address, so the guardian adds no separation. Cannot touch any existing position or its funds. See <L href="/docs/risks#roles">Risks</L>.</li>
        <li><strong>You.</strong> Only you can exit your position.</li>
      </ul>

      <h2 id="exits">Exits</h2>
      <p>You can always leave. <code>exitInKind</code> is always allowed and sends you your USDT and any tokens that can still move, with no keeper, no factory and no market hours. It skips a token the issuer has paused. Or you can request a close, and the vault swaps everything to USDT and sends it to you. See <L href="/docs/risks">Risks</L> for issuer pause and blocklist cases.</p>
      <p>{BRAND.name} supports bStocks only in v1: NVDAB, SPCXB and QQQB. Next: <L href="/docs/risks">Risks</L>.</p>
    </DocPage>
  );
}
