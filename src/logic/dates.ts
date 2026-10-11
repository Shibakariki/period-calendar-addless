const DAY = 86_400_000;

// 'YYYY-MM-DD' -> millisecondes à minuit UTC (l'UTC n'a pas de changement d'heure)
const toUTC = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export const addDaysISO = (iso: string, n: number) =>
  new Date(toUTC(iso) + n * DAY).toISOString().slice(0, 10);

/** a - b en jours (positif si a est après b) */
export const diffDays = (a: string, b: string) => Math.round((toUTC(a) - toUTC(b)) / DAY);

/** Date du jour dans le fuseau de l'utilisatrice (et non en UTC) */
export const todayISO = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Vrai pour une vraie date 'YYYY-MM-DD' (rejette '2026-02-30', '1/9/2026', ...) */
export const isValidISODate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && addDaysISO(s, 0) === s;