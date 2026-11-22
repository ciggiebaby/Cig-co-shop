-- Longer shipped-fallback for thank-you emails outside the US.
--
-- The 5-day fallback (THANKYOU_DELAY_DAYS) told a Korea customer the order
-- "should be with you now" while Unisend still had it in transit. US orders
-- stay on that short fallback. Every other shipping country waits
-- THANKYOU_INTL_DELAY_DAYS (default 14) unless Printful reports delivered,
-- which still sends immediately.
--
-- Country is public.orders.shipping_destination->>'country': the ISO alpha-2
-- code stored at checkout (Stripe address.country, PayPal country_code,
-- Coinbase shipping_country). "US" (any case) and a missing/blank country
-- keep the short delay. "KR", "CA", "GB", "DE", "AU", "JP", and anything
-- else use the international delay.
--
-- RUN THIS IN SUPABASE BEFORE the deploy that sends p_intl_delay_days.
-- CIG-CO-PRODUCTION SQL editor, or `supabase db push`. Safe to re-run.
--
-- What it does not do: it does not change a row already marked sent or
-- skipped, so an order that already got the email is not sent again.
-- Waiting, failed, or stuck-sending rows that are not delivered yet, and
-- that ship outside the US, have due_at pushed out to shipped_at + 14 days
-- when that is later. A send already in flight still finishes; this only
-- stops a later retry of one that has not gone out.
-- That one-time push uses the default of 14, not a custom Netlify value.

begin;

drop function if exists public.cigco_thankyou_record_event(text, text, text, timestamptz, integer);
drop function if exists public.cigco_thankyou_record_event(text, text, text, timestamptz, integer, integer);

-- Record a Printful shipment event and return the row plus the store order it
-- belongs to (matched by Printful external_id = the order's payment id).
create or replace function public.cigco_thankyou_record_event(
  p_printful_order_id text,
  p_external_id text,
  p_event text,
  p_occurred_at timestamptz,
  p_delay_days integer default 5,
  p_intl_delay_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz := coalesce(p_occurred_at, now());
  v_order public.orders;
  v_row public.thankyou_emails;
  v_country text := '';
  v_intl boolean := false;
  v_days integer;
  v_delay interval;
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

  -- Field access stays inside the found-row branch so a missing order (an
  -- unassigned record) cannot raise. Blank country stays on the US delay.
  if v_order.id is not null then
    v_country := upper(btrim(coalesce(v_order.shipping_destination->>'country', '')));
    v_intl := v_country <> '' and v_country <> 'US';
  end if;

  v_days := greatest(0, least(
    coalesce(
      case when v_intl then p_intl_delay_days else p_delay_days end,
      case when v_intl then 14 else 5 end
    ),
    60
  ));
  v_delay := make_interval(days => v_days);

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
    -- Sent/skipped rows keep their due_at, so this cannot schedule a resend.
    -- Delivered pulls a still-open row forward. A later shipped event never
    -- shortens the wait; for an international row it can only lengthen it.
    due_at = case
      when t.status in ('sent', 'skipped') then t.due_at
      when p_event = 'delivered' then least(coalesce(t.due_at, now()), now())
      when v_intl and t.delivered_at is null
        then greatest(coalesce(t.due_at, excluded.due_at), excluded.due_at)
      else coalesce(t.due_at, excluded.due_at)
    end,
    updated_at = now()
  returning * into v_row;

  return public.cigco_thankyou_context(v_row.printful_order_id);
end;
$$;

-- Orders already emailed stay emailed. This only postpones the fallback for
-- international shipments that have not been delivered and have not been sent.
update public.thankyou_emails t
   set due_at = t.shipped_at + interval '14 days',
       updated_at = now()
  from public.orders o
 where t.order_id = o.id
   and t.status in ('waiting', 'failed', 'sending')
   and t.sent_at is null
   and t.delivered_at is null
   and t.shipped_at is not null
   and t.due_at is not null
   and t.due_at < t.shipped_at + interval '14 days'
   and upper(btrim(coalesce(o.shipping_destination->>'country', ''))) not in ('', 'US');

revoke execute on function public.cigco_thankyou_record_event(text, text, text, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.cigco_thankyou_record_event(text, text, text, timestamptz, integer, integer) to service_role;

commit;
