/**
 * Plain SQL migrations, applied in order on startup. Every statement is idempotent (IF NOT EXISTS), so running them
 * on every boot, from several processes, is safe. Append new entries; never edit a shipped one.
 */
export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS chain_logs (
     address      text    NOT NULL,
     block_number bigint  NOT NULL,
     log_index    integer NOT NULL,
     tx_hash      text    NOT NULL,
     topics       jsonb   NOT NULL,
     data         text    NOT NULL,
     PRIMARY KEY (tx_hash, log_index)
   )`,
  `CREATE INDEX IF NOT EXISTS chain_logs_addr_block ON chain_logs (address, block_number)`,
  `CREATE TABLE IF NOT EXISTS index_cursor (
     address         text PRIMARY KEY,
     synced_to_block bigint NOT NULL,
     updated_at      timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS block_times (
     block_number bigint PRIMARY KEY,
     ts           bigint NOT NULL
   )`,
];
