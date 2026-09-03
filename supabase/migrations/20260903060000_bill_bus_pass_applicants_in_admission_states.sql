-- Bus pass service requests raised in MyJKKN were not producing a bill.
--
-- Root cause: the 15-minute sweep (lib/fees/auto-generate.ts -> lib/fees/
-- applicability.ts) only bills learners whose lifecycle_status is in the
-- structure's `lifecycle_statuses`, and every transport structure left that
-- column NULL, which the code reads as ['active'] (DEFAULT_LIFECYCLE_STATUSES).
--
-- MyJKKN's Bus Pass Request correctly sets bus_required = true, but a large
-- share of applicants are new admissions sitting in 'reserved' / 'admitted' /
-- 'account', never 'active'. They were filtered out of EVERY run, silently:
-- applicability drops them before the engine ever sees them, so there is no
-- unresolved count, no error, and no generation-run row to notice.
--
-- Fix: state the billable lifecycle states EXPLICITLY on each auto-generating
-- student structure instead of leaning on the code default. Admission-pipeline
-- states that are not yet (or no longer) a rider are deliberately NOT included:
--   enquiry, enquiry_submitted -> a lead, not an admission
--   rejected, graduated, inactive -> not travelling
-- An overdue transport bill locks the learner out of the portal
-- (tms_student_transport_access), so billing a mere lead has a real cost.

update public.tms_fee_structure
set lifecycle_statuses = array['active','admitted','account','reserved']
where transport_year_id = (
        select id from public.tms_transport_year where is_current is true limit 1
      )
  and audience = 'student'
  and status = 'active'
  and auto_generate is true;
