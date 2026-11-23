// EARLYCIG, Black Friday early access (CIG approved Mon 11/23/2026, 12:31 AM ET):
// 20% off ski masks ($30 -> $24) and balaclavas ($25 -> $20) only; moto and
// every FW26/27 piece stay full price; one code per order (no stacking, never
// with crypto); valid Tue 11/24 12:00 AM ET through Mon 11/30 11:59 PM ET.
const assert = require("node:assert/strict");
const test = require("node:test");

const promo = require("../promo.js");
const { quoteShipping } = require("../shipping-rates.js");
const {
  PricingValidationError,
  normalizePromoCode,
  priceCartForStripe,
} = require("../netlify/lib/stripe-pricing.js");
const { resolvePromo } = require("../netlify/lib/promo-codes.js");

const START = Date.parse("2026-11-24T05:00:00.000Z"); // Tue 11/24 12:00 AM ET
const END = Date.parse("2026-12-01T05:00:00.000Z");   // Tue 12/1 12:00 AM ET (exclusive)
const LIVE = Date.parse("2026-11-27T17:00:00.000Z");  // Black Friday noon ET

const ski = (color = "Red", size = "3-Hole", quantity = 1) => ({ productId: "0008", color, size, quantity });
const balaclava = (color = "Gold", quantity = 1) => ({ productId: "0005", color, quantity });
const moto = (quantity = 1) => ({ productId: "0013", color: "Purple", quantity });
const bundle = () => ({ productId: "FW26-BUNDLE", style: "Black", color: "Black", size: "iPhone 16 Pro", quantity: 1 });
const others = [
  { productId: "FW26-BAG", color: "Black", quantity: 1 },
  { productId: "FW26-CASE", color: "Black", size: "iPhone 16 Pro", quantity: 1 },
  { productId: "FW26-SLEEVE", color: "Black", size: "15″", quantity: 1 },
  { productId: "FW26-PILLOW", color: "Black", size: "18″×18″", quantity: 1 },
  { productId: "FW26-TOTE", color: "Black", quantity: 1 },
];
const price = (items, at = LIVE) => priceCartForStripe(items, "earlycig", undefined, { now: at });
const units = (priced) => priced.lineItems.map((l) => l.price_data.unit_amount);

test("EARLYCIG config matches CIG's approved terms exactly", () => {
  assert.deepEqual(promo.PROMO_CODES.EARLYCIG, {
    discount: 0.20,
    label: "20% off",
    productIds: ["0008", "0005"],
    eligibleLabel: "ski masks and balaclavas",
    startsAt: "2026-11-24T05:00:00.000Z",
    endsAt: "2026-12-01T05:00:00.000Z",
  });
});

test("ski mask $30 -> $24 and balaclava $25 -> $20, every color/size", () => {
  // Every in-stock variant (products.js stock; sold-out ones can't be bought).
  const { PRODUCTS } = require("../products.js");
  const skiStock = PRODUCTS.find((p) => p.id === "0008").stock;
  const balaclavaStock = PRODUCTS.find((p) => p.id === "0005").stock;
  let checked = 0;
  for (const [color, sizes] of Object.entries(skiStock)) {
    for (const [size, n] of Object.entries(sizes)) {
      if (n < 1) continue;
      assert.deepEqual(units(price([ski(color, size)])), [2400], `${color} ${size}`);
      checked += 1;
    }
  }
  for (const [color, n] of Object.entries(balaclavaStock)) {
    if (n < 1) continue;
    assert.deepEqual(units(price([balaclava(color)])), [2000], color);
    checked += 1;
  }
  assert.ok(checked >= 10);
  const both = price([ski(), balaclava("Gold", 2)]);
  assert.equal(both.subtotalCents, 3000 + 5000);
  assert.equal(both.totalCents, 2400 + 4000);
  assert.equal(both.promoCode, "EARLYCIG");
});

test("moto, the $99 bundle and every other product get no discount", () => {
  const priced = price([ski(), moto(), bundle(), ...others]);
  assert.deepEqual(units(priced), [2400, 1500, 9900, 6500, 4000, 5500, 5200, 3500]);
  assert.equal(priced.discountCents, 600); // only the ski mask
});

test("a cart with nothing EARLYCIG covers is refused, naming the masks", () => {
  for (const items of [[moto()], [bundle()], [moto(), bundle()], others]) {
    assert.throws(() => price(items), /only works on ski masks and balaclavas/);
  }
});

test("refused before Tue 11/24 12:00 AM ET and from Tue 12/1 12:00 AM ET", () => {
  assert.throws(() => price([ski()], START - 1), /isn't active yet/);
  assert.throws(() => price([ski()], Date.parse("2026-11-23T05:31:00Z")), /isn't active yet/); // approval time
  assert.deepEqual(units(price([ski()], START)), [2400]);
  assert.deepEqual(units(price([ski()], END - 1)), [2400]); // Mon 11/30 11:59:59.999 PM ET
  assert.throws(() => price([ski()], END), /has expired/);
  assert.equal(promo.promoCodeStatus("EARLYCIG", START - 1), "not_started");
  assert.equal(promo.promoCodeStatus("EARLYCIG", LIVE), "active");
  assert.equal(promo.promoCodeStatus("EARLYCIG", END), "expired");
  assert.throws(() => normalizePromoCode("EARLYCIG", START - 1), PricingValidationError);
});

test("checkout resolver (Stripe and PayPal) enforces the same window", async () => {
  const store = () => { throw new Error("static codes never hit Supabase"); };
  await assert.rejects(resolvePromo({ promoCode: "EARLYCIG", email: "a@b.co", now: START - 1, storeFactory: store }), /isn't active yet/);
  const ok = await resolvePromo({ promoCode: " earlycig ", email: "a@b.co", now: LIVE, storeFactory: store });
  assert.deepEqual(ok, { code: "EARLYCIG", discountBasisPoints: 2000, productIds: ["0008", "0005"], eligibleLabel: "ski masks and balaclavas" });
  assert.deepEqual(units(priceCartForStripe([ski(), moto()], "EARLYCIG", ok, { now: LIVE })), [2400, 1500]);
});

test("no stacking: one code per order, and crypto pricing ignores codes", () => {
  // Checkout takes a single promoCode string; a second code isn't accepted.
  assert.throws(() => normalizePromoCode("EARLYCIG CIG10-ABCDEFGH", LIVE), /not valid/);
  assert.throws(() => normalizePromoCode("EARLYCIG,CIG20", LIVE), /not valid/);
  // Coinbase prices with no code at all (create-coinbase-charge.js).
  assert.deepEqual(units(priceCartForStripe([ski()], null, undefined, { now: LIVE })), [3000]);
});

test("US shipping on masks stays free with the code", () => {
  const priced = price([ski(), balaclava()]);
  const lines = priced.shippingLines;
  assert.equal(quoteShipping(lines, "US", { merchandiseCents: priced.totalCents }).shippingCents, 0);
});

test("other masks' promo behavior is unchanged (Arcade codes still cover all three masks)", () => {
  const arcade = { code: "CIG10-ABCDEFGH", discountBasisPoints: 1000 };
  assert.deepEqual(units(priceCartForStripe([moto()], null, arcade, { now: LIVE })), [1350]);
});

// ---------- Checkout functions (real resolver; Stripe, PayPal and stock stubbed) ----------
const { createHandler: createStripeSession } = require("../netlify/functions/create-stripe-session.js");
const { createHandler: createPayPalOrder } = require("../netlify/functions/create-paypal-order.js");
const quiet = { log() {}, error() {} };
const stock = () => ({
  getStock: async () => [
    { product_id: "0008", color: "Red", size: "3-Hole", quantity: 50 },
    { product_id: "0005", color: "Gold", size: "", quantity: 10 },
    { product_id: "0013", color: "Purple", size: "", quantity: 14 },
  ],
});
const cart = [ski(), balaclava(), moto(), bundle()];

async function stripeCheckout(now, promoCode = "EARLYCIG", items = cart) {
  const requests = [];
  const handler = createStripeSession({
    environment: { STRIPE_SECRET_KEY: "sk_test_x", SITE_URL: "https://cigcompany.com" },
    stripeFactory: () => ({ checkout: { sessions: { create: async (r) => { requests.push(r); return { url: "https://checkout.stripe.test/s" }; } } } }),
    stockStoreFactory: stock,
    logger: quiet,
    now: () => now,
  });
  const body = JSON.stringify({ items, promoCode, shipCountry: "US", customer: { email: "buyer@example.com" } });
  const response = await handler({ httpMethod: "POST", headers: {}, body });
  return { response, request: requests[0] };
}

async function paypalCheckout(now, promoCode = "EARLYCIG", items = cart) {
  let sent;
  const handler = createPayPalOrder({
    environment: { PAYPAL_CLIENT_ID: "x", PAYPAL_SECRET: "y", SITE_URL: "https://cigcompany.com" },
    paypalFactory: () => ({ createOrder: async (order) => { sent = order; return { links: [{ rel: "approve", href: "https://paypal.test/a" }] }; } }),
    stockStoreFactory: stock,
    logger: quiet,
    now: () => now,
  });
  const body = JSON.stringify({ cart: items.map(({ quantity, ...rest }) => ({ ...rest, qty: quantity })), promoCode, shipCountry: "US", customer: { email: "b@example.com", name: "B" } });
  const response = await handler({ httpMethod: "POST", headers: {}, body });
  return { response, sent };
}

test("Stripe session: ski $24, balaclava $20, moto $15, bundle $99, free US shipping, code in metadata", async () => {
  const { response, request } = await stripeCheckout(LIVE);
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(request.line_items.map((l) => l.price_data.unit_amount), [2400, 2000, 1500, 9900]);
  assert.equal(request.metadata.promo_code, "EARLYCIG");
  assert.equal(request.allow_promotion_codes, undefined); // no Stripe-side codes to stack
  assert.equal(request.discounts, undefined);
  const rates = request.shipping_options || [];
  for (const rate of rates) assert.equal(rate.shipping_rate_data.fixed_amount.amount, 0);
});

test("Stripe session: refused before start and after end; no session is made", async () => {
  for (const [at, re] of [[START - 1, /isn't active yet/], [END, /has expired/]]) {
    const { response, request } = await stripeCheckout(at);
    assert.equal(response.statusCode, 400, String(at));
    assert.match(JSON.parse(response.body).error, re);
    assert.equal(request, undefined);
  }
  const motoOnly = await stripeCheckout(LIVE, "EARLYCIG", [moto()]);
  assert.equal(motoOnly.response.statusCode, 400);
  assert.match(JSON.parse(motoOnly.response.body).error, /ski masks and balaclavas/);
});

test("PayPal order: same prices and same window as Stripe", async () => {
  const { response, sent } = await paypalCheckout(LIVE);
  assert.equal(response.statusCode, 200, response.body);
  const unit = sent.purchase_units[0];
  assert.deepEqual(unit.items.map((i) => i.unit_amount.value), ["24.00", "20.00", "15.00", "99.00"]);
  assert.equal(unit.amount.breakdown.item_total.value, "158.00");
  assert.equal(JSON.parse(unit.custom_id).p, "EARLYCIG");
  for (const at of [START - 1, END]) {
    const refused = await paypalCheckout(at);
    assert.equal(refused.response.statusCode, 400, String(at));
    assert.equal(refused.sent, undefined);
  }
});

test("Stripe sessions with EARLYCIG can't be paid long after the code ends (no 30-day recovery copy)", async () => {
  const { promoSessionLimits } = require("../netlify/functions/create-stripe-session.js");
  // Early in the window: Stripe's 24h default stands, recovery off.
  assert.deepEqual(promoSessionLimits("EARLYCIG", LIVE), { noRecovery: true });
  // Mon 11/30 9 PM ET: session ends at the code's end, Tue 12/1 12:00 AM ET.
  const nine = Date.parse("2026-12-01T02:00:00Z");
  assert.deepEqual(promoSessionLimits("EARLYCIG", nine), { noRecovery: true, expiresAt: END / 1000 });
  // 11:50 PM ET: Stripe's 30-minute minimum, so 31 minutes from now.
  const late = Date.parse("2026-12-01T04:50:00Z");
  assert.equal(promoSessionLimits("EARLYCIG", late).expiresAt, late / 1000 + 31 * 60);
  // Codes without an end and no code: unchanged.
  assert.deepEqual(promoSessionLimits(null, LIVE), {});
  assert.deepEqual(promoSessionLimits("CIG10-ABCDEFGH", LIVE), {});

  const requests = [];
  const handler = createStripeSession({
    environment: { STRIPE_SECRET_KEY: "sk_test_x", SITE_URL: "https://cigcompany.com", STRIPE_CHECKOUT_RECOVERY: "true" },
    stripeFactory: () => ({ checkout: { sessions: { create: async (r) => { requests.push(r); return { url: "u" }; } } } }),
    stockStoreFactory: stock,
    logger: quiet,
    now: () => nine,
  });
  const send = (promoCode) => handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ items: [ski()], promoCode, shipCountry: "US", customer: { email: "b@example.com" } }) });
  assert.equal((await send("EARLYCIG")).statusCode, 200);
  assert.equal(requests[0].after_expiration, undefined);
  assert.equal(requests[0].expires_at, END / 1000);
  assert.equal((await send(null)).statusCode, 200);
  assert.deepEqual(requests[1].after_expiration, { recovery: { enabled: true } }); // no code: recovery as before
  assert.equal(requests[1].expires_at, undefined);
});
