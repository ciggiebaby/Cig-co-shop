# Checkout attribution & sign-up exports (for BG)

## Google Ads

The Google tag (`google-ads.js`, `AW-18545350125`) loads on every page, immediately after `site-visits.js`. Do Not Track and Global Privacy Control skip it, the same way they skip the first-party visit log.

- **Add to bag** fires on the existing `add_to_bag` event (`cart.js` → `CIGGoogleAds.addToCart`). Send-to: `AW-18545350125/a3w3CNuOir8dEO2rjotF`.
- **Purchase** does not fire on `/?checkout=success`. That return is still "confirmation pending" (`app.js` `handleCheckoutResult`): the bag is kept and `session_id` is removed. Stripe is confirmed only in `stripe-webhook.js` when `payment_status` is `paid`. PayPal is confirmed only after a `COMPLETED` capture in `paypal-capture.js` / `paypal-webhook.js`. Neither result is shown to the browser, and there is no confirmed-order page.
- **What is needed to fire purchase:** a confirmed-order view (or another client state that already knows the payment is paid) calls `CIGGoogleAds.purchase({ confirmed: true, value, transactionId })`. `value` is dollars. Currency sent to Google is USD. `transactionId` is the Stripe payment intent id, or the PayPal id already stored as `paymentId` (`paypal:<capture id>`). The same id fires once per tab. Do not call it from the pending return.

A landing with `gclid`, `gbraid`, or `wbraid` and no `src` is stored as `src=google-ads` (first touch, same as other src/utm tags). A landing that already has `src` keeps that src. The click id is kept in full when it is at most 200 characters of letters, digits, and `.` `_` `~` `-`. It is not cut to the 80-character slug. A longer or junk id is dropped, and `src=google-ads` is still set.

The click id is not an `orders` column and this change does not add a migration. It is saved on the Stripe Checkout Session and PaymentIntent metadata. PayPal `custom_id` includes it only when the full id still fits in 127 characters; otherwise it is left off and the sale fields and src/utm tags stay. `track-visit` writes `gclid` / `gbraid` / `wbraid` on `site_visits` when those columns exist, and if PostgREST says the column is missing (`PGRST204` or `42703`) it stores the visit without them.

## Which link drove a sale
Landing URLs with `?src=` (ig, tiktok, x, arcade, qr, fani...) and/or `utm_source`,
`utm_medium`, `utm_campaign`, `utm_content` are saved in the browser for 30 days
(`checkout-attribution.js`, localStorage, first touch wins) and sent with checkout.
The spelling is kept. A tag is kept only when it matches the visit log: trimmed,
at most 80 characters, letters, digits, and `.` `_` `~` `+` `-` or space. A missing
or junk tag is dropped and checkout still runs.

- **Orders table:** `src`, `utm_source`, `utm_medium`, `utm_campaign` (nullable).
  Empty means that order had no tag, or it was placed before the
  `202611250001_orders_attribution.sql` migration. `utm_content` is not a column.
- **Stripe:** Checkout Session and PaymentIntent `metadata.src`, `metadata.utm_source`,
  `metadata.utm_medium`, `metadata.utm_campaign`, `metadata.utm_content` (only keys
  that were present). The webhook copies the four order columns from the session.
  Stripe Dashboard → Payments, or `stripe checkout sessions list` and read `metadata.src`.
- **PayPal:** `custom_id` is capped at 127 characters, so the sale fields (code,
  discount, consent, country, customs code) win. Tags that still fit are stored as
  `s`, `us`, `um`, `uc` and copied onto the order when the payment is captured.
  A tag that does not fit is left off rather than shortened.

## Email sign-ups export
`customer-export` (Netlify function, needs `Authorization: Bearer $ADMIN_EXPORT_TOKEN`):

    curl -H "Authorization: Bearer $ADMIN_EXPORT_TOKEN" \
      "https://cigcompany.com/.netlify/functions/customer-export?filter=subscribers" -o signups.csv
    # one source: &source=qr   per-source totals: ?filter=subscriber_counts

Or in Supabase SQL: `select * from subscribers order by first_seen_at desc;`
