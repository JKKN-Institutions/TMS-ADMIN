-- Update transport-fee term due dates and propagate to every generated bill.
--   Term 1 -> 2026-08-31, Term 2 -> 2026-12-31
--
-- Scope: 'Transport Fees 2026-2027' (flat) + every Arts condition (e.g. the tiered
--        'Transport Fees 2026-2027(Arts Self)', and any future '%Arts%' structure).
--        The 'Testing' structure is deliberately left untouched.
--
-- due_date is DENORMALISED in three places (template -> ledger -> real bill); all three
-- are updated together so the admin Edit view, the tms_fee_bill coverage ledger /
-- Bill Management, and the learner-facing bills + /student/fees payment gate stay
-- consistent. Idempotent: re-running yields the same dates.
--
-- Targeted by NAME (not generated UUIDs) so this remains correct as new Arts conditions
-- are added. Covers flat structure terms and tiered year-band terms alike (matched on term_no).

-- 1) Term template (tms_fee_structure_term) — flat terms + tiered year-band terms.
update tms_fee_structure_term t
set due_date = case t.term_no when 1 then date '2026-08-31'
                             when 2 then date '2026-12-31' end
where t.term_no in (1, 2)
  and t.fee_structure_id in (
    select id from tms_fee_structure
    where name = 'Transport Fees 2026-2027' or name ilike '%arts%'
  );

-- 2) Coverage ledger (tms_fee_bill).
update tms_fee_bill fb
set due_date = case fb.term_no when 1 then date '2026-08-31'
                              when 2 then date '2026-12-31' end
where fb.term_no in (1, 2)
  and fb.fee_structure_id in (
    select id from tms_fee_structure
    where name = 'Transport Fees 2026-2027' or name ilike '%arts%'
  );

-- 3) Real learner bills (billing_student_bills) — routed via the ledger, which carries term_no.
update billing_student_bills b
set due_date = date '2026-08-31', updated_at = now()
where b.id in (
  select fb.billing_student_bill_id
  from tms_fee_bill fb
  where fb.term_no = 1
    and fb.billing_student_bill_id is not null
    and fb.fee_structure_id in (
      select id from tms_fee_structure
      where name = 'Transport Fees 2026-2027' or name ilike '%arts%'
    )
);

update billing_student_bills b
set due_date = date '2026-12-31', updated_at = now()
where b.id in (
  select fb.billing_student_bill_id
  from tms_fee_bill fb
  where fb.term_no = 2
    and fb.billing_student_bill_id is not null
    and fb.fee_structure_id in (
      select id from tms_fee_structure
      where name = 'Transport Fees 2026-2027' or name ilike '%arts%'
    )
);
