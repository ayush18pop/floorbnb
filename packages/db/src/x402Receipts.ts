// x402 receipts: replay protection and idempotent settle bookkeeping.
// Primary key (nonce, network, payer), same tuple the facilitator enforces.
// Structurally implements ReceiptStore from @floor/x402 (no import, to keep packages independent).

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
  createdAt: number;
  updatedAt: number;
}

export type NewReceipt = Omit<X402Receipt, 'status' | 'transaction' | 'createdAt' | 'updatedAt'>;

const norm = (k: ReceiptKey): ReceiptKey => ({
  nonce: k.nonce.toLowerCase(),
  network: k.network,
  payer: k.payer.toLowerCase(),
});
const idOf = (k: ReceiptKey) => `${k.nonce}|${k.network}|${k.payer}`;

export class MemoryReceiptStore {
  private rows = new Map<string, X402Receipt>();
  constructor(private now: () => number = Date.now) {}

  reserve(r: NewReceipt): boolean {
    const k = norm(r);
    const existing = this.rows.get(idOf(k));
    if (existing && existing.status !== 'failed') return false;
    const t = this.now();
    this.rows.set(idOf(k), { ...r, ...k, status: 'reserved', transaction: '', createdAt: existing?.createdAt ?? t, updatedAt: t });
    return true;
  }
  update(key: ReceiptKey, patch: { status: ReceiptStatus; transaction?: string }): void {
    const k = norm(key);
    const row = this.rows.get(idOf(k));
    if (!row) throw new Error('receipt not found');
    row.status = patch.status;
    if (patch.transaction !== undefined) row.transaction = patch.transaction;
    row.updatedAt = this.now();
  }
  release(key: ReceiptKey): void {
    const k = norm(key);
    const row = this.rows.get(idOf(k));
    if (row && row.status === 'reserved') this.rows.delete(idOf(k));
  }
  get(key: ReceiptKey): X402Receipt | undefined {
    const row = this.rows.get(idOf(norm(key)));
    return row ? { ...row } : undefined;
  }
}

/** Minimal better-sqlite3-compatible surface (arch: better-sqlite3 + WAL). */
export interface SqlStatement {
  run(...params: unknown[]): { changes: number };
  get(...params: unknown[]): unknown;
}
export interface SqlDb {
  exec(sql: string): unknown;
  prepare(sql: string): SqlStatement;
}

export const X402_RECEIPTS_DDL = `CREATE TABLE IF NOT EXISTS x402_receipts (
  nonce TEXT NOT NULL,
  network TEXT NOT NULL,
  payer TEXT NOT NULL,
  status TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount TEXT NOT NULL,
  resource TEXT NOT NULL,
  transaction_hash TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (nonce, network, payer)
)`;

/** UNTESTED against a real SQLite in this repo state (no native driver installed); covered by a fake-driver test. */
export class SqlReceiptStore {
  constructor(private db: SqlDb, private now: () => number = Date.now) {
    db.exec(X402_RECEIPTS_DDL);
  }

  reserve(r: NewReceipt): boolean {
    const k = norm(r);
    const t = this.now();
    const ins = this.db
      .prepare(
        `INSERT INTO x402_receipts (nonce, network, payer, status, asset, amount, resource, transaction_hash, created_at, updated_at)
         VALUES (?, ?, ?, 'reserved', ?, ?, ?, '', ?, ?)
         ON CONFLICT (nonce, network, payer) DO UPDATE SET status='reserved', asset=excluded.asset, amount=excluded.amount,
           resource=excluded.resource, transaction_hash='', updated_at=excluded.updated_at
         WHERE x402_receipts.status = 'failed'`,
      )
      .run(k.nonce, k.network, k.payer, r.asset, r.amount, r.resource, t, t);
    return ins.changes === 1;
  }
  update(key: ReceiptKey, patch: { status: ReceiptStatus; transaction?: string }): void {
    const k = norm(key);
    this.db
      .prepare(
        `UPDATE x402_receipts SET status = ?, transaction_hash = COALESCE(?, transaction_hash), updated_at = ?
         WHERE nonce = ? AND network = ? AND payer = ?`,
      )
      .run(patch.status, patch.transaction ?? null, this.now(), k.nonce, k.network, k.payer);
  }
  release(key: ReceiptKey): void {
    const k = norm(key);
    this.db
      .prepare(`DELETE FROM x402_receipts WHERE nonce = ? AND network = ? AND payer = ? AND status = 'reserved'`)
      .run(k.nonce, k.network, k.payer);
  }
  get(key: ReceiptKey): X402Receipt | undefined {
    const k = norm(key);
    const row = this.db
      .prepare(`SELECT * FROM x402_receipts WHERE nonce = ? AND network = ? AND payer = ?`)
      .get(k.nonce, k.network, k.payer) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      nonce: String(row.nonce),
      network: String(row.network),
      payer: String(row.payer),
      status: row.status as ReceiptStatus,
      asset: String(row.asset),
      amount: String(row.amount),
      resource: String(row.resource),
      transaction: String(row.transaction_hash),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }
}
