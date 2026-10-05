"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { Check } from "lucide-react";
import { quoteProtection } from "@floor/sdk";
import { Xh } from "@/components/ui/xh";
import { useChainNow } from "@/lib/adapters/use-chain";
import { getSource, fmt, isoDate, num, type CreateProgress, type CreateStep } from "@/lib/adapters";
import { BRAND } from "@/lib/brand";
import { APP_CHAIN_ID } from "@/lib/app-config";
import { Addr, ChainDate, Notice } from "./ui";
import { useConnectModal, NetworkGuard } from "./wallet";
import { equalWeights, parseBuilderParams } from "@/lib/builder-params";
import { acksFor, acksShort } from "@/lib/acks";
import { ExpandRow } from "@/components/ui/expand-row";
import { InfoPopover } from "@/components/ui/info-popover";
import { RisksLink } from "./risks";
import { DAY, evidenceFor, termLabel } from "@/lib/floor-config";
import { checkCreate } from "@/lib/create-validation";
import { useCreateLimits } from "@/lib/use-create-limits";

type StepState = "todo" | "wallet" | "pending" | "done";

export function FlowRail({ current }: { current: 1 | 2 | 3 }) {
  const items = [["01", "Build", "/app"], ["02", "Review", ""], ["03", "Confirm", ""]] as const;
  return (
    <nav aria-label="Progress" className="flex gap-6 border-b border-grid px-4 py-2 md:px-6 lg:flex-col lg:gap-0 lg:border-b-0 lg:px-0 lg:py-4">
      {items.map(([n, t], i) => (
        <div key={n} className={`lg:border-b lg:border-grid lg:px-4 lg:py-3 lg:last:border-b-0 ${current === i + 1 ? "lg:border-l-2 lg:!border-l-[var(--accent)]" : ""}`} aria-current={current === i + 1 ? "step" : undefined}>
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
  const now = useChainNow();
  const { limits, ready } = useCreateLimits();
  const q = quoteProtection({ deposit: parseUnits(String(amount), 18), floorBps: floor * 100, termSeconds, weightsBps: weights });
  const check = !ready ? { ok: false, issues: [] } : checkCreate({ amount: parseUnits(String(amount), 18), floorBps: floor * 100, termSeconds, weightsBps: weights, limits, nowSec: now });
  const ev = evidenceFor(floor, termDays);
  const stockPct = q.startingExposureBps / 100;
  const allAck = acks.every(Boolean);
  const mock = source.kind === "mock";
  const needsWallet = !mock && (!isConnected || chain?.id !== APP_CHAIN_ID);
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
    ["Term", <>{termLabel(termDays)}, ends <ChainDate>{termEnd}</ChainDate></>],
  ];
  const more: [string, React.ReactNode][] = [
    ["Multiplier", `${BRAND.multiplier}× cushion`],
    ["Starting split", `${stockPct.toFixed(0)}% stocks / ${(100 - stockPct).toFixed(0)}% USDT, after the first trading window`],
    ["Protocol fee", `0 USDT. Swap costs only.`],
    ["Network fee", "Gas in BNB, paid from your wallet."],
  ];
  const back = `/app?assets=${assets.join(",")}&floor=${floor}&term=${termDays}&amount=${amount}`;

  return (
    <div className="fill grid lg:grid-cols-[132px_minmax(0,1fr)]">
      <FlowRail current={2} />
      <div className="flex min-w-0 flex-col lg:border-l lg:border-grid">
        <div className="relative m-3 border border-grid bg-surface md:m-4">
          <Xh style={{ left: 0, top: 0 }} /><Xh style={{ left: "100%", top: 0 }} /><Xh style={{ left: 0, top: "100%" }} /><Xh style={{ left: "100%", top: "100%" }} />
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 md:px-6">
            <p className="label">Step 2 of 3</p>
            <Stepper steps={steps} />
          </div>
          <dl className="kvc">
            {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <div className="border-t border-grid px-4 py-2 md:px-6">
            <ExpandRow lead={<p className="label">Multiplier, split and fees</p>} more="Show" less="Hide" label="multiplier, split and fees" flush>
              <dl className="kvc mt-2 -mx-4 md:-mx-6">
                {more.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              </dl>
            </ExpandRow>
          </div>
          <fieldset className="m-0 min-w-0 space-y-2 border-0 border-t border-grid px-4 py-3 md:px-6" disabled={busy} aria-labelledby="l-sign">
            <p className="label !mb-2"><span id="l-sign">Before you sign</span> <RisksLink term={{ end: termEnd, days: termDays }} /></p>
            {acksFor(termEnd, termDays).map((t, i) => (
              <ExpandRow key={i} label={`acknowledgement ${i + 1}`} lead={
                <label className="check !text-[14px]">
                  <input type="checkbox" checked={acks[i]} onChange={(e) => setAcks((a) => a.map((x, j) => (j === i ? e.target.checked : x)))} />
                  <span>{acksShort()[i]}</span>
                </label>
              }>{t}</ExpandRow>
            ))}
          </fieldset>
          <div className="space-y-3 border-t border-grid px-4 py-3 md:px-6">
            {mock && <p className="small">Local dev mock: invented hashes, nothing is sent to BNB Chain.<InfoPopover label="local dev mock" title="Local dev mock"><p>This build uses the mock data source (NEXT_PUBLIC_DATA_SOURCE=mock). It runs the two steps with invented hashes. Nothing is sent to BNB Chain.</p></InfoPopover></p>}
            <NetworkGuard />
            {tx.approve && <p className="small">Approval <Addr value={tx.approve} kind="tx" />{tx.create && <> · Create <Addr value={tx.create} kind="tx" /></>}</p>}
            {!check.ok && <Notice kind="warn" title="This would be rejected">{check.issues.map((i) => i.message).join(" ")} <Link href={back} className="prose-link">Change settings</Link></Notice>}
            {!ev.backtested && <Notice kind="info" title="Not backtested yet">{ev.note}</Notice>}
            {error && <Notice kind="neg" title="Not created">{error}</Notice>}
            <div className="btn-stack flex flex-col-reverse items-center gap-3 sm:flex-row sm:justify-between">
              <p className="small !text-[13px]">{mock ? "" : `You sign two transactions: approve exactly ${fmt(amount)} USDT to the factory, then createPosition.`}</p>
              <div className="btn-stack flex w-full flex-col-reverse gap-3 sm:w-auto sm:flex-row">
                <Link href={back} className="btn btn-secondary" aria-disabled={busy}>Back</Link>
                <button type="button" className="btn btn-primary !h-11 !px-6" disabled={!allAck || !ready || now === null || !check.ok || busy || (needsWallet && isConnected)} onClick={create}>
                  {busy ? (steps.approve !== "done" ? "Approving USDT…" : "Creating position…") : !mock && !isConnected ? "Connect wallet" : mock ? "Run mock flow" : steps.approve === "done" ? "Create position" : "Approve and create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
