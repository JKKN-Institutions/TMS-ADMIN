import { describe, it, expect } from 'vitest';
import { deriveFineStatus } from './list';

const TODAY = '2026-08-20';

describe('deriveFineStatus', () => {
  it('reports a cancelled fine as cancelled whatever the money row says', () => {
    expect(
      deriveFineStatus(
        'cancelled',
        { status: 'unpaid', balance_amount: 500, due_date: '2026-01-01' },
        TODAY
      )
    ).toBe('cancelled');
  });

  it('reports paid from the money row', () => {
    expect(
      deriveFineStatus('generated', { status: 'paid', balance_amount: 0, due_date: '2026-01-01' }, TODAY)
    ).toBe('paid');
  });

  it('reports overdue when unpaid and past due', () => {
    expect(
      deriveFineStatus(
        'generated',
        { status: 'unpaid', balance_amount: 500, due_date: '2026-08-19' },
        TODAY
      )
    ).toBe('overdue');
  });

  it('reports unpaid when the due date has not passed', () => {
    expect(
      deriveFineStatus(
        'generated',
        { status: 'unpaid', balance_amount: 500, due_date: '2026-09-04' },
        TODAY
      )
    ).toBe('unpaid');
  });

  it('reports unknown when the money row is missing', () => {
    expect(deriveFineStatus('generated', null, TODAY)).toBe('unknown');
  });
});
