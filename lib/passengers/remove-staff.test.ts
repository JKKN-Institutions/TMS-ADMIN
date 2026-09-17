import { describe, it, expect } from 'vitest';
import { parseRemoveStaffIds, MAX_REMOVE_STAFF, REMOVE_FROM_TRANSPORT_PATCH } from './remove-staff';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('parseRemoveStaffIds', () => {
  it('accepts a list of uuids and de-duplicates it', () => {
    expect(parseRemoveStaffIds({ ids: [A, B, A] })).toEqual({ ids: [A, B] });
  });

  it('rejects a missing or empty list', () => {
    expect(parseRemoveStaffIds({})).toHaveProperty('error');
    expect(parseRemoveStaffIds({ ids: [] })).toHaveProperty('error');
    expect(parseRemoveStaffIds(null)).toHaveProperty('error');
  });

  it('rejects anything that is not a uuid (no filter injection)', () => {
    expect(parseRemoveStaffIds({ ids: [A, 'x,id.neq.0'] })).toHaveProperty('error');
    expect(parseRemoveStaffIds({ ids: [42] })).toHaveProperty('error');
  });

  it('caps the batch size', () => {
    const many = Array.from({ length: MAX_REMOVE_STAFF + 1 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
    );
    expect(parseRemoveStaffIds({ ids: many })).toHaveProperty('error');
    expect(parseRemoveStaffIds({ ids: many.slice(0, MAX_REMOVE_STAFF) })).toHaveProperty('ids');
  });
});

describe('REMOVE_FROM_TRANSPORT_PATCH', () => {
  it('only touches the transport columns — never deletes or deactivates the person', () => {
    expect(REMOVE_FROM_TRANSPORT_PATCH).toEqual({
      bus_required: false,
      transport_route_id: null,
      transport_stop_id: null,
    });
    expect(REMOVE_FROM_TRANSPORT_PATCH).not.toHaveProperty('is_active');
  });
});
