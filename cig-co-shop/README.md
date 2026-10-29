# CIG & CO. — Shop Site

Your own storefront: black/gold brand, product grid, full multi-item cart, and
checkout via Stripe (card), PayPal, and Coinbase Commerce (crypto, with your
20% discount built in automatically). No monthly platform fee — only standard
per-transaction processing fees from whichever payment method the customer picks.

## What's in this folder

- `index.html`, `styles.css`, `app.js`, `cart.js` — the actual site.
- `gallery.html`, `gallery-data.js`, `gallery.js` — the Gallery page.
- `arcade.html`, `arcade.js` — the Arcade page (email-gated games).
- `promo.js` — discount codes (none active right now) and Arcade prizes, shared by checkout and the Arcade.
- `email-list.js` — legacy Netlify Forms capture retained for non-Stripe checkout compatibility.
- `products.js` — **edit this to add/change backstock.** Plain English, no code experience needed beyond copy-pasting the pattern.
- `assets/logo-spin.mp4` — your spinning logo, used in the hero section.
- `assets/products/placeholder.svg` — shows until you add real photos.
- `netlify/functions/` — checkout, signed Stripe webhooks (orders + Printful print-on-demand), Arcade, Kit/Resend, shipment, and protected export endpoints.
- `supabase/migrations/` — the unified customer, order, Arcade, and integration schema.
- `docs/customer-system-setup.md` — Supabase, Stripe webhook, Kit, Resend, and protected export setup.
- `.env.example` — list of the secret keys you'll need (see below). Never put real keys directly in this file.

## Gallery page

Add real art to `gallery-data.js` the same way you add products — copy one of
the placeholder `{ ... }` blocks, point `image` at a file in `assets/gallery/`
(create that folder), and give it a title and description. The video at the
top of the page is set in `gallery.html` — swap the YouTube link there any
time you drop a new visualizer or music video.

## Promo codes

**Masks only (CIG, Oct 29, 2026).** Every promo code (static or Arcade) takes
money off the ski mask, balaclava and moto mask only (`PROMO_ELIGIBLE_PRODUCT_IDS`
in `promo.js`); FW26/27 pieces always stay full price, and a code on a bag with
no mask is refused. BG (Finance) set the caps in `promo.js`:
`MASK_PROMO_MAX_DISCOUNT` = 20% (the most a code can take off a mask) and
`MASK_PROMO_PRICE_FLOOR_USD` = wholesale (ski $15, balaclava $12.50, moto $7.50;
never set these below wholesale). Both are **provisional** until we have mask
unit costs and a mask label rate. Codes never stack: one code per order, and
crypto orders take no code.
Free-item Arcade prizes are redeemable for one mask only and ship separately on
their own Pirate Ship label, so the winner pays the $8.95 mask shipping
(`GIFT_MASK_SHIPPING_CENTS`) even if their order ships free. The 20% crypto
discount is separate and unchanged.

Store-wide promo codes live in `promo.js` under `PROMO_CODES` (Arcade codes
are separate; see below). **No store-wide codes are active right now** (CIG5, CIG10 and CIG20 were retired), so any code a customer types
shows "That code isn't valid." To add one, add a line inside the braces and
deploy:

```js
const PROMO_CODES = {
  SUMMER15: { discount: 0.15, label: "15% off" },
};
```

`discount` is the fraction off (0.15 = 15%). Write the code in UPPERCASE;
customers can type it in any case. The checkout server reads the same file, so
a code works for card and PayPal as soon as it's deployed. **Promo codes never
stack with the 20% crypto discount.** Crypto checkout always uses its 20% and
ignores any promo code.

## Arcade page + email list

Visitors enter their email to unlock three games — a spin wheel, a scratch
card, and mystery boxes. It's built to capture emails without giving away much:

- **First play:** a guaranteed **10% off** code.
- **Every play after that** (one every seven days): mostly free perks —
  **Early Access** to the next drop or a **Giveaway Entry** for that month's
  free item — with a rare **15% off** code (about 1 play in 20).
- No 20% codes, no free merch, no "try again".

Every discount code is **unique** (e.g. `CIG10-7KQ4XW2M`), works **once**, only
with **the email that won it**, and **expires 7 days** after it's issued.
Codes are stored in the Supabase `arcade_codes` table, checked by the server at
checkout, and marked used when the paid order is recorded. Like every promo
code, they never stack with the 20% crypto discount. **Playing any one of the
three games counts as your play** and locks the whole Arcade for seven days.

Supabase's `arcade_prizes` table picks the prize (the `weight` column sets the
odds; `is_first_play_eligible` marks the first-play prize). `PRIZES` in
`promo.js` is only the display copy for the wheel, so keep its ids in sync.
To find giveaway entrants or the early-access list, filter `arcade_plays` by
`prize_id = 'giveaway'` or `'early'`. See `docs/arcade-codes-rollout.md` for
the database rollout.

**Winners get their code by email immediately** after Supabase confirms the
play. Supabase is authoritative for Arcade identity, first-play eligibility,
the seven-day cooldown, and prize history. Kit receives only contacts who
explicitly select the optional promotional-email checkbox. See
`docs/customer-system-setup.md` for setup.

### Turning on automatic prize emails

1. Go to [resend.com](https://resend.com) and sign up (free — 3,000 emails/month on the free tier).
2. Go to **API Keys** and create one, then copy it.
3. In Netlify, go to **Site settings > Environment variables** and add `RESEND_API_KEY` with that value.
4. To send from your own address instead of Resend's shared test address, go to **Domains** in Resend, add `cigcompany.com`, and add the DNS records it gives you at GoDaddy (same place you'll already be adding DNS records in Step 4 below). Once verified, set `RESEND_FROM_EMAIL` to `CIG & CO. <info@cigcompany.com>`.
5. Until your domain is verified, Resend only lets you send to the email address you signed up with — that's a Resend limit for anti-spam, not something in this code. Real customers won't receive prize emails until you finish the domain verification step, so do that before promoting the Arcade.

## PayPal and crypto payment confirmation

PayPal and Coinbase checkouts are priced on the server from `products.js`
(the browser's prices are ignored), just like card checkout. Crypto always
gets its 20% discount and never takes a promo code on top.

- **PayPal:** after the buyer approves, PayPal sends them to
  `/.netlify/functions/paypal-capture`, which **captures** the payment (no
  capture means no money) and records the order. PayPal collects the shipping
  address from the buyer's PayPal account. The signed
  `/.netlify/functions/paypal-webhook` captures and records any order whose
  buyer closed the tab before returning.
- **Crypto:** `/.netlify/functions/coinbase-webhook` checks Coinbase's
  `X-CC-Webhook-Signature`, re-reads the charge, and records it once it is
  confirmed. The shipping address typed on the site is stored in the charge.

Confirmed PayPal/crypto orders are recorded in Supabase and get the same order
email and Kit sync as card orders. Their order ids start with `paypal:` or
`coinbase:` in the existing order columns.

Setup:

1. **PayPal:** in [developer.paypal.com](https://developer.paypal.com/dashboard/applications),
   open your Live app > **Webhooks > Add webhook**. Use the URL
   `https://cigcompany.com/.netlify/functions/paypal-webhook` with the events
   **Checkout order approved** (`CHECKOUT.ORDER.APPROVED`) and
   **Payment capture completed** (`PAYMENT.CAPTURE.COMPLETED`). Copy the
   **Webhook ID** into Netlify as `PAYPAL_WEBHOOK_ID`.
2. **Coinbase Commerce:** go to **Settings > Notifications > Add an endpoint**,
   use `https://cigcompany.com/.netlify/functions/coinbase-webhook`, and copy
   the **shared secret** into Netlify as `COINBASE_COMMERCE_WEBHOOK_SECRET`.
3. Redeploy, then place a small test order with each method.

## Print-on-demand (Printful)

Products with a `pod: { ... }` block in `products.js` are made to order by
Printful — no stock to track (see the comment at the top of `products.js` for
the format). When a customer pays **by card**, Stripe calls
`/.netlify/functions/printful-fulfillment`, which checks the signature,
confirms the payment is paid, and creates a Printful order for just the
print-on-demand items, shipped to the address the customer entered at Stripe
checkout. Archive items in the same order are untouched and ship from you as
before.

- **Drafts by default.** Orders land in Printful as drafts, so nothing is
  printed or billed to your Printful account until you click Confirm there.
  Set `PRINTFUL_AUTO_CONFIRM=true` to send paid orders straight to print.
- **No duplicates.** The Printful order's External ID is the Stripe payment id,
  so a retried webhook reuses the existing order.
- **Card and PayPal (CIG 10/22).** Made-to-order items take card or PayPal.
  Captured PayPal orders create the same Printful draft (external ID = the
  PayPal capture id) from `paypal-capture` / `paypal-webhook`; if Printful
  fails, the PayPal webhook retry tries again. Crypto never takes them. Set
  `POD_CARD_ONLY` at the bottom of `products.js` back to `true` to return to
  card only (it covers both the site and the server).

Setup:

1. In Netlify (**Site settings > Environment variables**) add
   `PRINTFUL_API_TOKEN` (Printful > Developers > API token), `PRINTFUL_STORE_ID`
   (your Printful store id), and `PRINTFUL_AUTO_CONFIRM=false`.
2. In Stripe (**Developers > Webhooks > Add endpoint**) add
   `https://cigcompany.com/.netlify/functions/printful-fulfillment` with the
   events `checkout.session.completed` and
   `checkout.session.async_payment_succeeded`. Copy its signing secret into
   Netlify as `STRIPE_PRINTFUL_WEBHOOK_SECRET`, then redeploy.
3. Add a product with a `pod` block, place a test order, and check it shows up
   as a draft in Printful > Orders.

To check the Printful connection from your computer (creates a draft order and
cancels it right away; nothing is charged):
`PRINTFUL_API_TOKEN=... node scripts/printful-live-test.js`

## Step 1 — Add your real product photos

1. Save each product photo as a `.jpg` or `.png` file.
2. Put them in `assets/products/` (e.g. `belt.jpg`, `pillow-red.jpg`).
3. Open `products.js` and change each product's `image:` line to point at the right file, e.g. `image: "assets/products/belt.jpg"`.
4. To add a new product, copy one of the existing `{ ... }` blocks and edit the id, sku, name, price, image, colors, and sizes.

## Step 2 — Create your (free) payment accounts

You need to create these yourself — I can't create accounts or enter passwords on your behalf. Each is free to sign up for; you only pay their standard per-sale processing fee when something actually sells:

1. **Stripe** — [dashboard.stripe.com/register](https://dashboard.stripe.com/register). After signing up, go to **Developers > API keys** and copy your **Secret key**.
2. **PayPal Developer** — [developer.paypal.com](https://developer.paypal.com/dashboard/applications). Create an app under "Apps & Credentials" to get a **Client ID** and **Secret**. Start in **Sandbox** mode to test with fake money, then switch to **Live** when you're ready for real sales.
3. **Coinbase Commerce** — [commerce.coinbase.com](https://commerce.coinbase.com/). After signing up, go to **Settings > Security** to generate an **API key**.

Keep all of these keys somewhere private (like a password manager) — never paste them into chat, a public repo, or this project's files directly.

## Step 3 — Deploy the site (free)

The easiest free host for this setup is **Netlify**, since it also runs the payment functions for you.

1. Go to [app.netlify.com](https://app.netlify.com) and sign up (free).
2. Click **Add new site > Deploy manually**, then drag this entire `cig-co-shop` folder onto the page. Netlify will give you a temporary URL like `random-name-123.netlify.app` — that's normal, you'll connect your real domain next.
3. Go to **Site settings > Environment variables** and add every server-side key from `.env.example`. Keep `SITE_URL` set to `https://cigcompany.com`.
4. Trigger a redeploy (Netlify does this automatically after saving environment variables, or click **Deploys > Trigger deploy**).

## Step 4 — Point cigcompany.com at it (GoDaddy)

1. In Netlify, go to **Domain settings > Add a domain**, type `cigcompany.com`, and follow its instructions — it will show you exact DNS records to add.
2. Log into **GoDaddy** yourself (your account, your login — I can't do this step for you) and go to **My Products > DNS** for cigcompany.com.
3. Netlify will typically ask for one of these two setups — use whichever it shows you:
   - **Option A (simplest):** Change your domain's **Nameservers** at GoDaddy to Netlify's nameservers (Netlify shows you the exact values).
   - **Option B:** Keep GoDaddy's nameservers, and instead add the specific **A record** and **CNAME record** Netlify gives you (usually an A record for `@` pointing to Netlify's load balancer IP, and a CNAME for `www` pointing to your `.netlify.app` address).
4. DNS changes can take anywhere from a few minutes to 24 hours to fully update. Netlify will show a green checkmark next to your domain once it's live with HTTPS.

## Step 5 — Test before going live

- In PayPal, leave `PAYPAL_API_BASE` set to sandbox mode first and place a test order with a sandbox PayPal account so you can see the full flow without real money moving.
- Stripe has built-in test mode automatically when you use test keys (they start with `sk_test_`) — switch to live keys (`sk_live_`) only once you've confirmed checkout works end to end.
- Coinbase Commerce charges are real from the first API key, so test carefully with a small cart before promoting it.

## Editing after launch

Any time you want to add backstock, remove a sold-out item, or change a price: edit `products.js`, then re-drag the folder onto Netlify (or connect this folder to a GitHub repo and Netlify will redeploy automatically on every save — ask me later if you want that set up, it removes the manual re-upload step).

## FW26/27 drop lock and pre-launch test order

- `DROP_AT` at the top of `products.js` (Oct 30, 12:00 PM ET, confirmed by CIG 10/21) locks the five FW26/27 products. Before that time they show a "Drops Oct 30" badge, Add to Bag is disabled, and the Stripe/PayPal/crypto checkouts refuse them with a 400. At `DROP_AT` everything opens automatically (no deploy needed).
- **One real test order before launch:**
  1. In Netlify, set env var `DROP_TEST_CODE` to a private code (8+ characters), then redeploy so it takes effect. If it's unset, there is no bypass at all.
  2. Open `https://cigcompany.com/?droptest`. That tab can add FW26/27 items to the bag and shows a "Drop test code" box at checkout.
  3. Enter the code there and pay by card. The server checks it against `DROP_TEST_CODE`; the price is unchanged. The Stripe session is tagged `drop_test=true`, and the Printful order lands as a draft as usual.
  4. Delete `DROP_TEST_CODE` from Netlify afterwards (and redeploy).
