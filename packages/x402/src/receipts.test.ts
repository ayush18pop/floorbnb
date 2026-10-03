import { describe, expect, it } from 'vitest';
import { MemoryReceiptStore, SqlReceiptStore, type SqlDb } from '../../db/src/x402Receipts';

const base = { nonce: '0xAB', network: 'eip155:56', payer: '0xPAYER', asset: '0xa', amount: '1', resource: 'u' };
const key = { nonce: '0xab', network: 'eip155:56', payer: '0xpayer' };

describe('MemoryReceiptStore', () => {
  it('keyed (nonce, network, payer), case-insensitive, replay refused', () => {
    const s = new MemoryReceiptStore();
    expect(s.reserve(base)).toBe(true);
    expect(s.reserve({ ...base, nonce: '0xab', payer: '0xpayer' })).toBe(false);
    expect(s.reserve({ ...base, network: 'eip155:97' })).toBe(true);
    expect(s.reserve({ ...base, payer: '0xother' })).toBe(true);
  });
  it('status flow, release only while reserved, failed can be re-reserved', () => {
    const s = new MemoryReceiptStore();
    s.reserve(base);
    s.update(key, { status: 'settled', transaction: '0xtx' });
    expect(s.get(key)).toMatchObject({ status: 'settled', transaction: '0xtx' });
    s.release(key);
    expect(s.get(key)).toBeDefined();
    s.update(key, { status: 'failed' });
    expect(s.reserve(base)).toBe(true);
    expect(s.get(key)!.status).toBe('reserved');
  });
});

// Fake driver that interprets just the statements SqlReceiptStore issues. It checks the store's
// parameter order and semantics, not SQLite itself (no native driver in this workspace).
function fakeDb(): SqlDb {
  const rows = new Map<string, Record<string, unknown>>();
  const id = (n: unknown, w: unknown, p: unknown) => `${n}|${w}|${p}`;
  return {
    exec: () => undefined,
    prepare(sql: string) {
      return {
        run(...a: unknown[]) {
          if (sql.includes('INSERT')) {
            const [nonce, network, payer, asset, amount, resource, t] = a;
            const ex = rows.get(id(nonce, network, payer));
            if (ex && ex.status !== 'failed') return { changes: 0 };
            rows.set(id(nonce, network, payer), { nonce, network, payer, status: 'reserved', asset, amount, resource, transaction_hash: '', created_at: ex?.created_at ?? t, updated_at: t });
            return { changes: 1 };
          }
          if (sql.includes('UPDATE')) {
            const [status, tx, t, nonce, network, payer] = a;
            const r = rows.get(id(nonce, network, payer));
            if (r) Object.assign(r, { status, transaction_hash: tx ?? r.transaction_hash, updated_at: t });
            return { changes: r ? 1 : 0 };
          }
          const [nonce, network, payer] = a;
          const r = rows.get(id(nonce, network, payer));
          if (r && r.status === 'reserved') rows.delete(id(nonce, network, payer));
          return { changes: 1 };
        },
        get(...a: unknown[]) {
          return rows.get(id(a[0], a[1], a[2]));
        },
      };
    },
  };
}

describe('SqlReceiptStore (fake driver)', () => {
  it('same contract as memory store', () => {
    const s = new SqlReceiptStore(fakeDb());
    expect(s.reserve(base)).toBe(true);
    expect(s.reserve(base)).toBe(false);
    s.update(key, { status: 'pending', transaction: '0xtx' });
    expect(s.get(key)).toMatchObject({ status: 'pending', transaction: '0xtx', payer: '0xpayer' });
    s.update(key, { status: 'failed' });
    expect(s.reserve(base)).toBe(true);
    s.release(key);
    expect(s.get(key)).toBeUndefined();
  });
});
