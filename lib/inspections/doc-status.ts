import { daysBetween } from './due';

export const DOC_WARN_DAYS = 30;
export type DocTone = 'valid' | 'expiring' | 'expired' | 'missing';

/** The statutory/safety dates shown on the bus card, in display order. */
export const VEHICLE_DOCS = [
  { key: 'insurance_expiry', label: 'Insurance' },
  { key: 'fitness_expiry', label: 'Fitness (FC)' },
  { key: 'permit_expiry_date', label: 'Permit' },
  { key: 'pollution_expiry_date', label: 'PUC' },
  { key: 'road_tax_expiry_date', label: 'Road tax' },
  { key: 'fire_extinguisher_expiry', label: 'Fire extinguisher' },
] as const;

export interface DocStatus { key: string; label: string; expiry: string | null; tone: DocTone; daysLeft: number | null }

export function docTone(expiry: string | null, today: string): { tone: DocTone; daysLeft: number | null } {
  if (!expiry) return { tone: 'missing', daysLeft: null };
  const daysLeft = daysBetween(today, expiry.slice(0, 10));
  if (daysLeft < 0) return { tone: 'expired', daysLeft };
  return { tone: daysLeft <= DOC_WARN_DAYS ? 'expiring' : 'valid', daysLeft };
}

export function vehicleDocStatuses(v: Record<string, unknown>, today: string): DocStatus[] {
  return VEHICLE_DOCS.map(({ key, label }) => {
    const expiry = typeof v[key] === 'string' ? (v[key] as string) : null;
    return { key, label, expiry, ...docTone(expiry, today) };
  });
}
