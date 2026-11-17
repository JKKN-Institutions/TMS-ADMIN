-- One row per IST calendar date for the daily "Needs attention" mail to the
-- transport heads (lib/attention-digest). The primary key is the double-send
-- guard: the job claims the date by inserting 'sending', and a second run that
-- finds 'sent' or 'sending' stands down. 'failed' and the skips may be retried.
--
-- Read it to answer "did today's mail go, and if not, why":
--   select * from tms_attention_digest_log order by digest_date desc limit 14;
--
-- A row stuck on 'sending' means the function died mid-send. It blocks that
-- day on purpose (a possible duplicate mail is worse than a missed one); clear
-- it by hand to allow a retry:
--   delete from tms_attention_digest_log where digest_date = current_date and outcome = 'sending';

create table if not exists public.tms_attention_digest_log (
  digest_date date primary key,
  outcome     text not null
              check (outcome in ('sending', 'sent', 'failed', 'skipped_clear', 'skipped_off_day')),
  rows        integer not null default 0,
  recipients  text[] not null default '{}',
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.tms_attention_digest_log is
  'Daily Needs-attention mail: one row per IST date with what happened. Service role only.';

-- Service role only: RLS on with no policies denies anon and authenticated.
alter table public.tms_attention_digest_log enable row level security;
revoke all on public.tms_attention_digest_log from anon, authenticated;
