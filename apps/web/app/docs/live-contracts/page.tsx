import { DocPage, L } from "@/components/docs/doc-page";
import { BRAND } from "@/lib/brand";
import { addrUrl, DEPLOY_BLOCK, MAINNET_FACTORY, MAINNET_LENS, MAINNET_VAULT_IMPL } from "@/lib/app-config";
import { AddrLink, BlockLink, TxLink } from "@/components/app/explorer-link";
import { DEPLOY_TXS, OWNERSHIP_ACCEPTED_TX } from "@/lib/deployment";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/docs/live-contracts", "Live contracts");

const OWNER = "0x762c9626711BCc882050cBf06Edd610fE8b91F1A";
const KEEPER = "0x46FD797AeBD0250A2E768022AD992DF21F12e58a";
const PAYEE = "0xF5f349ABe9647278AC3450058bc054886DaF816B";
const ROUTER = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
const RPC = "https://bsc-dataseed.bnbchain.org";

const contracts: [string, string, string][] = [
  ["FloorFactory", MAINNET_FACTORY, "Creates one vault per position. Holds the roles, the caps and the defaults."],
  ["FloorLens", MAINNET_LENS, "Read-only helper the app uses to show positions."],
  ["FloorVault implementation", MAINNET_VAULT_IMPL, "The code every position vault copies. Each position is its own small clone."],
];

const A = ({ a }: { a: string }) => <AddrLink address={a} example={false} full copy={false} />;

const cast = `export RPC=${RPC}
export FACTORY=${MAINNET_FACTORY}

cast call $FACTORY "owner()(address)" --rpc-url $RPC
cast call $FACTORY "guardian()(address)" --rpc-url $RPC
cast call $FACTORY "maxDeposit()(uint256)" --rpc-url $RPC
cast call $FACTORY "maxTotalTvl()(uint256)" --rpc-url $RPC
cast call $FACTORY "defaults()" --rpc-url $RPC
cast call $FACTORY "isKeeper(address)(bool)" ${KEEPER} --rpc-url $RPC`;

export default function Page() {
  return (
    <DocPage
      slug="live-contracts"
      lead={<p>{BRAND.name} is live on BNB Chain mainnet (chain 56). All three contracts are source-verified on BscScan. Check every number on this page yourself.</p>}
      toc={[["addresses", "Addresses"], ["roles", "Roles"], ["caps", "Caps"], ["verify", "Verify it yourself"], ["routers", "Routers"], ["review", "Review status"]]}
    >
      <h2 id="addresses" style={{ marginTop: 0 }}>Addresses</h2>
      <ul className="list">
        {contracts.map(([n, a, d]) => (
          <li key={n}><strong>{n}.</strong> <A a={a} /> <a className="prose-link" href={`${addrUrl(a)}#code`} target="_blank" rel="noopener noreferrer">Verified on BscScan</a>. {d}</li>
        ))}
        <li><strong>Deployed at block</strong> <BlockLink block={DEPLOY_BLOCK} example={false} />. The deployment file is <code>packages/contracts/deployments/56.json</code>.</li>
      </ul>

      <h3>Deployment transactions</h3>
      <ul className="list">
        {DEPLOY_TXS.map(([l, h]) => <li key={h}>{l}: <TxLink hash={h} example={false} copy={false} /></li>)}
        <li>Owner accepted ownership: <TxLink hash={OWNERSHIP_ACCEPTED_TX} example={false} copy={false} /></li>
      </ul>

      <h2 id="roles">Roles</h2>
      <ul className="list">
        <li><strong>Owner.</strong> <A a={OWNER} /></li>
        <li><strong>Guardian.</strong> <A a={OWNER} /> The same address as the owner, so it adds no separation of duties.</li>
        <li><strong>Keeper.</strong> <A a={KEEPER} /></li>
        <li><strong>Payee for paid API calls.</strong> <A a={PAYEE} /></li>
      </ul>
      <p>What each role can and cannot do is on <L href="/docs/risks#roles">Risks</L> and <L href="/docs/contracts#roles">Contracts</L>.</p>

      <h2 id="caps">Caps</h2>
      <p>Launch caps are {BRAND.launchCapPerPosition.toLocaleString("en-US")} USDT per position and {BRAND.launchCapTotal.toLocaleString("en-US")} USDT in total across all users. The owner can change them at any time with <code>setLimits</code>. Positions that already exist are not affected. The app and API ask for at least 5 USDT per position. The factory&apos;s own hard floor is 1 USDT.</p>

      <h2 id="verify">Verify it yourself</h2>
      <p>You need <code>cast</code> from Foundry. These are plain read calls. They cost nothing.</p>
      <pre className="code" tabIndex={0} aria-label="cast commands to read the factory">{cast}</pre>
      <p>The caps come back in 18-decimal units: <span className="mono">1000000000000000000000</span> is 1,000 USDT and <span className="mono">5000000000000000000000</span> is 5,000 USDT. <code>defaults()</code> returns the settings new positions start with.</p>

      <h2 id="routers">Routers</h2>
      <p>Only the direct PancakeSwap v3 router is allowed: <A a={ROUTER} />. No aggregator. A router added later waits 24 hours before it is active.</p>

      <h2 id="review">Review status</h2>
      <p>The contracts have not had a formal human audit. The reviews so far are AI-assisted only. That is why the launch caps are small. See <L href="/docs/open-items">Known open items</L> and <L href="/docs/risks">Risks</L>.</p>
    </DocPage>
  );
}
