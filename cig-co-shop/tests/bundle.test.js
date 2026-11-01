// Crossbody + MagSafe bundle (FW26-BUNDLE): one site product, one price constant,
// two Printful line items in the same draft order (card and PayPal).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { BUNDLE_PRICE, PRODUCTS } = require("../products.js");
const { priceCartForStripe } = require("../netlify/lib/stripe-pricing.js");
const { resolveCheckoutShipping } = require("../netlify/lib/checkout-shipping.js");
const { printfulItemsForLine, PrintfulError } = require("../netlify/lib/printful.js");
const { podLines } = require("../netlify/functions/printful-fulfillment.js");
const { buildPayPalOrder, payPalPodLines, sendPayPalPodOrder } = require("../netlify/lib/paypal.js");
const { checkoutRecoveryOptions } = require("../netlify/functions/create-stripe-session.js");
const { parseProductLink } = require("../product-links.js");

const bundle = PRODUCTS.find((p) => p.id === "FW26-BUNDLE");
const bag = PRODUCTS.find((p) => p.id === "FW26-BAG");
const pcCase = PRODUCTS.find((p) => p.id === "FW26-CASE");
const line = (extra = {}) => ({ productId: "FW26-BUNDLE", color: "Navy", style: "Burgundy", size: "iPhone 16 Pro", quantity: 1, ...extra });
const quiet = { log() {}, error() {}, warn() {} };

test("the bundle price is one constant, defaulting to full price ($105) until CIG picks", () => {
  assert.equal(BUNDLE_PRICE, 105);
  assert.equal(bundle.price, BUNDLE_PRICE);
  assert.ok(bundle.styles.every((s) => s.price === BUNDLE_PRICE));
  assert.equal(bundle.compareAtPrice, bag.price + pcCase.price);
  assert.match(fs.readFileSync(path.join(__dirname, "..", "products.js"), "utf8"), /const BUNDLE_PRICE = 105\.00;/);
});

test("buyer picks Crossbody color, MagSafe color and phone model (Multi left out)", () => {
  assert.deepEqual(bundle.colors, bag.colors.filter((c) => c !== "Multi"));
  assert.deepEqual(bundle.styles.map((s) => s.name), pcCase.colors);
  assert.deepEqual(bundle.sizes, pcCase.sizes);
  assert.equal(bundle.dropAt, bag.dropAt);
  assert.ok(bundle.pod && !bundle.hidden && !bundle.stock);
  assert.deepEqual(bundle.bundleImages("Burgundy", "iPhone 16 Pro"), [pcCase.colorImages.Burgundy["iPhone 16 Pro"]]);
});

test("deep link ?product=FW26-BUNDLE opens the bundle with the picks", () => {
  const link = parseProductLink("https://cigcompany.com/?product=fw26-bundle&color=navy&style=Burgundy&size=iPhone%2016%20Pro", PRODUCTS);
  assert.deepEqual(link, { id: "FW26-BUNDLE", color: "Navy", size: "iPhone 16 Pro", style: "Burgundy" });
});

test("Stripe line: bundle price, clear name, POD metadata; US shipping is free", () => {
  const pricing = priceCartForStripe([line()]);
  const li = pricing.lineItems[0];
  assert.equal(li.price_data.unit_amount, BUNDLE_PRICE * 100);
  assert.equal(li.price_data.product_data.name, "Crossbody + MagSafe Bundle — Crossbody Navy + MagSafe Burgundy (iPhone 16 Pro)");
  assert.deepEqual(li.price_data.product_data.metadata, { pod: "true", product_id: "FW26-BUNDLE", style: "Burgundy", color: "Navy", size: "iPhone 16 Pro" });
  assert.equal(resolveCheckoutShipping(pricing, "US").shippingCents, 0);
  assert.throws(() => priceCartForStripe([line({ color: "Multi" })]), /Invalid color/);
  assert.throws(() => priceCartForStripe([line({ style: null })]), /style is required/);
});

test("bundle ships like bag + case abroad and is blocked to Japan and South Korea", () => {
  const pricing = priceCartForStripe([line()]);
  assert.equal(resolveCheckoutShipping(pricing, "CA").shippingCents, 1800);
  assert.equal(resolveCheckoutShipping(pricing, "GB").shippingCents, 800);
  assert.throws(() => resolveCheckoutShipping(pricing, "JP"), /can't ship to Japan/);
  assert.throws(() => resolveCheckoutShipping(pricing, "KR"), /can't ship to South Korea/);
});

test("a paid bundle becomes two Printful items (bag + case) whose retail prices add up", () => {
  const items = printfulItemsForLine({ ...line({ quantity: 2 }), retailPrice: "105.00" });
  assert.deepEqual(items.map((i) => [i.sync_variant_id, i.quantity, i.retail_price]), [
    [bag.pod.variants.Navy.syncVariantId, 2, "65.00"],
    [pcCase.pod.variants["Burgundy / iPhone 16 Pro"].syncVariantId, 2, "40.00"],
  ]);
  const cheaper = printfulItemsForLine({ ...line(), retailPrice: "99.00" });
  assert.equal(cheaper.reduce((s, i) => s + Number(i.retail_price), 0).toFixed(2), "99.00");
  assert.throws(() => printfulItemsForLine({ ...line({ color: "Multi" }), retailPrice: "105.00" }), PrintfulError);
  // Non-bundle lines still map to exactly one item.
  assert.equal(printfulItemsForLine({ productId: "FW26-BAG", color: "Navy", quantity: 1 }).length, 1);
});

test("Stripe webhook lines and PayPal capture both send the bundle as a Printful draft", async () => {
  const pricing = priceCartForStripe([line()]);
  const stripeLines = podLines([{ quantity: 1, amount_total: 10500, price: { product: { metadata: pricing.lineItems[0].price_data.product_data.metadata } } }]);
  assert.equal(stripeLines.flatMap(printfulItemsForLine).length, 2);

  const built = buildPayPalOrder(pricing, { siteUrl: "https://cigcompany.com", shipping: resolveCheckoutShipping(pricing, "US") });
  const unit = built.purchase_units[0];
  const order = {
    id: "PP1", status: "COMPLETED", payer: { email_address: "b@example.com" },
    purchase_units: [{ ...unit, shipping: { name: { full_name: "A B" }, address: { address_line_1: "1 Main St", admin_area_2: "Atlanta", admin_area_1: "GA", postal_code: "30301", country_code: "US" } }, payments: { captures: [{ id: "CAP1", status: "COMPLETED", amount: unit.amount }] } }],
  };
  assert.equal(payPalPodLines(order)[0].style, "Burgundy");
  const calls = [];
  await sendPayPalPodOrder(order, {
    environment: { PRINTFUL_AUTO_CONFIRM: "false" },
    printfulFactory: () => ({ createOrder: async (args) => { calls.push(args); return { order: { id: 1, status: "draft" }, created: true }; } }),
    logger: quiet,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].confirm, false);
  assert.equal(calls[0].items.length, 2);
});

test("Stripe Checkout recovery is off unless its env flags are set", () => {
  assert.deepEqual(checkoutRecoveryOptions({}), {});
  assert.deepEqual(checkoutRecoveryOptions({ STRIPE_CHECKOUT_RECOVERY: "false" }), {});
  assert.deepEqual(checkoutRecoveryOptions({ STRIPE_CHECKOUT_RECOVERY: "true" }), {
    after_expiration: { recovery: { enabled: true } },
  });
  assert.deepEqual(checkoutRecoveryOptions({ STRIPE_CHECKOUT_RECOVERY: "TRUE", STRIPE_CHECKOUT_PROMO_CONSENT: "true" }), {
    after_expiration: { recovery: { enabled: true } },
    consent_collection: { promotions: "auto" },
  });
});
