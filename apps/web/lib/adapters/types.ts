/**
 * Data layer types. Chain-shaped views come from @floor/sdk (LensStatus, VaultStatusCode); the rest
 * mirror docs/CONTRACTS.md section 11 events. Money is in WAD (18 decimals, bigint), as on chain.
 */
import type { Address, Hex } from "viem";
import type { LensStatus, VaultStatusCode } from "@floor/sdk";

export type { Address, Hex, LensStatus };
export type VaultStatus = VaultStatusCode;

export type AssetSymbol = "NVDAB" | "SPCXB" | "QQQB" | "SPYB";

export type Holding = {
  symbol: AssetSymbol;
  token: Address;
  weightBps: number;
  /** Token units (18 decimals). */
  amount: bigint;
  /** Value in USDT WAD at the TWAP price. */
  value: bigint;
  /** True if the issuer has paused this token (exit in kind skips it). */
  paused?: boolean;
};

/** One position, as the UI reads it: Lens.status + vault storage + holdings. */
export type PositionView = {
  status: LensStatus;
  owner: Address;
  vaultStatus: VaultStatus;
  deposit: bigint;
  /** Unix seconds. 0 if unknown (chain source without the creation event). */
  start: number;
  maturity: number;
  /** Seconds: the "now" these numbers were read at (block time on chain). */
  asOf: number;
  usdtBalance: bigint;
  holdings: Holding[];
  lastRebalance: number;
};

/** Derived UI phase. Cash lock = Active, no stock target, value at the floor. */
export type Phase = "active" | "cashLock" | "closing" | "closed";

export type SignerKind = "keeper" | "agentic" | "public";

export type VaultEvent =
  | { type: "PositionCreated"; time: number; tx: Hex; deposit: bigint; floor: bigint; maturity: number; assets: AssetSymbol[] }
  | { type: "Rebalanced"; time: number; tx: Hex; id: number; symbol: AssetSymbol; buy: boolean; amountIn: bigint; amountOut: bigint; V: bigint; exposureTarget: bigint; caller: Address; signer: SignerKind; minOut?: bigint; costBps?: number; stockPctBefore?: number; stockPctAfter?: number; trigger?: string }
  | { type: "CashLock"; time: number; tx: Hex; usdtOut: bigint }
  | { type: "CloseRequested"; time: number; tx: Hex }
  | { type: "Closed"; time: number; tx: Hex; usdtOut: bigint }
  | { type: "ExitInKind"; time: number; tx: Hex; usdtOut: bigint; skipped: Address[] };

export type ValuePoint = { t: number; v: number };

export type KeeperRun = {
  time: number;
  vault: Address;
  symbol: AssetSymbol;
  buy: boolean;
  /** Human numbers: stock units for a sell, USDT for a buy. */
  amountIn: number;
  amountInUnit: AssetSymbol | "USDT";
  minOut?: number;
  received: number;
  receivedUnit: AssetSymbol | "USDT";
  costBps?: number;
  signer: SignerKind;
  tx: Hex;
  cashLock?: boolean;
};

export type KeeperStatus = {
  online: boolean;
  lastRunTime: number;
  tradingOpen: boolean;
  rebalancesToday: number;
};

export type CreateParams = {
  owner: Address;
  /** USDT WAD */
  amount: bigint;
  floorBps: number;
  termSeconds: number;
  assets: AssetSymbol[];
  weightsBps: number[];
};

export type { CreateLimits } from "../create-validation";
import type { CreateLimits } from "../create-validation";

export type CreateStep = "approve" | "create";
export type CreateProgress = { step: CreateStep; state: "wallet" | "pending" | "done"; tx?: Hex };
export type CreateResult = { vault: Address; approveTx: Hex; createTx: Hex };

export type ExitKind = "requestClose" | "closeToUSDT" | "exitInKind";

export type AssetInfo = {
  symbol: AssetSymbol;
  name: string;
  token: Address;
  /** Round-trip cost per $10k in bps from live quotes (CONTEXT.md, Thu 2026-10-02 12:06 UTC). */
  roundTripBps: number;
  optional?: boolean;
};

/**
 * The one interface the screens use. `mock` implements it with labelled example data. `chain` implements
 * it with @floor/sdk reads and transactions. Screens never import either directly (see ./index.ts).
 */
export interface PositionSource {
  /** "mock" means every screen shows an EXAMPLE label. */
  readonly kind: "mock" | "chain";
  assets(): Promise<AssetInfo[]>;
  listPositions(owner?: Address): Promise<PositionView[]>;
  getPosition(vault: Address): Promise<PositionView | null>;
  getEvents(vault: Address): Promise<VaultEvent[]>;
  getHistory(vault: Address): Promise<ValuePoint[]>;
  keeperStatus(): Promise<KeeperStatus>;
  keeperRuns(limit?: number): Promise<KeeperRun[]>;
  /** What createPosition enforces right now (minTrade, buy band, caps). Mock returns the documented defaults. */
  createLimits(): Promise<CreateLimits>;
  createPosition(p: CreateParams, onProgress: (e: CreateProgress) => void): Promise<CreateResult>;
  /** `to` is only used by exitInKind (defaults to the owner). */
  exit(vault: Address, kind: ExitKind, owner: Address): Promise<Hex>;
}
