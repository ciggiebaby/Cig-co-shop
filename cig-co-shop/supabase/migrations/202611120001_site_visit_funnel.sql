-- Checkout funnel events (2026-11-12). Same table, no personal data.
-- `detail` is a short token only: card, paypal, email, pccc, bag, case.
-- Never an email address, name, or shipping address.
-- Safe to run more than once. Run in the Supabase SQL editor
-- (or `psql "$SUPABASE_DB_URL" -f this-file`) before the new events can be stored.
-- Until then track-visit still answers 204 and keeps recording the old events.

alter table public.site_visits drop constraint if exists site_visits_event_check;
alter table public.site_visits add constraint site_visits_event_check
  check (event in (
    'pageview',
    'product_view',
    'add_to_bag',
    'checkout_start',
    'checkout_form_view',
    'checkout_pay_click',
    'checkout_validation_error',
    'checkout_session_error',
    'checkout_redirect',
    'bag_upsell_shown',
    'bag_upsell_accepted'
  ));

alter table public.site_visits add column if not exists detail text;
alter table public.site_visits drop constraint if exists site_visits_detail_check;
alter table public.site_visits add constraint site_visits_detail_check
  check (detail is null or (char_length(detail) <= 40 and detail ~ '^[A-Za-z0-9_-]+$'));

-- Weekly report picks up the new counts. Grants stay with the service role.
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
      'checkout_start', (select count(*) from v where event = 'checkout_start'),
      'checkout_form_view', (select count(*) from v where event = 'checkout_form_view'),
      'checkout_pay_click', (select count(*) from v where event = 'checkout_pay_click'),
      'checkout_validation_error', (select count(*) from v where event = 'checkout_validation_error'),
      'checkout_session_error', (select count(*) from v where event = 'checkout_session_error'),
      'checkout_redirect', (select count(*) from v where event = 'checkout_redirect'),
      'bag_upsell_shown', (select count(*) from v where event = 'bag_upsell_shown'),
      'bag_upsell_accepted', (select count(*) from v where event = 'bag_upsell_accepted')
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
      from pv group by 1 order by 2 desc) x), '[]'::jsonb),
    'funnel', jsonb_build_object(
      'pay_clicks', coalesce((select jsonb_agg(x) from (
        select coalesce(detail, '(none)') as detail, count(*) as n
        from v where event = 'checkout_pay_click' group by 1 order by 2 desc, 1) x), '[]'::jsonb),
      'validation_errors', coalesce((select jsonb_agg(x) from (
        select coalesce(detail, '(none)') as detail, count(*) as n
        from v where event = 'checkout_validation_error' group by 1 order by 2 desc, 1) x), '[]'::jsonb),
      'session_errors', coalesce((select jsonb_agg(x) from (
        select coalesce(detail, '(none)') as detail, count(*) as n
        from v where event = 'checkout_session_error' group by 1 order by 2 desc, 1) x), '[]'::jsonb)
    )
  );
$$;

revoke execute on function public.cigco_site_visits_summary(integer) from public, anon, authenticated;
grant execute on function public.cigco_site_visits_summary(integer) to service_role;
