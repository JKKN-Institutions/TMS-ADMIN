-- Who may RECEIVE the "attendance settings changed" signal on the private
-- Realtime topic 'tms_attendance_settings'. Mirrors tms_bus_realtime_receive
-- (for select, to authenticated), but is a separate policy: the bus policy is
-- not touched.
--
-- Only staff who may scan (tms.attendance.scan) receive it. The signal carries
-- no data at all — it only tells a screen to re-read the windows through
-- GET /api/boarding/attendance-window, which checks the same permission.

drop policy if exists tms_attendance_settings_realtime_receive on realtime.messages;

create policy tms_attendance_settings_realtime_receive
  on realtime.messages
  for select
  to authenticated
  using (
    topic = 'tms_attendance_settings'
    and public.user_has_permission('tms.attendance.scan')
  );
