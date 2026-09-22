-- ─────────────────────────────────────────────────────────────────────────────
-- Route Check person rows: allow an 'unknown' kind (an unrecognised card is
-- still a finding worth keeping, with the code that was scanned), and make a
-- tick idempotent: one row per learner / per staff per check.
-- Target: shared MyJKKN project kvizhngldtiuufknvehv. Idempotent / safe to re-run.
-- Spec: docs/superpowers/specs/2026-09-21-route-checkers-design.md
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tms_route_check_person
  drop constraint if exists tms_route_check_person_person_kind_check;
alter table public.tms_route_check_person
  add constraint tms_route_check_person_person_kind_check
  check (person_kind in ('learner','staff','manual','unknown'));

alter table public.tms_route_check_person
  drop constraint if exists tms_route_check_person_kind_fields;
alter table public.tms_route_check_person
  add constraint tms_route_check_person_kind_fields check (
    (person_kind = 'learner' and learner_id is not null)
    or (person_kind = 'staff' and staff_id is not null)
    or (person_kind = 'manual' and manual_type is not null and manual_name is not null)
    or (person_kind = 'unknown' and scanned_code is not null and outcome = 'unknown_card')
  );

-- One tick per person per check. A re-scan hits 23505 and the API returns the
-- existing row as "already checked" instead of a second line.
create unique index if not exists uq_tms_route_check_person_learner
  on public.tms_route_check_person (check_id, learner_id) where learner_id is not null;
create unique index if not exists uq_tms_route_check_person_staff
  on public.tms_route_check_person (check_id, staff_id) where staff_id is not null;
