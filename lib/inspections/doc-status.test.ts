import { describe, it, expect } from 'vitest';
import { docTone, vehicleDocStatuses } from './doc-status';

describe('docTone', () => {
  const today = '2026-09-21';
  it('missing', () => expect(docTone(null, today)).toEqual({ tone: 'missing', daysLeft: null }));
  it('expired', () => expect(docTone('2026-09-20', today)).toEqual({ tone: 'expired', daysLeft: -1 }));
  it('expiring on the day and within 30', () => {
    expect(docTone('2026-09-21', today).tone).toBe('expiring');
    expect(docTone('2026-10-21', today).tone).toBe('expiring');
  });
  it('valid beyond 30 days', () => expect(docTone('2026-10-22', today)).toEqual({ tone: 'valid', daysLeft: 31 }));
});

describe('vehicleDocStatuses', () => {
  it('lists the six documents in order', () => {
    const rows = vehicleDocStatuses({ insurance_expiry: '2027-01-01', pollution_expiry_date: '2026-01-01' }, '2026-09-21');
    expect(rows.map((r) => r.label)).toEqual(['Insurance', 'Fitness (FC)', 'Permit', 'PUC', 'Road tax', 'Fire extinguisher']);
    expect(rows[0].tone).toBe('valid');
    expect(rows[3].tone).toBe('expired');
    expect(rows[1].tone).toBe('missing');
  });
});
