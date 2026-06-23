/**
 * Pure month-grid layout for the booking calendar. Lays out a 'YYYY-MM' as
 * Sunday-first weeks, padding leading/trailing slots with null so the grid is
 * always whole 7-cell rows. UTC integer math only (no timezone drift).
 */
export function monthGrid(monthStr: string): (string | null)[][] {
  const [y, m] = monthStr.split('-').map(Number);
  const startDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=Sun..6=Sat
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= last; d++) cells.push(`${monthStr}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** 'YYYY-MM' shifted by ±delta months. */
export function addMonth(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Current month 'YYYY-MM' in IST (+05:30). */
export function istMonth(now: Date = new Date()): string {
  return new Date(now.getTime() + (5 * 60 + 30) * 60_000).toISOString().slice(0, 7);
}
