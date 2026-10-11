import { addDaysISO, diffDays, isValidISODate } from './dates';

export type Period = { startDate: string; endDate: string | null };
export type StoredPeriod = Period & { id: number };

export type Prediction = {
  startDate: string;
  endDate: string;
  cycleLength: number;  // jours entre deux débuts de règles
  periodLength: number; // durée des règles, jour de début et de fin inclus
};

export const DEFAULT_PERIOD_LENGTH = 5;
const DEFAULT_CYCLE_LENGTH = 28;
const MIN_CYCLE_LENGTH = 15; // hors de cette plage : probablement un oubli de saisie
const MAX_CYCLE_LENGTH = 60;
const HISTORY = 6;           // nombre de cycles pris en compte

const average = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;

/** Durée réelle en jours (début et fin inclus), ou null sans date de fin valide */
export const periodDays = (p: Period) =>
  p.endDate && p.endDate >= p.startDate ? diffDays(p.endDate, p.startDate) + 1 : null;

/** Dernier jour à afficher : la date de fin, ou à défaut la durée habituelle des règles */
export const displayEnd = (p: Period, periodLength: number) =>
  p.endDate && p.endDate >= p.startDate ? p.endDate : addDaysISO(p.startDate, periodLength - 1);

export function predictNextPeriod(periods: Period[]): Prediction | null {
  if (periods.length === 0) return null;
  const sorted = [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate));

  // Longueur de cycle = écart entre deux DÉBUTS consécutifs (pas entre une fin et un début)
  const cycleLengths = sorted
    .slice(1)
    .map((p, i) => diffDays(p.startDate, sorted[i].startDate))
    .filter(n => n >= MIN_CYCLE_LENGTH && n <= MAX_CYCLE_LENGTH)
    .slice(-HISTORY);

  // Durée des règles : seulement pour celles qui ont une date de fin
  const periodLengths = sorted
    .map(p => periodDays(p))
    .filter((n): n is number => n !== null)
    .slice(-HISTORY);

  const cycleLength = cycleLengths.length ? Math.round(average(cycleLengths)) : DEFAULT_CYCLE_LENGTH;
  const periodLength = periodLengths.length ? Math.round(average(periodLengths)) : DEFAULT_PERIOD_LENGTH;

  // On part du DERNIER début saisi, même si ces règles n'ont pas encore de date de fin
  const last = sorted[sorted.length - 1];
  const startDate = addDaysISO(last.startDate, cycleLength);
  return { startDate, endDate: addDaysISO(startDate, periodLength - 1), cycleLength, periodLength };
}

export type PeriodError =
  | { code: 'invalid-start' }
  | { code: 'invalid-end' }
  | { code: 'end-before-start' }
  | { code: 'overlap'; with: string }; // début du cycle en conflit

/**
 * Vérifie une saisie (dates sous forme de texte, '' = pas de date de fin).
 * `id` = cycle en cours de modification (ignoré dans la recherche de chevauchement), null pour un ajout.
 */
export function validatePeriod(
  input: { id: number | null; startDate: string; endDate: string },
  existing: StoredPeriod[],
  periodLength: number,
): PeriodError | null {
  const { id, startDate, endDate } = input;
  if (!isValidISODate(startDate)) return { code: 'invalid-start' };
  if (endDate && !isValidISODate(endDate)) return { code: 'invalid-end' };
  if (endDate && endDate < startDate) return { code: 'end-before-start' };

  // Sans date de fin, seul le jour de début compte pour détecter un chevauchement
  const end = endDate || startDate;
  const clash = existing.find(
    p => p.id !== id && startDate <= displayEnd(p, periodLength) && end >= p.startDate,
  );
  return clash ? { code: 'overlap', with: clash.startDate } : null;
}