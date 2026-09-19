/**
 * Database lifecycle: a single lazily-opened connection, migrated on first use.
 *
 * Everything above this file talks to repositories, never to SQLite directly.
 */

import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { runMigrations } from '@/database/migrations';

export const DATABASE_NAME = 'tripare-dog-breeds.db';

/**
 * In-flight open promise, so concurrent callers during startup share one
 * connection instead of racing to open and migrate several.
 */
let connectionPromise: Promise<SQLiteDatabase> | null = null;

async function openAndMigrate(): Promise<SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  // WAL keeps reads from blocking on the sync transaction's writes, which is
  // what lets the list stay scrollable while a background sync commits.
  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync('PRAGMA foreign_keys = ON');

  await runMigrations(db);
  return db;
}

/** Returns the shared connection, opening and migrating it on first call. */
export async function getDatabase(): Promise<SQLiteDatabase> {
  if (connectionPromise === null) {
    connectionPromise = openAndMigrate().catch((error: unknown) => {
      // Do not cache a failed open: a later attempt should be able to retry.
      connectionPromise = null;
      throw error;
    });
  }
  return connectionPromise;
}

/** Closes the connection. Used by tests and on teardown. */
export async function closeDatabase(): Promise<void> {
  const pending = connectionPromise;
  connectionPromise = null;
  if (pending === null) return;
  try {
    const db = await pending;
    await db.closeAsync();
  } catch {
    // Already closed or never opened cleanly; nothing to release.
  }
}
