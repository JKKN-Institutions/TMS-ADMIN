-- The evening return trip is coming back, switched on from Settings.
--
-- It needs its own on/off switch. The existing `enabled` column CANNOT be that
-- switch: in lib/boarding/attendance-window.ts `enabled = false` means "apply
-- no time limit", i.e. the window is open ALL DAY. Turning the evening row's
-- `enabled` off would open evening marking around the clock, not switch it off.
--
-- `is_active` is the switch. The morning row stays true and is never read as a
-- switch (morning attendance is always on). The evening row starts OFF.

alter table public.tms_attendance_window
  add column if not exists is_active boolean not null default true;

update public.tms_attendance_window
   set is_active = false
 where direction = 'return';
