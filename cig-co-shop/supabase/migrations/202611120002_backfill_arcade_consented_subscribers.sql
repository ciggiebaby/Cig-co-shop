-- One-off backfill: Arcade players who already opted in live on
-- public.contacts (source_arcade + marketing_consent) but never got a
-- public.subscribers row, so they were missing from the email list.
--
-- RUN THIS IN SUPABASE WHEN THE CHANGE IS MERGED, before expecting those
-- past players to show up on the list. Supabase SQL editor for
-- CIG-CO-PRODUCTION, or `supabase db push`. Safe to run more than once.
--
-- What it does: inserts a subscribers row (source = arcade, marketing
-- consent on) for each contact who played the Arcade and opted in, and who
-- has no subscribers row yet.
-- What it does not do: it does not change or remove existing rows, and it
-- skips anyone who did not opt in (marketing_consent is not true, or consent
-- was later revoked). Contacts do not store the card/banner slug, so these
-- historical rows are tagged arcade. New sign-ups keep their real slug
-- (home, pdp, bag, footer, qr, shop, fani, thankyou).

begin;

insert into public.subscribers (
  email_normalized,
  email_original,
  source,
  product_id,
  variant,
  marketing_consent,
  consent_at,
  consent_text,
  contact_id,
  first_seen_at,
  last_seen_at,
  signup_count
)
select
  c.email_normalized,
  c.email_original,
  'arcade',
  '',
  '',
  true,
  coalesce(c.marketing_consent_timestamp, c.first_seen_at),
  'Backfill: arcade player who already opted in to drops and promotions.',
  c.id,
  c.first_seen_at,
  c.last_seen_at,
  1
from public.contacts c
where c.source_arcade = true
  and c.marketing_consent = true
  and c.marketing_consent_revoked_at is null
  and not exists (
    select 1
    from public.subscribers s
    where s.email_normalized = c.email_normalized
  )
on conflict (email_normalized, source, product_id, variant) do nothing;

commit;
