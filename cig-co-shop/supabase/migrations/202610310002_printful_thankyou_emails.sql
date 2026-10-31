-- Thank-you email for Printful-fulfilled orders (those boxes get no QR card).
-- (CIG asked for it on the email-list branch, Oct 29, 2026.)
--
-- POST-MERGE STEP. Same rules as 202610310001: don't run before the Fri Oct 30
-- noon drop, only after CIG OKs the merge, in CIG-CO-PRODUCTION, right before
-- the deploy that includes it. Additive and idempotent. Nothing is sent unless
-- THANKYOU_EMAIL_ENABLED=true is set in Netlify.
--
-- One row per Printful order = the "sent once" flag. Printful's signed v2
-- webhooks (netlify/functions/printful-webhook.js) record shipment_sent and
-- shipment_delivered here:
--   * shipment_delivered -> due now (preferred trigger).
--   * shipment_sent      -> due at shipped_at + THANKYOU_DELAY_DAYS (default 5),
--     the fallback for carriers whose tracking never reports "delivered".
-- The hourly sweep (netlify/functions/thankyou-email-sweep.js) sends anything
-- due that the delivered event didn't already send. Claiming a row is atomic,
-- so a webhook and the sweep can't both send it.
begin;

create table if not exists public.thankyou_emails (
  printful_order_id text primary key check (char_length(printful_order_id) between 1 and 40),
  external_id text check (external_id is null or char_length(external_id) <= 64),
  order_id uuid references public.orders(id) on delete set null,
  status text not null default 'waiting'
    check (status in ('waiting', 'sending', 'sent', 'skipped', 'failed')),
  skip_reason text check (skip_reason is null or char_length(skip_reason) <= 60),
  shipped_at timestamptz,
  delivered_at timestamptz,
  due_at timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists thankyou_emails_due_idx
  on public.thankyou_emails (due_at)
  where status in ('waiting', 'failed');

-- Printful external_id for a store payment id, same rule as
-- netlify/lib/printful.js printfulExternalId(): short ids as-is, otherwise
-- "h_" + first 30 hex chars of sha256 (PayPal "paypal:<capture>" ids).
create or replace function public.cigco_printful_external_id(p_payment_id text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_payment_id is null or p_payment_id = '' then null
    when char_length(p_payment_id) <= 32 and p_payment_id ~ '^[A-Za-z0-9_-]+$' then p_payment_id
    else 'h_' || left(encode(sha256(convert_to(p_payment_id, 'UTF8')), 'hex'), 30)
  end;
$$;

-- Record a Printful shipment event and return the row plus the store order it
-- belongs to (matched by Printful external_id = the order's payment id).
create or replace function public.cigco_thankyou_record_event(
  p_printful_order_id text,
  p_external_id text,
  p_event text,
  p_occurred_at timestamptz,
  p_delay_days integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz := coalesce(p_occurred_at, now());
  v_delay interval := make_interval(days => greatest(0, least(coalesce(p_delay_days, 5), 60)));
  v_order public.orders;
  v_row public.thankyou_emails;
begin
  if p_event not in ('shipped', 'delivered') then
    raise exception using errcode = '22023', message = 'invalid_event';
  end if;

  select o.* into v_order
    from public.orders o
   where nullif(p_external_id, '') is not null
     and (o.stripe_payment_intent_id = p_external_id
          or public.cigco_printful_external_id(o.stripe_payment_intent_id) = p_external_id)
   order by o.paid_at desc
   limit 1;

  insert into public.thankyou_emails as t (
    printful_order_id, external_id, order_id, shipped_at, delivered_at, due_at
  ) values (
    p_printful_order_id,
    nullif(left(p_external_id, 64), ''),
    v_order.id,
    case when p_event = 'shipped' then v_at end,
    case when p_event = 'delivered' then v_at end,
    case when p_event = 'delivered' then now() else v_at + v_delay end
  )
  on conflict (printful_order_id) do update set
    external_id = coalesce(t.external_id, excluded.external_id),
    order_id = coalesce(t.order_id, excluded.order_id),
    shipped_at = coalesce(t.shipped_at, excluded.shipped_at),
    delivered_at = coalesce(t.delivered_at, excluded.delivered_at),
    -- Delivered pulls the send forward; a later shipment never pushes it back.
    due_at = case
      when t.status in ('sent', 'skipped') then t.due_at
      when p_event = 'delivered' then least(coalesce(t.due_at, now()), now())
      else coalesce(t.due_at, excluded.due_at)
    end,
    updated_at = now()
  returning * into v_row;

  return public.cigco_thankyou_context(v_row.printful_order_id);
end;
$$;

-- Row + store order + contact (+ whether they unsubscribed), for the sender.
create or replace function public.cigco_thankyou_context(p_printful_order_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'thankyou', to_jsonb(t),
    'order', case when o.id is null then null else jsonb_build_object(
      'id', o.id, 'order_number', o.order_number, 'items', o.items, 'paid_at', o.paid_at
    ) end,
    'contact', case when c.id is null then null else jsonb_build_object(
      'id', c.id, 'email_normalized', c.email_normalized, 'first_name', c.first_name
    ) end,
    'unsubscribed', coalesce(
      (c.marketing_consent_revoked_at is not null and not c.marketing_consent)
      or exists (
        select 1 from public.subscribers s
         where s.email_normalized = c.email_normalized and s.unsubscribed_at is not null
      ), false)
  )
  from public.thankyou_emails t
  left join public.orders o on o.id = t.order_id
  left join public.contacts c on c.id = o.contact_id
  where t.printful_order_id = p_printful_order_id;
$$;

-- Atomically take a due row for sending. Returns the context, or null when it
-- is not due, already sent/skipped, being sent right now, or out of retries.
create or replace function public.cigco_thankyou_claim(
  p_printful_order_id text,
  p_max_attempts integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  update public.thankyou_emails set
    status = 'sending',
    attempts = attempts + 1,
    last_attempt_at = now(),
    updated_at = now()
  where printful_order_id = p_printful_order_id
    and due_at is not null and due_at <= now()
    and attempts < p_max_attempts
    and (status in ('waiting', 'failed')
         or (status = 'sending' and last_attempt_at < now() - interval '10 minutes'))
  returning printful_order_id into v_id;
  if v_id is null then
    return null;
  end if;
  return public.cigco_thankyou_context(v_id);
end;
$$;

create or replace function public.cigco_thankyou_complete(
  p_printful_order_id text,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('sent', 'skipped', 'failed') then
    raise exception using errcode = '22023', message = 'invalid_status';
  end if;
  update public.thankyou_emails set
    status = p_status,
    sent_at = case when p_status = 'sent' then now() else sent_at end,
    skip_reason = case when p_status = 'skipped' then left(p_reason, 60) else skip_reason end,
    last_error_code = case when p_status = 'failed' then left(p_reason, 80) else last_error_code end,
    updated_at = now()
  where printful_order_id = p_printful_order_id
    and status <> 'sent';
end;
$$;

-- Printful order ids due for the hourly sweep (the shipped + delay fallback,
-- plus retries). Returns a JSON array of ids.
create or replace function public.cigco_thankyou_due(
  p_limit integer default 25,
  p_max_attempts integer default 5
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(d.printful_order_id order by d.due_at), '[]'::jsonb)
  from (
    select printful_order_id, due_at
      from public.thankyou_emails
     where due_at <= now()
       and attempts < p_max_attempts
       and (status in ('waiting', 'failed')
            or (status = 'sending' and last_attempt_at < now() - interval '10 minutes'))
     order by due_at
     limit greatest(1, least(coalesce(p_limit, 25), 100))
  ) d;
$$;

alter table public.thankyou_emails enable row level security;
revoke all on table public.thankyou_emails from public, anon, authenticated;
grant all on table public.thankyou_emails to service_role;

revoke execute on function public.cigco_printful_external_id(text) from public, anon, authenticated;
revoke execute on function public.cigco_thankyou_record_event(text, text, text, timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.cigco_thankyou_context(text) from public, anon, authenticated;
revoke execute on function public.cigco_thankyou_claim(text, integer) from public, anon, authenticated;
revoke execute on function public.cigco_thankyou_complete(text, text, text) from public, anon, authenticated;
revoke execute on function public.cigco_thankyou_due(integer, integer) from public, anon, authenticated;
grant execute on function public.cigco_printful_external_id(text) to service_role;
grant execute on function public.cigco_thankyou_record_event(text, text, text, timestamptz, integer) to service_role;
grant execute on function public.cigco_thankyou_context(text) to service_role;
grant execute on function public.cigco_thankyou_claim(text, integer) to service_role;
grant execute on function public.cigco_thankyou_complete(text, text, text) to service_role;
grant execute on function public.cigco_thankyou_due(integer, integer) to service_role;

commit;
