/**
 * Client-side SQLite via sql.js, persisted to IndexedDB.
 *
 * On first load: creates a fresh DB, runs SCHEMA_SQL, seeds the channels table.
 * On subsequent loads: restores the saved DB bytes from IndexedDB.
 * After every write: persists the DB bytes back to IndexedDB.
 *
 * Usage (only in client components):
 *   import { getDb, persistDb, queryAll, run } from '@/lib/db';
 */

import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { get, set, del } from 'idb-keyval';
import { SCHEMA_SQL } from './schema';
import { CHANNEL_CONFIGS } from './channels';

let SQL: SqlJsStatic | null = null;
let dbInstance: Database | null = null;
let initPromise: Promise<Database> | null = null;

const DB_STORAGE_KEY = 'tja-sqlite-db';
const SCHEMA_VERSION_KEY = 'tja-schema-version';
const CURRENT_SCHEMA_VERSION = '4'; // bumped — old DBs with stale pending messages get re-created

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  console.log('[db] loading sql.js WASM from /sql-wasm.wasm');
  SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' });
  console.log('[db] sql.js loaded');
  return SQL;
}

async function loadExistingDbBytes(): Promise<Uint8Array | null> {
  if (typeof window === 'undefined') return null;
  try {
    const stored = await get<Uint8Array>(DB_STORAGE_KEY);
    return stored ?? null;
  } catch (err) {
    console.warn('[db] loadExistingDbBytes failed:', err);
    return null;
  }
}

function applySchema(db: Database): void {
  console.log('[db] applying schema');
  db.run(SCHEMA_SQL);
  // Seed channels table if empty
  const result = db.exec(`SELECT COUNT(*) as c FROM channels`);
  const count = result[0]?.values?.[0]?.[0] ?? 0;
  console.log(`[db] channels table has ${count} rows`);
  if (count === 0) {
    console.log('[db] seeding channels table');
    for (const c of CHANNEL_CONFIGS) {
      db.run(
        `INSERT OR IGNORE INTO channels (username, display_name, channel_type, is_active, config_json)
         VALUES (?, ?, ?, 1, ?)`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [c.telegram_username, c.display_name, c.channel_type, JSON.stringify(c)] as any,
      );
    }
    console.log(`[db] seeded ${CHANNEL_CONFIGS.length} channels`);
  }
  // Verify tables exist (for debugging)
  const tables = db.exec(
    `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
  );
  const tableNames = tables[0]?.values?.map((v) => v[0]) ?? [];
  console.log('[db] tables in DB:', tableNames);
}

function ensureSchema(db: Database): void {
  const storedVersion =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(SCHEMA_VERSION_KEY) ?? '0'
      : '0';
  console.log(`[db] stored schema version: ${storedVersion}, current: ${CURRENT_SCHEMA_VERSION}`);
  if (storedVersion !== CURRENT_SCHEMA_VERSION) {
    applySchema(db);
    // v4 migration: reset all raw_messages back to 'pending' so the new
    // sync logic (which always extracts pending) will pick them up.
    // This fixes the bug where messages were inserted but never extracted.
    if (storedVersion < '4') {
      try {
        db.run(`UPDATE raw_messages SET status = 'pending' WHERE status IN ('extracted', 'failed')`);
        console.log('[db] v4 migration: reset raw_messages status to pending');
      } catch (err) {
        console.warn('[db] v4 migration failed:', err);
      }
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SCHEMA_VERSION_KEY, CURRENT_SCHEMA_VERSION);
    }
  }
}

export async function getDb(): Promise<Database> {
  if (typeof window === 'undefined') {
    throw new Error('getDb() can only be called in the browser');
  }
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const sql = await loadSqlJs();
    const existingBytes = await loadExistingDbBytes();
    console.log(`[db] existing DB bytes: ${existingBytes?.length ?? 0}`);

    if (existingBytes && existingBytes.length > 0) {
      try {
        dbInstance = new sql.Database(existingBytes);
        console.log('[db] restored existing DB from IndexedDB');
      } catch (err) {
        console.warn('[db] failed to restore DB, starting fresh:', err);
        dbInstance = new sql.Database();
      }
    } else {
      console.log('[db] no existing DB, creating fresh');
      dbInstance = new sql.Database();
    }

    ensureSchema(dbInstance);
    await persistDb();
    return dbInstance;
  })();

  return initPromise;
}

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
 * Reset the DB entirely — truly wipes IndexedDB and re-creates everything.
 */
export async function resetDb(): Promise<void> {
  console.log('[db] resetDb — wiping everything');
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (err) {
      console.warn('[db] error closing old instance:', err);
    }
    dbInstance = null;
  }
  initPromise = null;
  if (typeof window !== 'undefined') {
    // Actually delete from IndexedDB (not just set to null)
    try {
      await del(DB_STORAGE_KEY);
    } catch (err) {
      console.warn('[db] failed to delete IndexedDB key:', err);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SCHEMA_VERSION_KEY);
    }
  }
  console.log('[db] IndexedDB wiped, re-initializing fresh DB');
  await getDb();
  console.log('[db] reset complete');
}

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

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await queryAll<T>(sql, params);
  return rows[0] ?? null;
}

export async function run(
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  const db = await getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.run(sql, params as any);
  await persistDb();
}

export async function runWithChanges(
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  const db = await getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.run(sql, params as any);
  const changes = db.getRowsModified();
  await persistDb();
  return changes;
}

/**
 * Debug helper — returns table counts for the admin debug panel.
 */
export async function getDbStats(): Promise<Record<string, number>> {
  try {
    const tables = ['channels', 'raw_messages', 'jobs', 'user_preferences', 'user_interactions'];
    const stats: Record<string, number> = {};
    for (const t of tables) {
      try {
        const rows = await queryAll<{ c: number }>(`SELECT COUNT(*) as c FROM ${t}`);
        stats[t] = rows[0]?.c ?? 0;
      } catch {
        stats[t] = -1; // table doesn't exist
      }
    }
    return stats;
  } catch (err) {
    console.error('[db] getDbStats failed:', err);
    return { error: (err as Error).message };
  }
}
