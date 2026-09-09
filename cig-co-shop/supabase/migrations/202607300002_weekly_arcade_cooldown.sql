begin;

-- Apply the weekly policy to recent plays as well as future claims. This
-- prevents a play made under the former 48-hour rule from becoming eligible
-- sooner than seven days after it occurred.
update public.arcade_plays
set next_eligible_at = played_at + interval '7 days'
where played_at + interval '7 days' > now()
  and next_eligible_at < played_at + interval '7 days';

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
    played_at_value + interval '7 days'
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

commit;
