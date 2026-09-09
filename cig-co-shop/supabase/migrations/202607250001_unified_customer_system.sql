begin;

create extension if not exists pgcrypto;

create or replace function public.cigco_normalize_email(value text)
returns text
language sql
immutable
strict
as $$
  select lower(btrim(value));
$$;

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null unique,
  email_original text not null,
  first_name text,
  last_name text,
  marketing_consent boolean not null default false,
  marketing_consent_timestamp timestamptz,
  marketing_consent_source text,
  marketing_consent_revoked_at timestamptz,
  source_arcade boolean not null default false,
  source_checkout boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  first_order_at timestamptz,
  last_order_at timestamptz,
  order_count integer not null default 0 check (order_count >= 0),
  lifetime_value_cents bigint not null default 0 check (lifetime_value_cents >= 0),
  kit_subscriber_id bigint,
  kit_sync_status text not null default 'not_applicable'
    check (kit_sync_status in ('not_applicable', 'pending', 'synced', 'suppressed', 'failed')),
  kit_synced_at timestamptz,
  last_arcade_play_at timestamptz,
  last_arcade_prize_id text,
  last_arcade_prize_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email_normalized = public.cigco_normalize_email(email_normalized)),
  check (position('@' in email_normalized) > 1)
);

create table public.arcade_prizes (
  id text primary key,
  prize_type text not null check (prize_type in ('discount', 'merch', 'gift', 'none')),
  code text,
  label text not null,
  detail text not null,
  is_first_play_eligible boolean not null default false,
  active boolean not null default true,
  weight integer not null default 1 check (weight > 0)
);

insert into public.arcade_prizes
  (id, prize_type, code, label, detail, is_first_play_eligible)
values
  ('p5', 'discount', 'CIG5', '5% Off', 'Use code CIG5 at checkout.', false),
  ('p10', 'discount', 'CIG10', '10% Off', 'Use code CIG10 at checkout.', true),
  ('p20', 'discount', 'CIG20', '20% Off', 'Use code CIG20 at checkout.', true),
  ('merch', 'merch', null, 'Free Merch', 'Screenshot this and email or DM us to claim your free item.', false),
  ('gift', 'gift', null, 'Mystery Gift', 'Screenshot this and email or DM us to claim your gift.', false),
  ('again1', 'none', null, 'Try Again', 'No luck this time — come back soon.', false),
  ('again2', 'none', null, 'So Close', 'No luck this time — come back soon.', false)
on conflict (id) do update set
  prize_type = excluded.prize_type,
  code = excluded.code,
  label = excluded.label,
  detail = excluded.detail,
  is_first_play_eligible = excluded.is_first_play_eligible,
  active = true;

create table public.arcade_plays (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  request_id uuid not null unique,
  game text not null check (game in ('wheel', 'scratch', 'boxes')),
  prize_id text not null references public.arcade_prizes(id),
  prize_type text not null,
  prize_code text,
  prize_label text not null,
  prize_detail text not null,
  is_first_play boolean not null default false,
  redemption_status text not null default 'unredeemed'
    check (redemption_status in ('not_applicable', 'unredeemed', 'redeemed', 'void')),
  redeemed_at timestamptz,
  redemption_updated_at timestamptz,
  redemption_notes text,
  played_at timestamptz not null default now(),
  next_eligible_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index arcade_one_first_play_per_contact
  on public.arcade_plays(contact_id)
  where is_first_play;
create index arcade_plays_contact_played_idx
  on public.arcade_plays(contact_id, played_at desc);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  contact_id uuid not null references public.contacts(id),
  stripe_session_id text not null unique,
  stripe_payment_intent_id text unique,
  stripe_event_id text not null,
  cart_fingerprint text,
  promo_code text,
  amount_total_cents bigint not null check (amount_total_cents >= 0),
  currency text not null check (char_length(currency) = 3),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  shipping_destination jsonb,
  marketing_consent_at_checkout boolean not null default false,
  paid_at timestamptz not null,
  order_email_status text not null default 'pending'
    check (order_email_status in ('pending', 'sent', 'failed')),
  order_email_sent_at timestamptz,
  shipment_carrier text,
  shipment_tracking_number text,
  shipment_tracking_url text,
  shipment_date date,
  shipment_email_status text
    check (shipment_email_status is null or shipment_email_status in ('pending', 'sent', 'failed')),
  shipment_email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_contact_paid_idx on public.orders(contact_id, paid_at desc);

create table public.stripe_events (
  event_id text primary key,
  event_type text not null,
  stripe_session_id text not null,
  processed_at timestamptz not null default now()
);

create table public.integration_attempts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('kit', 'resend_prize', 'resend_order', 'resend_shipment')),
  operation_key text not null,
  contact_id uuid references public.contacts(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed')),
  lease_id uuid,
  attempts integer not null default 0 check (attempts >= 0),
  last_error_code text,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, operation_key)
);

create table public.arcade_rate_limits (
  rate_key text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (rate_key, window_started_at)
);

create or replace function public.cigco_upsert_contact(
  p_email text,
  p_email_original text,
  p_first_name text default null,
  p_last_name text default null,
  p_source_arcade boolean default false,
  p_source_checkout boolean default false,
  p_marketing_consent boolean default null,
  p_consent_source text default null
)
returns public.contacts
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text := public.cigco_normalize_email(p_email);
  result public.contacts;
begin
  if normalized is null
    or char_length(normalized) > 320
    or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception using errcode = '22023', message = 'invalid_email';
  end if;

  insert into public.contacts (
    email_normalized,
    email_original,
    first_name,
    last_name,
    source_arcade,
    source_checkout,
    marketing_consent,
    marketing_consent_timestamp,
    marketing_consent_source,
    kit_sync_status
  )
  values (
    normalized,
    btrim(coalesce(p_email_original, p_email)),
    nullif(btrim(p_first_name), ''),
    nullif(btrim(p_last_name), ''),
    p_source_arcade,
    p_source_checkout,
    coalesce(p_marketing_consent, false),
    case when p_marketing_consent is null then null else now() end,
    case when p_marketing_consent is null then null else p_consent_source end,
    case when p_marketing_consent is true then 'pending' else 'not_applicable' end
  )
  on conflict (email_normalized) do update set
    email_original = excluded.email_original,
    first_name = coalesce(excluded.first_name, contacts.first_name),
    last_name = coalesce(excluded.last_name, contacts.last_name),
    source_arcade = contacts.source_arcade or excluded.source_arcade,
    source_checkout = contacts.source_checkout or excluded.source_checkout,
    marketing_consent = case
      when p_marketing_consent is null then contacts.marketing_consent
      else p_marketing_consent
    end,
    marketing_consent_timestamp = case
      when p_marketing_consent is null then contacts.marketing_consent_timestamp
      else now()
    end,
    marketing_consent_source = case
      when p_marketing_consent is null then contacts.marketing_consent_source
      else p_consent_source
    end,
    marketing_consent_revoked_at = case
      when p_marketing_consent is false then now()
      when p_marketing_consent is true then null
      else contacts.marketing_consent_revoked_at
    end,
    kit_sync_status = case
      when p_marketing_consent is true then 'pending'
      when p_marketing_consent is false then 'not_applicable'
      else contacts.kit_sync_status
    end,
    last_seen_at = now(),
    updated_at = now()
  returning * into result;

  return result;
end;
$$;

create or replace function public.cigco_check_arcade_rate_limit(
  p_rate_key text,
  p_limit integer default 12,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  window_start timestamptz;
  current_count integer;
begin
  if p_rate_key is null or char_length(p_rate_key) < 16
    or p_limit < 1 or p_window_seconds < 1
  then
    raise exception using errcode = '22023', message = 'invalid_rate_limit';
  end if;

  window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.arcade_rate_limits(rate_key, window_started_at, request_count)
  values (p_rate_key, window_start, 1)
  on conflict (rate_key, window_started_at) do update
    set request_count = arcade_rate_limits.request_count + 1
  returning request_count into current_count;

  return current_count <= p_limit;
end;
$$;

create or replace function public.cigco_arcade_register(
  p_email text,
  p_email_original text,
  p_marketing_consent boolean default null,
  p_consent_source text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  contact_row public.contacts;
  last_play public.arcade_plays;
begin
  contact_row := public.cigco_upsert_contact(
    p_email,
    p_email_original,
    null,
    null,
    true,
    false,
    case when p_marketing_consent is true then true else null end,
    case when p_marketing_consent is true then p_consent_source else null end
  );

  select * into last_play
  from public.arcade_plays
  where contact_id = contact_row.id
  order by played_at desc
  limit 1;

  if last_play.id is not null then
    update public.contacts set
      last_arcade_play_at = last_play.played_at,
      last_arcade_prize_id = last_play.prize_id,
      last_arcade_prize_label = last_play.prize_label,
      updated_at = now()
    where id = contact_row.id;
  end if;

  return jsonb_build_object(
    'contactId', contact_row.id,
    'email', contact_row.email_normalized,
    'marketingConsent', contact_row.marketing_consent,
    'sourceArcade', contact_row.source_arcade,
    'sourceCheckout', contact_row.source_checkout,
    'orderCount', contact_row.order_count,
    'eligible', last_play.id is null or last_play.next_eligible_at <= now(),
    'serverNow', now(),
    'lastPlay', case when last_play.id is null then null else jsonb_build_object(
      'playedAt', last_play.played_at,
      'nextEligibleAt', last_play.next_eligible_at,
      'prize', jsonb_build_object(
        'id', last_play.prize_id,
        'type', last_play.prize_type,
        'code', last_play.prize_code,
        'label', last_play.prize_label,
        'detail', last_play.prize_detail
      )
    ) end
  );
end;
$$;

create or replace function public.cigco_arcade_claim(
  p_email text,
  p_game text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text := public.cigco_normalize_email(p_email);
  contact_row public.contacts;
  existing_play public.arcade_plays;
  last_play public.arcade_plays;
  selected_prize public.arcade_prizes;
  first_play boolean;
  played_at_value timestamptz := now();
begin
  if p_game not in ('wheel', 'scratch', 'boxes') then
    raise exception using errcode = '22023', message = 'invalid_game';
  end if;

  select * into existing_play
  from public.arcade_plays
  where request_id = p_request_id;

  if existing_play.id is not null then
    if not exists (
      select 1 from public.contacts
      where id = existing_play.contact_id
        and email_normalized = normalized
    ) then
      raise exception using errcode = '22023', message = 'invalid_arcade_request';
    end if;
    return jsonb_build_object(
      'claimed', true,
      'replayedRequest', true,
      'playId', existing_play.id,
      'firstPlay', existing_play.is_first_play,
      'playedAt', existing_play.played_at,
      'nextEligibleAt', existing_play.next_eligible_at,
      'prize', jsonb_build_object(
        'id', existing_play.prize_id,
        'type', existing_play.prize_type,
        'code', existing_play.prize_code,
        'label', existing_play.prize_label,
        'detail', existing_play.prize_detail
      )
    );
  end if;

  select * into contact_row
  from public.contacts
  where email_normalized = normalized
  for update;

  if contact_row.id is null then
    raise exception using errcode = '22023', message = 'arcade_identity_required';
  end if;

  select * into last_play
  from public.arcade_plays
  where contact_id = contact_row.id
  order by played_at desc
  limit 1;

  if last_play.id is not null and last_play.next_eligible_at > played_at_value then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'cooldown',
      'playedAt', last_play.played_at,
      'nextEligibleAt', last_play.next_eligible_at,
      'prize', jsonb_build_object(
        'id', last_play.prize_id,
        'type', last_play.prize_type,
        'code', last_play.prize_code,
        'label', last_play.prize_label,
        'detail', last_play.prize_detail
      )
    );
  end if;

  first_play := last_play.id is null;

  select prize.* into selected_prize
  from public.arcade_prizes prize
  cross join lateral generate_series(1, prize.weight)
  where prize.active
    and (not first_play or prize.is_first_play_eligible)
  order by random()
  limit 1;

  if selected_prize.id is null then
    raise exception using message = 'arcade_prize_configuration_error';
  end if;

  insert into public.arcade_plays (
    contact_id,
    request_id,
    game,
    prize_id,
    prize_type,
    prize_code,
    prize_label,
    prize_detail,
    is_first_play,
    redemption_status,
    played_at,
    next_eligible_at
  )
  values (
    contact_row.id,
    p_request_id,
    p_game,
    selected_prize.id,
    selected_prize.prize_type,
    selected_prize.code,
    selected_prize.label,
    selected_prize.detail,
    first_play,
    case when selected_prize.prize_type = 'none' then 'not_applicable' else 'unredeemed' end,
    played_at_value,
    played_at_value + interval '48 hours'
  )
  returning * into existing_play;

  update public.contacts set
    last_arcade_play_at = existing_play.played_at,
    last_arcade_prize_id = existing_play.prize_id,
    last_arcade_prize_label = existing_play.prize_label,
    last_seen_at = now(),
    updated_at = now()
  where id = contact_row.id;

  return jsonb_build_object(
    'claimed', true,
    'replayedRequest', false,
    'contactId', contact_row.id,
    'playId', existing_play.id,
    'email', contact_row.email_normalized,
    'firstPlay', existing_play.is_first_play,
    'playedAt', existing_play.played_at,
    'nextEligibleAt', existing_play.next_eligible_at,
    'prize', jsonb_build_object(
      'id', existing_play.prize_id,
      'type', existing_play.prize_type,
      'code', existing_play.prize_code,
      'label', existing_play.prize_label,
      'detail', existing_play.prize_detail
    )
  );
end;
$$;

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
  p_paid_at timestamptz
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

create or replace function public.cigco_get_arcade_play_delivery(p_play_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'claimed', true,
    'replayedRequest', false,
    'contactId', c.id,
    'playId', ap.id,
    'email', c.email_normalized,
    'prize', jsonb_build_object(
      'id', ap.prize_id,
      'type', ap.prize_type,
      'code', ap.prize_code,
      'label', ap.prize_label,
      'detail', ap.prize_detail
    )
  )
  from public.arcade_plays ap
  join public.contacts c on c.id = ap.contact_id
  where ap.id = p_play_id;
$$;

create or replace function public.cigco_reserve_integration(
  p_kind text,
  p_operation_key text,
  p_contact_id uuid default null,
  p_order_id uuid default null,
  p_max_attempts integer default 5
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt_row public.integration_attempts;
  requested_lease uuid := gen_random_uuid();
begin
  insert into public.integration_attempts (
    kind, operation_key, contact_id, order_id, status, lease_id, attempts, last_attempt_at
  )
  values (
    p_kind, p_operation_key, p_contact_id, p_order_id, 'processing', requested_lease, 1, now()
  )
  on conflict (kind, operation_key) do update set
    status = case
      when integration_attempts.status = 'succeeded' then 'succeeded'
      when integration_attempts.status = 'processing'
        and integration_attempts.last_attempt_at > now() - interval '5 minutes'
        then 'processing'
      when integration_attempts.attempts >= p_max_attempts then integration_attempts.status
      else 'processing'
    end,
    lease_id = case
      when integration_attempts.status = 'succeeded'
        or (integration_attempts.status = 'processing'
          and integration_attempts.last_attempt_at > now() - interval '5 minutes')
        or integration_attempts.attempts >= p_max_attempts
        then integration_attempts.lease_id
      else requested_lease
    end,
    attempts = case
      when integration_attempts.status = 'succeeded'
        or (integration_attempts.status = 'processing'
          and integration_attempts.last_attempt_at > now() - interval '5 minutes')
        or integration_attempts.attempts >= p_max_attempts
        then integration_attempts.attempts
      else integration_attempts.attempts + 1
    end,
    last_attempt_at = case
      when integration_attempts.status = 'succeeded'
        or (integration_attempts.status = 'processing'
          and integration_attempts.last_attempt_at > now() - interval '5 minutes')
        or integration_attempts.attempts >= p_max_attempts
        then integration_attempts.last_attempt_at
      else now()
    end,
    updated_at = now()
  returning * into attempt_row;

  return case
    when attempt_row.lease_id = requested_lease then requested_lease
    else null
  end;
end;
$$;

create or replace function public.cigco_complete_integration(
  p_kind text,
  p_operation_key text,
  p_lease_id uuid,
  p_succeeded boolean,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.integration_attempts set
    status = case when p_succeeded then 'succeeded' else 'failed' end,
    last_error_code = case when p_succeeded then null else left(coalesce(p_error_code, 'unknown'), 80) end,
    completed_at = case when p_succeeded then now() else null end,
    updated_at = now()
  where kind = p_kind
    and operation_key = p_operation_key
    and lease_id = p_lease_id;
end;
$$;

create or replace function public.cigco_record_kit_result(
  p_contact_id uuid,
  p_status text,
  p_subscriber_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('synced', 'suppressed', 'failed') then
    raise exception using errcode = '22023', message = 'invalid_kit_status';
  end if;

  update public.contacts set
    kit_sync_status = p_status,
    kit_subscriber_id = coalesce(p_subscriber_id, kit_subscriber_id),
    kit_synced_at = case when p_status = 'synced' then now() else kit_synced_at end,
    marketing_consent = case when p_status = 'suppressed' then false else marketing_consent end,
    marketing_consent_revoked_at = case when p_status = 'suppressed' then now() else marketing_consent_revoked_at end,
    marketing_consent_source = case when p_status = 'suppressed' then 'kit_unsubscribe' else marketing_consent_source end,
    updated_at = now()
  where id = p_contact_id;
end;
$$;

create or replace function public.cigco_record_order_email(
  p_order_id uuid,
  p_email_kind text,
  p_succeeded boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_email_kind = 'order' then
    update public.orders set
      order_email_status = case when p_succeeded then 'sent' else 'failed' end,
      order_email_sent_at = case when p_succeeded then now() else order_email_sent_at end,
      updated_at = now()
    where id = p_order_id;
  elsif p_email_kind = 'shipment' then
    update public.orders set
      shipment_email_status = case when p_succeeded then 'sent' else 'failed' end,
      shipment_email_sent_at = case when p_succeeded then now() else shipment_email_sent_at end,
      updated_at = now()
    where id = p_order_id;
  else
    raise exception using errcode = '22023', message = 'invalid_email_kind';
  end if;
end;
$$;

create or replace function public.cigco_get_order_for_shipment(p_order_number text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object('order', to_jsonb(o), 'contact', to_jsonb(c))
  from public.orders o
  join public.contacts c on c.id = o.contact_id
  where o.order_number = p_order_number;
$$;

create or replace function public.cigco_record_shipment(
  p_order_id uuid,
  p_carrier text,
  p_tracking_number text,
  p_tracking_url text,
  p_shipment_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders set
    shipment_carrier = nullif(btrim(p_carrier), ''),
    shipment_tracking_number = nullif(btrim(p_tracking_number), ''),
    shipment_tracking_url = nullif(btrim(p_tracking_url), ''),
    shipment_date = p_shipment_date,
    shipment_email_status = case
      when shipment_tracking_number is not distinct from nullif(btrim(p_tracking_number), '')
        then shipment_email_status
      else 'pending'
    end,
    shipment_email_sent_at = case
      when shipment_tracking_number is not distinct from nullif(btrim(p_tracking_number), '')
        then shipment_email_sent_at
      else null
    end,
    updated_at = now()
  where id = p_order_id;

  if not found then
    raise exception using errcode = '22023', message = 'order_not_found';
  end if;
end;
$$;

create or replace function public.cigco_record_prize_redemption(
  p_play_id uuid,
  p_status text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('redeemed', 'void') then
    raise exception using errcode = '22023', message = 'invalid_redemption_status';
  end if;

  update public.arcade_plays set
    redemption_status = p_status,
    redeemed_at = case when p_status = 'redeemed' then now() else redeemed_at end,
    redemption_updated_at = now(),
    redemption_notes = nullif(left(btrim(p_notes), 500), '')
  where id = p_play_id
    and prize_type <> 'none';

  if not found then
    raise exception using errcode = '22023', message = 'arcade_play_not_found';
  end if;
end;
$$;

create or replace function public.cigco_export_contacts(p_filter text default 'all')
returns table (
  email text,
  name text,
  arcade_status text,
  marketing_consent boolean,
  customer_status text,
  order_count integer,
  lifetime_value_cents bigint,
  last_order_at timestamptz,
  last_arcade_play_at timestamptz,
  last_prize text,
  kit_sync_status text,
  failed_transactional_email boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    c.email_original,
    nullif(concat_ws(' ', c.first_name, c.last_name), ''),
    case when c.source_arcade then 'arcade' else 'none' end,
    c.marketing_consent,
    case
      when c.order_count > 1 then 'repeat_customer'
      when c.order_count = 1 then 'first_time_customer'
      else 'lead'
    end,
    c.order_count,
    c.lifetime_value_cents,
    c.last_order_at,
    c.last_arcade_play_at,
    c.last_arcade_prize_label,
    c.kit_sync_status,
    exists (
      select 1 from public.integration_attempts ia
      where ia.contact_id = c.id
        and ia.kind in ('resend_prize', 'resend_order', 'resend_shipment')
        and ia.status = 'failed'
    ),
    c.created_at
  from public.contacts c
  where case coalesce(p_filter, 'all')
    when 'all' then true
    when 'arcade_leads' then c.source_arcade
    when 'customers' then c.order_count > 0
    when 'arcade_never_purchased' then c.source_arcade and c.order_count = 0
    when 'first_time_customers' then c.order_count = 1
    when 'repeat_customers' then c.order_count > 1
    when 'marketing_subscribers' then c.marketing_consent
    when 'non_subscribed_customers' then c.order_count > 0 and not c.marketing_consent
    when 'prize_winners' then c.last_arcade_prize_id is not null
      and c.last_arcade_prize_id not in ('again1', 'again2')
    when 'failed_kit_sync' then c.kit_sync_status = 'failed'
    when 'failed_transactional_email' then exists (
      select 1 from public.integration_attempts ia
      where ia.contact_id = c.id
        and ia.kind in ('resend_prize', 'resend_order', 'resend_shipment')
        and ia.status = 'failed'
    )
    else false
  end
  order by c.created_at desc;
$$;

alter table public.contacts enable row level security;
alter table public.arcade_prizes enable row level security;
alter table public.arcade_plays enable row level security;
alter table public.orders enable row level security;
alter table public.stripe_events enable row level security;
alter table public.integration_attempts enable row level security;
alter table public.arcade_rate_limits enable row level security;

revoke all on table
  public.contacts,
  public.arcade_prizes,
  public.arcade_plays,
  public.orders,
  public.stripe_events,
  public.integration_attempts,
  public.arcade_rate_limits
from anon, authenticated;
revoke execute on function public.cigco_normalize_email(text) from public, anon, authenticated;
revoke execute on function public.cigco_upsert_contact(
  text, text, text, text, boolean, boolean, boolean, text
) from public, anon, authenticated;
revoke execute on function public.cigco_check_arcade_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.cigco_arcade_register(
  text, text, boolean, text
) from public, anon, authenticated;
revoke execute on function public.cigco_arcade_claim(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.cigco_process_stripe_order(
  text, text, text, text, text, text, text, text, bigint, text, jsonb, jsonb,
  boolean, text, text, timestamptz
) from public, anon, authenticated;
revoke execute on function public.cigco_get_arcade_play_delivery(uuid) from public, anon, authenticated;
revoke execute on function public.cigco_reserve_integration(text, text, uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.cigco_complete_integration(text, text, uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.cigco_record_kit_result(uuid, text, bigint) from public, anon, authenticated;
revoke execute on function public.cigco_record_order_email(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.cigco_get_order_for_shipment(text) from public, anon, authenticated;
revoke execute on function public.cigco_record_shipment(uuid, text, text, text, date) from public, anon, authenticated;
revoke execute on function public.cigco_record_prize_redemption(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.cigco_export_contacts(text) from public, anon, authenticated;
grant usage on schema public to service_role;
grant all on table
  public.contacts,
  public.arcade_prizes,
  public.arcade_plays,
  public.orders,
  public.stripe_events,
  public.integration_attempts,
  public.arcade_rate_limits
to service_role;
grant execute on function public.cigco_check_arcade_rate_limit(text, integer, integer) to service_role;
grant execute on function public.cigco_arcade_register(
  text, text, boolean, text
) to service_role;
grant execute on function public.cigco_arcade_claim(text, text, uuid) to service_role;
grant execute on function public.cigco_process_stripe_order(
  text, text, text, text, text, text, text, text, bigint, text, jsonb, jsonb,
  boolean, text, text, timestamptz
) to service_role;
grant execute on function public.cigco_get_arcade_play_delivery(uuid) to service_role;
grant execute on function public.cigco_reserve_integration(text, text, uuid, uuid, integer) to service_role;
grant execute on function public.cigco_complete_integration(text, text, uuid, boolean, text) to service_role;
grant execute on function public.cigco_record_kit_result(uuid, text, bigint) to service_role;
grant execute on function public.cigco_record_order_email(uuid, text, boolean) to service_role;
grant execute on function public.cigco_get_order_for_shipment(text) to service_role;
grant execute on function public.cigco_record_shipment(uuid, text, text, text, date) to service_role;
grant execute on function public.cigco_record_prize_redemption(uuid, text, text) to service_role;
grant execute on function public.cigco_export_contacts(text) to service_role;

commit;
