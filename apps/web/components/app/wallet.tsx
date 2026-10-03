"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAccount, useConnect, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { bsc } from "wagmi/chains";
import { Bot, Link2, Wallet, Fingerprint } from "lucide-react";
import { Dialog, Notice } from "./ui";
import { REOWN_PROJECT_ID } from "@/lib/app-config";
import { shortAddr } from "@/lib/adapters/format";
import { BRAND } from "@/lib/brand";

const Ctx = createContext<{ open: () => void }>({ open: () => {} });
export const useConnectModal = () => useContext(Ctx);

export function WalletUiProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Ctx.Provider value={{ open: () => setOpen(true) }}>
      {children}
      <ConnectModal open={open} onClose={() => setOpen(false)} />
    </Ctx.Provider>
  );
}

/** Header button: "Connect wallet" or the connected address. Never shows a balance it did not read. */
export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const modal = useConnectModal();
  if (isConnected && address) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="badge b-pos" title={address}><span aria-hidden="true" className="mr-2 inline-block h-2 w-2 bg-current" />{shortAddr(address)}</span>
        <button type="button" className="small underline underline-offset-4 hover:text-ink" onClick={() => disconnect()}>Disconnect</button>
      </span>
    );
  }
  return <button type="button" className="btn btn-secondary !h-9" onClick={modal.open}>Connect wallet</button>;
}

/** Wrong-network banner (Floor runs on BSC only). */
export function NetworkGuard() {
  const { chain, isConnected } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  if (!isConnected || chain?.id === bsc.id) return null;
  return (
    <Notice kind="warn" title={`Your wallet is on ${chain?.name ?? "another network"}.`} action={
      <button type="button" className="btn btn-secondary" disabled={isPending} onClick={() => switchChain({ chainId: bsc.id })}>Switch to {BRAND.chain}</button>
    }>
      {BRAND.name} runs on {BRAND.chain}.
    </Notice>
  );
}

function ConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const connectors = useConnectors();
  const { connectAsync, isPending, error } = useConnect();
  const [agentInfo, setAgentInfo] = useState(false);
  const find = (re: RegExp) => connectors.find((c) => re.test(`${c.name} ${c.id}`));
  const generic = connectors.find((c) => c.id === "injected");
  const hasBrowserWallet = typeof window !== "undefined" && "ethereum" in window;

  const go = async (c: (typeof connectors)[number] | undefined) => {
    if (!c) return;
    try { await connectAsync({ connector: c, chainId: bsc.id }); onClose(); } catch { /* error shown below */ }
  };
  const bin = find(/binance/i), mm = find(/metamask/i), wc = connectors.find((c) => c.id === "walletConnect");

  const rows: { key: string; title: string; sub: string; icon: ReactNode; disabled?: boolean; hint?: string; on: () => void }[] = [
    { key: "bw", title: "Binance Wallet", sub: "Browser or app", icon: <Wallet size={20} strokeWidth={1.5} />, disabled: !bin && !(generic && hasBrowserWallet), hint: !bin && !(generic && hasBrowserWallet) ? "Not detected in this browser." : undefined, on: () => go(bin ?? generic) },
    { key: "mm", title: "MetaMask", sub: "Browser extension", icon: <Fingerprint size={20} strokeWidth={1.5} />, disabled: !mm && !(generic && hasBrowserWallet), hint: !mm && !(generic && hasBrowserWallet) ? "Not detected in this browser." : undefined, on: () => go(mm ?? generic) },
    { key: "wc", title: "WalletConnect", sub: "Scan with your phone", icon: <Link2 size={20} strokeWidth={1.5} />, disabled: !wc, hint: !wc ? "Needs NEXT_PUBLIC_REOWN_PROJECT_ID." : undefined, on: () => go(wc) },
    { key: "baw", title: "Binance Agentic Wallet", sub: "For AI agents", icon: <Bot size={20} strokeWidth={1.5} />, on: () => setAgentInfo((v) => !v) },
  ];
  void REOWN_PROJECT_ID;

  return (
    <Dialog open={open} onClose={onClose} title="Connect a wallet" labelledBy="connect-title">
      <div className="-mx-6 -mb-6 border-b border-grid">
        {rows.map((r) => (
          <button key={r.key} type="button" className="wrow" aria-disabled={r.disabled || isPending} onClick={() => !r.disabled && !isPending && r.on()} aria-describedby={r.hint ? `h-${r.key}` : undefined}>
            <span className="ic">{r.icon}</span>
            <span><span className="tt block">{r.title}</span>{r.hint && <span id={`h-${r.key}`} className="small block">{r.hint}</span>}</span>
            <span className="ss">{r.sub}</span>
          </button>
        ))}
        {agentInfo && (
          <div className="border-t border-grid px-6 py-4">
            <Notice kind="info" title="An Agentic Wallet does not connect to this page.">
              It is a keyless wallet that an AI agent drives from a terminal, so there is no browser prompt to approve. Your agent calls {BRAND.name}&apos;s tools and signs with its own wallet. <Link href="/agents" className="prose-link" onClick={onClose}>See how agents use {BRAND.name}</Link>.
            </Notice>
          </div>
        )}
        <p className="small border-t border-grid px-6 py-4">{BRAND.name} never holds your keys. Your funds sit in your own vault contract on {BRAND.chain}.</p>
      </div>
      {error && <div className="mt-8"><Notice kind="neg" title="Could not connect">{error.message}</Notice></div>}
    </Dialog>
  );
}
