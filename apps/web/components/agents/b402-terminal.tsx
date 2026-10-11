"use client";
import { useEffect, useRef, useState } from "react";
import { PAID_TOOL_PRICE_USD } from "@/lib/app-config";

/* Asset and payee as configured for the paid tools (apps/api/src/paid.ts, render.yaml X402_PAYTO). */
const USD1 = "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d";
const PAY_TO = "0xF5f349ABe9647278AC3450058bc054886DaF816B";
/* 0.01 token at 18 decimals. */
const ATOMIC = "10000000000000000";

type Line = { t: string; tone?: "c" | "k" | "s"; pause?: number };

/** Scripted example of one paid MCP call. No settlement hash is shown: none was recorded. */
const SCRIPT: Line[] = [
  { t: "# agent calls a paid Floor MCP tool", tone: "c" },
  { t: 'agent  > tools/call quote_protection {"depositUsdt":"800","floorBps":9000}', tone: "k", pause: 500 },
  { t: "floor  < 402 Payment Required", tone: "s", pause: 300 },
  { t: "         scheme=exact network=eip155:56 rail=b402" },
  { t: `         asset=${USD1} (USD1)` },
  { t: `         amount=${ATOMIC} (${PAID_TOOL_PRICE_USD} USD1)` },
  { t: `         payTo=${PAY_TO}`, pause: 500 },
  { t: "agent  > sign EIP-3009 TransferWithAuthorization (user's own wallet)", tone: "k", pause: 500 },
  { t: "agent  > retry with PAYMENT-SIGNATURE header", tone: "k", pause: 500 },
  { t: "floor  < 200 OK  quote_protection result", tone: "s" },
  { t: "floor  < PAYMENT-RESPONSE: settled via b402", tone: "s" },
];

const TYPE_MS = 14;

function Row({ line, text }: { line: Line; text: string }) {
  return <div className={line.tone ?? ""}>{text || " "}</div>;
}

/** Looping typed-out terminal showing an agent paying a Floor MCP tool over b402. Shows the final state under reduced motion. */
export function B402Terminal() {
  const [done, setDone] = useState<string[]>([]);
  const [cur, setCur] = useState("");
  const [reduced, setReduced] = useState<boolean | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (reduced !== false) return;
    let li = 0;
    let ci = 0;
    const step = () => {
      if (li >= SCRIPT.length) {
        timer.current = setTimeout(() => { li = 0; ci = 0; setDone([]); setCur(""); step(); }, 3500);
        return;
      }
      const full = SCRIPT[li].t;
      if (ci < full.length) {
        ci += 2;
        setCur(full.slice(0, ci));
        timer.current = setTimeout(step, TYPE_MS);
      } else {
        setDone((d) => [...d, full]);
        setCur("");
        const pause = SCRIPT[li].pause ?? 150;
        li += 1;
        ci = 0;
        timer.current = setTimeout(step, pause);
      }
    };
    step();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [reduced]);

  const rows = reduced === false ? done : SCRIPT.map((l) => l.t);
  const curIdx = reduced === false ? done.length : -1;
  return (
    <div className="block border border-grid bg-surface">
      <div className="flex items-center justify-between border-b border-grid px-4 py-3 md:px-6">
        <span className="label">A paid call over b402</span>
        <span className="badge">Example</span>
      </div>
      <div
        className="code !border-0 !bg-transparent !p-4 md:!p-6"
        role="img"
        aria-label={`Terminal: an agent calls quote_protection, receives 402 Payment Required for ${PAID_TOOL_PRICE_USD} USD1 to ${PAY_TO} on eip155:56, signs an EIP-3009 authorization, retries with the payment header, gets 200 and the payment settles via b402.`}
        style={{ minHeight: `${Math.round(SCRIPT.length * 1.7 * 12.5 + 8)}px` }}
      >
        {rows.map((t, i) => <Row key={i} line={SCRIPT[i]} text={t} />)}
        {curIdx >= 0 && curIdx < SCRIPT.length && <Row line={SCRIPT[curIdx]} text={cur + "█"} />}
      </div>
    </div>
  );
}
