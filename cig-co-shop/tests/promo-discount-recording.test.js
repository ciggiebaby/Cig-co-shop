// BG (Finance, 11/23/2026): every order that uses a promo code records the
// code AND the dollars off, for card and PayPal alike:
//   Stripe Checkout Session metadata  promo_code + discount_cents
//   Stripe PaymentIntent metadata     promo_code + discount_cents (code orders)
//   PayPal custom_id                  p (code) + d (cents off, code orders)
//   Supabase public.orders            promo_code + discount_cents
// discount_cents: 0 = no code; null = not recorded (older orders, or a code
// order whose checkout started before this change).
const assert = require("node:assert/strict");
const test = require("node:test");

const { priceCartForStripe, recordedDiscountCents } = require("../netlify/lib/stripe-pricing.js");
const { buildPayPalOrder, paidPayPalOrder, parseCustomId } = require("../netlify/lib/paypal.js");
const { createCustomerStore } = require("../netlify/lib/customer-store.js");
const { recordPaidOrder } = require("../netlify/lib/order-recording.js");
const { createHandler: createStripeSession } = require("../netlify/functions/create-stripe-session.js");
const { createHandler: createStripeWebhook } = require("../netlify/functions/stripe-webhook.js");
const { SupabaseRequestError } = require("../netlify/lib/supabase.js");

const LIVE = Date.parse("2026-11-27T17:00:00.000Z"); // EARLYCIG window
const quiet = { log() {}, error() {}, warn() {} };
const ski = { productId: "0008", color: "Red", size: "3-Hole", quantity: 1 };
const balaclava = { productId: "0005", color: "Gold", quantity: 1 };
const moto = { productId: "0013", color: "Purple", quantity: 1 };
const stock = () => ({
  getStock: async () => [
    { product_id: "0008", color: "Red", size: "3-Hole", quantity: 50 },
    { product_id: "0005", color: "Gold", size: "", quantity: 10 },
    { product_id: "0013", color: "Purple", size: "", quantity: 14 },
  ],
});

test("recordedDiscountCents: number or digit string; 0 with no code; null if a code order has none", () => {
  assert.equal(recordedDiscountCents("1100", "EARLYCIG"), 1100);
  assert.equal(recordedDiscountCents(1100, "EARLYCIG"), 1100);
  assert.equal(recordedDiscountCents("0", null), 0);
  assert.equal(recordedDiscountCents(undefined, null), 0);
  assert.equal(recordedDiscountCents(undefined, ""), 0);
  assert.equal(recordedDiscountCents(undefined, "EARLYCIG"), null);
  assert.equal(recordedDiscountCents("", "EARLYCIG"), null);
  for (const bad of ["-5", "12.5", "abc", -1, 1.5, "1e3x"]) {
    assert.equal(recordedDiscountCents(bad, "EARLYCIG"), null, String(bad));
  }
});

async function stripeSession(promoCode, items) {
  const requests = [];
  const handler = createStripeSession({
    environment: { STRIPE_SECRET_KEY: "sk_test_x", SITE_URL: "https://cigcompany.com" },
    stripeFactory: () => ({ checkout: { sessions: { create: async (r) => { requests.push(r); return { url: "u" }; } } } }),
    stockStoreFactory: stock,
    logger: quiet,
    now: () => LIVE,
  });
  const response = await handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ items, promoCode, shipCountry: "US", customer: { email: "b@example.com" } }) });
  assert.equal(response.statusCode, 200, response.body);
  return requests[0];
}

test("Stripe session: EARLYCIG order carries promo_code + discount_cents on the session and the PaymentIntent", async () => {
  const request = await stripeSession("EARLYCIG", [ski, balaclava, moto]);
  assert.equal(request.metadata.promo_code, "EARLYCIG");
  assert.equal(request.metadata.discount_cents, "1100"); // $6 ski + $5 balaclava
  assert.deepEqual(request.payment_intent_data, { metadata: { promo_code: "EARLYCIG", discount_cents: "1100" } });
});

test("Stripe session: no code -> discount_cents \"0\", no PaymentIntent metadata added", async () => {
  const request = await stripeSession(null, [ski]);
  assert.equal(request.metadata.promo_code, "");
  assert.equal(request.metadata.discount_cents, "0");
  assert.equal(request.payment_intent_data, undefined);
});

function webhookFor(metadata) {
  let processed;
  const session = {
    id: "cs_paid_1", mode: "payment", status: "complete", payment_status: "paid", payment_intent: "pi_1",
    amount_total: 4400, currency: "usd", customer_details: { email: "b@example.com", name: "B C" },
    metadata, line_items: { data: [] },
  };
  const handler = createStripeWebhook({
    stripeFactory: () => ({
      webhooks: { constructEvent: () => ({ id: "evt_1", type: "checkout.session.completed", created: 1795000000, data: { object: { id: session.id } } }) },
      checkout: { sessions: { retrieve: async () => session } },
    }),
    storeFactory: () => ({
      processStripeOrder: async (order) => {
        processed = order;
        return { created: true, contact: { id: "c1", marketing_consent: false }, order: { id: "o1", order_number: "CIG-1" } };
      },
    }),
    stockStoreFactory: () => ({ commitOrder: async () => ({}) }),
    sendOrder: async () => {},
    syncKit: async () => {},
    environment: { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" },
    logger: quiet,
  });
  return { run: () => handler({ httpMethod: "POST", headers: { "stripe-signature": "ok" }, body: "raw" }), get: () => processed };
}

test("Stripe webhook passes discount_cents to the order record (and handles older sessions)", async () => {
  for (const [metadata, promo, cents] of [
    [{ promo_code: "EARLYCIG", discount_cents: "1100" }, "EARLYCIG", 1100],
    [{ promo_code: "", discount_cents: "0" }, "", 0],
    [{ promo_code: "EARLYCIG" }, "EARLYCIG", null], // session made before this deploy
    [{ promo_code: "" }, "", 0],
  ]) {
    const hook = webhookFor({ marketing_consent: "false", ...metadata });
    const response = await hook.run();
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(hook.get().promoCode, promo);
    assert.equal(hook.get().discountCents, cents, JSON.stringify(metadata));
  }
});

test("PayPal: custom_id carries d (cents off) only with a code, stays <= 127 chars, and is read back", () => {
  const priced = priceCartForStripe([ski, balaclava, moto], "EARLYCIG", undefined, { now: LIVE });
  const order = buildPayPalOrder(priced, { siteUrl: "https://cigcompany.com" });
  const custom = JSON.parse(order.purchase_units[0].custom_id);
  assert.deepEqual(custom, { p: "EARLYCIG", d: 1100, m: 0 });
  assert.equal(parseCustomId(order.purchase_units[0].custom_id).discountCents, 1100);

  const plain = buildPayPalOrder(priceCartForStripe([ski], null, undefined, { now: LIVE }), { siteUrl: "https://cigcompany.com" });
  assert.deepEqual(JSON.parse(plain.purchase_units[0].custom_id), { p: "", m: 0 });
  assert.equal(parseCustomId(plain.purchase_units[0].custom_id).discountCents, 0);

  // Worst case: Arcade code, KR customs code, drop test, 24-char src, a big discount.
  const worst = buildPayPalOrder(
    { ...priced, promoCode: "CIG15-ABCDEFGH", discountCents: 9999999 },
    { siteUrl: "https://cigcompany.com", marketingConsent: true, shipping: { country: "KR", shippingCents: 4000 }, pccc: "P123456789012", dropTest: true, src: "x".repeat(40) },
  );
  assert.ok(worst.purchase_units[0].custom_id.length <= 127, String(worst.purchase_units[0].custom_id.length));

  // Older PayPal order with a code but no d: not recorded (null).
  assert.equal(parseCustomId(JSON.stringify({ p: "CIG10", m: 0 })).discountCents, null);
  assert.equal(parseCustomId("not json").discountCents, null);
});

test("PayPal capture -> order record gets promoCode + discountCents", async () => {
  const order = {
    id: "PP1", status: "COMPLETED",
    payer: { email_address: "b@example.com", name: { given_name: "B", surname: "C" } },
    purchase_units: [{
      amount: { currency_code: "USD", value: "59.00" },
      custom_id: JSON.stringify({ p: "EARLYCIG", d: 1100, m: 0 }),
      items: [{ name: "CIG Ski Mask — Red — 3-Hole", quantity: "1", unit_amount: { currency_code: "USD", value: "24.00" } }],
      shipping: { address: { country_code: "US" } },
      payments: { captures: [{ id: "CAP1", status: "COMPLETED", amount: { currency_code: "USD", value: "59.00" }, create_time: "2026-11-27T17:00:00Z" }] },
    }],
  };
  const paid = paidPayPalOrder(order);
  assert.equal(paid.promoCode, "EARLYCIG");
  assert.equal(paid.discountCents, 1100);

  let sent;
  await recordPaidOrder({ ...paid, eventId: "paypal:CAP1", eventType: "paypal.capture" }, {
    storeFactory: () => ({
      processStripeOrder: async (o) => { sent = o; return { contact: { id: "c", marketing_consent: false }, order: { id: "o" } }; },
    }),
    sendOrder: async () => {},
    syncKit: async () => {},
    logger: quiet,
  });
  assert.equal(sent.promoCode, "EARLYCIG");
  assert.equal(sent.discountCents, 1100);
});

function fakeClient(responses) {
  const calls = [];
  return {
    calls,
    rpc: async (name, params) => {
      calls.push({ name, params });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
}
const baseOrder = {
  eventId: "e", eventType: "t", sessionId: "s", paymentIntentId: "p", email: "a@b.co", emailOriginal: "a@b.co",
  firstName: "A", lastName: null, amountTotalCents: 2400, currency: "usd", items: [], shippingDestination: null,
  marketingConsent: false, cartFingerprint: null, promoCode: "EARLYCIG", paidAt: "2026-11-27T17:00:00Z",
};

test("customer store sends p_discount_cents to cigco_process_stripe_order", async () => {
  const client = fakeClient([{ ok: 1 }]);
  await createCustomerStore(client).processStripeOrder({ ...baseOrder, discountCents: 600 });
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].name, "cigco_process_stripe_order");
  assert.equal(client.calls[0].params.p_discount_cents, 600);
  assert.equal(client.calls[0].params.p_promo_code, "EARLYCIG");

  const nullClient = fakeClient([{ ok: 1 }]);
  await createCustomerStore(nullClient).processStripeOrder({ ...baseOrder, discountCents: null });
  assert.equal(nullClient.calls[0].params.p_discount_cents, null);

  // Callers that don't know the amount send the old 16 parameters.
  const oldClient = fakeClient([{ ok: 1 }]);
  await createCustomerStore(oldClient).processStripeOrder(baseOrder);
  assert.equal("p_discount_cents" in oldClient.calls[0].params, false);
});

test("customer store: if the migration hasn't run (PGRST202), the order still records without the amount", async () => {
  const missing = new SupabaseRequestError("x", { status: 404, code: "PGRST202" });
  const client = fakeClient([missing, { recorded: true }]);
  const result = await createCustomerStore(client).processStripeOrder({ ...baseOrder, discountCents: 600 });
  assert.deepEqual(result, { recorded: true });
  assert.equal(client.calls.length, 2);
  assert.equal(client.calls[1].params.p_discount_cents, undefined);
  assert.equal("p_discount_cents" in client.calls[1].params, false);

  // Any other database error is not swallowed.
  const other = fakeClient([new SupabaseRequestError("x", { status: 500, code: "XX000" })]);
  await assert.rejects(createCustomerStore(other).processStripeOrder({ ...baseOrder, discountCents: 600 }), (error) => error.code === "XX000");
  assert.equal(other.calls.length, 1);
});

test("migration file adds orders.discount_cents and the p_discount_cents RPC parameter", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const sql = fs.readFileSync(path.join(__dirname, "../supabase/migrations/202611230001_orders_discount_cents.sql"), "utf8");
  assert.match(sql, /add column if not exists discount_cents bigint;/);
  assert.match(sql, /p_discount_cents bigint default null/);
  assert.match(sql, /drop function if exists public\.cigco_process_stripe_order\(/);
  assert.match(sql, /grant execute on function public\.cigco_process_stripe_order\([\s\S]*timestamptz, bigint\s*\) to service_role;/);
});
