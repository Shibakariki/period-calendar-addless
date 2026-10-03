import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const CYCLES_TABLE_COLUMNS = `
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_date TEXT NOT NULL UNIQUE,
  end_date TEXT,
  notes TEXT,
  predicted_cycle_time INTEGER NOT NULL
`;

// Ouvre la base une seule fois pour toute l'app
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = openAndMigrate();
  return dbPromise;
}

export const createTable = async (tableName: string, columns: string) => {
  const db = await getDb();
  await db.execAsync(`
      CREATE TABLE IF NOT EXISTS ${tableName} (${columns});
    `);
};

async function ensureCyclesTable(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS cycles (${CYCLES_TABLE_COLUMNS});`);
}

export async function recreateCyclesTable(): Promise<void> {
  const db = await getDb();
  await db.execAsync('DROP TABLE IF EXISTS cycles;');
  await ensureCyclesTable(db);
}

  async function openAndMigrate() {
  const db = await SQLite.openDatabaseAsync('cycles.db');
  await db.execAsync('PRAGMA journal_mode = WAL;');

  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const version = row?.user_version ?? 0;
  console.log(`Current database version: ${version}`);

  if (version < 1) {
    await ensureCyclesTable(db);
    await db.execAsync('PRAGMA user_version = 1;');
  }
  // Futur : if (version < 2) { ALTER TABLE ...; PRAGMA user_version = 2; }

  return db;
}