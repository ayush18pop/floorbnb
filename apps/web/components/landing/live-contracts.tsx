"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { addrUrl, MAINNET_FACTORY, MAINNET_LENS, MAINNET_VAULT_IMPL } from "@/lib/app-config";
import { AddrLink } from "@/components/app/explorer-link";
import { Section } from "./section";

const ROWS: [name: string, addr: string][] = [
  ["FloorFactory", MAINNET_FACTORY],
  ["FloorLens", MAINNET_LENS],
  ["FloorVault implementation", MAINNET_VAULT_IMPL],
];

function CopyBtn({ value, name }: { value: string; name: string }) {
  const [ok, setOk] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1400); } catch { /* clipboard unavailable */ }
  };
  return (
    <button type="button" onClick={copy} className="inline-flex h-8 w-8 items-center justify-center text-muted hover:text-ink" aria-label={`Copy ${name} address`}>
      {ok ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
    </button>
  );
}

/* ---------- live contracts: three rows, detail lives in /docs/live-contracts ---------- */
export function LiveContracts() {
  return (
    <Section id="live-contracts" index="05" label="Live contracts" title="Live on BNB Chain mainnet.">
      <div className="cellgrid">
        {ROWS.map(([name, addr]) => (
          <div key={name} className="col-span-4 md:col-span-8 lg:col-span-12 !py-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <p className="font-medium">{name}</p>
            <p className="inline-flex items-center gap-1 mono">
              <AddrLink address={addr} example={false} copy={false} />
              <CopyBtn value={addr} name={name} />
            </p>
            <a className="prose-link small" href={`${addrUrl(addr)}#code`} target="_blank" rel="noopener noreferrer">Verified on BscScan</a>
          </div>
        ))}
        <div className="col-span-4 md:col-span-8 lg:col-span-12 bare">
          <p className="small">Launch caps: 1,000 USDT per position, 5,000 USDT in total. AI-assisted reviews only, no formal audit. <Link href="/docs/live-contracts" className="prose-link">Roles and how to verify</Link></p>
        </div>
      </div>
    </Section>
  );
}
