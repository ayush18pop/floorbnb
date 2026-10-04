import { mock } from "wagmi/connectors";
import type { CreateConnectorFn } from "wagmi";
import type { Address } from "viem";

const FLAG = "floor.localdev.connected";
const get = () => { try { return localStorage.getItem(FLAG) === "1"; } catch { return false; } };
const set = (on: boolean) => { try { if (on) localStorage.setItem(FLAG, "1"); else localStorage.removeItem(FLAG); } catch { /* storage blocked: no persistence */ } };

/**
 * LOCAL DEV ONLY. wagmi's mock connector acting as an unlocked anvil dev account (the node signs, the browser holds no key).
 * wagmi's own mock is "connected" in memory only, so a reload either auto-connects everyone (defaultConnected) or forgets the
 * session. This wrapper remembers an explicit click in localStorage: not connected until you click "Dev wallet", still connected
 * after a reload, disconnected again after "Disconnect".
 */
export function localDevConnector(account: Address): CreateConnectorFn {
  const base = mock({ accounts: [account], features: { reconnect: true } });
  return (config) => {
    const c = base(config);
    return {
      ...c,
      async connect(p?: never) { const r = await (c.connect as (p?: unknown) => Promise<unknown>)(p); set(true); return r as never; },
      async disconnect() { set(false); await c.disconnect(); },
      async isAuthorized() { if (!get()) return false; await (c.connect as (p?: unknown) => Promise<unknown>)(); return true; },
    } as ReturnType<CreateConnectorFn>;
  };
}
