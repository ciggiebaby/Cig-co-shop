// US shipping for in-hand backstock masks: FREE in the US since CIG approved it
// on 2026-11-01 ("yup thats a go"), matching Etsy and Google Merchant Center
// (free US shipping, about 5–14 business days). Before that it was $8.95 per
// order, free over $75 (2026-10-22). FW26 pieces were always free in the US.
// Abroad (CIG 2026-10-30, unchanged), masks ship to every store country for a
// per-order USPS charge by weight.
require("./full-price-clock-fixture.js");
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

test("shared rule: US mask shipping is $0, flag still on mask lines only", () => {
  assert.equal(rates.MASK_US_SHIPPING_CENTS, 0);
  assert.equal(rates.MASK_FREE_SHIPPING_OVER_CENTS, undefined, "no more free-over-$75 threshold");
  assert.equal(rates.MASK_US_DELIVERY_DAYS, "5\u201314 business days");
  assert.match(rates.MASK_SHIPPING_NOTE, /^Masks ship free in the US/);
  assert.doesNotMatch(rates.MASK_SHIPPING_NOTE, /8\.95|\$75/);
  const lines = priceCartForStripe([balaclava(), bag()], null).shippingLines;
  assert.deepEqual(lines.map((l) => l.mask), [true, false]);
});

test("every US cart ships free: masks alone, any total, with or without a promo, mixed with FW26", () => {
  const tote = (quantity = 1) => ({ productId: "FW26-TOTE", color: "Hunter", quantity });
  for (const [items, promo] of [
    [[balaclava()], null],                      // $25 (was $8.95)
    [[balaclava(2)], null],                     // $50
    [[balaclava(3)], null],                     // exactly $75 (was $8.95)
    [[balaclava(2), skiMask(1)], null],         // $80
    [[balaclava(2), skiMask(1)], TEN_OFF],      // $72 after promo (was $8.95)
    [[balaclava(1), bag(1)], null],
    [[tote(), balaclava()], null],              // $60 (was $8.95)
    [[tote(), balaclava(2)], { code: "T20", discountBasisPoints: 2000 }], // $75 (was $8.95)
    [[{ productId: "0013", color: "Purple", quantity: 1 }], null], // $15 moto mask
    [[bag(1)], null],
    [[tote(3)], null],
  ]) {
    assert.equal(usShipping(items, promo), 0, JSON.stringify(items));
  }
  assert.equal(rates.usShippingCents([{ mask: true }], 100), 0);
  assert.equal(rates.usShippingCents([{ mask: true }]), 0, "a missing total can't bring a fee back");
  assert.equal(rates.quoteShipping([{ name: "Mask", shipping: null, quantity: 1, mask: true }], "US").shippingCents, 0);
  assert.equal(rates.quoteShipping([{ name: "Bag", shipping: "bag", quantity: 1 }], "US").shippingCents, 0);
  // A promo code on an FW26-only cart is still refused (promos are masks only).
  assert.throws(() => usShipping([bag(1)], TEN_OFF), /only work on masks/);
});

test("international: FW26 rates unchanged; masks ship to every country for the in-hand order charge", () => {
  const bagOnly = priceCartForStripe([bag(2)], null);
  assert.deepEqual(resolveCheckoutShipping(bagOnly, "CA"), { country: "CA", shippingCents: 1600 });
  // 4 balaclavas = 12 oz + 3 oz mailer = 15 oz -> 9-16 oz band; plus the bag's per-item rate.
  const tier16 = { CA: 2500, GB: 3100, DE: 2800, AU: 4000, JP: 3300, KR: 3000 };
  const bagRate = { CA: 800, GB: 500, DE: 500, AU: 800, JP: 500, KR: 1300 };
  for (const country of ["CA", "GB", "DE", "AU", "JP", "KR"]) {
    assert.deepEqual(
      resolveCheckoutShipping(priceCartForStripe([balaclava(4), bag(1)], null), country),
      { country, shippingCents: tier16[country] + bagRate[country] },
      country,
    );
    // One mask pays the same cushioned 9-16 oz band (no free-over-$75 abroad).
    assert.equal(resolveCheckoutShipping(priceCartForStripe([balaclava(1)], null), country).shippingCents, tier16[country]);
    assert.equal(resolveCheckoutShipping(priceCartForStripe([balaclava(2), skiMask(2)], null), country).shippingCents, tier16[country]);
  }
});

test("in-hand weight bands: 1-4 masks, 5 masks (18 oz), parcels split over 64 oz", () => {
  const q = (lines, country) => rates.quoteShipping(lines, country).shippingCents;
  const mask = (quantity, extra = {}) => ({ name: "Mask", shipping: null, quantity, mask: true, ...extra });
  assert.equal(q([mask(4)], "KR"), 3000);   // 15 oz
  assert.equal(q([mask(5)], "KR"), 3400);   // 18 oz -> 17-32 oz
  assert.equal(q([mask(10)], "KR"), 4900);  // 33 oz -> 33-48 oz
  assert.equal(q([mask(20)], "KR"), 5600);  // 63 oz -> 49-64 oz
  assert.equal(q([mask(21)], "KR"), 5600 + 3000); // 66 oz -> 61 + 2 item oz: two parcels
  // Non-mask in-hand items (no liveStock) are priced by weightOz.
  assert.equal(q([{ name: "Umbrella", shipping: null, quantity: 1, inHand: true, weightOz: 16 }], "JP"), 3700);
  assert.deepEqual(rates.quoteShipping([mask(1)], "AU").blocked, []);
  assert.deepEqual(rates.quoteShipping([mask(1)], "AU").usOnly, []);
  // Every in-hand product in the catalog has a weight and ships to all six countries.
  const { PRODUCTS } = require("../products.js");
  const inHand = PRODUCTS.filter((p) => !p.pod);
  assert.ok(inHand.length >= 3);
  for (const product of inHand) {
    assert.equal(typeof product.shipWeightOz, "number", product.name);
    for (const country of ["CA", "GB", "DE", "AU", "JP", "KR"]) {
      const quote = rates.quoteShipping([{ name: product.name, shipping: product.shipping || null, quantity: 1, inHand: true, weightOz: product.shipWeightOz }], country);
      assert.ok(quote.shippingCents > 0, `${product.name} -> ${country}`);
    }
  }
});

test("PayPal: US mask orders have no shipping charge; total = items after promo", () => {
  for (const [items, promo] of [
    [[balaclava(1)], null],
    [[balaclava(3)], null],
    [[balaclava(2), skiMask(1)], TEN_OFF],
    [[bag(1)], null],
  ]) {
    const pricing = priceCartForStripe(items, null, promo);
    const shipping = resolveCheckoutShipping(pricing, "US");
    assert.equal(shipping.shippingCents, 0);
    const order = buildPayPalOrder(pricing, { siteUrl: "https://cigcompany.com", shipping });
    const unit = order.purchase_units[0];
    assert.equal(unit.amount.value, (pricing.totalCents / 100).toFixed(2));
    assert.equal((unit.amount.breakdown || {}).shipping, undefined);
    const itemsCents = unit.items.reduce((s, i) => s + Math.round(Number(i.unit_amount.value) * 100) * Number(i.quantity), 0);
    assert.equal(itemsCents, pricing.totalCents);
  }
  // Abroad, PayPal still adds the in-hand mask rate (unchanged).
  const pricing = priceCartForStripe([balaclava(1)], null);
  const shipping = resolveCheckoutShipping(pricing, "CA");
  const unit = buildPayPalOrder(pricing, { siteUrl: "https://cigcompany.com", shipping }).purchase_units[0];
  assert.equal(unit.amount.breakdown.shipping.value, "25.00");
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

test("Stripe: US mask orders get no shipping option or fee; abroad still pays the flat mask rate", async () => {
  const stripe = stripeHarness();
  for (const items of [[balaclava(1)], [balaclava(3)], [balaclava(2), skiMask(1)], [bag(1)]]) {
    const { res, created } = await stripe.post({ items });
    assert.equal(res.statusCode, 200);
    assert.equal(created.shipping_options, undefined, JSON.stringify(items));
    assert.equal(created.metadata.shipping_cents, undefined);
    assert.deepEqual(created.shipping_address_collection.allowed_countries, ["US"]);
  }
  const { res, created } = await stripe.post({ items: [balaclava(1)], shipCountry: "GB" });
  assert.equal(res.statusCode, 200);
  assert.equal(created.shipping_options[0].shipping_rate_data.fixed_amount.amount, 3100);
  assert.equal(created.shipping_options[0].shipping_rate_data.display_name, "Standard shipping to United Kingdom");
  assert.deepEqual(created.shipping_address_collection.allowed_countries, ["GB"]);
});

test("Stripe: a promo on a US mask order doesn't add shipping", async () => {
  const { created } = await stripeHarness({ promo: TEN_OFF }).post({ items: [balaclava(2), skiMask(1)], promoCode: "TEST10" });
  assert.equal(created.metadata.promo_code, "TEST10");
  const items = created.line_items.reduce((s, l) => s + l.price_data.unit_amount * l.quantity, 0);
  assert.equal(items, 7200);
  assert.equal(created.shipping_options, undefined);
});

test("drop-test code: pre-drop FW26 + mask test order ships free in the US and is flagged", async () => {
  let created = null;
  const handler = createStripeSession({
    environment: { STRIPE_SECRET_KEY: "sk_test", SITE_URL: "https://cigcompany.com", DROP_TEST_CODE: "drop-test-code-2026" },
    stripeFactory: () => ({ checkout: { sessions: { create: async (a) => { created = a; return { url: "u" }; } } } }),
    promoResolver: async () => ({ code: "T20", discountBasisPoints: 2000 }),
    stockStoreFactory: () => ({ getStock: async () => [{ product_id: "0005", color: "Red", size: "", quantity: 70 }] }),
    logger: quiet,
    now: () => Date.parse("2026-10-22T12:00:00-04:00"), // before the drop
  });
  const post = (extra) => handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ items: [balaclava(1), { productId: "FW26-TOTE", color: "Hunter", quantity: 1 }], promoCode: "T20", ...extra }) });
  const locked = await post({});
  assert.equal(locked.statusCode, 400);
  const ok = await post({ dropTestCode: "drop-test-code-2026" });
  assert.equal(ok.statusCode, 200);
  assert.equal(created.metadata.drop_test, "true");
  assert.equal(created.shipping_options, undefined);
});

test("tote still counts as FW26 and is never flagged as a mask", () => {
  const tote = (quantity = 1) => ({ productId: "FW26-TOTE", color: "Hunter", quantity });
  assert.deepEqual(priceCartForStripe([tote(), balaclava()], null).shippingLines.map((l) => l.mask), [false, true]);
});
