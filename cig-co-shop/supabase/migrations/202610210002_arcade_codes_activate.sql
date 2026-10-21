-- Arcade codes, part 2 of 2: switch the Arcade to unique, single-use codes.
-- Run right AFTER the site that understands Arcade codes is deployed
-- (requires 202610210001_arcade_codes_schema.sql first).
--
-- * First play: guaranteed 10% off, unique code, one use, expires in 7 days.
-- * Later plays: free perks (early access, monthly giveaway entry), or a rare
--   15% code (1 in 20), also unique, one use, 7 days.
-- * Old static prizes (CIG5/CIG10/CIG20, free merch, mystery gift, try again)
--   are switched off (rows kept for play history).
-- * Paid orders (card or PayPal) mark their Arcade code as used.
begin;

update public.arcade_prizes set active = false
where id in ('p5', 'p20', 'merch', 'gift', 'again1', 'again2');

update public.arcade_prizes set
  prize_type = 'discount',
  code = null,
  label = '10% Off',
  detail = 'A one-time 10% off code, good for 7 days.',
  discount_basis_points = 1000,
  code_valid_days = 7,
  is_first_play_eligible = true,
  active = true,
  weight = 1
where id = 'p10';

insert into public.arcade_prizes
  (id, prize_type, code, label, detail, is_first_play_eligible, active, weight, discount_basis_points, code_valid_days)
values
  ('p15', 'discount', null, '15% Off', 'A one-time 15% off code, good for 7 days.', false, true, 1, 1500, 7),
  ('early', 'perk', null, 'Early Access', 'You''re on the early-access list for our next drop. Watch your inbox.', false, true, 10, null, null),
  ('giveaway', 'perk', null, 'Giveaway Entry', 'You''re entered in this month''s giveaway for one free item. The winner is emailed.', false, true, 9, null, null)
on conflict (id) do update set
  prize_type = excluded.prize_type,
  code = excluded.code,
  label = excluded.label,
  detail = excluded.detail,
  is_first_play_eligible = excluded.is_first_play_eligible,
  active = excluded.active,
  weight = excluded.weight,
  discount_basis_points = excluded.discount_basis_points,
  code_valid_days = excluded.code_valid_days;

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
  code_value text;
  code_expires_at timestamptz;
  random_bytes bytea;
  byte_index integer;
  detail_value text;
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
    -- First play draws only first-play prizes; later plays never do.
    and prize.is_first_play_eligible = first_play
  order by random()
  limit 1;

  if selected_prize.id is null then
    raise exception using message = 'arcade_prize_configuration_error';
  end if;

  detail_value := selected_prize.detail;
  code_value := selected_prize.code;
  if selected_prize.prize_type = 'discount'
    and selected_prize.discount_basis_points is not null
  then
    code_expires_at := played_at_value
      + make_interval(days => coalesce(selected_prize.code_valid_days, 7));
    loop
      -- e.g. CIG10-7KQ4XW2M: 8 random characters, no 0/O/1/I/L so it's easy
      -- to type. Uses core gen_random_uuid() (no pgcrypto needed).
      random_bytes := uuid_send(gen_random_uuid());
      code_value := 'CIG' || (selected_prize.discount_basis_points / 100)::text || '-';
      foreach byte_index in array array[0, 1, 2, 3, 4, 5, 10, 11] loop
        code_value := code_value || substr(
          'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
          1 + get_byte(random_bytes, byte_index) % 31,
          1
        );
      end loop;
      exit when not exists (select 1 from public.arcade_codes where code = code_value);
    end loop;
    detail_value := format(
      'Use code %s at checkout by %s. One use, for %s only. Not combined with the crypto discount.',
      code_value,
      to_char(code_expires_at at time zone 'America/New_York', 'FMMonth FMDD'),
      contact_row.email_normalized
    );
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
    code_value,
    selected_prize.label,
    detail_value,
    first_play,
    case when selected_prize.prize_type = 'none' then 'not_applicable' else 'unredeemed' end,
    played_at_value,
    played_at_value + interval '7 days'
  )
  returning * into existing_play;

  if code_expires_at is not null then
    insert into public.arcade_codes (code, contact_id, play_id, discount_basis_points, issued_at, expires_at)
    values (code_value, contact_row.id, existing_play.id, selected_prize.discount_basis_points, played_at_value, code_expires_at);
  end if;

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

commit;
