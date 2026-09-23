-- Vehicle-checklist Bus Inspection removed (spec 2026-09-23). Backup first.
create table if not exists public.tms_inspection_backup_20260923 (
  source text not null, row_data jsonb not null, backed_up_at timestamptz not null default now()
);
insert into public.tms_inspection_backup_20260923 (source, row_data)
  select 'tms_inspection', to_jsonb(i) from public.tms_inspection i
  union all select 'tms_inspection_item', to_jsonb(it) from public.tms_inspection_item it
  union all select 'tms_inspection_learner_check', to_jsonb(lc) from public.tms_inspection_learner_check lc
  union all select 'tms_inspection_issue', to_jsonb(s) from public.tms_inspection_issue s;
revoke all on public.tms_inspection_backup_20260923 from anon, authenticated;

drop table if exists public.tms_inspection_learner_check, public.tms_inspection_issue,
  public.tms_inspection_item, public.tms_inspection, public.tms_inspection_checklist_item cascade;

delete from storage.objects where bucket_id = 'tms-inspection-photos';
delete from storage.buckets where id = 'tms-inspection-photos';

update public.custom_roles
  set permissions = permissions - 'tms.inspection.view' - 'tms.inspection.conduct' - 'tms.inspection.manage'
  where permissions ?| array['tms.inspection.view','tms.inspection.conduct','tms.inspection.manage'];

delete from public.admin_settings where setting_type = 'inspection';
-- NOTE: public.tms_set_updated_at() is shared by 10+ tables — never drop it here.
