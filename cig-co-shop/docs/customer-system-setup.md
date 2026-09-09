# Unified customer system setup

The storefront contains the application code, but the database schema and
third-party credentials must be configured before deploying these functions.
Never place real values in `.env.example`, frontend JavaScript, or Git.

## 1. Supabase

1. Create a Supabase project in the region closest to the Netlify Functions
   region.
2. Open **SQL Editor** and run
   `supabase/migrations/202607250001_unified_customer_system.sql`.
3. In **Project settings > API Keys**, copy the project URL and a modern
   `sb_secret_...` server key into Netlify as `SUPABASE_URL` and
   `SUPABASE_SECRET_KEY`. A legacy service-role JWT also remains supported.
4. Do not use the Supabase secret key in browser code. The migration enables
   Row Level Security and grants the data/RPC access only to `service_role`.

The SQL migration creates:

- `contacts`: one row per normalized email.
- `arcade_prizes` and `arcade_plays`: authoritative prize and cooldown history.
- `orders` and `stripe_events`: paid Stripe orders and replay protection.
- `integration_attempts`: idempotent Kit/Resend retries and failure reporting.
- `arcade_rate_limits`: hashed network rate-limit counters.

Existing browser Arcade cache is not imported into these tables because it
cannot be trusted to establish prize or cooldown history. On first registration
after launch, Supabase establishes the authoritative state and replaces the
local convenience cache with its response.

## 2. Stripe webhook

1. In Stripe Workbench, create a webhook endpoint:
   `https://cigcompany.com/.netlify/functions/stripe-webhook`
2. Subscribe to:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
3. Add the endpoint signing secret to Netlify as
   `STRIPE_WEBHOOK_SECRET`.
4. Keep `STRIPE_SECRET_KEY` server-side and use the matching Stripe mode
   (test or live) for both secrets.
5. Run test-mode payments, resend the same event, and confirm only one order
   and one customer-total increment are recorded.

The browser return URL never fulfills an order. The webhook verifies the
signature, retrieves the Checkout Session, checks `mode`, `status`, and
`payment_status`, then calls the atomic order RPC.

## 3. Kit

Create these Kit tags and place their numeric IDs in Netlify:

- Arcade: `KIT_ARCADE_TAG_ID`
- Checkout: `KIT_CHECKOUT_TAG_ID`
- Customer: `KIT_CUSTOMER_TAG_ID`
- First order: `KIT_FIRST_ORDER_TAG_ID`
- Repeat customer: `KIT_REPEAT_CUSTOMER_TAG_ID`
- Marketing opt-in: `KIT_MARKETING_OPT_IN_TAG_ID`

Add the Kit v4 API key as `KIT_API_KEY`. Contacts are sent to Kit only after
explicit promotional consent. Existing Kit subscribers in cancelled,
complained, bounced, or inactive states are suppressed instead of
reactivated.

## 4. Resend and DNS

1. Verify `cigcompany.com` in Resend.
2. Add the DNS records supplied by Resend.
3. Add `RESEND_API_KEY` and a verified sender such as
   `CIG & CO. <info@cigcompany.com>` as `RESEND_FROM_EMAIL`.
4. Send a test order and verify the branded order-received email.

Transactional order, prize, and shipment emails do not require marketing
consent. Delivery failures are recorded and never reverse a paid order or an
Arcade claim.

## 5. Protected internal endpoints

Generate a long random token in a password manager and store it in Netlify as
`ADMIN_EXPORT_TOKEN`. Do not put it in a URL.

Export all contacts:

```sh
curl -H "Authorization: Bearer $ADMIN_EXPORT_TOKEN" \
  "https://cigcompany.com/.netlify/functions/customer-export?filter=all" \
  --output cigco-customers.csv
```

Supported filters:

- `all`
- `arcade_leads`
- `customers`
- `arcade_never_purchased`
- `first_time_customers`
- `repeat_customers`
- `marketing_subscribers`
- `non_subscribed_customers`
- `prize_winners`
- `failed_kit_sync`
- `failed_transactional_email`

The same token protects `send-shipment-email`. Send JSON containing
`orderNumber`, `carrier`, `trackingNumber`, `trackingUrl`, and
`shipmentDate` (`YYYY-MM-DD`).

It also protects `record-prize-redemption`. Send `playId`, a `status` of
`redeemed` or `void`, and optional internal `notes`. Each Arcade play retains
its original prize snapshot alongside the redemption status and timestamp.

## 6. Netlify

Add every variable in `.env.example` under **Project configuration >
Environment variables**. Scope all secrets to Functions and production where
possible. Redeploy after changing variables.

Because the current site was originally deployed manually, connect the GitHub
repository to Netlify or upload a complete production deploy containing the
site and Functions. Verify all Functions exist before enabling live Stripe
webhooks.

## 7. Pre-launch checks

1. Run `npm test`.
2. Run `node --check` for every JavaScript file.
3. Test new and returning Arcade emails, opt-in and no opt-in, first prize,
   cooldown, and a replayed claim request.
4. Test first and second Stripe orders for one normalized email.
5. Temporarily use invalid Kit and Resend test credentials and confirm the
   paid order and Arcade claim remain recorded.
6. Verify an unauthorized CSV request returns `401`.
7. Verify no server secret appears in page source, function responses, or logs.
