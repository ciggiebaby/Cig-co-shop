# Checkout attribution & sign-up exports (for BG)

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
