-- The 26 charges raised before the 2026-09-16 rename read "Transport Fine — …".
-- The penalty is called the Transport Fee everywhere now (UI, notifications and
-- lib/fines/create.ts), so bring the existing money rows into line.
--
-- DESCRIPTION TEXT ONLY: no amount, status, due date, category or tms_fee_fine
-- row is touched. Anchored to '^Transport Fine' so the 2,801
-- "Transport Maintenance Fee …" rows cannot match.
--
-- Applied to prod 2026-09-16. Verified after: 0 rows read "Transport Fine",
-- 26 read "Transport Fee" (25 unpaid ₹3,66,120 + 1 cancelled ₹1 smoke test),
-- maintenance rows and the ledger unchanged.
do $$
declare
  v_n    int;
  v_left int;
begin
  update public.billing_student_bills
     set bill_description = regexp_replace(bill_description, '^Transport Fine', 'Transport Fee')
   where bill_description like 'Transport Fine%';

  get diagnostics v_n = row_count;
  if v_n <> 26 then
    raise exception 'Expected 26 bill descriptions renamed, changed %', v_n;
  end if;

  select count(*) into v_left from public.billing_student_bills
   where bill_description like 'Transport Fine%';
  if v_left <> 0 then
    raise exception '% rows still read "Transport Fine"', v_left;
  end if;
end $$;
