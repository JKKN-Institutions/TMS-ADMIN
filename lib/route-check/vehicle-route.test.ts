import { describe, it, expect } from 'vitest';
import { makeFakeSupabase } from '@/lib/fees/__testing__/fake-supabase';
import { liveVehicleId } from './vehicle-route';

// Four active routes (05, 06, 07, 14 on 2026-09-24) point at tms_vehicle rows
// that no longer exist. Copying that id onto a new check broke the
// tms_route_check.vehicle_id foreign key (PostgREST 409), so the inspector
// could not start a check at all on those routes.
describe('liveVehicleId', () => {
  it('keeps the bus when it exists', async () => {
    const svc = makeFakeSupabase({ tms_vehicle: [{ id: 'V1' }] });
    expect(await liveVehicleId(svc as never, 'V1')).toBe('V1');
  });

  it('drops a route bus link that points at a missing vehicle', async () => {
    const svc = makeFakeSupabase({ tms_vehicle: [] });
    expect(await liveVehicleId(svc as never, 'GONE')).toBeNull();
  });

  it('is null (and makes no query) when the route has no bus', async () => {
    const svc = makeFakeSupabase({ tms_vehicle: [{ id: 'V1' }] });
    expect(await liveVehicleId(svc as never, null)).toBeNull();
    expect(svc.calls).toHaveLength(0);
  });

  it('throws on a read error rather than silently dropping a real bus', async () => {
    const svc = makeFakeSupabase({ tms_vehicle: [] }, { errors: { tms_vehicle: { message: 'boom' } } });
    await expect(liveVehicleId(svc as never, 'V1')).rejects.toThrow('boom');
  });
});
