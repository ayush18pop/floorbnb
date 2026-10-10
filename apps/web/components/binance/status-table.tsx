"use client";
import { fetchBinanceStatus, toMs } from "@/lib/binance";
import { UtcTime } from "@/components/app/ui";
import { RemoteState, useRemote } from "./use-binance";

/** Live table of the Binance Web3 modules Floor uses, from GET /v1/binance/status. */
export function StatusTable() {
  const { state, retry } = useRemote(fetchBinanceStatus, "status");
  return (
    <RemoteState state={state} retry={retry} lines={5}>
      {state.phase === "ok" && (
        <>
          {!state.data.configured && <p className="small mb-3">Binance keys are not configured on this server, so the counts below stay at zero.</p>}
          {state.data.modules.length === 0 ? <p className="small">The server lists no modules.</p> : (
            <div className="tbl-wrap">
              <table className="tbl">
                <caption className="sr-only">Binance Web3 modules and live call counts</caption>
                <thead><tr><th scope="col">Module</th><th scope="col">API</th><th scope="col">Endpoint</th><th scope="col">Used by</th><th scope="col">In production</th><th scope="col">Last OK</th><th scope="col" className="r">Calls</th></tr></thead>
                <tbody>
                  {state.data.modules.map((m) => (
                    <tr key={m.id}>
                      <th scope="row" className="mono">{m.id}</th>
                      <td>{m.api}</td>
                      <td className="mono [overflow-wrap:anywhere]">{m.endpoint || "n/a"}</td>
                      <td>{m.usedBy.length ? m.usedBy.join(", ") : "n/a"}</td>
                      <td>{m.inProduction ? "Yes" : "No"}{m.note && <span className="small block">{m.note}</span>}</td>
                      <td>{m.lastOkAt !== null ? <UtcTime t={Math.floor(toMs(m.lastOkAt) / 1000)} /> : "never"}{m.lastError && <span className="small block">Last error: {m.lastError}</span>}</td>
                      <td className="r">{m.okCalls} / {m.calls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="small mt-2">Calls shows successful / total since the server last started. {state.data.generatedAt !== null && <>Generated <UtcTime t={Math.floor(toMs(state.data.generatedAt) / 1000)} />.</>}</p>
        </>
      )}
    </RemoteState>
  );
}
