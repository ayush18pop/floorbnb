"use client";
import Link from "next/link";
import { getSource, fmt, shortAddr, isoTime, isoDate } from "@/lib/adapters";
import { useAsync } from "@/lib/adapters/use";
import { PUBLIC_DELAY_HOURS } from "@/lib/app-config";
import { BRAND } from "@/lib/brand";
import { Xh } from "@/components/ui/xh";
import { Addr, ErrorBox, ExampleBadge, Skeleton, Tile } from "./ui";

const SIGNER = { keeper: ["Keeper wallet", "b-pos"], agentic: ["Agentic wallet", "b-warn"], public: ["Public caller", ""] } as const;

export function KeeperLog() {
  const s = getSource();
  const st = useAsync(() => s.keeperStatus(), "st");
  const runs = useAsync(() => s.keeperRuns(30), "runs");
  return (
    <>
      <div className="relative">
        <Xh style={{ left: 0, top: "100%" }} /><Xh style={{ left: "100%", top: "100%" }} />
        {st.error ? <ErrorBox message={st.error} /> : !st.data ? <Skeleton lines={1} /> : (
          <div className="tiles" style={{ ["--n" as string]: 5 }}>
            <Tile label="Keeper" value={<span className={`badge ${st.data.online ? "b-pos" : "b-neg"}`}>{st.data.online ? "Online" : "Offline"}</span>} />
            <Tile label="Last run" value={`${isoTime(st.data.lastRunTime)} UTC`} note={isoDate(st.data.lastRunTime)} />
            <Tile label="Trading window" tone={st.data.tradingOpen ? "pos" : "warn"} value={st.data.tradingOpen ? "Open" : "Closed"} note="Mon–Fri 15:30–19:30 UTC" />
            <Tile label="Rebalances today" value={st.data.rebalancesToday} note={s.kind === "mock" ? "example" : undefined} />
            <Tile label="Fallback" value={<span className="!block !whitespace-normal !font-sans !text-[15px] !leading-snug">Anyone can rebalance after {PUBLIC_DELAY_HOURS} h idle</span>} />
          </div>
        )}
      </div>
      {runs.loading ? <Skeleton lines={5} /> : runs.error ? <ErrorBox message={runs.error} /> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <caption className="sr-only">Recent keeper rebalances</caption>
            <thead><tr><th scope="col">Time (UTC)</th><th scope="col">Vault</th><th scope="col">Action</th><th scope="col" className="r">Amount</th><th scope="col" className="r">Min out</th><th scope="col" className="r">Received</th><th scope="col" className="r">Cost</th><th scope="col">Signed by</th><th scope="col">Tx</th></tr></thead>
            <tbody>
              {runs.data?.map((r, i) => (
                <tr key={i}>
                  <td className="mono whitespace-nowrap">{isoDate(r.time).slice(5)} {isoTime(r.time)}</td>
                  <td className="mono"><Link href={`/app/position?v=${r.vault}`} className="!text-ink underline-offset-4 hover:underline">{shortAddr(r.vault)}</Link></td>
                  <td className={`mono whitespace-nowrap ${r.buy ? "pos" : "neg"}`}>{r.cashLock ? "SELL ALL · CASH LOCK" : `${r.buy ? "BUY" : "SELL"} ${r.symbol}`}</td>
                  <td className="r">{fmt(r.amountIn)} {r.amountInUnit}</td>
                  <td className="r">{r.minOut !== undefined ? fmt(r.minOut) : "n/a"}</td>
                  <td className="r">{fmt(r.received)} {r.receivedUnit}</td>
                  <td className="r">{r.costBps !== undefined ? `${r.costBps.toFixed(1)} bps` : "n/a"}</td>
                  <td><span className={`badge ${SIGNER[r.signer][1]}`}>{SIGNER[r.signer][0]}</span></td>
                  <td><Addr value={r.tx} kind="tx" link /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-grid p-4 md:p-6">
        <p className="small">{s.kind === "mock" && <ExampleBadge className="mr-2" />}Keepers can only trigger trades the vault&apos;s rules allow. No keeper can withdraw user funds. Cost is an estimate from {BRAND.name}&apos;s quotes; the on-chain event does not log it. Amounts are stock units for a sell and USDT for a buy.</p>
      </div>
    </>
  );
}
