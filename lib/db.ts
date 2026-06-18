/**
 * Client-side SQLite via sql.js, persisted to IndexedDB.
 *
 * On first load: creates a fresh DB and runs SCHEMA_SQL.
 * On subsequent loads: restores the saved DB bytes from IndexedDB.
 * After every write: persists the DB bytes back to IndexedDB.
 *
 * Usage (only in client components):
 *   import { getDb, persistDb, queryAll, run } from '@/lib/db';
 *   const jobs = await queryAll('SELECT * FROM jobs ORDER BY posted_at DESC LIMIT 20');
 *   await run('INSERT INTO jobs ...', [...params]);
 */

import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { get, set } from 'idb-keyval';
import { SCHEMA_SQL } from './schema';

let SQL: SqlJsStatic | null = null;
let dbInstance: Database | null = null;
let initPromise: Promise<Database> | null = null;

const DB_STORAGE_KEY = 'tja-sqlite-db';
const SCHEMA_VERSION_KEY = 'tja-schema-version';
const CURRENT_SCHEMA_VERSION = '2';

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  // Load WASM from /public/sql-wasm.wasm (must exist; downloaded by postinstall script)
  SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' });
  return SQL;
}

async function loadExistingDbBytes(): Promise<Uint8Array | null> {
  if (typeof window === 'undefined') return null;
  try {
    const stored = await get<Uint8Array>(DB_STORAGE_KEY);
    return stored ?? null;
  } catch {
    return null;
  }
}

function ensureSchema(db: Database): void {
  const storedVersion =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(SCHEMA_VERSION_KEY) ?? '0'
      : '0';

  if (storedVersion !== CURRENT_SCHEMA_VERSION) {
    // SCHEMA_SQL uses CREATE TABLE IF NOT EXISTS — idempotent
    db.run(SCHEMA_SQL);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SCHEMA_VERSION_KEY, CURRENT_SCHEMA_VERSION);
    }
  }
}

/**
 * Get the singleton Database instance, initializing it if needed.
 * Safe to call multiple times — returns the same instance.
 */
export async function getDb(): Promise<Database> {
  if (typeof window === 'undefined') {
    throw new Error('getDb() can only be called in the browser');
  }
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const sql = await loadSqlJs();
    const existingBytes = await loadExistingDbBytes();

    if (existingBytes && existingBytes.length > 0) {
      try {
        dbInstance = new sql.Database(existingBytes);
      } catch {
        dbInstance = new sql.Database();
      }
    } else {
      dbInstance = new sql.Database();
    }

    ensureSchema(dbInstance);
    await persistDb();
    return dbInstance;
  })();

  return initPromise;
}

/**
 * Persist the current DB state to IndexedDB.
 * Call after any write operation.
 */
export async function persistDb(): Promise<void> {
  if (!dbInstance) return;
  if (typeof window === 'undefined') return;
  try {
    const bytes = dbInstance.export();
    await set(DB_STORAGE_KEY, bytes);
  } catch (err) {
    console.error('[db] persistDb failed:', err);
  }
}

/**
 * Reset the DB entirely (used for "clear all data" button).
 */
export async function resetDb(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  initPromise = null;
  if (typeof window !== 'undefined') {
    await set(DB_STORAGE_KEY, null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SCHEMA_VERSION_KEY);
    }
  }
  await getDb();
}

/**
 * Run a query that returns rows. Typed via generic.
 *
 * Example:
 *   const jobs = await queryAll<JobRow>('SELECT * FROM jobs LIMIT 20');
 */
export async function queryAll<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await getDb();
  const stmt = db.prepare(sql);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stmt.bind(params as any);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    return rows;
  } finally {
    stmt.free();
  }
}

/**
 * Run a query that returns a single row (or null).
 */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await queryAll<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Run a write statement (INSERT/UPDATE/DELETE) and persist.
 */
export async function run(
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  const db = await getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.run(sql, params as any);
  await persistDb();
}
