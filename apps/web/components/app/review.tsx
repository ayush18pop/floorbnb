"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { Check } from "lucide-react";
import { quoteProtection } from "@floor/sdk";
import { Xh } from "@/components/ui/xh";
import { useNow } from "@/lib/adapters/use";
import { getSource, fmt, isoDate, num, type CreateProgress, type CreateStep } from "@/lib/adapters";
import { BRAND } from "@/lib/brand";
import { APP_CHAIN_ID } from "@/lib/app-config";
import { Addr, Notice } from "./ui";
import { useConnectModal, NetworkGuard } from "./wallet";
import { equalWeights, parseBuilderParams } from "@/lib/builder-params";
import { acksFor } from "@/lib/acks";
import { DAY, evidenceFor, termEndText, termLabel } from "@/lib/floor-config";
import { checkCreate } from "@/lib/create-validation";
import { useCreateLimits } from "@/lib/use-create-limits";

type StepState = "todo" | "wallet" | "pending" | "done";

export function FlowRail({ current }: { current: 1 | 2 | 3 }) {
  const items = [["01", "Build", "/app"], ["02", "Review", ""], ["03", "Confirm", ""]] as const;
  return (
    <nav aria-label="Progress" className="flex gap-6 border-b border-grid px-4 py-3 md:px-6 lg:flex-col lg:gap-0 lg:border-b-0 lg:px-0 lg:py-6">
      {items.map(([n, t], i) => (
        <div key={n} className={`lg:border-b lg:border-grid lg:px-6 lg:py-4 lg:last:border-b-0 ${current === i + 1 ? "lg:border-l-2 lg:!border-l-[var(--accent)]" : ""}`} aria-current={current === i + 1 ? "step" : undefined}>
          <p className="label">{n}</p>
          <p className={`label ${current === i + 1 ? "acc" : ""}`}>{t}</p>
        </div>
      ))}
    </nav>
  );
}

function Stepper({ steps }: { steps: Record<CreateStep, StepState> }) {
  const st = (s: StepState) => (s === "done" ? "done" : s === "todo" ? "" : "active");
  return (
    <ol className="stepper" aria-label="Transactions">
      <li className="st" data-s={st(steps.approve)}><span className="dot">{steps.approve === "done" ? <Check size={14} strokeWidth={2} /> : 1}</span>Approve USDT</li>
      <span className="ln" aria-hidden="true" />
      <li className="st" data-s={st(steps.create)}><span className="dot">{steps.create === "done" ? <Check size={14} strokeWidth={2} /> : 2}</span>Create position</li>
      <span className="ln" aria-hidden="true" />
      <li className="st" data-s=""><span className="dot">3</span>Done</li>
    </ol>
  );
}

export { acksFor };

export function Review() {
  const router = useRouter();
  const sp = useSearchParams();
  const { assets, floor, termDays, amount } = useMemo(() => parseBuilderParams(new URLSearchParams(sp.toString())), [sp]);
  const source = getSource();
  const { address, isConnected, chain } = useAccount();
  const modal = useConnectModal();
  const [acks, setAcks] = useState([false, false, false]);
  const [steps, setSteps] = useState<Record<CreateStep, StepState>>({ approve: "todo", create: "todo" });
  const [tx, setTx] = useState<Partial<Record<CreateStep, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const weights = equalWeights(assets.length);
  const termSeconds = termDays * DAY;
  const { limits } = useCreateLimits();
  const q = quoteProtection({ deposit: parseUnits(String(amount), 18), floorBps: floor * 100, termSeconds, weightsBps: weights });
  const check = checkCreate({ amount: parseUnits(String(amount), 18), floorBps: floor * 100, termSeconds, weightsBps: weights, limits });
  const ev = evidenceFor(floor, termDays);
  const stockPct = q.startingExposureBps / 100;
  const allAck = acks.every(Boolean);
  const mock = source.kind === "mock";
  const needsWallet = !mock && (!isConnected || chain?.id !== APP_CHAIN_ID);
  const now = useNow();
  const termEnd = now ? isoDate(now + termSeconds) : "…";

  const onProgress = (e: CreateProgress) => {
    setSteps((s) => ({ ...s, [e.step]: e.state }));
    if (e.tx) setTx((t) => ({ ...t, [e.step]: e.tx }));
  };

  const create = async () => {
    if (!mock && !isConnected) return modal.open();
    setBusy(true); setError(null);
    try {
      const owner = (address ?? "0x1111111111111111111111111111111111111111") as `0x${string}`;
      const r = await source.createPosition({ owner, amount: parseUnits(String(amount), 18), floorBps: floor * 100, termSeconds, assets, weightsBps: weights }, onProgress);
      router.push(`/app/confirmed?vault=${r.vault}&tx=${r.createTx}&amount=${amount}&floor=${num(q.floorValue)}&term=${termDays}&end=${(now ?? 0) + termSeconds}`);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(/reject|denied/i.test(m) ? "You rejected the request in your wallet. Nothing was sent. You can try again." : m);
      setSteps((s) => ({ approve: s.approve === "done" ? "done" : "todo", create: "todo" }));
    } finally { setBusy(false); }
  };

  const rows: [string, React.ReactNode][] = [
    ["Basket", `${assets.join(" · ")}${assets.length > 1 ? " (equal weight)" : ""}`],
    ["Deposit", `${fmt(amount)} USDT`],
    ["Floor", `${fmt(num(q.floorValue))} USDT (${floor}%)`],
    ["Term", `${termLabel(termDays)}, ends ${termEnd}`],
    ["Multiplier", `${BRAND.multiplier}× cushion`],
    ["Starting split", `${stockPct.toFixed(0)}% stocks / ${(100 - stockPct).toFixed(0)}% USDT, after the first trading window`],
    ["Protocol fee", `0 USDT. Swap costs only.`],
    ["Network fee", "Gas in BNB, paid from your wallet."],
  ];

  return (
    <div className="grid lg:grid-cols-[200px_minmax(0,1fr)]">
      <FlowRail current={2} />
      <div className="min-w-0 lg:border-l lg:border-grid">
        <div className="relative m-4 border border-grid bg-surface md:m-6">
          <Xh style={{ left: 0, top: 0 }} /><Xh style={{ left: "100%", top: 0 }} /><Xh style={{ left: 0, top: "100%" }} /><Xh style={{ left: "100%", top: "100%" }} />
          <div className="p-4 md:p-6">
            <p className="label">Step 2 of 3</p>
            <h2 className="h1 mt-2">Review your floor</h2>
            <div className="mt-6"><Stepper steps={steps} /></div>
          </div>
          <dl className="kv">
            {rows.map(([k, v]) => <div key={k} className="contents"><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <fieldset className="m-0 min-w-0 space-y-4 border-0 border-t border-grid p-4 md:p-6" disabled={busy}>
            <h3 className="label !mb-4">Before you sign</h3>
            {acksFor(termEnd, termDays).map((t, i) => (
              <label key={i} className="check">
                <input type="checkbox" checked={acks[i]} onChange={(e) => setAcks((a) => a.map((x, j) => (j === i ? e.target.checked : x)))} />
                <span>{t}</span>
              </label>
            ))}
          </fieldset>
          <div className="space-y-4 border-t border-grid p-4 md:p-6">
            {mock && <Notice kind="info" title="Example mode">No contract is deployed yet. This runs the two steps with invented hashes. Nothing is sent to BNB Chain.</Notice>}
            <NetworkGuard />
            {tx.approve && <p className="small">Approval <Addr value={tx.approve} kind="tx" />{tx.create && <> · Create <Addr value={tx.create} kind="tx" /></>}</p>}
            {!check.ok && <Notice kind="warn" title="This would be rejected">{check.issues.map((i) => i.message).join(" ")} <Link href={`/app?assets=${assets.join(",")}&floor=${floor}&term=${termDays}&amount=${amount}`} className="prose-link">Change settings</Link></Notice>}
            {!ev.backtested && <Notice kind="info" title="Not backtested yet">{ev.note}</Notice>}
            {error && <Notice kind="neg" title="Not created">{error}</Notice>}
            <div className="btn-stack flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Link href={`/app?assets=${assets.join(",")}&floor=${floor}&term=${termDays}&amount=${amount}`} className="btn btn-secondary" aria-disabled={busy}>Back</Link>
              <button type="button" className="btn btn-primary" disabled={!allAck || !check.ok || busy || (needsWallet && isConnected)} onClick={create}>
                {busy ? (steps.approve !== "done" ? "Approving USDT…" : "Creating position…") : !mock && !isConnected ? "Connect wallet" : mock ? "Run example flow" : steps.approve === "done" ? "Create position" : "Approve and create"}
              </button>
            </div>
            <p className="small sm:text-right">{mock ? "" : `You sign two transactions: approve exactly ${fmt(amount)} USDT to the factory, then createPosition.`}</p>
          </div>
        </div>
        <p className="small px-4 pb-6 md:px-6">{termEndText(termEnd)} Exit in kind is always allowed. {BRAND.name} cannot move your funds: the vault only trades by its own rules.</p>
      </div>
    </div>
  );
}
