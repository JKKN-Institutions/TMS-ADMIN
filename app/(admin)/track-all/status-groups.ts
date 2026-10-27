import type { TrackingState } from './types';
import type { FleetRoute } from './types';

/**
 * The five groups an admin acts on, most urgent first. Shared by the summary
 * cards (which filter), the list order and the map legend so all three agree.
 *
 *  - Can't track: the route has a driver or a bus but not both.
 *  - Paused / stuck: sharing, but positions stopped arriving.
 *  - Not sharing: driver and bus present, driver hasn't gone on duty.
 *  - Reporting: positions arriving now.
 *  - Not set up: neither driver nor bus.
 */
export type GroupKey = 'cant' | 'problem' | 'off' | 'reporting' | 'setup';

export const STATUS_GROUPS: {
  key: GroupKey;
  label: string;
  states: TrackingState[];
  dot: string;
  tone: 'danger' | 'warn' | 'good' | 'neutral';
  color: string;
}[] = [
  { key: 'cant', label: "Can't track", states: ['no_vehicle', 'no_driver'], dot: 'bg-red-500', tone: 'danger', color: '#EF4444' },
  { key: 'problem', label: 'Paused / stuck', states: ['paused', 'stuck'], dot: 'bg-amber-500', tone: 'warn', color: '#F59E0B' },
  { key: 'off', label: 'Not sharing', states: ['off'], dot: 'bg-yellow-400', tone: 'warn', color: '#EAB308' },
  { key: 'reporting', label: 'Reporting', states: ['live', 'recent'], dot: 'bg-green-500', tone: 'good', color: '#10B981' },
  { key: 'setup', label: 'Not set up', states: ['unconfigured'], dot: 'bg-gray-400', tone: 'neutral', color: '#6B7280' },
];

export function groupOf(state: TrackingState): (typeof STATUS_GROUPS)[number] {
  return STATUS_GROUPS.find((g) => g.states.includes(state)) ?? STATUS_GROUPS[STATUS_GROUPS.length - 1];
}

/** Rough minutes to campus at a 30 km/h average — labelled "about" wherever shown. */
export function etaMinutes(r: FleetRoute): number | null {
  if (r.distanceToCampusKm == null) return null;
  return Math.max(1, Math.round((r.distanceToCampusKm / 30) * 60));
}
