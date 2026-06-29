import { describe, it, expect } from 'vitest';
import { recommendRightsizing, type RightsizeRouteInput, type FleetVehicle } from './rightsize';

const OPTS = { headroomPercent: 15, minDemand: 1 };

const r = (o: Partial<RightsizeRouteInput> & { routeId: string }): RightsizeRouteInput => ({
  routeName: o.routeId, routeNumber: null, demand: 0, currentVehicleId: 'cur', currentCapacity: 60, ...o,
});
const fleet = (...caps: number[]): FleetVehicle[] =>
  caps.map((c, i) => ({ id: `v${c}-${i}`, capacity: c, label: `REG-${c}` }));

describe('recommendRightsizing', () => {
  it('downsizes an over-provisioned route to the smallest fitting spare', () => {
    const out = recommendRightsizing([r({ routeId: 'A', demand: 18, currentCapacity: 61 })], fleet(42, 55), OPTS);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('downsize');
    expect(out[0].recommendedCapacity).toBe(42);
  });

  it('upsizes an over-capacity route to the smallest fitting spare', () => {
    const out = recommendRightsizing([r({ routeId: 'B', demand: 47, currentCapacity: 42 })], fleet(55, 61), OPTS);
    expect(out[0].kind).toBe('upsize');
    expect(out[0].recommendedCapacity).toBe(55);
  });

  it('reports no_fit when over capacity and no spare is large enough', () => {
    const out = recommendRightsizing([r({ routeId: 'C', demand: 60, currentCapacity: 42 })], fleet(55), OPTS);
    expect(out[0].kind).toBe('no_fit');
    expect(out[0].recommendedVehicleId).toBe(null);
  });

  it('leaves a good-fit route alone', () => {
    const out = recommendRightsizing([r({ routeId: 'D', demand: 50, currentCapacity: 55 })], fleet(42), OPTS);
    expect(out).toHaveLength(0);
  });

  it('ignores routes below minDemand', () => {
    const out = recommendRightsizing([r({ routeId: 'E', demand: 0, currentCapacity: 61 })], fleet(42), OPTS);
    expect(out).toHaveLength(0);
  });

  it('uses each spare vehicle at most once', () => {
    const out = recommendRightsizing(
      [r({ routeId: 'A', demand: 18, currentCapacity: 61 }), r({ routeId: 'B', demand: 18, currentCapacity: 61 })],
      fleet(42),
      OPTS
    );
    expect(out.filter((s) => s.kind === 'downsize')).toHaveLength(1);
  });
});
