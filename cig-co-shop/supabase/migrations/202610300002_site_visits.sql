-- First-party site-visit tracking (CIG 10/30). Rows come from the Netlify
-- function track-visit (service role). No IPs, user agents or personal data.
-- RLS on with no policies: anon/authenticated can't read or write; only the
-- service role (server side) inserts and reads. Safe to run more than once.
-- Run in the Supabase SQL editor (or `psql "$SUPABASE_DB_URL" -f this-file`).

create extension if not exists pgcrypto;

create table if not exists public.site_visits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text check (session_id is null or session_id ~ '^[a-z0-9]{8,40}$'),
  path text not null check (char_length(path) between 1 and 200),
  event text not null check (event in ('pageview', 'product_view', 'add_to_bag', 'checkout_start')),
  product_id text check (product_id is null or char_length(product_id) <= 40),
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 120),
  utm_source text check (utm_source is null or char_length(utm_source) <= 80),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 80),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 80),
  src text check (src is null or char_length(src) <= 80),
  device text check (device is null or device in ('mobile', 'desktop')),
  country text check (country is null or country ~ '^[A-Z]{2}$')
);

create index if not exists site_visits_created_at_idx on public.site_visits (created_at desc);
create index if not exists site_visits_event_created_idx on public.site_visits (event, created_at desc);

alter table public.site_visits enable row level security;
revoke all on table public.site_visits from public, anon, authenticated;
grant insert, select on table public.site_visits to service_role;

-- Weekly report (read-only): totals, by day (America/New_York), top pages,
-- products, referrers, src/utm tags, countries and devices for the last p_days.
create or replace function public.cigco_site_visits_summary(p_days integer default 7)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select *, (created_at at time zone 'America/New_York')::date as day
    from public.site_visits
    where created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90))
  ),
  pv as (select * from v where event = 'pageview')
  select jsonb_build_object(
    'days', least(greatest(coalesce(p_days, 7), 1), 90),
    'totals', jsonb_build_object(
      'visits', (select count(*) from pv),
      'unique_sessions', (select count(distinct session_id) from v),
      'product_views', (select count(*) from v where event = 'product_view'),
      'add_to_bag', (select count(*) from v where event = 'add_to_bag'),
      'checkout_start', (select count(*) from v where event = 'checkout_start')
    ),
    'by_day', coalesce((select jsonb_agg(d order by d.day) from (
      select day,
        count(*) filter (where event = 'pageview') as visits,
        count(distinct session_id) as unique_sessions,
        count(*) filter (where event = 'product_view') as product_views,
        count(*) filter (where event = 'add_to_bag') as add_to_bag,
        count(*) filter (where event = 'checkout_start') as checkout_start
      from v group by day) d), '[]'::jsonb),
    'top_pages', coalesce((select jsonb_agg(x) from (
      select path, count(*) as visits from pv group by path order by count(*) desc, path limit 10) x), '[]'::jsonb),
    'top_products', coalesce((select jsonb_agg(x) from (
      select product_id,
        count(*) filter (where event = 'product_view') as views,
        count(*) filter (where event = 'add_to_bag') as add_to_bag
      from v where product_id is not null group by product_id
      order by count(*) filter (where event = 'product_view') desc, product_id limit 15) x), '[]'::jsonb),
    'referrers', coalesce((select jsonb_agg(x) from (
      select coalesce(referrer_host, '(direct)') as referrer, count(*) as visits
      from pv group by 1 order by 2 desc, 1 limit 10) x), '[]'::jsonb),
    'src', coalesce((select jsonb_agg(x) from (
      select coalesce(src, '(none)') as src, count(*) as visits
      from pv group by 1 order by 2 desc, 1 limit 10) x), '[]'::jsonb),
    'utm', coalesce((select jsonb_agg(x) from (
      select utm_source, utm_medium, utm_campaign, count(*) as visits
      from pv where coalesce(utm_source, utm_medium, utm_campaign) is not null
      group by 1, 2, 3 order by 4 desc limit 10) x), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(x) from (
      select coalesce(country, '??') as country, count(*) as visits
      from pv group by 1 order by 2 desc, 1 limit 15) x), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(x) from (
      select coalesce(device, 'unknown') as device, count(*) as visits
      from pv group by 1 order by 2 desc) x), '[]'::jsonb)
  );
$$;

revoke execute on function public.cigco_site_visits_summary(integer) from public, anon, authenticated;
grant execute on function public.cigco_site_visits_summary(integer) to service_role;
