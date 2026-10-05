// x402 v2 types. Sources: https://github.com/coinbase/x402/blob/main/specs/transports-v2/http.md
// and https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md

export type TransferMethod = 'eip3009' | 'permit2';

export interface PaymentExtra {
  name?: string;
  version?: string;
  assetTransferMethod?: TransferMethod | string;
  signerAddress?: string;
  spenderAddress?: string;
  [k: string]: unknown;
}

export interface PaymentRequirements {
  scheme: 'exact' | string;
  network: string; // CAIP-2, e.g. eip155:56
  asset: string;
  amount: string; // atomic units
  payTo: string;
  maxTimeoutSeconds: number;
  extra: PaymentExtra;
}

export interface ResourceInfo {
  url: string;
  description?: string;
  mimeType?: string;
}

export interface PaymentRequired {
  x402Version: 2;
  error?: string;
  resource: ResourceInfo;
  accepts: PaymentRequirements[];
}

export interface Eip3009Authorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

export interface PaymentPayload {
  x402Version: number;
  resource?: ResourceInfo;
  accepted: PaymentRequirements;
  payload: {
    signature?: string;
    authorization?: Eip3009Authorization;
    // permit2 shape is passed through untouched to the facilitator
    permit2Authorization?: { from: string; nonce: string; [k: string]: unknown };
    [k: string]: unknown;
  };
}

export interface VerifyResult {
  isValid: boolean;
  payer?: string;
  invalidReason?: string;
}

export interface SettleResult {
  success: boolean;
  transaction: string; // '' when none
  network: string;
  payer?: string;
  amount?: string;
  errorReason?: string;
  /** success=false with a transaction hash: broadcast but not final yet. */
  pending?: boolean;
}

export interface SupportedKind {
  x402Version?: number;
  scheme?: string;
  network?: string;
  asset?: string;
  extra: PaymentExtra;
}

export interface Supported {
  kinds: SupportedKind[];
}

export interface FacilitatorClient {
  getSupported(): Promise<Supported>;
  verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResult>;
  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResult>;
}

export type ReceiptStatus = 'reserved' | 'pending' | 'settled' | 'failed';

export interface ReceiptKey {
  nonce: string;
  network: string;
  payer: string;
}

export interface X402Receipt extends ReceiptKey {
  status: ReceiptStatus;
  asset: string;
  amount: string;
  resource: string;
  transaction: string;
  createdAt: number; // ms
  updatedAt: number;
}

/** Implemented by packages/db/src/x402Receipts.ts (memory and SQL). */
export interface ReceiptStore {
  /** Insert if absent (or if the existing row is 'failed'). false means replay. */
  reserve(r: Omit<X402Receipt, 'status' | 'transaction' | 'createdAt' | 'updatedAt'>): boolean | Promise<boolean>;
  update(key: ReceiptKey, patch: { status: ReceiptStatus; transaction?: string }): void | Promise<void>;
  release(key: ReceiptKey): void | Promise<void>;
  get(key: ReceiptKey): X402Receipt | undefined | Promise<X402Receipt | undefined>;
}

/** Default price of every paid Floor call (API route and MCP tool), USD per call. PRICE_* env vars override it. */
export const DEFAULT_PAID_PRICE_USD = '0.01';
