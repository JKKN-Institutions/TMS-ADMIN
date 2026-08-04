import { describe, it, expect } from 'vitest';
import { buildStaffBillNotification, formatInr } from './staff-bill-notification';

const BASE = { amount: 10450, dueDate: '2026-08-31', stopName: 'SEELANAYAKKAM PATTI BYPASS', yearName: '2026-2027' };

describe('formatInr', () => {
  it('groups in the Indian lakh convention', () => {
    expect(formatInr(208550)).toBe('₹2,08,550');
  });

  it('formats a plain four-figure amount', () => {
    expect(formatInr(5500)).toBe('₹5,500');
  });

  it('drops a zero paise fraction', () => {
    expect(formatInr(10450.0)).toBe('₹10,450');
  });
});

describe('buildStaffBillNotification', () => {
  it('names the transport year in the title', () => {
    expect(buildStaffBillNotification(BASE).title).toBe('Transport fee 2026-2027 — bill generated');
  });

  it('states the amount and the due date in the body', () => {
    const { body } = buildStaffBillNotification(BASE);
    expect(body).toContain('₹10,450');
    expect(body).toContain('31 August 2026');
  });

  it('names the boarding stop the amount was derived from', () => {
    expect(buildStaffBillNotification(BASE).body).toContain('SEELANAYAKKAM PATTI BYPASS');
  });

  it('omits the stop clause when the stop is unknown', () => {
    const { body } = buildStaffBillNotification({ ...BASE, stopName: null });
    expect(body).toContain('₹10,450');
    expect(body).not.toContain('boarding stop');
  });

  it('links to the staff fees page under the transport category', () => {
    const n = buildStaffBillNotification(BASE);
    expect(n.url).toBe('/boarding/fees');
    expect(n.category).toBe('transport');
  });
});
