/**
 * Unit tests for the pure roster-tally rule.
 *
 * Regression origin: /staff-route-assignments showed "0/0" passengers on every
 * row because it rendered tms_route.current_passengers — a denormalized column
 * that is created with `default 0` and never written by any code path. The count
 * must be derived from real allocation instead; these tests pin that rule.
 */
import { describe, it, expect } from 'vitest';
import { countRosterByRoute } from './types';

const R1 = '11111111-1111-1111-1111-111111111111';
const R2 = '22222222-2222-2222-2222-222222222222';

describe('countRosterByRoute', () => {
  it('returns an empty map when given no rows', () => {
    expect(countRosterByRoute([]).size).toBe(0);
    expect(countRosterByRoute().size).toBe(0);
  });

  it('counts learners per route', () => {
    const counts = countRosterByRoute([
      { transport_route_id: R1 },
      { transport_route_id: R1 },
      { transport_route_id: R2 },
    ]);
    expect(counts.get(R1)).toBe(2);
    expect(counts.get(R2)).toBe(1);
  });

  it('sums learners and staff into one rider count per route', () => {
    const learners = [{ transport_route_id: R1 }, { transport_route_id: R1 }];
    const staff = [{ transport_route_id: R1 }, { transport_route_id: R2 }];
    const counts = countRosterByRoute(learners, staff);
    // A route's passengers are learners AND staff — the same definition the
    // driver and boarding portals use, so all three screens agree.
    expect(counts.get(R1)).toBe(3);
    expect(counts.get(R2)).toBe(1);
  });

  it('ignores rows with no route allocation', () => {
    const counts = countRosterByRoute([
      { transport_route_id: null },
      { transport_route_id: R1 },
    ]);
    expect(counts.get(R1)).toBe(1);
    expect(counts.size).toBe(1);
  });

  it('reports an unallocated route as absent, not zero', () => {
    // Callers render `counts.get(id) ?? 0`; the map itself stays sparse.
    const counts = countRosterByRoute([{ transport_route_id: R1 }]);
    expect(counts.has(R2)).toBe(false);
  });
});
