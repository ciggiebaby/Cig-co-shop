// US shipping for in-hand backstock masks (CIG, 2026-10-22): any US order with
// a mask pays $8.95 per ORDER, free when the items total after promo is over
// $75 (exactly $75 still pays). FW26-only carts stay free; masks stay US only.
const assert = require("node:assert/strict");
const test = require("node:test");

const rates = require("../shipping-rates.js");
const { priceCartForStripe } = require("../netlify/lib/stripe-pricing.js");
const { resolveCheckoutShipping } = require("../netlify/lib/checkout-shipping.js");
const { buildPayPalOrder } = require("../netlify/lib/paypal.js");
const { createHandler: createStripeSession } = require("../netlify/functions/create-stripe-session.js");

const quiet = { log() {}, error() {}, warn() {} };
const TEN_OFF = { code: "TEST10", discountBasisPoints: 1000 };
const balaclava = (quantity = 1, color = "Red") => ({ productId: "0005", color, quantity });
const skiMask = (quantity = 1) => ({ productId: "0008", color: "Red", size: "3-Hole", quantity });
const bag = (quantity = 1) => ({ productId: "FW26-BAG", color: "Navy", quantity });
const usShipping = (items, promo = null) => resolveCheckoutShipping(priceCartForStripe(items, null, promo), "US").shippingCents;

test("shared rule: constants, flag on mask lines only", () => {
  assert.equal(rates.MASK_US_SHIPPING_CENTS, 895);
  assert.equal(rates.MASK_FREE_SHIPPING_OVER_CENTS, 7500);
  assert.match(rates.MASK_SHIPPING_NOTE, /\$8\.95.*free over \$75/);
  const lines = priceCartForStripe([balaclava(), bag()], null).shippingLines;
  assert.deepEqual(lines.map((l) => l.mask), [true, false]);
});

test("mask-only under $75 pays $8.95 once per order (not per item)", () => {
  assert.equal(usShipping([balaclava()]), 895);            // $25
  assert.equal(usShipping([balaclava(2)]), 895);           // $50, two items, still one fee
  assert.equal(usShipping([balaclava(1), skiMask(1)]), 895); // $55, two mask products
});

test("mask-only over $75 ships free", () => {
  assert.equal(usShipping([balaclava(2), skiMask(1)]), 0); // $80
});

test("exactly $75.00 still pays $8.95 (free is strictly over $75)", () => {
  assert.equal(usShipping([balaclava(3)]), 895);           // $75.00
  assert.equal(rates.usShippingCents([{ mask: true }], 7500), 895);
  assert.equal(rates.usShippingCents([{ mask: true }], 7501), 0);
});

test("mixed mask + FW26: over $75 free, under $75 (after promo) pays", () => {
  assert.equal(usShipping([balaclava(1), bag(1)]), 0);     // $90
  // $25 + $65 = $90 with 20% off = $72 → under $75 → $8.95.
  assert.equal(usShipping([balaclava(1), bag(1)], { code: "T20", discountBasisPoints: 2000 }), 895);
});

test("a promo that pushes the items total to $75 or under brings the $8.95 back", () => {
  assert.equal(usShipping([balaclava(2), skiMask(1)]), 0);          // $80
  assert.equal(usShipping([balaclava(2), skiMask(1)], TEN_OFF), 895); // $72
  // $85 with 10% off = $76.50, still over $75 → free.
  assert.equal(usShipping([balaclava(1), skiMask(2)], TEN_OFF), 0);
});

test("FW26-only carts stay free in the US; no merchandise total never undercharges a mask", () => {
  assert.equal(usShipping([bag(1)]), 0);
  assert.equal(usShipping([bag(1)], TEN_OFF), 0);
  assert.equal(rates.quoteShipping([{ name: "Bag", shipping: "bag", quantity: 1 }], "US").shippingCents, 0);
  assert.equal(rates.quoteShipping([{ name: "Mask", shipping: null, quantity: 1, mask: true }], "US").shippingCents, 895);
});

test("international is unchanged and a mask is still refused as US-only", () => {
  const bagOnly = priceCartForStripe([bag(2)], null);
  assert.deepEqual(resolveCheckoutShipping(bagOnly, "CA"), { country: "CA", shippingCents: 1600 });
  for (const country of ["CA", "GB", "DE", "AU", "JP", "KR"]) {
    assert.throws(
      () => resolveCheckoutShipping(priceCartForStripe([balaclava(4), bag(1)], null), country),
      /CIG Paisley Balaclava ships to the US only/,
      country,
    );
  }
});

test("PayPal: order amount = items after promo + mask shipping, with a shipping breakdown", () => {
  for (const [items, promo, shippingCents] of [
    [[balaclava(1)], null, 895],
    [[balaclava(3)], null, 895],
    [[balaclava(2), skiMask(1)], null, 0],
    [[balaclava(2), skiMask(1)], TEN_OFF, 895],
    [[bag(1)], null, 0],
  ]) {
    const pricing = priceCartForStripe(items, null, promo);
    const shipping = resolveCheckoutShipping(pricing, "US");
    assert.equal(shipping.shippingCents, shippingCents);
    const order = buildPayPalOrder(pricing, { siteUrl: "https://cigcompany.com", shipping });
    const unit = order.purchase_units[0];
    assert.equal(unit.amount.value, ((pricing.totalCents + shippingCents) / 100).toFixed(2));
    const breakdown = unit.amount.breakdown || {};
    if (shippingCents) assert.equal(breakdown.shipping.value, (shippingCents / 100).toFixed(2));
    else assert.equal(breakdown.shipping, undefined);
    const itemsCents = unit.items.reduce((s, i) => s + Math.round(Number(i.unit_amount.value) * 100) * Number(i.quantity), 0);
    assert.equal(itemsCents, pricing.totalCents);
  }
});

function stripeHarness({ environment = {}, promo = null } = {}) {
  let created = null;
  const handler = createStripeSession({
    environment: { STRIPE_SECRET_KEY: "sk_test", SITE_URL: "https://cigcompany.com", ...environment },
    stripeFactory: () => ({ checkout: { sessions: { create: async (a) => { created = a; return { url: "https://stripe.test/s" }; } } } }),
    promoResolver: async () => promo,
    stockStoreFactory: () => ({ getStock: async () => [
      { product_id: "0005", color: "Red", size: "", quantity: 70 },
      { product_id: "0008", color: "Red", size: "3-Hole", quantity: 80 },
    ] }),
    logger: quiet,
    now: () => Date.parse("2026-11-02T12:00:00-05:00"), // after the drop
  });
  return {
    post: async (body) => {
      created = null;
      const res = await handler({ httpMethod: "POST", headers: {}, body: JSON.stringify(body) });
      return { res, created };
    },
  };
}

test("Stripe: mask orders under/at $75 get one $8.95 US shipping option; over $75 and FW26-only get none", async () => {
  const stripe = stripeHarness();
  let { res, created } = await stripe.post({ items: [balaclava(1)] });
  assert.equal(res.statusCode, 200);
  assert.equal(created.shipping_options.length, 1);
  assert.equal(created.shipping_options[0].shipping_rate_data.fixed_amount.amount, 895);
  assert.equal(created.shipping_options[0].shipping_rate_data.fixed_amount.currency, "usd");
  assert.equal(created.metadata.shipping_cents, "895");
  assert.deepEqual(created.shipping_address_collection.allowed_countries, ["US"]);

  ({ created } = await stripe.post({ items: [balaclava(3)] }));
  assert.equal(created.shipping_options[0].shipping_rate_data.fixed_amount.amount, 895);

  ({ created } = await stripe.post({ items: [balaclava(2), skiMask(1)] }));
  assert.equal(created.shipping_options, undefined);

  ({ created } = await stripe.post({ items: [bag(1)] }));
  assert.equal(created.shipping_options, undefined);
  assert.equal(created.metadata.shipping_cents, undefined);

  ({ res } = await stripe.post({ items: [balaclava(1)], shipCountry: "GB" }));
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /ships to the US only/);
});

test("Stripe: a promo that drops an $80 mask order to $72 adds the $8.95 back", async () => {
  const { created } = await stripeHarness({ promo: TEN_OFF }).post({ items: [balaclava(2), skiMask(1)], promoCode: "TEST10" });
  assert.equal(created.metadata.promo_code, "TEST10");
  const items = created.line_items.reduce((s, l) => s + l.price_data.unit_amount * l.quantity, 0);
  assert.equal(items, 7200);
  assert.equal(created.shipping_options[0].shipping_rate_data.fixed_amount.amount, 895);
});

test("drop-test code: pre-drop FW26 + mask test order gets the same mask shipping and is flagged", async () => {
  let created = null;
  const handler = createStripeSession({
    environment: { STRIPE_SECRET_KEY: "sk_test", SITE_URL: "https://cigcompany.com", DROP_TEST_CODE: "drop-test-code-2026" },
    stripeFactory: () => ({ checkout: { sessions: { create: async (a) => { created = a; return { url: "u" }; } } } }),
    promoResolver: async () => ({ code: "T20", discountBasisPoints: 2000 }),
    stockStoreFactory: () => ({ getStock: async () => [{ product_id: "0005", color: "Red", size: "", quantity: 70 }] }),
    logger: quiet,
    now: () => Date.parse("2026-10-22T12:00:00-04:00"), // before the drop
  });
  const post = (extra) => handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ items: [balaclava(1), bag(1)], promoCode: "T20", ...extra }) });
  const locked = await post({});
  assert.equal(locked.statusCode, 400);
  const ok = await post({ dropTestCode: "drop-test-code-2026" });
  assert.equal(ok.statusCode, 200);
  assert.equal(created.metadata.drop_test, "true");
  // $90 with 20% off = $72 → $8.95; the test code doesn't change pricing or shipping.
  assert.equal(created.shipping_options[0].shipping_rate_data.fixed_amount.amount, 895);
});
