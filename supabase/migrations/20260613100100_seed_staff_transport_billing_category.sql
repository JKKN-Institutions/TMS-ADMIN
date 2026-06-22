-- ─────────────────────────────────────────────────────────────────────────────
-- Seed the "Staff Transport Fee" billing category.
--
-- ⚠️ This writes into MyJKKN's SHARED billing_categories table (additive, low
-- risk). The existing "Transport Fee" category (kind='transport') is used for
-- learners; this new one is used for staff transport bills. The TMS fees module
-- maps audience='student' → "Transport Fee", audience='staff' → this row.
--
-- Guarded insert (no unique constraint on category_name) — idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.billing_categories (category_name, kind, frequency, is_active)
select 'Staff Transport Fee', 'transport', 'one-time', true
where not exists (
  select 1 from public.billing_categories where category_name = 'Staff Transport Fee'
);
