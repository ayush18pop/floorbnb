"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAccount, useConnect, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { Bot, Link2, Wallet, Fingerprint } from "lucide-react";
import { Dialog, Notice } from "./ui";
import { REOWN_PROJECT_ID } from "@/lib/app-config";
import { appChain } from "@/lib/wagmi";
import { AddrLink } from "./explorer-link";
import { BRAND } from "@/lib/brand";

const LOCAL_DEV = process.env.NEXT_PUBLIC_LOCAL_DEV === "1"; // inlined at build time so production bundles drop every local-dev branch
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
        {LOCAL_DEV && <span className="badge b-neg" title="Local dev mode: an anvil fork, not BNB Chain">LOCAL DEV WALLET</span>}
        <span className="badge b-pos" title={address}><span aria-hidden="true" className="mr-2 inline-block h-2 w-2 bg-current" /><AddrLink address={address} example={false} copy={false} /></span>
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
  if (!isConnected || chain?.id === appChain.id) return null;
  return (
    <Notice kind="warn" title={`Your wallet is on ${chain?.name ?? "another network"}.`} action={
      <button type="button" className="btn btn-secondary" disabled={isPending} onClick={() => switchChain({ chainId: appChain.id })}>Switch to {BRAND.chain}</button>
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
    try { await connectAsync({ connector: c, chainId: appChain.id }); onClose(); } catch { /* error shown below */ }
  };
  const bin = find(/binance/i), mm = find(/metamask/i), wc = connectors.find((c) => c.id === "walletConnect");

  const rows: { key: string; title: string; sub: string; icon: ReactNode; disabled?: boolean; hint?: string; on: () => void }[] = [
    { key: "bw", title: "Binance Wallet", sub: "Browser or app", icon: <Wallet size={20} strokeWidth={1.5} />, disabled: !bin && !(generic && hasBrowserWallet), hint: !bin && !(generic && hasBrowserWallet) ? "Not detected in this browser." : undefined, on: () => go(bin ?? generic) },
    { key: "mm", title: "MetaMask", sub: "Browser extension", icon: <Fingerprint size={20} strokeWidth={1.5} />, disabled: !mm && !(generic && hasBrowserWallet), hint: !mm && !(generic && hasBrowserWallet) ? "Not detected in this browser." : undefined, on: () => go(mm ?? generic) },
    { key: "wc", title: "WalletConnect", sub: "Scan with your phone", icon: <Link2 size={20} strokeWidth={1.5} />, disabled: !wc, hint: !wc ? "Needs NEXT_PUBLIC_REOWN_PROJECT_ID." : undefined, on: () => go(wc) },
    { key: "baw", title: "Binance Agentic Wallet", sub: "For AI agents", icon: <Bot size={20} strokeWidth={1.5} />, on: () => setAgentInfo((v) => !v) },
  ];
  void REOWN_PROJECT_ID;
  const dev = LOCAL_DEV ? connectors.find((c) => c.id === "mock") : undefined;
  if (dev) rows.unshift({ key: "dev", title: "Dev wallet", sub: "LOCAL DEV WALLET (anvil fork)", icon: <Wallet size={20} strokeWidth={1.5} />, hint: "Local development only. Acts as the demo user on the local fork.", on: () => go(dev) });

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
            <Notice kind="info" title="A browser page cannot connect an Agentic Wallet.">
              <p>An AI agent can use {BRAND.name} through its MCP tools (<code>build_create_position_tx</code>, <code>build_exit_tx</code> return unsigned transactions) and execute them with Binance Agentic Wallet Developer Mode:</p>
              <pre className="code mt-2 overflow-x-auto" tabIndex={0}>{`baw contract-call preview --binanceChainId 56 --from <agent wallet> --to <to> --value <wei> --inputData <data> --json
baw contract-call execute --requestId <id> --json`}</pre>
              <p className="mt-2">Developer Mode is enabled in the Binance app and has its own daily limit and expiry. It does not support x402 payments. This flow is documented by Binance; we have not run it live yet. See <Link href="/docs/agents#agentic-wallet" className="prose-link" onClick={onClose}>Agents</Link> and <Link href="/docs/binance" className="prose-link" onClick={onClose}>Binance</Link>.</p>
            </Notice>
          </div>
        )}
        <p className="small border-t border-grid px-6 py-4">{BRAND.name} never holds your keys. Your funds sit in your own vault contract on {BRAND.chain}.</p>
      </div>
      {error && <div className="mt-8"><Notice kind="neg" title="Could not connect">{error.message}</Notice></div>}
    </Dialog>
  );
}
