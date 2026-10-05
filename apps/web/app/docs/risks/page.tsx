import { DocPage, L } from "@/components/docs/doc-page";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Risks" };

const limits: [string, React.ReactNode][] = [
  [`${BRAND.name} is not a guarantee.`, <>It holds unless prices gap more than about {BRAND.gapLimitPct}% before the vault can rebalance. It does not cap your loss at the gap between 100% and your floor. In our one-week windows the worst result (AIG, 15 Sep 2008, 90% floor) lost 24%. Past drops since 2018 in the tokenized names were smaller (worst: NVDA −19.3%; SPCX has only 76 days of history. See <L href="/docs/backtest#gaps">worst gaps</L>). A future drop could be larger. Single stocks have fallen 30% to 61% in a day (AIG 2008, Apple 2000), and no setting survives that. See <L href="/docs/evidence">Evidence</L>.</>],
  ["How often the floor was missed.", <>At a 90% floor, 0.44% of one-year windows (95% range 0.07% to 0.93%) ended more than 1 point below the floor; for one-month windows it was 0.09%. The S&amp;P 500 alone was never below it in 98 years. Daily closes only, and the history has survivorship bias (no delisted names), so the true rate is likely higher.</>],
  ["It can miss the recovery, for the rest of the term.", <>If value reaches the floor, the vault goes to USDT and stays there until the term ends. It cannot buy stocks again. That happened in 2.85% of one-year windows (0.17% of one-month windows) at a 90% floor. You can still exit at any time (<L href="/docs/how-it-works#cash-lock">cash lock</L>).</>],
  ["You give up upside.", <>The share of a gain you keep is roughly 4 × (100 − floor)%: about 40% at a 90% floor, 20% at 95%, 80% at 80%. In a typical year the vault returns far less than holding. See <L href="/docs/trade-off">The trade-off</L>.</>],
  ["Some stocks suit it badly.", "TSLA's choppy moves made the vault lose in a median year."],
  ["Weekends.", `${BRAND.name} does not trade on weekends. We assume the full weekend gap hits. Weekend trading cost is not measured yet.`],
  ["A sell can be delayed in a fast crash.", "Each sell must return at least the 10-minute average price minus a tolerance (0.3% on the aggregator route, 1% on the direct pool route), and spot must stay within about 3% of that average. In a fast fall, spot can drop below the average by more than that, so the sell reverts until spot and the average agree again. The keeper retries, and anyone can trigger a public rebalance after the public delay. Your value can fall below the floor in the meantime. We accepted this and did not widen the tolerance, because widening it would loosen the floor check."],
  ["A stock with no price history does not trigger a sell.", "If a held stock has no usable 10-minute average at all, the vault cannot value your position, so it does not make a de-risking sell of the other stocks. It fails closed. You can still exit in kind."],
  ["Thin pools can be manipulated.", `The price comes from a 10-minute average of a PancakeSwap v3 pool. A pool's liquidity is thin (NVDAB about $4.8M) and can be pushed around or drained. The contract has bounds, but not a guarantee. This is why launch caps are ${BRAND.launchCapPerPosition.toLocaleString("en-US")} USDT per position and ${BRAND.launchCapTotal.toLocaleString("en-US")} USDT in total.`],
  ["One caller can fill the launch cap.", `The ${BRAND.launchCapTotal.toLocaleString("en-US")} USDT total cap is shared by all users. A caller with that much USDT can open positions up to the cap and leave them open, so new deposits fail. It costs the caller gas and the use of the money, not the money itself, and the caller can exit at any time. The owner can raise the cap at any time with no redeploy, and the caller then needs more money to fill it again. This is a proposed acceptance, not yet signed (see Known open items).`],
  ["Public rebalances can be sandwiched.", "Anyone can call a public rebalance once the keeper has been idle. An attacker can trade around it and take value up to the slippage bound the vault allows (1% of the trade on the direct pool path, at most the per-asset trade cap). The keeper path acts first and the vault checks balances after every swap."],
  ["Public delay counts open-market time.", "The public path opens only after the keeper has been idle for the public delay in open-market seconds: nights, weekends, holidays and the time before the last unpause do not count. It counts from that stock's last trade (or the position start), not from the last call. The mainnet parameter is 3,600 seconds."],
  ["A disabled token's weight stays in USDT.", "If a token is disabled, the vault sells it and its share of the basket stays in USDT. It is not moved to the other stocks."],
  ["The token issuer has powers.", "bStocks have an issuer pause, a blocklist and a sanctions list, and the issuer's key can upgrade every bStock at once. The vault cannot prevent that. Exit in kind skips a paused token and moves the rest."],
  ["The audit is AI-assisted, not human.", "No human audit has been done. That is a reason for the small launch caps."],
];

const roles: [string, React.ReactNode, React.ReactNode][] = [
  ["Keeper", "Triggers rebalances: one swap per call, on any position, through a router on the allowlist, within bounds the vault checks itself (direction, size window, router, minimum out, minimum time between trades, market hours).", "Withdraw, set prices, pick a recipient, use a router that is not on the list, trade in the wrong direction or at the wrong size, or trade outside market hours. A bad keeper can trigger valid rebalances at bad timing or waste gas; each trade can cost up to 1% of its value (the direct-route tolerance), capped by the per-asset trade limit."],
  ["Guardian", "Stop things, not move money: pause or unpause, halt trading, set the holiday table, remove a router at once, disable an asset (positions then sell it), and approve a new bStock implementation.", "Move funds, add a router, or change a position. A pause or halt stops new positions and all rebalances, including de-risking sells, so a bad or hacked guardian could leave the floor undefended. It never stops exits. Disabling an asset forces a sale and costs you upside and fees."],
  ["Owner", "Admin of the factory: list assets, add routers (active only after 24 hours), add or remove keepers, change the guardian, change defaults for new positions, change the launch caps at any time with no redeploy (existing positions are unaffected), transfer ownership in two steps. It can also pause or halt.", "Touch any existing position, change its floor, term or weights, or move funds. Exits stay with the depositor."],
  ["You (position owner)", "Close the position, take your USDT out, or exit in kind (USDT plus any tokens that can still move), whenever you like, with no keeper and no market hours. Rescue a token that was skipped.", "Change the floor, term or weights after creation."],
];

export default function Page() {
  return (
    <DocPage slug="risks" lead={<p>What we don&apos;t claim, and who you have to trust.</p>}
      toc={[["limits", "What can go wrong"], ["roles", "Who can do what"]]}>
      <h2 id="limits" style={{ marginTop: 0 }}>What can go wrong</h2>
      <ul className="list" style={{ maxWidth: "none" }}>
        {limits.map(([h, b]) => (
          <li key={h}>
            <strong>{h}</strong>
            <span className="block max-w-[64ch]">{b}</span>
          </li>
        ))}
      </ul>
      <h2 id="roles">Who can do what</h2>
      <p>Floor has three trusted roles besides you. At launch the owner and the guardian are the same address, so the guardian gives no separation of duties; the owner is meant to be a hardware wallet (a multisig is not set up yet). None of them can take your funds, but they can stop trading or pick who may trade. This is read from the contracts: the factory and vault source, and the roles section of the contract design.</p>
      <ul className="list" style={{ maxWidth: "none" }}>
        {roles.map(([h, can, cannot]) => (
          <li key={h}>
            <strong>{h}</strong>
            <span className="block max-w-[64ch]"><em>Can:</em> {can}</span>
            <span className="block max-w-[64ch]"><em>Cannot:</em> {cannot}</span>
          </li>
        ))}
      </ul>
      <p>Router additions made after launch wait 24 hours. The first routers set at deploy are active at once, and a router the guardian removes can only come back through the same 24 hour wait.</p>
      <p>Not done or not decided yet: see <L href="/docs/open-items">Known open items</L>. Next: <L href="/docs/faq">FAQ</L>.</p>
    </DocPage>
  );
}
