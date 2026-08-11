-- Mark SOORIYA B's (EE24032) Term-1 transport bill UNPAID at its corrected Rs 500.
--
-- WHY: migration 20260811093000 reduced this learner's Term 1 from Rs 3,000 to Rs 500
-- under the 7.5% scholarship rule and left it `paid`, because Rs 3,000 had already been
-- receipted against it (cash receipt RCP-2026-003412, 2026-07-31). Requested change:
-- the Rs 500 is to stand as OUTSTANDING, so the learner's payment record is rebuilt
-- from scratch rather than inheriting the old over-collection.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: it does not touch billing_receipts or
-- billing_receipt_items. Receipt RCP-2026-003412 still allocates Rs 3,000 to this bill
-- and Rs 2,500 to the cancelled Term 2. Reversing that allocation is MyJKKN's domain
-- and was not requested. Until accounts reverses it, the receipts and this bill's
-- balance disagree by design: Rs 3,000 receipted against a Rs 500 outstanding bill.
--
-- KNOWN AND ACCEPTED CONSEQUENCE: this LOCKS THE LEARNER OUT of the student portal.
-- tms_student_transport_access is fail-CLOSED on a PAID Term 1 -- it returns
-- allowed=false with reason 'term1_unpaid' the moment this bill is not 'paid'. The
-- learner regains access when the Rs 500 is receipted and this bill returns to 'paid'.
-- This was flagged before the change and confirmed by the requester on 2026-08-11.
--
-- balance_amount and status are written EXPLICITLY. update_bill_balance_on_amount_change
-- looks like it maintains them, but it is declared AFTER UPDATE while its body mutates
-- NEW -- PostgreSQL discards an AFTER row trigger's return value, so it is a no-op.
-- (It would not fire here regardless: final_amount is unchanged.)
--
-- The tms_fee_bill ledger row needs no change: its `status` records GENERATION state
-- ('generated' vs 'cancelled'), not payment, and its paid_at / paid_amount /
-- payment_reference columns were never populated for this learner. Payment state for
-- learners lives solely on billing_student_bills.
--
-- Trigger safety for a status/balance-only write on this table:
--   fn_evaluate_status_after_bill_paid   -- AFTER UPDATE OF status, but only acts when
--                                           NEW.status = 'paid'; paid -> unpaid is inert.
--   billing_enforce_once_per_learner     -- early-returns: student_id and
--                                           item_category_id unchanged, OLD.status is
--                                           not cancelled/superseded.
--   trg_bill_apply_hostel_fee_categories -- filters fee_source = 'academic'; transport
--                                           bills are 'ad_hoc'.
--   trigger_refresh_student_billing_summary -- cheap per-student upsert.

do $$
declare
  v_learner  uuid;
  v_bill     uuid;
  v_final    numeric;
  v_n        int;
begin
  -- Resolve by email, not a hardcoded uuid, so this fails loudly rather than silently
  -- doing nothing if run against a database where the learner is absent. Counted and
  -- fetched separately: PostgreSQL has no min()/max() aggregate for uuid.
  select count(*) into v_n
  from public.learners_profiles
  where lower(college_email) = 'sooriyab2024eee@jkkn.ac.in';

  if v_n <> 1 then
    raise exception
      'Expected exactly 1 learner for sooriyab2024eee@jkkn.ac.in, found %', v_n;
  end if;

  select id into v_learner
  from public.learners_profiles
  where lower(college_email) = 'sooriyab2024eee@jkkn.ac.in';

  -- The Term-1 money row. fb.status = 'generated' excludes any cancelled ledger row.
  select b.id, b.final_amount into v_bill, v_final
  from public.tms_fee_bill fb
  join public.billing_student_bills b on b.id = fb.billing_student_bill_id
  where fb.person_id         = v_learner
    and fb.person_type       = 'learner'
    and fb.transport_year_id = '6b3768f9-c9fb-48d5-a955-41949983c3b0'
    and fb.term_no           = 1
    and fb.status            = 'generated';

  if v_bill is null then
    raise exception 'No generated Term-1 transport bill found for learner %', v_learner;
  end if;

  -- Already unpaid? Then stop -- re-running must not append the remark twice.
  perform 1 from public.billing_student_bills
   where id = v_bill and status = 'unpaid';
  if found then
    raise notice 'Term 1 for learner % is already unpaid; skipping.', v_learner;
    return;
  end if;

  -- balance_amount is derived from final_amount, never hardcoded, so this stays correct
  -- if the agreed fee is ever revised again before this runs.
  update public.billing_student_bills b
     set balance_amount = b.final_amount,
         status         = 'unpaid',
         payment_date   = null,
         remarks        = concat_ws(' | ', nullif(b.remarks, ''),
                          'Marked UNPAID on 2026-08-11: the Rs 500 scholarship fee is '
                          || 'outstanding. Receipt RCP-2026-003412 still allocates '
                          || 'Rs 3,000 to this bill and Rs 2,500 to the cancelled Term 2 '
                          || '-- accounts to reverse and re-collect Rs 500.'),
         updated_at     = now()
   where b.id = v_bill;

  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'Expected to update exactly 1 bill, updated % - rolled back', v_n;
  end if;

  raise notice 'SOORIYA B Term 1 marked unpaid: Rs % outstanding.', v_final;
end $$;
