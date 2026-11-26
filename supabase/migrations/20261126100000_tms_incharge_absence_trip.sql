-- In-charge absence: which trip it is for (bug report BUG-1157).
--
-- Until now a declaration always meant the whole day. An in-charge who rides
-- the morning bus but leaves before the evening one had to declare the full
-- day or nothing. `trip` records the choice, using the same words as
-- tms_attendance.direction plus 'full_day'.
--
-- Additive on purpose: the default makes every existing row a full day, which
-- is what it always meant, and code that predates this column keeps working
-- because it never names it. The unique key (assignment_id, absence_date) is
-- NOT changed: there is still one declaration per person per day, and
-- declaring again replaces the earlier choice.

alter table tms_incharge_absence
  add column if not exists trip text not null default 'full_day';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tms_incharge_absence_trip_check'
  ) then
    alter table tms_incharge_absence
      add constraint tms_incharge_absence_trip_check
      check (trip in ('full_day', 'onward', 'return'));
  end if;
end $$;

comment on column tms_incharge_absence.trip is
  'Which trip the absence covers: onward (morning), return (evening) or full_day. A half-day absence excuses, and hands cover over for, that trip only.';
