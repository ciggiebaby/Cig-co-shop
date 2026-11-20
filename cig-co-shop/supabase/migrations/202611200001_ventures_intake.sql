-- CIG Ventures order intake from /ventures (21-day commercial test).
--
-- Rows come from the Netlify function ventures-intake (service role).
-- RLS on with no policies: anon/authenticated can't read or write; only the
-- service role (server side) inserts and reads. Safe to run more than once.
--
-- POST-DEPLOY STEP. Run this in the Supabase SQL Editor for CIG-CO-PRODUCTION
-- (or `supabase db push`) BEFORE or immediately with the site deploy that
-- includes the /ventures order form. Until it runs, submissions return an
-- error and ask the buyer to email ventures@cigcompany.com. Additive only:
-- nothing existing is changed or dropped.
--
-- No payment data is stored. paymentUrl values are not collected here.

begin;

create table if not exists public.ventures_intake (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  service_id text not null
    check (service_id in ('lead-research', 'competitor-intelligence', 'signal-federal')),
  name text not null check (char_length(name) between 1 and 200),
  business text not null check (char_length(business) between 1 and 200),
  email_normalized text not null,
  email_original text,
  need text not null check (char_length(need) between 1 and 4000),
  budget_timeline text check (budget_timeline is null or char_length(budget_timeline) <= 400),
  status text not null default 'new'
    check (status in ('new', 'quoted', 'paid', 'delivered', 'closed')),
  notified_at timestamptz,
  check (position('@' in email_normalized) > 1)
);

create index if not exists ventures_intake_created_at_idx
  on public.ventures_intake (created_at desc);
create index if not exists ventures_intake_status_idx
  on public.ventures_intake (status, created_at desc);

alter table public.ventures_intake enable row level security;
revoke all on table public.ventures_intake from public, anon, authenticated;
grant insert, select, update on table public.ventures_intake to service_role;

commit;
