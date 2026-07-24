-- Per-structure opt-in for the nightly auto-bill sweep. Default false: a structure
-- auto-generates only when explicitly flagged AND active AND on the current transport
-- year. The manual Generate button ignores this flag entirely.
--
-- Which structures are enabled is DATA (set from the fee-structure form or SQL), not
-- committed here — this migration only adds the column so it stays environment-agnostic.
alter table tms_fee_structure
  add column if not exists auto_generate boolean not null default false;

comment on column tms_fee_structure.auto_generate is
  'When true (and status=active on the current transport year), the nightly auto-bill sweep (lib/fees/auto-generate.ts) generates this structure''s bills. Default false = opt-in per structure; the manual Generate button ignores this flag.';
