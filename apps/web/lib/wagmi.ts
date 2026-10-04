import { createConfig, http } from "wagmi";
import { bsc } from "wagmi/chains";
import { injected, mock, walletConnect } from "wagmi/connectors";
import { defineChain } from "viem";
import { LOCAL_DEV, LOCAL_CHAIN_ID, LOCAL_USER, REOWN_PROJECT_ID } from "./app-config";

/** Local anvil fork of BSC. Only used when NEXT_PUBLIC_LOCAL_DEV=1. */
export const localFork = defineChain({
  id: LOCAL_CHAIN_ID,
  name: "Floor local fork (BSC)",
  nativeCurrency: bsc.nativeCurrency,
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545"] } },
});
/** The one chain the app uses: BSC (chain 56) in production, the local fork in local-dev mode. */
export const appChain = LOCAL_DEV ? localFork : bsc;

/**
 * BSC only (chain 56). Browser wallets are found through EIP-6963 (Binance Wallet, MetaMask) plus a
 * generic injected connector. WalletConnect is added only when NEXT_PUBLIC_REOWN_PROJECT_ID is set.
 * The app never sees a key. In local-dev mode (NEXT_PUBLIC_LOCAL_DEV=1) a mock connector acts as an unlocked anvil dev account
 * (the anvil node signs; no key is in the browser).
 */
export const wagmiConfig = createConfig({
  chains: [appChain] as unknown as readonly [typeof bsc],
  ssr: true,
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected(),
    ...(REOWN_PROJECT_ID ? [walletConnect({ projectId: REOWN_PROJECT_ID, showQrModal: true })] : []),
    ...(LOCAL_DEV && LOCAL_USER ? [mock({ accounts: [LOCAL_USER], features: { defaultConnected: true, reconnect: true } })] : []),
  ],
  transports: { [appChain.id]: http(process.env.NEXT_PUBLIC_RPC_URL || undefined) } as Record<typeof bsc.id, ReturnType<typeof http>>,
});
