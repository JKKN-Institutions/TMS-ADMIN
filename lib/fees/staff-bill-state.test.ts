import { describe, it, expect } from 'vitest';
import { summarizeStaffBills } from './staff-bill-state';

describe('summarizeStaffBills', () => {
  it('reports no outstanding bill for an empty list', () => {
    expect(summarizeStaffBills([])).toEqual({
      hasOutstanding: false, outstandingAmount: 0, billIds: [],
    });
  });

  it('counts a staff_deferred, unpaid bill as outstanding', () => {
    expect(summarizeStaffBills([
      { id: 'a', amount: 13310, status: 'staff_deferred', paid_at: null },
    ])).toEqual({ hasOutstanding: true, outstandingAmount: 13310, billIds: ['a'] });
  });

  it('counts a generated, unpaid bill as outstanding', () => {
    expect(summarizeStaffBills([
      { id: 'a', amount: 500, status: 'generated', paid_at: null },
    ])).toEqual({ hasOutstanding: true, outstandingAmount: 500, billIds: ['a'] });
  });

  it('ignores a cancelled bill', () => {
    expect(summarizeStaffBills([
      { id: 'a', amount: 13310, status: 'cancelled', paid_at: null },
    ])).toEqual({ hasOutstanding: false, outstandingAmount: 0, billIds: [] });
  });

  it('ignores a paid bill even when its status is still generated', () => {
    // paid_at is the authority on settlement, not status -- the admin
    // mark-paid path writes paid_at and leaves status alone.
    expect(summarizeStaffBills([
      { id: 'a', amount: 13310, status: 'generated', paid_at: '2026-08-20T05:00:00Z' },
    ])).toEqual({ hasOutstanding: false, outstandingAmount: 0, billIds: [] });
  });

  it('sums several outstanding terms and keeps every id', () => {
    expect(summarizeStaffBills([
      { id: 'a', amount: 1000, status: 'staff_deferred', paid_at: null },
      { id: 'b', amount: 2000, status: 'staff_deferred', paid_at: null },
      { id: 'c', amount: 9999, status: 'cancelled', paid_at: null },
    ])).toEqual({ hasOutstanding: true, outstandingAmount: 3000, billIds: ['a', 'b'] });
  });

  it('coerces a string amount from the numeric column', () => {
    // Supabase returns `numeric` as a string. Adding it unconverted yields
    // '01000' rather than 1000 and silently understates every total.
    expect(summarizeStaffBills([
      { id: 'a', amount: '1000' as unknown as number, status: 'generated', paid_at: null },
      { id: 'b', amount: '250.50' as unknown as number, status: 'generated', paid_at: null },
    ]).outstandingAmount).toBe(1250.5);
  });
});
