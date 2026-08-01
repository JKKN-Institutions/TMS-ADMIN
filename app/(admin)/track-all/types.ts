import type { TrackingState } from '@/lib/gps/route-status';

export type { TrackingState };

export interface FleetRoute {
  routeId: string;
  routeNumber: string | null;
  routeName: string | null;
  driver: { id: string; name: string } | null;
  vehicle: { id: string; registrationNumber: string | null } | null;
  position: { lat: number; lng: number } | null;
  heading: number | null;
  /** Already converted from tms_vehicle.gps_speed (m/s) to km/h by the API. */
  speedKmh: number | null;
  accuracyM: number | null;
  distanceToCampusKm: number | null;
  lastFixAt: string | null;
  sharing: boolean;
  state: TrackingState;
  label: string;
  reason: string;
  tone: 'green' | 'amber' | 'red' | 'gray';
  fixHref: string | null;
  canNudge: boolean;
}

export interface FleetSummary {
  /** Every route in tms_route. */
  total: number;
  /** Routes with both a driver and a vehicle — the honest denominator. */
  trackable: number;
  /** Routes currently in state live or recent — the honest numerator. */
  reporting: number;
  live: number;
  recent: number;
  paused: number;
  stuck: number;
  off: number;
  noVehicle: number;
  noDriver: number;
  unconfigured: number;
}

export interface FleetResponse {
  success: true;
  summary: FleetSummary;
  routes: FleetRoute[];
}
