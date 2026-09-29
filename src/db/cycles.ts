import { isValid, parseISO } from 'date-fns';
import { getDb } from './database';
import type { Cycle, NewCycle } from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s: string) {
  return DATE_RE.test(s) && isValid(parseISO(s));
}

function validate(c: NewCycle) {
  if (!isValidDate(c.startDate)) {
    throw new Error('Date de début invalide');
  }
  if (c.endDate !== null) {
    if (!isValidDate(c.endDate)) throw new Error('Date de fin invalide');
    // Le format YYYY-MM-DD se compare correctement comme du texte
    if (c.endDate < c.startDate) {
      throw new Error('La fin ne peut pas précéder le début');
    }
  }
}

const SELECT = `
  SELECT id, start_date AS startDate, end_date AS endDate, notes
  FROM cycles
`;

// Triés du plus ancien au plus récent (pratique pour les calculs)
export async function getAllCycles(): Promise<Cycle[]> {
  const db = await getDb();
  return db.getAllAsync<Cycle>(`${SELECT} ORDER BY start_date ASC`);
}

export async function getCycleById(id: number): Promise<Cycle | null> {
  const db = await getDb();
  return db.getFirstAsync<Cycle>(`${SELECT} WHERE id = ?`, [id]);
}

export async function addCycle(c: NewCycle): Promise<number> {
  validate(c);
  const db = await getDb();
  const result = await db.runAsync(
    'INSERT INTO cycles (start_date, end_date, notes) VALUES (?, ?, ?)',
    [c.startDate, c.endDate, c.notes]
  );
  return result.lastInsertRowId;
}

export async function updateCycle(cycle: Cycle): Promise<void> {
  validate(cycle);
  const db = await getDb();
  await db.runAsync(
    'UPDATE cycles SET start_date = ?, end_date = ?, notes = ? WHERE id = ?',
    [cycle.startDate, cycle.endDate, cycle.notes, cycle.id]
  );
}

export async function deleteCycle(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM cycles WHERE id = ?', [id]);
}

export async function resetCycles(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM cycles');
}