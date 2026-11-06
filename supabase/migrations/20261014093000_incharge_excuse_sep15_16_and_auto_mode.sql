-- Owner decision 2026-10-14: excuse 15 and 16 Sep 2026 for the in-charge
-- bill review (route 24 missed scan on 15 Sep; 16 Sep was the scan-only
-- switchover day), then switch the review from preview to auto.
--
-- APPLIED to the live DB 2026-10-14. Preview run before switching: 24 pass /
-- 13 fail (was 20 / 17); no previous pass flipped to fail. The auto run for
-- 2026-09 then cancelled 24 staff bills, Rs 3,45,000. Remaining staff_deferred:
-- 13 bills, Rs 1,43,400.

insert into tms_incharge_excused_day (day, reason) values
  ('2026-09-15', 'Bus scan missed (route 24) - owner excused 2026-10-14'),
  ('2026-09-16', 'Scan-only switchover day - owner excused 2026-10-14')
on conflict (day) do nothing;

update admin_settings
   set settings_data = jsonb_set(settings_data, '{mode}', '"auto"')
 where setting_type = 'incharge_bill_cancel';
