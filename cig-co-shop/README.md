# CIG & CO. — Shop Site

Your own storefront: black/gold brand, product grid, full multi-item cart, and
checkout via Stripe (card), PayPal, and Coinbase Commerce (crypto, with your
20% discount built in automatically). No monthly platform fee — only standard
per-transaction processing fees from whichever payment method the customer picks.

## What's in this folder

- `index.html`, `styles.css`, `app.js`, `cart.js` — the actual site.
- `gallery.html`, `gallery-data.js`, `gallery.js` — the Gallery page.
- `arcade.html`, `arcade.js` — the Arcade page (email-gated games).
- `promo.js` — discount codes and Arcade prizes, shared by checkout and the Arcade.
- `email-list.js` — sends emails (Arcade unlock + optional checkout opt-in) to Netlify Forms.
- `products.js` — **edit this to add/change backstock.** Plain English, no code experience needed beyond copy-pasting the pattern.
- `assets/logo-spin.mp4` — your spinning logo, used in the hero section.
- `assets/products/placeholder.svg` — shows until you add real photos.
- `netlify/functions/` — backend functions: Stripe, PayPal, and Coinbase Commerce checkout, plus `send-prize-email.js` for the Arcade.
- `.env.example` — list of the secret keys you'll need (see below). Never put real keys directly in this file.

## Gallery page

Add real art to `gallery-data.js` the same way you add products — copy one of
the placeholder `{ ... }` blocks, point `image` at a file in `assets/gallery/`
(create that folder), and give it a title and description. The video at the
top of the page is set in `gallery.html` — swap the YouTube link there any
time you drop a new visualizer or music video.

## Arcade page + email list

Visitors enter their email to unlock three games — a spin wheel, a scratch
card, and mystery boxes. **Every visitor's first play is a guaranteed 10% or
20% off** (picked randomly between the two) — a hook to get people playing.
Every play after that is pure chance across the full prize pool, including a
"try again" outcome. **Playing any one of the three counts as your play**
and locks the whole Arcade for 48 hours — a live countdown shows on the page
until the next play unlocks. Prizes are
defined in `promo.js` under `PRIZES`: 5%, 10%, and 20% off codes (the same
codes usable at checkout — nothing higher, by design), plus "Free Merch" and
"Mystery Gift" prizes that have no automatic fulfillment — winners are told
to screenshot their result and email or DM you to claim it, so keep an eye
out for those.

**Winners get their code by email immediately** — no waiting for you to send
it. That part needs one more free account (see below). Every email — from the
Arcade gate and from the optional "keep me posted" checkbox at checkout — is
also captured via **Netlify Forms**, a free feature of the same Netlify
account you're already deploying to. No extra signup or API key needed for
that part. Once deployed, submissions appear under **Site settings > Forms**
in your Netlify dashboard, where you can view them, export a CSV, or turn on
an email notification for new signups.

### Turning on automatic prize emails

1. Go to [resend.com](https://resend.com) and sign up (free — 3,000 emails/month on the free tier).
2. Go to **API Keys** and create one, then copy it.
3. In Netlify, go to **Site settings > Environment variables** and add `RESEND_API_KEY` with that value.
4. To send from your own address instead of Resend's shared test address, go to **Domains** in Resend, add `cigcompany.com`, and add the DNS records it gives you at GoDaddy (same place you'll already be adding DNS records in Step 4 below). Once verified, set the `FROM_EMAIL` environment variable to something like `CIG & CO. <rewards@cigcompany.com>`.
5. Until your domain is verified, Resend only lets you send to the email address you signed up with — that's a Resend limit for anti-spam, not something in this code. Real customers won't receive prize emails until you finish the domain verification step, so do that before promoting the Arcade.

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
3. Go to **Site settings > Environment variables** and add each key from `.env.example` with your real values from Step 2 (STRIPE_SECRET_KEY, PAYPAL_CLIENT_ID, PAYPAL_SECRET, COINBASE_COMMERCE_API_KEY, RESEND_API_KEY, FROM_EMAIL, and SITE_URL set to `https://cigcompany.com`).
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
