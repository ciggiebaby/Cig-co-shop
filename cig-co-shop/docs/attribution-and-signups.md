# Checkout attribution & sign-up exports (for BG)

## Which link drove a sale
Landing URLs with `?src=` (ig, tiktok, x, arcade, qr, fani...) and/or `utm_source`,
`utm_medium`, `utm_campaign`, `utm_content` are saved for the browser tab
(`checkout-attribution.js`, sessionStorage, last touch wins) and sent with checkout.

- **Stripe:** Checkout Session `metadata.src`, `metadata.utm_source`, `metadata.utm_medium`,
  `metadata.utm_campaign`, `metadata.utm_content` (only keys that were present; lowercase,
  `[a-z0-9_.-]`, max 80 chars). Stripe Dashboard → Payments → Checkout sessions, or
  `stripe checkout sessions list` and read `metadata.src`.
- **PayPal:** `custom_id` is capped at 127 chars, so only `src` is stored (as `s`, max 24
  chars). UTMs are not passed to PayPal.

## Email sign-ups export
`customer-export` (Netlify function, needs `Authorization: Bearer $ADMIN_EXPORT_TOKEN`):

    curl -H "Authorization: Bearer $ADMIN_EXPORT_TOKEN" \
      "https://cigcompany.com/.netlify/functions/customer-export?filter=subscribers" -o signups.csv
    # one source: &source=qr   per-source totals: ?filter=subscriber_counts

Or in Supabase SQL: `select * from subscribers order by first_seen_at desc;`
