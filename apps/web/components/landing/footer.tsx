import Link from "next/link";
import { Xh } from "@/components/ui/xh";
import { BRAND } from "@/lib/brand";

/* ---------- footer ---------- */
const cols: { h: string; links: [string, string][] }[] = [
  { h: "Product", links: [["How it works", "/docs/how-it-works"], ["Trade-off", "/docs/trade-off"], ["Backtest", "/docs/backtest"], ["Evidence", "/docs/evidence"], ["App", "/app"]] },
  { h: "Docs", links: [["Overview", "/docs"], ["Agents", "/docs/agents"], ["Contracts", "/docs/contracts"], ["FAQ", "/docs/faq"]] },
  { h: "Code", links: [["Contracts on BscScan", "https://bscscan.com/address/0x1147d482fD08DDd7F377838efb610B606B3Ad765"], ["GitHub", "https://github.com/ayush18pop/floorbnb"], ["Backtest scripts", "https://github.com/ayush18pop/floorbnb/tree/main/research/m_study"]] },
  { h: "Legal", links: [["Risks", "/docs/risks"], ["Terms (soon)", "#"], ["Privacy (soon)", "#"]] },
];
export function Footer() {
  return (
    <footer className="sec" aria-label="Footer">
      <Xh style={{ left: 0, top: 0 }} />
      <Xh style={{ left: "100%", top: 0 }} />
      <div className="cellgrid" style={{ borderTop: 0 }}>
        <div className="col-span-4 md:col-span-8 lg:col-span-4">
          <p className="h3">{BRAND.name}. {BRAND.tagline}</p>
        </div>
        {cols.map((c) => (
          <nav key={c.h} aria-label={c.h} className="col-span-2 md:col-span-2 lg:col-span-2">
            <p className="label mb-3 text-ink!">{c.h}</p>
            <ul className="space-y-2">
              {c.links.map(([t, h]) => (
                <li key={t}>{h === "#" ? <span className="small">{t}</span> : <Link href={h} className="navlink">{t}</Link>}</li>
              ))}
            </ul>
          </nav>
        ))}
        <div className="col-span-4 md:col-span-8 lg:col-span-12 bare">
          <p className="small mb-2 max-w-[96ch]">{BRAND.contractsStatus + ". Launch caps: " + BRAND.launchCapPerPosition.toLocaleString("en-US") + " USDT per position, " + BRAND.launchCapTotal.toLocaleString("en-US") + " USDT in total."}</p>
          <p className="small max-w-[96ch]">
            {BRAND.name} is a hackathon project built for BNB Hack: Tokenized Stocks Edition. Backtests use past prices and do not predict the future. Not financial advice. Tokenized stocks and smart contracts carry risk, including loss of the amount deposited. A token issuer can pause or block a token.
          </p>
        </div>
      </div>
    </footer>
  );
}
