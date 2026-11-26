-- Orders: record which landing tag brought the buyer (src and utm_*), so a
-- sale can be tied to the post or link that started it.
--
-- * New nullable columns on public.orders: src, utm_source, utm_medium,
--   utm_campaign. NULL = not recorded (every order before this change, a
--   checkout with no tag, or a tag that failed the slug check). Old rows are
--   not touched. Values use the same rule as site_visits / track-visit.js:
--   trimmed, at most 80 characters, only letters, digits, and . _ ~ + - space.
-- * cigco_process_stripe_order gains p_src, p_utm_source, p_utm_medium,
--   p_utm_campaign (text, default NULL). A bad value is stored as NULL; it
--   does not reject the order. The rest of the body matches
--   202611230001_orders_discount_cents.sql. The previous 17-argument function
--   is dropped so PostgREST has one signature.
--
-- Requires 202611230001_orders_discount_cents.sql (this function writes
-- discount_cents).
--
-- APPLY BEFORE OR WITH the site deploy that sends these parameters. Run it in
-- the Supabase SQL Editor for CIG-CO-PRODUCTION (eaksrojksnczzhgpmetp), or with
-- `supabase db push`. The Netlify deploy does NOT run migrations. If the site
-- deploys first, the site retries the call without the new parameters, so the
-- order still records (the tags are just not saved). Safe to run more than once.
--
-- After it is applied, which links sold:
--   select coalesce(src, '(none)') as src, utm_source, utm_medium, utm_campaign,
--          count(*) as orders, sum(amount_total_cents) as cents
--   from public.orders
--   where paid_at >= now() - interval '30 days'
--   group by 1, 2, 3, 4
--   order by orders desc, cents desc;

begin;

alter table public.orders
  add column if not exists src text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;

-- Same charset as track-visit.js / cigco_campaign_tag. The function stores NULL
-- for a bad value, so this check does not reject a checkout.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_src_tag' and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_src_tag
      check (src is null or (char_length(src) between 1 and 80 and src ~ '^[A-Za-z0-9._~+ -]+$'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_utm_source_tag' and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_utm_source_tag
      check (utm_source is null or (char_length(utm_source) between 1 and 80 and utm_source ~ '^[A-Za-z0-9._~+ -]+$'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_utm_medium_tag' and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_utm_medium_tag
      check (utm_medium is null or (char_length(utm_medium) between 1 and 80 and utm_medium ~ '^[A-Za-z0-9._~+ -]+$'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_utm_campaign_tag' and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_utm_campaign_tag
      check (utm_campaign is null or (char_length(utm_campaign) between 1 and 80 and utm_campaign ~ '^[A-Za-z0-9._~+ -]+$'));
  end if;
end;
$$;

comment on column public.orders.src is
  'First-touch landing ?src= tag. NULL = not recorded (orders before 2026-11-25, or checkout with no valid tag).';
comment on column public.orders.utm_source is
  'First-touch utm_source. NULL = not recorded.';
comment on column public.orders.utm_medium is
  'First-touch utm_medium. NULL = not recorded.';
comment on column public.orders.utm_campaign is
  'First-touch utm_campaign. NULL = not recorded.';

create index if not exists orders_src_paid_idx
  on public.orders (src, paid_at desc)
  where src is not null;

-- Same trim / 80-char / slug rule as netlify/functions/track-visit.js. Invalid
-- input becomes NULL so a bad tag cannot fail the order insert.
create or replace function public.cigco_campaign_tag(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_value is null or btrim(p_value) = '' then null
    else (
      select case
        when v ~ '^[A-Za-z0-9._~+ -]+$' then v
        else null
      end
      from (select left(btrim(p_value), 80) as v) clipped
    )
  end;
$$;

revoke all on function public.cigco_campaign_tag(text) from public, anon, authenticated;
grant execute on function public.cigco_campaign_tag(text) to service_role;

drop function if exists public.cigco_process_stripe_order(
  text, text, text, text, text, text, text, text, bigint, text, jsonb, jsonb,
  boolean, text, text, timestamptz, bigint
);

create or replace function public.cigco_process_stripe_order(
  p_event_id text,
  p_event_type text,
  p_session_id text,
  p_payment_intent_id text,
  p_email text,
  p_email_original text,
  p_first_name text,
  p_last_name text,
  p_amount_total_cents bigint,
  p_currency text,
  p_items jsonb,
  p_shipping_destination jsonb,
  p_marketing_consent boolean,
  p_cart_fingerprint text,
  p_promo_code text,
  p_paid_at timestamptz,
  p_discount_cents bigint default null,
  p_src text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  contact_row public.contacts;
  order_row public.orders;
  inserted_event boolean;
  affected_rows integer;
  created_order boolean := false;
  v_src text := public.cigco_campaign_tag(p_src);
  v_utm_source text := public.cigco_campaign_tag(p_utm_source);
  v_utm_medium text := public.cigco_campaign_tag(p_utm_medium);
  v_utm_campaign text := public.cigco_campaign_tag(p_utm_campaign);
begin
  if p_event_id is null or p_session_id is null or p_amount_total_cents < 0
    or jsonb_typeof(p_items) <> 'array'
    or (p_discount_cents is not null and p_discount_cents < 0)
  then
    raise exception using errcode = '22023', message = 'invalid_order';
  end if;

  insert into public.stripe_events(event_id, event_type, stripe_session_id)
  values (p_event_id, p_event_type, p_session_id)
  on conflict (event_id) do nothing;
  get diagnostics affected_rows = row_count;
  inserted_event := affected_rows > 0;

  select * into order_row
  from public.orders
  where stripe_session_id = p_session_id
    or (
      nullif(p_payment_intent_id, '') is not null
      and stripe_payment_intent_id = nullif(p_payment_intent_id, '')
    )
  limit 1;

  if order_row.id is not null then
    select * into contact_row from public.contacts where id = order_row.contact_id;
    return jsonb_build_object(
      'created', false,
      'eventReplay', not inserted_event,
      'order', to_jsonb(order_row),
      'contact', to_jsonb(contact_row)
    );
  end if;

  contact_row := public.cigco_upsert_contact(
    p_email,
    p_email_original,
    p_first_name,
    p_last_name,
    false,
    true,
    case when p_marketing_consent then true else null end,
    case when p_marketing_consent then 'stripe_checkout' else null end
  );

  select * into contact_row
  from public.contacts
  where id = contact_row.id
  for update;

  insert into public.orders (
    order_number,
    contact_id,
    stripe_session_id,
    stripe_payment_intent_id,
    stripe_event_id,
    cart_fingerprint,
    promo_code,
    discount_cents,
    src,
    utm_source,
    utm_medium,
    utm_campaign,
    amount_total_cents,
    currency,
    items,
    shipping_destination,
    marketing_consent_at_checkout,
    paid_at
  )
  values (
    'CIG-' || upper(substr(md5(p_session_id), 1, 10)),
    contact_row.id,
    p_session_id,
    nullif(p_payment_intent_id, ''),
    p_event_id,
    nullif(p_cart_fingerprint, ''),
    nullif(p_promo_code, ''),
    p_discount_cents,
    v_src,
    v_utm_source,
    v_utm_medium,
    v_utm_campaign,
    p_amount_total_cents,
    lower(p_currency),
    p_items,
    p_shipping_destination,
    p_marketing_consent,
    p_paid_at
  )
  on conflict do nothing
  returning * into order_row;

  if order_row.id is null then
    select * into order_row
    from public.orders
    where stripe_session_id = p_session_id
      or (
        nullif(p_payment_intent_id, '') is not null
        and stripe_payment_intent_id = nullif(p_payment_intent_id, '')
      )
    limit 1;
  else
    created_order := true;
    if nullif(btrim(p_promo_code), '') is not null then
      update public.arcade_codes set
        used_at = p_paid_at,
        used_order_id = order_row.id
      where code = upper(btrim(p_promo_code))
        and used_at is null;
    end if;
    update public.contacts set
      first_order_at = coalesce(first_order_at, p_paid_at),
      last_order_at = greatest(coalesce(last_order_at, p_paid_at), p_paid_at),
      order_count = order_count + 1,
      lifetime_value_cents = lifetime_value_cents + p_amount_total_cents,
      source_checkout = true,
      last_seen_at = now(),
      updated_at = now()
    where id = contact_row.id
    returning * into contact_row;
  end if;

  return jsonb_build_object(
    'created', created_order,
    'eventReplay', not inserted_event,
    'order', to_jsonb(order_row),
    'contact', to_jsonb(contact_row)
  );
end;
$$;

revoke execute on function public.cigco_process_stripe_order(
  text, text, text, text, text, text, text, text, bigint, text, jsonb, jsonb,
  boolean, text, text, timestamptz, bigint, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.cigco_process_stripe_order(
  text, text, text, text, text, text, text, text, bigint, text, jsonb, jsonb,
  boolean, text, text, timestamptz, bigint, text, text, text, text
) to service_role;

-- PostgREST picks up the new signature.
notify pgrst, 'reload schema';

commit;
