-- Arcade codes, part 1 of 2: additive schema only.
-- Safe to apply while the current site is live: it adds a table, two nullable
-- columns, one function, and widens a check constraint. Nothing existing
-- changes behavior until 202610210002_arcade_codes_activate.sql runs.
begin;

alter table public.arcade_prizes
  add column if not exists discount_basis_points integer
    check (discount_basis_points is null or (discount_basis_points > 0 and discount_basis_points < 10000)),
  add column if not exists code_valid_days integer
    check (code_valid_days is null or code_valid_days > 0);

-- Allow zero-cost "perk" prizes (early access, giveaway entries).
alter table public.arcade_prizes drop constraint if exists arcade_prizes_prize_type_check;
alter table public.arcade_prizes add constraint arcade_prizes_prize_type_check
  check (prize_type in ('discount', 'merch', 'gift', 'perk', 'none'));

-- One unique, single-use, expiring discount code per winning play.
create table if not exists public.arcade_codes (
  code text primary key check (code = upper(code)),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  play_id uuid not null unique references public.arcade_plays(id) on delete cascade,
  discount_basis_points integer not null
    check (discount_basis_points > 0 and discount_basis_points < 10000),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists arcade_codes_contact_idx on public.arcade_codes(contact_id);

alter table public.arcade_codes enable row level security;
revoke all on table public.arcade_codes from anon, authenticated;
grant all on table public.arcade_codes to service_role;

-- Checks an Arcade code. With p_email, the code must belong to that email.
create or replace function public.cigco_check_arcade_code(
  p_code text,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  code_row public.arcade_codes;
  owner_email text;
begin
  select * into code_row
  from public.arcade_codes
  where code = upper(btrim(coalesce(p_code, '')));

  if code_row.code is null then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;
  if code_row.used_at is not null then
    return jsonb_build_object('valid', false, 'reason', 'used');
  end if;
  if code_row.expires_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;
  if p_email is not null then
    select email_normalized into owner_email
    from public.contacts
    where id = code_row.contact_id;
    if owner_email is distinct from public.cigco_normalize_email(p_email) then
      return jsonb_build_object('valid', false, 'reason', 'wrong_email');
    end if;
  end if;

  return jsonb_build_object(
    'valid', true,
    'code', code_row.code,
    'discountBasisPoints', code_row.discount_basis_points,
    'expiresAt', code_row.expires_at
  );
end;
$$;

revoke execute on function public.cigco_check_arcade_code(text, text) from public, anon, authenticated;
grant execute on function public.cigco_check_arcade_code(text, text) to service_role;

commit;
