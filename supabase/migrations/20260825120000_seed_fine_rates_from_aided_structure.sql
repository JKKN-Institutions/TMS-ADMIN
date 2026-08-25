-- Seed the 2026-2027 transport fine sheet from the Arts Aided stop-wise fee structure.
--
-- The fine sheet (tms_fine_stop_rate) is keyed to a transport YEAR, not to a fee
-- structure, and held a single hand-typed row -- so resolveFine() reported
-- 'no_stop_rate' for every learner but one. Policy is that a fine equals the
-- stop's FULL annual transport fee, so we copy the aided structure's per-stop
-- annual_amount across, stop for stop.
--
-- This is a one-way COPY, deliberately not a view: revising a transport fee must
-- never silently move fine amounts. Re-run the "Copy from fee structure" action
-- on /fees/fine-rates after a rate revision.
--
-- Rows priced at 0 are skipped: resolveFine() treats 0 as unpriced, so writing
-- one would look like a configured rate while behaving like a missing one.
--
-- Idempotent: re-running re-asserts the same amounts.
insert into tms_fine_stop_rate (transport_year_id, stop_id, fine_amount, updated_at)
select '6b3768f9-c9fb-48d5-a955-41949983c3b0'::uuid, r.stop_id, r.annual_amount, now()
from tms_fee_structure_stop_rate r
where r.fee_structure_id = '9f8f5153-d45a-4fbf-85f2-c399292c201b'
  and r.annual_amount > 0
on conflict (transport_year_id, stop_id)
do update set fine_amount = excluded.fine_amount, updated_at = now();

-- Applied to production 2026-08-25: 464 inserted, 1 overwritten
-- (JEEVA SHAKTHI 12,500 -> 12,900), 465 rows total, 0 mismatches.
-- 106 active stops are absent from the aided structure and stay unpriced;
-- 28 learners sit on those stops and will still skip with 'no_stop_rate'.
