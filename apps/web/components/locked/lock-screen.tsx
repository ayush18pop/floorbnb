import Link from "next/link";
import { Lock } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BRAND } from "@/lib/brand";
import "./lock-screen.css";

/** Static decorative mock of the builder. Not the real component: no wallet, no data, no RPC. Inert and hidden from assistive tech. */
function BuilderMock() {
  return (
    <div className="lk-mock" aria-hidden="true" inert>
      <div className="lk-mock-head"><span className="lk-mock-h">Set your floor</span><span className="label">New position</span></div>
      <div className="lk-mock-grid">
        <div className="lk-mock-col">
          <span className="label">Stocks</span>
          <div className="lk-row">{["NVDA", "TSLA", "AAPL"].map((s, i) => <span key={s} className={`lk-chip${i === 0 ? " on" : ""}`}>{s}</span>)}</div>
          <span className="label">Floor</span>
          <div className="lk-row">{["80%", "90%", "95%"].map((s, i) => <span key={s} className={`lk-chip${i === 1 ? " on" : ""}`}>{s}</span>)}</div>
          <span className="label">Term</span>
          <div className="lk-row">{["7 d", "14 d", "30 d"].map((s, i) => <span key={s} className={`lk-chip${i === 1 ? " on" : ""}`}>{s}</span>)}</div>
          <span className="label">Amount</span>
          <div className="lk-input">1,000 USDT</div>
          <div className="lk-cta">Review protection</div>
        </div>
        <div className="lk-mock-col lk-chartcol">
          <svg viewBox="0 0 400 220" preserveAspectRatio="none" className="lk-chart">
            <line x1="0" x2="400" y1="150" y2="150" stroke="var(--floor-line)" strokeWidth="2" />
            <polyline fill="none" stroke="var(--text-muted)" strokeWidth="2" points="0,40 60,60 120,50 180,110 240,90 300,170 360,140 400,150" />
            <polyline fill="none" stroke="var(--text)" strokeWidth="2" points="0,40 60,58 120,52 180,100 240,96 300,140 360,136 400,138" />
          </svg>
          <div className="lk-row"><span className="lk-stat">Floor value</span><span className="lk-stat">Upside kept</span><span className="lk-stat">Cost</span></div>
        </div>
      </div>
    </div>
  );
}

export function LockScreen() {
  return (
    <>
      <header className="lk-header">
        <Link href="/" aria-label={`${BRAND.name} home`} className="inline-flex items-center"><Logo height={30} /></Link>
        <ThemeToggle />
      </header>
      <main id="main" className="lk-stage">
        <BuilderMock />
        <div className="lk-veil" aria-hidden="true" />
        <section className="lk-card" aria-labelledby="lk-title">
          <span className="lk-icon" aria-hidden="true"><Lock size={20} strokeWidth={1.75} /></span>
          <p className="label">Locked until launch</p>
          <h1 id="lk-title" className="h2">The {BRAND.name} app opens at mainnet launch</h1>
          <p className="small">Spot-only protection for tokenized stocks on {BRAND.chain}. A floor that holds unless prices gap, not a guarantee. {BRAND.contractsStatus}.</p>
          <div className="lk-actions">
            <Link href="/try" className="btn btn-primary">Try the simulator</Link>
            <Link href="/docs" className="btn btn-secondary">Read the docs</Link>
          </div>
        </section>
      </main>
    </>
  );
}
