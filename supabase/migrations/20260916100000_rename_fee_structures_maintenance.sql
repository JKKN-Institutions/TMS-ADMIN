-- Rename the transport fee structures to say MAINTENANCE fee.
--
-- The institution collects a Transport Maintenance Fee; a learner who does not
-- pay it is charged a Transport Fee (the penalty ledger, tms_fee_fine). The
-- structure names still read "Transport Fees", which now reads as the penalty.
--
-- Display-only and safe:
--   * bill_description is composed from billing_categories.category_name
--     (lib/fees/generate.ts), never from the structure name;
--   * no DB function or view references the string 'Transport Fees'
--     (checked pg_proc.prosrc + pg_views.definition, 0 hits).
-- Renamed by ID, not by name pattern, so a re-run cannot catch a future
-- structure that happens to match. 'Testing' is deliberately left alone.

do $$
declare
  v_n int;
begin
  update public.tms_fee_structure set name = 'Transport Maintenance Fee 2026-2027'
   where id = '6b2ebf76-f06d-4f40-95fb-f8654f152f16';
  update public.tms_fee_structure set name = 'Transport Maintenance Fee 2026-2027 (Arts Aided)'
   where id = '9f8f5153-d45a-4fbf-85f2-c399292c201b';
  update public.tms_fee_structure set name = 'Transport Maintenance Fee 2026-2027 (Arts Self)'
   where id = '4716ae9e-7850-458e-bf9e-2401d414a098';
  update public.tms_fee_structure set name = 'Transport Maintenance Fee 2026-2027 (Staff - All Colleges)'
   where id = '1cff2da9-565b-4618-9c21-68fb66c52aad';

  select count(*) into v_n from public.tms_fee_structure
   where name like 'Transport Maintenance Fee 2026-2027%';
  if v_n <> 4 then
    raise exception 'Expected 4 renamed structures, found %', v_n;
  end if;
end $$;
