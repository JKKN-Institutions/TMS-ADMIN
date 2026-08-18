-- ⚠ NOT YET APPLIED. Deferred deliberately.
--
-- Applying this deactivates 26 in-charge assignments belonging to real staff.
-- Their route back is the pledge screen (/boarding/in-charge) and
-- /api/boarding/incharge-pledge. Do NOT apply until those are live, or the 26
-- are stranded with no way to regain the role and their routes stop being
-- marked. The leak this reverses is already closed by the fee guard in
-- app/api/boarding/self-assign/route.ts, so there is no urgency to apply early.
--
-- NOTE: the pre-apply count query (Step 2) was re-run on 2026-08-18 during
-- authoring of this migration and returned 28, not the 26 the plan expected.
-- The population has grown since the plan was written. Do not apply this
-- migration, and re-run the Step 2 count immediately before the deferred
-- application stage to get a current number.

-- Revoke the in-charge assignments that billed staff re-granted themselves.
--
-- On 2026-08-14 the enforcement run removed and billed 35 in-charges. Between
-- 08-17 and 08-18, twenty-six of them re-opened /boarding/in-charge, flipped the
-- willingness toggle and self-assigned again -- restoring the fee exemption that
-- their bill had just replaced. The guard that now prevents this shipped in the
-- same change as this migration; the guard is forward-looking, so the rows
-- already created must be reversed here.
--
-- Fully reversible: every affected row is copied out first.

create table if not exists tms_staff_route_assignment_backup_20260818 as
select a.*, now() as backed_up_at
from tms_staff_route_assignment a
where false;

with billed as (
  select distinct b.person_id
  from tms_fee_bill b
  where b.person_type = 'staff'
    and b.status <> 'cancelled'
    and b.paid_at is null
),
leaked as (
  select a.id
  from tms_staff_route_assignment a
  join staff s
    on lower(trim(a.staff_email)) in (
         lower(trim(coalesce(s.email, ''))),
         lower(trim(coalesce(s.institution_email, '')))
       )
  join billed b on b.person_id = s.id
  where a.is_active
    and a.source = 'self'
    -- Only re-grants made AFTER the enforcement run. An assignment predating it
    -- was not a re-entry and is not this migration's business.
    and a.assigned_at >= '2026-08-15'
)
insert into tms_staff_route_assignment_backup_20260818
select a.*, now()
from tms_staff_route_assignment a
join leaked l on l.id = a.id;

update tms_staff_route_assignment a
set is_active = false
where a.id in (select id from tms_staff_route_assignment_backup_20260818);

-- ── Verification (run separately after applying) ─────────────────────────────
--   select count(*) from tms_staff_route_assignment_backup_20260818;   -- expect 26
--   -- and zero billed-and-active staff should remain:
--   -- (see the Step 3 query in the plan)
--
-- ── Rollback ─────────────────────────────────────────────────────────────────
--   update tms_staff_route_assignment a set is_active = true
--   from tms_staff_route_assignment_backup_20260818 b where b.id = a.id;
