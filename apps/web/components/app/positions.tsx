"use client";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ArrowRight } from "lucide-react";
import { getSource, daysLeft, fmtW, num, fmt, phaseOf, shortAddr } from "@/lib/adapters";
import { useAsync as useAsyncKey } from "@/lib/adapters/use";
import { Notice, Skeleton, ErrorBox, Tile, ExampleBadge } from "./ui";
import { PhaseBadges } from "./phase";
import { EmptyPositions } from "./states";
import { useConnectModal } from "./wallet";

export function Positions() {
  const { address } = useAccount();
  const modal = useConnectModal();
  const source = getSource();
  const needsWallet = source.kind === "chain" && !address;
  const { data, error, loading } = useAsyncKey(() => (needsWallet ? Promise.resolve([]) : source.listPositions(address)), `${address}`);
  if (needsWallet) return <div className="p-4 md:p-6"><Notice kind="info" title="Connect a wallet to see your positions." action={<button type="button" className="btn btn-primary" onClick={modal.open}>Connect wallet</button>}>Positions are read from BNB Chain for the connected address.</Notice></div>;
  if (loading) return <Skeleton lines={5} />;
  if (error) return <ErrorBox message={error} />;
  if (!data || data.length === 0) return <EmptyPositions />;
  const live = data.filter((p) => phaseOf(p) !== "closed");
  const totalV = live.reduce((a, p) => a + num(p.status.V), 0);
  const totalF = live.reduce((a, p) => a + num(p.status.floor), 0);
  return (
    <>
      <div className="tiles" style={{ ["--n" as string]: 4 }}>
        <Tile label="Total value" value={fmt(totalV)} unit="USDT" />
        <Tile label="Total floor" value={fmt(totalF)} unit="USDT" />
        <Tile label="Active" value={live.filter((p) => phaseOf(p) === "active").length} />
        <Tile label="Cash locked" value={live.filter((p) => phaseOf(p) === "cashLock").length} />
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <caption className="sr-only">Your positions</caption>
          <thead><tr><th scope="col">Vault</th><th scope="col">Basket</th><th scope="col" className="r">Deposit</th><th scope="col" className="r">Value</th><th scope="col" className="r">Floor</th><th scope="col" className="r">Cushion</th><th scope="col">State</th><th scope="col" className="r">Term left</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
          <tbody>
            {data.map((p) => {
              const closed = phaseOf(p) === "closed";
              return (
                <tr key={p.status.vault} className="trow">
                  <td className="mono"><Link href={`/app/position?v=${p.status.vault}`} className="!text-ink underline-offset-4 hover:underline">{shortAddr(p.status.vault)}</Link> <ExampleBadge className="ml-1" /></td>
                  <td className="mono whitespace-nowrap">{p.holdings.map((h) => h.symbol).join(" · ")}</td>
                  <td className="r">{fmtW(p.deposit)}</td><td className="r">{fmtW(p.status.V)}</td><td className="r">{fmtW(p.status.floor)}</td>
                  <td className="r">{closed ? "n/a" : fmtW(p.status.cushion)}</td>
                  <td><PhaseBadges p={p} /></td>
                  <td className="r">{closed ? "n/a" : `${daysLeft(p.maturity, p.asOf)} d`}</td>
                  <td><Link href={`/app/position?v=${p.status.vault}`} aria-label={`Open ${shortAddr(p.status.vault)}`} className="acc"><ArrowRight size={18} strokeWidth={1.5} /></Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
