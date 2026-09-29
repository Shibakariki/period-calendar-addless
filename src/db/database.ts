import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Ouvre la base une seule fois pour toute l'app
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = openAndMigrate();
  return dbPromise;
}

async function openAndMigrate() {
  const db = await SQLite.openDatabaseAsync('cycles.db');
  await db.execAsync('PRAGMA journal_mode = WAL;');

  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const version = row?.user_version ?? 0;

  if (version < 1) {
    await db.execAsync(`
      CREATE TABLE cycles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        start_date TEXT NOT NULL UNIQUE,
        end_date TEXT,
        notes TEXT
      );
      PRAGMA user_version = 1;
    `);
  }
  // Futur : if (version < 2) { ALTER TABLE ...; PRAGMA user_version = 2; }

  return db;
}