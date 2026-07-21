-- RLS follow-up for the stop-wise transport fees tables.
--
-- 20260721000000_tms_fee_stop_wise.sql created tms_fee_structure_stop_rate and
-- tms_fee_structure_stop_term without enabling row level security, unlike every
-- sibling tms_fee_* table (tms_fee_structure, tms_fee_structure_term,
-- tms_fee_structure_year_band, tms_fee_generation_run, tms_fee_bill — see
-- 20260613100000_create_tms_fee_structure.sql and
-- 20260618000000_fee_structure_year_bands.sql). Both are reached only via the
-- service-role client (withAuth + requirePerm), so this matches the sibling
-- pattern exactly: RLS enabled, NO policies (deny-all for anon/authenticated;
-- service-role bypasses).

alter table public.tms_fee_structure_stop_rate enable row level security;
alter table public.tms_fee_structure_stop_term enable row level security;
