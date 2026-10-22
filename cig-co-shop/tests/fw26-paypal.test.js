// CIG 10/22 4:34 PM ET: "Turn on PayPal for the FW26 collection". FW26 items
// (tote included) check out with PayPal at card prices/shipping/mask rules, and
// captured PayPal orders become unconfirmed Printful drafts like Stripe ones.
const assert = require("node:assert/strict");
const test = require("node:test");

const { POD_CARD_ONLY } = require("../products.js");
const { priceCartForStripe } = require("../netlify/lib/stripe-pricing.js");
const { resolveCheckoutShipping } = require("../netlify/lib/checkout-shipping.js");
const { buildPayPalOrder, payPalPodLines, recordPayPalOrder } = require("../netlify/lib/paypal.js");
const { createHandler: createPayPalOrder } = require("../netlify/functions/create-paypal-order.js");

const quiet = { log() {}, error() {}, warn() {} };
const AFTER_DROP = () => Date.parse("2026-10-30T12:00:01-04:00");
const tote = (quantity = 1, color = "Hunter") => ({ productId: "FW26-TOTE", color, quantity });
const bag = (quantity = 1) => ({ productId: "FW26-BAG", color: "Multi", quantity });
const balaclava = (quantity = 1) => ({ productId: "0005", color: "Red", quantity });
const stockStore = () => ({ getStock: async () => [{ product_id: "0005", color: "Red", size: "", quantity: 70 }] });

function payPalHandler({ environment = {}, now = AFTER_DROP } = {}) {
  const sent = [];
  const handler = createPayPalOrder({
    environment: { PAYPAL_CLIENT_ID: "x", PAYPAL_SECRET: "y", SITE_URL: "https://cigcompany.com", ...environment },
    paypalFactory: () => ({ createOrder: async (o) => { sent.push(o); return { links: [{ rel: "approve", href: "https://paypal.test/a" }] }; } }),
    promoResolver: async ({ promoCode }) => (promoCode === "T20" ? { code: "T20", discountBasisPoints: 2000 } : null),
    stockStoreFactory: stockStore,
    logger: quiet,
    now,
  });
  return { handler, sent };
}
const post = (body) => ({ httpMethod: "POST", headers: {}, body: JSON.stringify({ shipCountry: "US", ...body }) });

function captured(built, { country = "US", id = "PP1", captureId = "CAP1" } = {}) {
  const unit = built.purchase_units[0];
  return {
    id, status: "COMPLETED",
    payer: { email_address: "buyer@example.com", name: { given_name: "A", surname: "B" } },
    purchase_units: [{
      ...unit,
      shipping: { name: { full_name: "A B" }, address: { address_line_1: "1 Main St", admin_area_2: country === "KR" ? "Seoul" : "Atlanta", admin_area_1: country === "US" ? "GA" : undefined, postal_code: "30301", country_code: country } },
      payments: { captures: [{ id: captureId, status: "COMPLETED", amount: { ...unit.amount } }] },
    }],
  };
}
function deps(printfulCalls, extra = {}) {
  return {
    storeFactory: () => ({ processStripeOrder: async () => ({ contact: { id: "c", marketing_consent: false }, order: { id: "o" } }) }),
    sendOrder: async () => {}, syncKit: async () => {},
    stockStoreFactory: () => ({ commitOrder: async () => ({}) }),
    printfulFactory: ({ environment }) => ({ createOrder: async (args) => { printfulCalls.push({ ...args, environment }); return { order: { id: 9, status: "draft" }, created: printfulCalls.length === 1 }; } }),
    environment: { PRINTFUL_API_TOKEN: "t", PRINTFUL_AUTO_CONFIRM: "false" },
    logger: quiet,
    ...extra,
  };
}

test("FW26 PayPal is on (POD_CARD_ONLY false) and the create endpoint accepts a tote + bag", async () => {
  assert.equal(POD_CARD_ONLY, false);
  const { handler, sent } = payPalHandler();
  const res = await handler(post({ items: [tote(2), bag(1)] }));
  assert.equal(res.statusCode, 200);
  const unit = sent[0].purchase_units[0];
  // $35 × 2 + $75 Multi = $145; US shipping free, so no shipping line.
  assert.deepEqual(unit.amount, { currency_code: "USD", value: "145.00", breakdown: { item_total: { currency_code: "USD", value: "145.00" } } });
  assert.deepEqual(unit.items.map((i) => [i.name, i.quantity, i.unit_amount.value, i.sku]), [
    ["Tote Bag — Hunter", "2", "35.00", "pod:FW26-TOTE||Hunter|"],
    ["Crossbody Bag — Multi", "1", "75.00", "pod:FW26-BAG||Multi|"],
  ]);
  assert.equal(unit.description, "CIG & CO. order");
});

test("FW26 PayPal uses the card prices, promo, international and mask shipping rules", async () => {
  const { handler, sent } = payPalHandler();
  // Tote + balaclava = $60 → $8.95 mask shipping, shown in the breakdown.
  assert.equal((await handler(post({ items: [tote(1), balaclava(1)] }))).statusCode, 200);
  let unit = sent.at(-1).purchase_units[0];
  assert.deepEqual(unit.amount.breakdown, { item_total: { currency_code: "USD", value: "60.00" }, shipping: { currency_code: "USD", value: "8.95" } });
  assert.equal(unit.amount.value, "68.95");
  assert.deepEqual(unit.items.map((i) => i.sku), ["pod:FW26-TOTE||Hunter|", "stock:0005|Red|"]);
  // Two totes + balaclava = $95 → free; with 20% off = $76 → still over $75, free.
  assert.equal((await handler(post({ items: [tote(2), balaclava(1)], promoCode: "T20" }))).statusCode, 200);
  unit = sent.at(-1).purchase_units[0];
  assert.equal(unit.amount.value, "76.00");
  assert.equal(unit.amount.breakdown.shipping, undefined);
  assert.deepEqual(unit.items.map((i) => i.unit_amount.value), ["28.00", "20.00"]);
  // Canada: the tote is in the bag class ($8/item), same as the card quote.
  assert.equal((await handler(post({ items: [tote(1)], shipCountry: "CA" }))).statusCode, 200);
  unit = sent.at(-1).purchase_units[0];
  const cardQuote = resolveCheckoutShipping(priceCartForStripe([tote(1)]), "CA");
  assert.equal(cardQuote.shippingCents, 800);
  assert.deepEqual(unit.amount.breakdown.shipping, { currency_code: "USD", value: "8.00" });
  assert.equal(unit.amount.value, "43.00");
  // A mask still can't ship abroad.
  assert.equal((await handler(post({ items: [tote(1), balaclava(1)], shipCountry: "CA" }))).statusCode, 400);
});

test("drop gating is unchanged for PayPal; the drop-test order is flagged", async () => {
  const before = () => Date.parse("2026-10-30T11:59:59-04:00");
  const env = { DROP_TEST_CODE: "drop-test-code-2026" };
  const { handler, sent } = payPalHandler({ environment: env, now: before });
  assert.equal((await handler(post({ items: [tote(1)] }))).statusCode, 400);
  assert.equal((await handler(post({ items: [tote(1)], dropTestCode: "wrong-code-xx" }))).statusCode, 400);
  assert.equal(sent.length, 0);
  assert.equal((await handler(post({ items: [tote(1)], dropTestCode: "drop-test-code-2026" }))).statusCode, 200);
  const unit = sent[0].purchase_units[0];
  assert.equal(unit.description, "CIG & CO. order (DROP TEST)");
  assert.equal(JSON.parse(unit.custom_id).t, 1);
  assert.equal(unit.amount.value, "35.00"); // the code is not a discount
  // Without DROP_TEST_CODE set, no code works before the drop.
  const locked = payPalHandler({ now: before });
  assert.equal((await locked.handler(post({ items: [tote(1)], dropTestCode: "drop-test-code-2026" }))).statusCode, 400);
});

test("a captured FW26 PayPal order becomes one unconfirmed Printful draft (replays reuse it)", async () => {
  const pricing = priceCartForStripe([tote(1, "Gold"), bag(1), balaclava(1)]);
  const built = buildPayPalOrder(pricing, { siteUrl: "https://cigcompany.com", shipping: resolveCheckoutShipping(pricing, "US") });
  const order = captured(built);
  assert.deepEqual(payPalPodLines(order).map((l) => [l.productId, l.color, l.quantity, l.retailPrice]), [["FW26-TOTE", "Gold", 1, "35.00"], ["FW26-BAG", "Multi", 1, "75.00"]]);
  const calls = [];
  assert.equal(await recordPayPalOrder(order, { eventId: "paypal-return:PP1", eventType: "x" }, deps(calls)), true);
  assert.equal(await recordPayPalOrder(order, { eventId: "paypal:WH-1", eventType: "y" }, deps(calls)), true);
  assert.equal(calls.length, 2); // second call hits Printful's external_id lookup, which reuses the order
  for (const call of calls) {
    assert.equal(call.paymentId, "paypal:CAP1");
    assert.equal(call.confirm, false); // draft
    // Only the made-to-order lines; the balaclava ships from CIG.
    assert.deepEqual(call.items.map((i) => [i.sync_variant_id, i.quantity, i.retail_price]), [[5589508290, 1, "35.00"], [5586110183, 1, "75.00"]]);
    assert.deepEqual(call.recipient, { name: "A B", address1: "1 Main St", address2: undefined, city: "Atlanta", state_code: "GA", country_code: "US", zip: "30301", email: "buyer@example.com" });
  }
});

test("PayPal Printful drafts follow PRINTFUL_AUTO_CONFIRM, skip mask-only orders, and fail loudly for a retry", async () => {
  const pricing = priceCartForStripe([tote(1)]);
  const order = captured(buildPayPalOrder(pricing, { siteUrl: "https://cigcompany.com" }));
  const confirmed = [];
  await recordPayPalOrder(order, { eventId: "e", eventType: "x" }, deps(confirmed, { environment: { PRINTFUL_AUTO_CONFIRM: "true" } }));
  assert.equal(confirmed[0].confirm, true);

  const maskOnly = captured(buildPayPalOrder(priceCartForStripe([balaclava(1)]), { siteUrl: "https://cigcompany.com" }));
  const none = [];
  assert.equal(await recordPayPalOrder(maskOnly, { eventId: "e", eventType: "x" }, deps(none)), true);
  assert.equal(none.length, 0);

  await assert.rejects(
    recordPayPalOrder(order, { eventId: "e", eventType: "x" }, deps([], { printfulFactory: () => ({ createOrder: async () => { throw new Error("printful down"); } }) })),
    /printful down/,
  );
});

test("South Korea PayPal orders carry the PCCC through to the Printful draft", async () => {
  const { handler, sent } = payPalHandler();
  assert.equal((await handler(post({ items: [tote(1)], shipCountry: "KR", customer: { pccc: "p123456789012" } }))).statusCode, 200);
  const built = sent[0];
  assert.equal(JSON.parse(built.purchase_units[0].custom_id).k, "P123456789012");
  assert.equal(built.purchase_units[0].amount.breakdown.shipping.value, "13.00");
  const calls = [];
  await recordPayPalOrder(captured(built, { country: "KR" }), { eventId: "e", eventType: "x" }, deps(calls));
  assert.equal(calls[0].recipient.tax_number, "P123456789012");
  assert.equal(calls[0].recipient.address2, "PCCC P123456789012");
});
