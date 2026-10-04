"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Xh } from "@/components/ui/xh";
import { useNow } from "@/lib/adapters/use";
import { fmt, isAddress, isoDate, nextWindow, stamp, dow } from "@/lib/adapters";
import { BRAND } from "@/lib/brand";
import { Addr, ExampleBadge } from "./ui";
import { termLabel, parseTermDays, termEndText } from "@/lib/floor-config";
import { FlowRail } from "./review";

export function Confirmed() {
  const sp = useSearchParams();
  const vault = sp.get("vault");
  const tx = sp.get("tx");
  const amount = Number(sp.get("amount")) || 0;
  const floor = Number(sp.get("floor")) || 0;
  const days = parseTermDays(sp.get("term"));
  const endTs = Number(sp.get("end")) || 0;
  const end = endTs > 0 ? isoDate(endTs) : null;
  const now = useNow();
  const win = now ? nextWindow(now) : null;
  return (
    <div className="grid lg:grid-cols-[200px_minmax(0,1fr)]">
      <FlowRail current={3} />
      <div className="min-w-0 lg:border-l lg:border-grid">
        <div className="relative m-4 border border-grid bg-surface md:m-6">
          <Xh style={{ left: 0, top: 0 }} /><Xh style={{ left: "100%", top: 0 }} /><Xh style={{ left: 0, top: "100%" }} /><Xh style={{ left: "100%", top: "100%" }} />
          <div className="p-4 md:p-8">
            <span className="badge b-pos">Confirmed</span>
            <h2 className="display mt-5">Your floor is set.</h2>
            <p className="body-l mt-4">Your vault holds <span className="mono text-ink">{fmt(amount)} USDT</span>. It buys your basket in the next trading window. Nothing is bought at deposit.</p>
          </div>
          <dl className="kv">
            <div className="contents"><dt>Vault</dt><dd className="flex flex-wrap items-center justify-between gap-2">{isAddress(vault) ? <Addr value={vault} /> : "n/a"}<ExampleBadge /></dd></div>
            <div className="contents"><dt>Transaction</dt><dd>{tx ? <Addr value={tx} kind="tx" /> : "n/a"}</dd></div>
            <div className="contents"><dt>Floor</dt><dd>{fmt(floor)} USDT</dd></div>
            <div className="contents"><dt>Term</dt><dd>{termLabel(days)}{end ? `, ends ${end}` : ""}</dd></div>
            <div className="contents"><dt>First rebalance</dt><dd>{win ? `${dow(win)} ${stamp(win).replace(" ", ", from ")} UTC` : "…"}</dd></div>
          </dl>
          <div className="btn-stack flex flex-col gap-4 border-t border-grid p-4 sm:flex-row sm:items-center md:p-6">
            <Link href={isAddress(vault) ? `/app/position?v=${vault}` : "/app/positions"} className="btn btn-primary">Open position</Link>
            <Link href="/app" className="btn btn-ghost">Set another floor →</Link>
          </div>
          <div className="h-[3px] bg-[var(--floor-line)]" aria-hidden="true" />
        </div>
        <p className="small px-4 pb-6 md:px-6">First rebalance is the next trading window ({BRAND.tradingWindow}). Holidays can move it.{end && <> {termEndText(end)}</>}</p>
      </div>
    </div>
  );
}
