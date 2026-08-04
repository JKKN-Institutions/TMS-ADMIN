-- Staff transport bills are payable inside TMS.
-- Staff can never be written to billing_student_bills (student_id is NOT NULL
-- with an FK to learners_profiles), so tms_fee_bill is the authoritative staff
-- ledger and needs a paid state plus payment capture columns.

alter table public.tms_fee_bill
  drop constraint if exists tms_fee_bill_status_check;

alter table public.tms_fee_bill
  add constraint tms_fee_bill_status_check
  check (status = any (array['generated'::text, 'staff_deferred'::text, 'paid'::text, 'error'::text, 'cancelled'::text]));

alter table public.tms_fee_bill
  add column if not exists paid_at timestamptz,
  add column if not exists paid_amount numeric(10,2),
  add column if not exists payment_reference text,
  add column if not exists marked_paid_by uuid;

comment on column public.tms_fee_bill.paid_at is 'Set when the transport office records payment. Staff bills only; learner payment lives in billing_student_bills.';
comment on column public.tms_fee_bill.payment_reference is 'Free-text receipt or transaction reference captured by the transport office.';

create index if not exists idx_tms_fee_bill_person_type_status
  on public.tms_fee_bill (person_type, status);
