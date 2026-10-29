-- Email list: one subscribers table for every sign-up, tagged by source.
-- (CIG approved the email-list build, Oct 29, 2026.)
--
-- POST-MERGE STEP. Do not run before the Fri Oct 30 noon drop, and only after
-- CIG OKs the merge. Run it in the Supabase SQL Editor for CIG-CO-PRODUCTION
-- (or `supabase db push`) right BEFORE the site deploy that includes it. It is
-- additive only: nothing existing is changed or dropped, and running it twice
-- is harmless. Until it runs, sign-ups fail soft (forms still answer "you're
-- on the list", the Arcade and checkout keep working) but nothing is stored.
--
-- Sources (BG tags every recap by these):
--   arcade        Arcade email gate
--   qr            Arcade reached from the mask-mailer QR card (arcade.html?src=qr)
--   shop          Arcade reached from cards in wholesale boxes that stores
--                 hand out (arcade.html?src=shop)
--   fani          Arcade reached from Fani's store (Closette) cards
--                 (arcade.html?src=fani)
--   <card slug>   Any other arcade.html?src= value shaped like a slug
--                 (^[a-z0-9_-]{2,24}$) is saved as-is, so a new store's
--                 cards are tracked before the site's list is updated. The
--                 known list lives in netlify/lib/subscribers.js
--                 (ARCADE_SRC_LIST); this table only enforces the shape, so
--                 adding a store never needs a migration.
--   checkout      Buyer ticked the opt-in box at checkout (card or PayPal)
--   notify_me     "Notify me" on a sold-out product/variant
--   early_access  Early-access list (next drop + Black Friday code)
--
-- Dedupe: one row per (email, source, product, variant). Repeat sign-ups bump
-- last_seen_at and signup_count instead of adding rows. product_id/variant are
-- '' (not null) when they don't apply so the unique key works on every
-- Postgres version.
begin;

create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null,
  email_original text,
  source text not null
    check (source ~ '^[a-z0-9_-]{2,24}$'),
  product_id text not null default '' check (char_length(product_id) <= 80),
  variant text not null default '' check (char_length(variant) <= 120),
  marketing_consent boolean not null default false,
  consent_at timestamptz,
  consent_text text check (consent_text is null or char_length(consent_text) <= 300),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  signup_count integer not null default 1 check (signup_count >= 1),
  unsubscribed_at timestamptz,
  notified_at timestamptz,
  contact_id uuid references public.contacts(id) on delete set null,
  unique (email_normalized, source, product_id, variant),
  check (email_normalized = public.cigco_normalize_email(email_normalized)),
  check (position('@' in email_normalized) > 1)
);

create index if not exists subscribers_source_idx
  on public.subscribers (source, first_seen_at desc);
create index if not exists subscribers_product_idx
  on public.subscribers (product_id, variant)
  where source = 'notify_me' and notified_at is null and unsubscribed_at is null;
create index if not exists subscribers_email_idx
  on public.subscribers (email_normalized);

-- Upsert one sign-up. Consent never downgrades: once a row has consent it
-- keeps its original consent_at. A fresh explicit opt-in after an
-- unsubscribe re-subscribes (clears unsubscribed_at); a sign-up without
-- consent never does.
create or replace function public.cigco_subscribe(
  p_email text,
  p_email_original text,
  p_source text,
  p_product_id text default null,
  p_variant text default null,
  p_marketing_consent boolean default false,
  p_consent_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := public.cigco_normalize_email(p_email);
  v_product text := coalesce(nullif(btrim(p_product_id), ''), '');
  v_variant text := coalesce(nullif(btrim(p_variant), ''), '');
  v_consent boolean := coalesce(p_marketing_consent, false);
  v_contact uuid;
  v_row public.subscribers;
  v_created boolean;
begin
  if v_email is null or position('@' in v_email) <= 1 then
    raise exception using errcode = '22023', message = 'invalid_email';
  end if;
  if p_source is null or p_source !~ '^[a-z0-9_-]{2,24}$' then
    raise exception using errcode = '22023', message = 'invalid_source';
  end if;
  if p_source = 'notify_me' and v_product = '' then
    raise exception using errcode = '22023', message = 'product_required';
  end if;

  select id into v_contact from public.contacts where email_normalized = v_email;

  insert into public.subscribers as s (
    email_normalized, email_original, source, product_id, variant,
    marketing_consent, consent_at, consent_text, contact_id
  )
  values (
    v_email, left(p_email_original, 320), p_source, v_product, v_variant,
    v_consent, case when v_consent then now() end, left(p_consent_text, 300), v_contact
  )
  on conflict (email_normalized, source, product_id, variant) do update set
    last_seen_at = now(),
    signup_count = s.signup_count + 1,
    marketing_consent = s.marketing_consent or excluded.marketing_consent,
    consent_at = coalesce(s.consent_at, excluded.consent_at),
    consent_text = coalesce(s.consent_text, excluded.consent_text),
    unsubscribed_at = case when excluded.marketing_consent then null else s.unsubscribed_at end,
    contact_id = coalesce(s.contact_id, excluded.contact_id)
  returning * into v_row;

  v_created := v_row.signup_count = 1;
  return jsonb_build_object(
    'subscriberId', v_row.id,
    'created', v_created,
    'source', v_row.source,
    'marketingConsent', v_row.marketing_consent
  );
end;
$$;

-- Unsubscribe an email from everything: every subscribers row, and the
-- contact's marketing consent (so Kit sync stops too). Returns how many rows
-- changed; the caller always shows the same page either way.
create or replace function public.cigco_unsubscribe(p_email text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := public.cigco_normalize_email(p_email);
  v_count integer;
begin
  update public.subscribers
     set unsubscribed_at = coalesce(unsubscribed_at, now()),
         marketing_consent = false
   where email_normalized = v_email;
  get diagnostics v_count = row_count;

  update public.contacts
     set marketing_consent = false,
         marketing_consent_revoked_at = coalesce(marketing_consent_revoked_at, now()),
         updated_at = now()
   where email_normalized = v_email;
  -- (Also stamps buyers who never opted in, so the Printful thank-you email
  -- respects an unsubscribe from it: see 202610310002.)

  return v_count;
end;
$$;

-- Protected export (customer-export ?filter=subscribers[&source=...]).
create or replace function public.cigco_export_subscribers(p_source text default null)
returns setof jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'email', s.email_normalized,
    'source', s.source,
    'product_id', nullif(s.product_id, ''),
    'variant', nullif(s.variant, ''),
    'marketing_consent', s.marketing_consent,
    'consent_at', s.consent_at,
    'first_seen_at', s.first_seen_at,
    'last_seen_at', s.last_seen_at,
    'signup_count', s.signup_count,
    'unsubscribed_at', s.unsubscribed_at,
    'notified_at', s.notified_at,
    'is_customer', coalesce(c.order_count, 0) > 0
  )
  from public.subscribers s
  left join public.contacts c on c.email_normalized = s.email_normalized
  where p_source is null or s.source = p_source
  order by s.first_seen_at desc;
$$;

-- Per-source counts for BG's recaps (customer-export ?filter=subscriber_counts).
create or replace function public.cigco_subscriber_counts()
returns setof jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'source', s.source,
    'signups', count(*),
    'unique_emails', count(distinct s.email_normalized),
    'marketing_consent', count(*) filter (where s.marketing_consent and s.unsubscribed_at is null),
    'unsubscribed', count(*) filter (where s.unsubscribed_at is not null),
    'last_7_days', count(*) filter (where s.first_seen_at >= now() - interval '7 days'),
    'became_customers', count(*) filter (where coalesce(c.order_count, 0) > 0)
  )
  from public.subscribers s
  left join public.contacts c on c.email_normalized = s.email_normalized
  group by s.source
  order by s.source;
$$;

alter table public.subscribers enable row level security;
revoke all on table public.subscribers from public, anon, authenticated;
revoke execute on function public.cigco_subscribe(text, text, text, text, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.cigco_unsubscribe(text) from public, anon, authenticated;
revoke execute on function public.cigco_export_subscribers(text) from public, anon, authenticated;
revoke execute on function public.cigco_subscriber_counts() from public, anon, authenticated;
grant all on table public.subscribers to service_role;
grant execute on function public.cigco_subscribe(text, text, text, text, text, boolean, text) to service_role;
grant execute on function public.cigco_unsubscribe(text) to service_role;
grant execute on function public.cigco_export_subscribers(text) to service_role;
grant execute on function public.cigco_subscriber_counts() to service_role;

commit;
