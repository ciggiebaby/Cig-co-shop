-- Live stock for backstock masks (products.js `liveStock: true`): 0005
-- CIG Paisley Balaclava, 0008 CIG Acrylic Ski Mask, 0013 Moto Mask.
-- Safe to run more than once: tables/functions are created if missing and the
-- seed never overwrites counts that already exist (so re-running won't undo sales).
-- Run in the Supabase SQL editor (or `psql "$SUPABASE_DB_URL" -f this-file`).

create table if not exists public.live_stock (
  product_id text not null,
  color text not null default '',
  size text not null default '',
  quantity integer not null check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (product_id, color, size)
);

-- One row per paid order that touched live stock (idempotency + oversell log).
create table if not exists public.live_stock_orders (
  order_key text primary key,
  lines jsonb not null,
  oversold jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.live_stock enable row level security;
alter table public.live_stock_orders enable row level security;

create or replace function public.cigco_get_live_stock()
returns table (product_id text, color text, size text, quantity integer)
language sql
stable
security definer
set search_path = public
as $$
  select s.product_id, s.color, s.size, s.quantity from public.live_stock s;
$$;

create or replace function public.cigco_commit_stock_order(p_order_key text, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  line record;
  current_qty integer;
  v_oversold jsonb := '[]'::jsonb;
begin
  if p_order_key is null or char_length(p_order_key) < 8 or jsonb_typeof(p_lines) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_stock_order';
  end if;

  insert into public.live_stock_orders(order_key, lines)
  values (p_order_key, p_lines)
  on conflict (order_key) do nothing;
  if not found then
    return jsonb_build_object('applied', false, 'oversold', '[]'::jsonb);
  end if;

  for line in
    select * from jsonb_to_recordset(p_lines) as x(product_id text, color text, size text, quantity integer)
  loop
    if line.quantity is null or line.quantity < 1 then
      raise exception using errcode = '22023', message = 'invalid_stock_quantity';
    end if;
    current_qty := null;
    select s.quantity into current_qty
      from public.live_stock s
      where s.product_id = line.product_id and s.color = coalesce(line.color, '') and s.size = coalesce(line.size, '')
      for update;
    if current_qty is null or current_qty < line.quantity then
      v_oversold := v_oversold || jsonb_build_object(
        'product_id', line.product_id, 'color', line.color, 'size', line.size,
        'requested', line.quantity, 'available', coalesce(current_qty, 0));
    end if;
    update public.live_stock s
      set quantity = greatest(s.quantity - line.quantity, 0), updated_at = now()
      where s.product_id = line.product_id and s.color = coalesce(line.color, '') and s.size = coalesce(line.size, '');
  end loop;

  update public.live_stock_orders o set oversold = v_oversold where o.order_key = p_order_key;
  return jsonb_build_object('applied', true, 'oversold', v_oversold);
end;
$$;

revoke all on public.live_stock, public.live_stock_orders from public, anon, authenticated;
revoke execute on function public.cigco_get_live_stock() from public, anon, authenticated;
revoke execute on function public.cigco_commit_stock_order(text, jsonb) from public, anon, authenticated;

-- Seed: BG backstock count 10/21 (bg/backstock_2026-10-21.csv).
-- BG "Yellow" ski mask = site "Gold". Sold-out variants are seeded at 0.
insert into public.live_stock (product_id, color, size, quantity) values
  ('0005', 'Red', '', 70),
  ('0005', 'Blue', '', 68),
  ('0005', 'Black', '', 24),
  ('0008', 'Red', '1-Hole', 59),
  ('0008', 'Red', '3-Hole', 80),
  ('0008', 'Red', 'Skully', 0),
  ('0008', 'Blue', '1-Hole', 56),
  ('0008', 'Blue', '3-Hole', 70),
  ('0008', 'Blue', 'Skully', 0),
  ('0008', 'Gold', '1-Hole', 73),
  ('0008', 'Gold', '3-Hole', 81),
  ('0008', 'Gold', 'Skully', 0),
  ('0008', 'Green', '1-Hole', 71),
  ('0008', 'Green', '3-Hole', 77),
  ('0008', 'Green', 'Skully', 0),
  ('0013', 'Yellow', '', 17),
  ('0013', 'Pink', '', 22),
  ('0013', 'Brown', '', 16),
  ('0013', 'Purple', '', 14),
  ('0013', 'Green', '', 13),
  ('0013', 'Orange', '', 12)
on conflict (product_id, color, size) do nothing;
