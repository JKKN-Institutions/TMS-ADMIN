/** 'HH:MM:SS' / 'HH:MM' → '7:30 AM'; '—' when missing/blank. */
export function formatStopTime(t: string | null | undefined): string {
  if (!t) return '—';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return t;
  const minute = mStr ?? '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${minute} ${ampm}`;
}
