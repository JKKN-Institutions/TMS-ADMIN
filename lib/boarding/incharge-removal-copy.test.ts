import { describe, expect, it } from 'vitest';
import { buildRemovalBillCopy, type RemovalBillNotice } from './incharge-removal-copy';

const BASE: RemovalBillNotice = {
  routeNumber: '15',
  routeName: 'SALEM',
  inchargeCount: 5,
  missedDates: ['2026-08-11', '2026-08-12', '2026-08-13'],
  amount: 19800,
  dueDate: '2026-08-31',
  stopName: 'THIRUVAGOWNDANOOR BYPASS',
};

describe('buildRemovalBillCopy', () => {
  it('puts the amount in the title so the inbox line is actionable', () => {
    expect(buildRemovalBillCopy(BASE).title).toBe(
      'Transport fee ₹19,800 billed — bus in-charge role removed',
    );
  });

  it('groups Indian digits, which en-US would render as 1,00,000 wrongly', () => {
    const { title } = buildRemovalBillCopy({ ...BASE, amount: 100000 });
    expect(title).toContain('₹1,00,000');
  });

  it('drops trailing paise but keeps a real fractional amount', () => {
    expect(buildRemovalBillCopy({ ...BASE, amount: 19800.0 }).title).toContain('₹19,800');
    expect(buildRemovalBillCopy({ ...BASE, amount: 19800.5 }).title).toContain('₹19,800.50');
  });

  it('compacts dates that share a month instead of repeating it three times', () => {
    expect(buildRemovalBillCopy(BASE).body).toContain('11, 12 and 13 August 2026');
  });

  it('spells each date out in full when they span months', () => {
    const body = buildRemovalBillCopy({
      ...BASE,
      missedDates: ['2026-08-31', '2026-09-01', '2026-09-02'],
    }).body;
    expect(body).toContain('31 August 2026, 1 September 2026 and 2 September 2026');
  });

  it('explains the route-level rule when the route has several in-charges', () => {
    const body = buildRemovalBillCopy(BASE).body;
    expect(body).toContain('per route, not per person');
    expect(body).toContain('Route 15 has 5 in-charges');
    expect(body).toContain('every in-charge on the route');
  });

  it('does not blame absent colleagues when the staffer is the only in-charge', () => {
    const body = buildRemovalBillCopy({ ...BASE, inchargeCount: 1 }).body;
    expect(body).toContain('You are the only in-charge assigned to Route 15');
    expect(body).not.toContain('has 1 in-charges');
    expect(body).not.toContain('every in-charge on the route');
  });

  it('states plainly that no warning was sent, per the disclosure decision', () => {
    expect(buildRemovalBillCopy(BASE).body).toContain('no warning was sent to you beforehand');
  });

  it('title-cases the stop so it does not shout mid-sentence', () => {
    expect(buildRemovalBillCopy(BASE).body).toContain('Thiruvagowndanoor Bypass');
    expect(buildRemovalBillCopy(BASE).body).not.toContain('THIRUVAGOWNDANOOR BYPASS');
  });

  it('omits the stop clause entirely rather than printing an empty dash', () => {
    const body = buildRemovalBillCopy({ ...BASE, stopName: null }).body;
    expect(body).toContain('the standard fee for your boarding stop has been billed');
    expect(body).not.toContain('—  —');
  });

  it('carries the amount and due date in the body too, not only the title', () => {
    const body = buildRemovalBillCopy(BASE).body;
    expect(body).toContain('₹19,800');
    expect(body).toContain('31 August 2026');
  });

  it('never invites the staffer to re-volunteer', () => {
    // Deliberate: they land on the willingness toggle to read this, and the
    // decision was to say nothing about re-assigning themselves. A future edit
    // that adds such wording must consciously delete this test.
    const body = buildRemovalBillCopy(BASE).body.toLowerCase();
    for (const phrase of ['volunteer', 'sign up again', 'opt in', 'reassign yourself']) {
      expect(body).not.toContain(phrase);
    }
  });

  it('tells them where to go when the removal looks wrong', () => {
    expect(buildRemovalBillCopy(BASE).body).toContain('Contact the transport office');
  });
});
