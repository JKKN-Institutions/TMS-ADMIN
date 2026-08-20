-- AVATHIPALAYAM (route 34 KOKKARAYANPETTAI, sequence 16) had no Aided stop rate,
-- so its one bus_required learner (RAMYA R, AUG25CH10, Arts Aided) resolved as
-- `no_stop_rate` and was silently left UNBILLED for 2026-2027.
--
-- ₹9,600 matches both immediate neighbours on the same corridor — AGARAHARAM
-- (seq 14) and CHILLAN KADU (seq 17) — so this prices it consistently rather
-- than inventing a figure.
--
-- Scope is the Arts Aided structure ONLY, as requested. The Staff (All Colleges)
-- sheet is deliberately left alone here; no staff member boards this stop today.
-- That leaves the two stop_wise sheets at 464 vs 463 rates — the first time they
-- have diverged.
--
-- NOTE: the Aided structure has auto_generate=true and the pg_cron sweep runs
-- every 15 minutes, so this row causes RAMYA to be billed ₹9,600 (1 term, due
-- 2026-08-31) automatically, with no manual Generate.
insert into public.tms_fee_structure_stop_rate (fee_structure_id, stop_id, annual_amount)
values (
  '9f8f5153-d45a-4fbf-85f2-c399292c201b',  -- Transport Fees 2026-2027 (Arts Aided)
  '1c9ed362-bf98-41b8-9207-fe45f182ad9a',  -- AVATHIPALAYAM, route 34, seq 16
  9600
)
on conflict (fee_structure_id, stop_id) do update
  set annual_amount = excluded.annual_amount,
      updated_at = now();
