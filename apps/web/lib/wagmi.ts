import { createConfig, http } from "wagmi";
import { bsc } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
import { REOWN_PROJECT_ID } from "./app-config";

/**
 * BSC only (chain 56). Browser wallets are found through EIP-6963 (Binance Wallet, MetaMask) plus a
 * generic injected connector. WalletConnect is added only when NEXT_PUBLIC_REOWN_PROJECT_ID is set.
 * The app never sees a key.
 */
export const wagmiConfig = createConfig({
  chains: [bsc],
  ssr: true,
  multiInjectedProviderDiscovery: true,
  connectors: [injected(), ...(REOWN_PROJECT_ID ? [walletConnect({ projectId: REOWN_PROJECT_ID, showQrModal: true })] : [])],
  transports: { [bsc.id]: http(process.env.NEXT_PUBLIC_RPC_URL || undefined) },
});
