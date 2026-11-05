import { describe, it, expect } from 'vitest';
import { pickRequestedRoutes } from './requested-route';

const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';
const S1 = '33333333-3333-4333-8333-333333333333';

describe('pickRequestedRoutes', () => {
  it('reads route and stop from form_data', () => {
    const m = pickRequestedRoutes([
      { requester_id: 'p1', created_at: '2026-09-01', form_data: { bus_route: R1, boarding_stop: S1 } },
    ]);
    expect(m.get('p1')).toEqual({ routeId: R1, stopId: S1 });
  });

  it('keeps the latest request per learner regardless of order', () => {
    const m = pickRequestedRoutes([
      { requester_id: 'p1', created_at: '2026-09-10', form_data: { bus_route: R2 } },
      { requester_id: 'p1', created_at: '2026-09-01', form_data: { bus_route: R1 } },
    ]);
    expect(m.get('p1')?.routeId).toBe(R2);
  });

  it('treats an empty boarding_stop as no stop', () => {
    const m = pickRequestedRoutes([
      { requester_id: 'p1', created_at: '2026-09-01', form_data: { bus_route: R1, boarding_stop: '' } },
    ]);
    expect(m.get('p1')).toEqual({ routeId: R1, stopId: null });
  });

  it('skips requests without a usable route id', () => {
    const m = pickRequestedRoutes([
      { requester_id: 'p1', created_at: '2026-09-01', form_data: { bus_route: '' } },
      { requester_id: 'p2', created_at: '2026-09-01', form_data: { bus_route: 'Route 10' } },
      { requester_id: 'p3', created_at: '2026-09-01', form_data: null },
    ]);
    expect(m.size).toBe(0);
  });
});
