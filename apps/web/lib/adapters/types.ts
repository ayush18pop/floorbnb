/**
 * Data layer types. They mirror docs/CONTRACTS.md section 11: FloorLens.Status, FloorVault views
 * and events, FloorFactory.createPosition. Money is in WAD (18 decimals, bigint), as on chain.
 * When @floor/sdk is stable, these are replaced by (or mapped from) the SDK types.
 */
export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export type VaultStatus = "Active" | "Closing" | "Closed";

/** FloorLens.Status */
export type LensStatus = {
  vault: Address;
  V: bigint;
  floor: bigint;
  cushion: bigint;
  exposure: bigint;
  target: bigint;
  needsRebalance: boolean;
  tradingOpen: boolean;
};

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
  /** Unix seconds. */
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

export type VaultEvent =
  | { type: "PositionCreated"; time: number; tx: Hex; deposit: bigint; floor: bigint; maturity: number; assets: AssetSymbol[] }
  | { type: "Rebalanced"; time: number; tx: Hex; id: number; assetIdx: number; symbol: AssetSymbol; buy: boolean; amountIn: bigint; amountOut: bigint; V: bigint; exposureTarget: bigint; router: Address; caller: Address; signer: SignerKind; minOut?: bigint; costBps?: number; stockPctBefore?: number; stockPctAfter?: number; trigger?: string }
  | { type: "CashLock"; time: number; tx: Hex; usdtOut: bigint }
  | { type: "CloseRequested"; time: number; tx: Hex }
  | { type: "Closed"; time: number; tx: Hex; usdtOut: bigint }
  | { type: "ExitInKind"; time: number; tx: Hex; usdtOut: bigint; skipped: Address[] };

export type SignerKind = "keeper" | "agentic" | "public";

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
  /** USDT WAD */
  amount: bigint;
  floorBps: number;
  termSeconds: number;
  assets: AssetSymbol[];
  weightsBps: number[];
};

export type CreateStep = "approve" | "create";
export type CreateProgress = { step: CreateStep; state: "wallet" | "pending" | "done"; tx?: Hex };
export type CreateResult = { vault: Address; approveTx: Hex; createTx: Hex };

export type ExitKind = "requestClose" | "closeToUSDT" | "exitInKind";

export type AssetInfo = {
  symbol: AssetSymbol;
  name: string;
  token: Address;
  /** Round-trip cost per $10k in bps from live quotes (CONTEXT.md). */
  roundTripBps: number;
  optional?: boolean;
};

/**
 * The one interface the screens use. `mock` implements it with labelled example data.
 * `chain` (A21) implements it with FloorLens, events and the factory. `sdk` swaps in later.
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
  createPosition(p: CreateParams, onProgress: (e: CreateProgress) => void): Promise<CreateResult>;
  exit(vault: Address, kind: ExitKind): Promise<Hex>;
}
