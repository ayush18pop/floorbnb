import { DocPage, L } from "@/components/docs/doc-page";
import { BRAND } from "@/lib/brand";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/docs/open-items", "Known open items");

type Item = [item: string, status: string, note: React.ReactNode];

const open: Item[] = [
  ["Mainnet deployment", "Not done", <>The contracts are not on mainnet yet ({BRAND.contractsStatus.toLowerCase()}). The app is locked until the launch switch is flipped; these docs stay public.</>],
  ["Human audit", "Not done", "The audit so far is AI-assisted. No human auditor has reviewed the code. This is why launch caps are small."],
  ["Owner is not a multisig", "Open", "The owner is meant to be a hardware wallet. At launch the guardian is the same address as the owner, so it adds no separation. A multisig is not set up. The team lead has to confirm the setup in writing before mainnet."],
  ["Written acceptance by the team lead", "Open", "Six audit findings (below) were accepted by the manager on instruction. The team lead has to confirm or reverse them in writing before mainnet."],
  ["Audit run of 2026-10-05", "Proposed acceptance, not signed", "The latest AI-assisted run (Pashov Audit Group skills, not a formal audit) raised one finding and some unscored leads. The finding: one caller with 5,000 USDT can fill the shared total cap and block new deposits. It costs the caller gas and the use of the money. The owner can raise the cap with setLimits, with no redeploy. We propose to accept it for the hackathon launch with no contract change. The team lead has to confirm in writing."],
  ["b402 payments", "Partly verified live", "b402 (Binance's x402 on BSC) works through a Binance Web3 API key with the B402 Payments permission. The supported and verify calls have been run live and passed. Settle has not been run live yet. Until it is, the demo settles through our own self facilitator, which is the default in the code. We say which one is used."],
  ["Weekend trading cost", "Not measured", "The vault does not trade on weekends and the maths assumes the full weekend gap. The cost of the Monday rebalance is not measured."],
  ["Hourly backtest", "Not done", "The backtest rebalances once a day at the close. The contract trades in a 4 hour window. Only about two years of hourly data exist."],
  ["Survivorship in the history", "Known bias", "The long history has no delisted names, and uses daily closes only (no intraday or halt gaps). Real failure rates are likely a little higher."],
  ["Holiday table ends 31 Dec 2028", "Open", "The table covers NYSE closures through 31 Dec 2028 (checked 2026-10-04; early closes count as full closures). A 365-day term can no longer be created after about 18 Dec 2027 unless the guardian extends the table."],
  ["Name", "Open", "Floor clashes with floor.xyz and FloorDAO. Sill is the backup. The name lives in one constant."],
  ["Agentic Wallet keeper", "Optional, not set up", "An EOA keeper is the primary keeper. An Agentic Wallet is an optional second keeper. It is not set up."],
];

const accepted: Item[] = [
  ["Pool and TVL manipulation", "Accepted", "A pool's liquidity can be moved. Limits: launch caps of 1,000 USDT per position and 5,000 USDT in total, per-position vaults, and exit in kind always allowed."],
  ["Public rebalance sandwich", "Accepted", "Anyone can call the public rebalance after the keeper has been idle. It can be sandwiched within the 1% slippage bound. Limits: the 10-minute price bounds, balance checks after each swap, a minimum trade size, and the keeper acts first."],
  ["Permanent cash lock", "Accepted", "After the value falls to the floor the vault holds USDT until the term ends and cannot buy stocks again. Limits: the lock needs every price guard to pass, an open market, and value below the floor by a margin. The depositor can always exit."],
  ["Public delay semantics", "Accepted", "The public delay is counted in open-market seconds from that stock's last trade, and time before the last unpause or un-halt does not count."],
  ["Disabled token weight", "Accepted", "A disabled token is sold and its weight stays in USDT."],
  ["Delayed sell in a fast fall (F-04)", "Accepted", "A sell reverts while spot and the 10-minute average disagree by more than the tolerance. The tolerance is not widened because that would loosen the floor check."],
  ["No sell when a held stock has no price history", "Accepted", "The vault fails closed. You can exit in kind."],
  ["Trusted roles", "Accepted", <>Keeper, guardian and owner, with the limits on <L href="/docs/risks#roles">Risks</L>. Router additions wait 24 hours. The owner can change the launch caps at any time with no redeploy. At launch the owner and the guardian are the same address.</>],
];

function Table({ rows }: { rows: Item[] }) {
  return (
    <ul className="list" style={{ maxWidth: "none" }}>
      {rows.map(([h, status, note]) => (
        <li key={h}>
          <strong>{h}</strong> <span className="badge align-middle">{status}</span>
          <span className="block max-w-[64ch]">{note}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Page() {
  return (
    <DocPage
      slug="open-items"
      lead={<p>What is not done, not tested, or accepted as a known weakness. We keep this list short and plain.</p>}
      toc={[["open", "Not done"], ["accepted", "Accepted weaknesses"]]}
    >
      <h2 id="open" style={{ marginTop: 0 }}>Not done or not tested</h2>
      <Table rows={open} />
      <h2 id="accepted">Accepted weaknesses</h2>
      <p>These are known and left in place on purpose. Each one has a limit on the loss and is described on <L href="/docs/risks">Risks</L>.</p>
      <Table rows={accepted} />
      <p className="small">Last updated 2026-10-05. Backtest numbers are past data, not a prediction.</p>
    </DocPage>
  );
}
