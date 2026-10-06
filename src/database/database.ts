/**
 * Database lifecycle: a single lazily-opened connection, migrated on first use.
 *
 * Everything above this file talks to repositories, never to SQLite directly.
 * The repositories in turn see only the small `SqlDatabase` interface below,
 * so the driver (op-sqlite) is an implementation detail of this one file.
 */

import { open } from '@op-engineering/op-sqlite';
import type { DB } from '@op-engineering/op-sqlite';

import { runMigrations } from '@/database/migrations';
import type { SQLiteBindValue } from '@/database/rowMappers';

export const DATABASE_NAME = 'tripare-dog-breeds.db';

/** A compiled statement reused across many rows inside one transaction. */
export interface SqlStatement {
  execute(params: readonly SQLiteBindValue[]): Promise<void>;
}

/** The subset of SQLite the repositories need. */
export interface SqlDatabase {
  /** Runs one or more statements with no parameters and no result. */
  exec(sql: string): Promise<void>;
  /** Runs a single write statement. */
  run(sql: string, params?: readonly SQLiteBindValue[]): Promise<void>;
  getAll<T>(sql: string, params?: readonly SQLiteBindValue[]): Promise<T[]>;
  getFirst<T>(sql: string, params?: readonly SQLiteBindValue[]): Promise<T | null>;
  /**
   * Runs `work` inside BEGIN/COMMIT, rolling back if it throws. op-sqlite
   * queues transactions, so two concurrent callers never nest a BEGIN.
   */
  withTransaction(work: () => Promise<void>): Promise<void>;
  /** op-sqlite frees the native statement when the JS object is collected. */
  prepare(sql: string): Promise<SqlStatement>;
}

function wrap(db: DB): SqlDatabase {
  return {
    async exec(sql) {
      await db.execute(sql);
    },
    async run(sql, params = []) {
      await db.execute(sql, [...params]);
    },
    async getAll<T>(sql: string, params: readonly SQLiteBindValue[] = []) {
      const result = await db.execute(sql, [...params]);
      return result.rows as T[];
    },
    async getFirst<T>(sql: string, params: readonly SQLiteBindValue[] = []) {
      const result = await db.execute(sql, [...params]);
      return (result.rows[0] as T | undefined) ?? null;
    },
    async withTransaction(work) {
      // Statements issued through `db` inside the callback run on the same
      // connection, so they are part of this transaction.
      await db.transaction(async () => {
        await work();
      });
    },
    async prepare(sql) {
      const statement = db.prepareStatement(sql);
      return {
        async execute(params) {
          await statement.bind([...params]);
          await statement.execute();
        },
      };
    },
  };
}

/**
 * In-flight open promise, so concurrent callers during startup share one
 * connection instead of racing to open and migrate several.
 */
let connectionPromise: Promise<SqlDatabase> | null = null;

async function openAndMigrate(): Promise<SqlDatabase> {
  const db = wrap(open({ name: DATABASE_NAME }));

  // WAL keeps reads from blocking on the sync transaction's writes, which is
  // what lets the list stay scrollable while a background sync commits.
  await db.exec('PRAGMA journal_mode = WAL');
  await db.exec('PRAGMA foreign_keys = ON');

  await runMigrations(db);
  return db;
}

/** Returns the shared connection, opening and migrating it on first call. */
export async function getDatabase(): Promise<SqlDatabase> {
  if (connectionPromise === null) {
    connectionPromise = openAndMigrate().catch((error: unknown) => {
      // Do not cache a failed open: a later attempt should be able to retry.
      connectionPromise = null;
      throw error;
    });
  }
  return connectionPromise;
}
