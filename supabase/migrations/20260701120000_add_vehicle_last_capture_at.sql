-- Ordering baseline for the driver-app live-tracking monotonic guard.
-- Kept separate from last_gps_update so freshness can key off SERVER-receipt time
-- while stale/duplicate rejection keeps ordering by the DEVICE capture time.
ALTER TABLE tms_vehicle
  ADD COLUMN IF NOT EXISTS last_capture_at timestamptz;

COMMENT ON COLUMN tms_vehicle.last_capture_at IS
  'Clamped device capture time of the last accepted driver-app GPS fix; ordering baseline for the ingest monotonic guard. last_gps_update holds server-receipt time for freshness.';
