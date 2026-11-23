-- Orders: record the dollars a promo code took off (BG, Finance, 11/23/2026),
-- so EARLYCIG uses and their margin cost can be counted per order.
--
-- * New nullable column public.orders.discount_cents (bigint, >= 0): cents a
--   promo code took off the items. 0 = no code. NULL = not recorded (every
--   order before this change, and a code order whose checkout started before
--   the deploy). Old rows are not touched.
-- * cigco_process_stripe_order gets one more parameter, p_discount_cents
--   (bigint, default NULL), written to the new column. The function body is
--   otherwise identical to 202610210002_arcade_codes_activate.sql (checked
--   against the live definition 11/23/2026). The old 16-argument version is
--   dropped so PostgREST has a single, unambiguous function to call.
--
-- APPLY BEFORE OR AT THE MERGE of the site change that sends p_discount_cents
-- (PR #46, earlycig-promo). Run it in the Supabase SQL Editor for
-- CIG-CO-PRODUCTION (eaksrojksnczzhgpmetp), or with `supabase db push`. The
-- Netlify deploy does NOT run migrations. If the site deploys first, the
-- site retries the call without p_discount_cents, so orders still record (the
-- discount is just not saved). Safe to run more than once.

begin;

alter table public.orders
  add column if not exists discount_cents bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_discount_cents_nonnegative'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_discount_cents_nonnegative
      check (discount_cents is null or discount_cents >= 0);
  end if;
end;
$$;

comment on column public.orders.discount_cents is
  'Cents a promo code took off the items (0 = no code; NULL = not recorded, e.g. orders before 2026-11-23).';

drop function if exists public.cigco_process_stripe_order(
  text, text, text, text, text, text, text, text, bigint, text, jsonb, jsonb,
  boolean, text, text, timestamptz
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
  p_discount_cents bigint default null
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
  boolean, text, text, timestamptz, bigint
) from public, anon, authenticated;
grant execute on function public.cigco_process_stripe_order(
  text, text, text, text, text, text, text, text, bigint, text, jsonb, jsonb,
  boolean, text, text, timestamptz, bigint
) to service_role;

-- PostgREST picks up the new signature.
notify pgrst, 'reload schema';

commit;
