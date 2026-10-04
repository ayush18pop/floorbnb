"use client";
import Link from "next/link";
import { useAccount, useSwitchChain } from "wagmi";
import { appChain } from "@/lib/wagmi";
import { BRAND } from "@/lib/brand";
import { Notice } from "./ui";
import { Xh } from "@/components/ui/xh";

export function EmptyPositions() {
  return (
    <div className="relative mx-4 my-8 flex flex-col items-center border border-dashed border-grid-strong px-6 py-14 text-center md:mx-6">
      <Xh style={{ left: "50%", top: 0 }} />
      <p className="h2">No floors yet</p>
      <p className="body mt-2">Set one in under a minute.</p>
      <Link href="/app" className="btn btn-primary mt-6">Set your floor</Link>
    </div>
  );
}

/** Reusable error and info states (E01). Each is also shown on /app/states. */
export function WrongNetwork({ name = "Ethereum" }: { name?: string }) {
  const { switchChain } = useSwitchChain();
  return <Notice kind="warn" title={`Your wallet is on ${name}.`} action={<button type="button" className="btn btn-secondary" onClick={() => switchChain({ chainId: appChain.id })}>Switch to {BRAND.chain}</button>}>{BRAND.name} runs on {BRAND.chain}.</Notice>;
}
export function NotEnoughUsdt({ have }: { have: string }) {
  return (
    <div>
      <div className="input-wrap"><input className="input" readOnly value="1,000.00" aria-invalid="true" aria-describedby="ne-msg" style={{ borderColor: "var(--negative)" }} /><span className="unit">USDT</span></div>
      <p id="ne-msg" className="small neg mt-2" role="alert">You have {have} USDT. Lower the amount or add USDT.</p>
    </div>
  );
}
export function OutsideWindow() {
  return <Notice kind="info">Rebalances run {BRAND.tradingWindow}. Your deposit is safe in the vault; the basket is bought in the next window.</Notice>;
}
export function PriceCheckFailed() {
  return <Notice kind="warn" title="Rebalance skipped" action={<Link href="/docs/how-it-works" className="prose-link">Why?</Link>}>The pool price moved more than the allowed band from its 10-minute average, so the vault did not trade. It tries again at the next run.</Notice>;
}
export function TokenPaused({ symbol = "SPCXB" }: { symbol?: string }) {
  return <Notice kind="neg" title={`The issuer paused ${symbol}.`}>Trades in {symbol} are stopped. You can still exit in kind.</Notice>;
}
export function NoWallet() {
  const { isConnected } = useAccount();
  return isConnected ? null : <Notice kind="info">Connect a wallet to continue.</Notice>;
}
