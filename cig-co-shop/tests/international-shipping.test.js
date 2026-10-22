require("./legacy-fixture.js");
const assert = require("node:assert/strict");
const test = require("node:test");
require("./promo-fixture.js");
require("./shipping-fixture.js");

const {
  INTERNATIONAL_SHIPPING_PER_ITEM_USD,
  SHIP_TO_COUNTRIES,
  SLOW_DELIVERY,
  quoteShipping,
  slowDeliveryNote,
} = require("../shipping-rates.js");
const { PRODUCTS } = require("../products.js");
const { priceCartForStripe } = require("../netlify/lib/stripe-pricing.js");
const { resolveCheckoutShipping, requireShippingAddress } = require("../netlify/lib/checkout-shipping.js");
const { RequestValidationError } = require("../netlify/lib/customer-utils.js");
const { createHandler: createStripeHandler } = require("../netlify/functions/create-stripe-session.js");
const { createHandler: createPayPalOrderHandler } = require("../netlify/functions/create-paypal-order.js");
const { createHandler: createPayPalCaptureHandler } = require("../netlify/functions/paypal-capture.js");
const { createHandler: createPayPalWebhookHandler } = require("../netlify/functions/paypal-webhook.js");
const { createHandler: createCoinbaseChargeHandler } = require("../netlify/functions/create-coinbase-charge.js");
const { paidPayPalOrder } = require("../netlify/lib/paypal.js");

const silent = { log() {}, error() {} };
const { CRYPTO_ENV } = require("./crypto-fixture.js");
const ENV = { SITE_URL: "https://shop.test", ...CRYPTO_ENV };
const bag = (quantity = 1) => ({ productId: "T-BAG", quantity });
const phoneCase = (quantity = 1) => ({ productId: "T-CASE", quantity });
const sleeve = (quantity = 1) => ({ productId: "T-SLEEVE", quantity });
const pillow = (quantity = 1) => ({ productId: "TEST-PILLOW", color: "Red", quantity });

function post(body) {
  return { httpMethod: "POST", headers: {}, body: JSON.stringify(body) };
}

// Printful's cheapest standard per-unit quotes (USD) from SERVI's pull.
const PRINTFUL_PER_UNIT = {
  bag: { CA: 7.29, GB: 4.59, DE: 4.99, AU: 7.99, JP: 4.89, KR: 12.49 },
  case: { CA: 9.29, GB: 2.59, DE: 7.29, AU: 8.39, JP: 5.19, KR: 8.29 },
  sleeve: { CA: 9.79, GB: 7.29, DE: 7.29, AU: 12.49, JP: 7.89, KR: 17.69 },
};

// ---------- Rate table + pricing ----------

test("international rates are Printful's per-unit cost rounded up to the next dollar", () => {
  assert.deepEqual(Object.keys(SHIP_TO_COUNTRIES), ["US", "CA", "GB", "DE", "AU", "JP", "KR"]);
  assert.deepEqual(Object.keys(INTERNATIONAL_SHIPPING_PER_ITEM_USD).sort(), ["bag", "case", "sleeve"]);
  for (const [shippingClass, costs] of Object.entries(PRINTFUL_PER_UNIT)) {
    for (const [country, cost] of Object.entries(costs)) {
      assert.equal(INTERNATIONAL_SHIPPING_PER_ITEM_USD[shippingClass][country], Math.ceil(cost), `${shippingClass} ${country}`);
    }
  }
});

test("shipping is free in the US and charged per item abroad", () => {
  const pricing = priceCartForStripe([bag(2), phoneCase(), sleeve()]);
  assert.deepEqual(resolveCheckoutShipping(pricing, "US"), { country: "US", shippingCents: 0 });
  assert.deepEqual(resolveCheckoutShipping(pricing, undefined), { country: "US", shippingCents: 0 });
  // CA: bag $8 x2 + case $10 + sleeve $10
  assert.deepEqual(resolveCheckoutShipping(pricing, "ca"), { country: "CA", shippingCents: 3600 });
  // AU: bag $8 x2 + case $9 + sleeve $13
  assert.equal(resolveCheckoutShipping(pricing, "AU").shippingCents, 3800);
  assert.equal(resolveCheckoutShipping(pricing, "GB").shippingCents, 2100);
  assert.equal(resolveCheckoutShipping(pricing, "DE").shippingCents, 2600);
  // JP: bag $5 x2 + case $6 + sleeve $8; KR: bag $13 x2 + case $9 + sleeve $18
  assert.equal(resolveCheckoutShipping(pricing, "JP").shippingCents, 2400);
  assert.equal(resolveCheckoutShipping(pricing, "kr").shippingCents, 5300);
  // Item prices are untouched by shipping.
  assert.equal(pricing.totalCents, 4500 * 2 + 3000 + 3500);
});

test("pillows (and products without an international class) block non-US shipping", () => {
  const pillowPricing = priceCartForStripe([bag(), pillow()]);
  assert.equal(resolveCheckoutShipping(pillowPricing, "US").shippingCents, 0);
  assert.throws(
    () => resolveCheckoutShipping(pillowPricing, "GB"),
    (error) => error instanceof RequestValidationError
      && /Test Pillow Case ships to the US only\. Remove it from your bag to ship to United Kingdom\./.test(error.message),
  );
  assert.equal(PRODUCTS.find((product) => product.id === "TEST-PILLOW").shipping, "pillow");
  const balaclava = priceCartForStripe([{ productId: "0005", quantity: 1, ...variantOf("0005") }]);
  assert.throws(() => resolveCheckoutShipping(balaclava, "CA"), /ships to the US only/);
  assert.equal(quoteShipping([{ name: "Pillow", shipping: "pillow", quantity: 1 }], "CA").shippingCents, null);
});

test("countries outside US/CA/GB/DE/AU/JP/KR are refused", () => {
  const pricing = priceCartForStripe([bag()]);
  for (const country of ["FR", "MX", "PR", "XX"]) {
    assert.throws(() => resolveCheckoutShipping(pricing, country), /only ship to the United States, Canada, the United Kingdom, Germany, Australia, Japan, and South Korea/);
  }
});

test("address checks: state + ZIP in the US, a valid postal code elsewhere", () => {
  assert.deepEqual(requireShippingAddress({ state: "ga", zip: "30303" }, "US"), { state: "GA", zip: "30303", country: "US" });
  assert.throws(() => requireShippingAddress({ zip: "30303" }, "US"), /US state/);
  assert.deepEqual(requireShippingAddress({ zip: "m5v 2t6" }, "CA"), { state: "", zip: "M5V 2T6", country: "CA" });
  assert.equal(requireShippingAddress({ zip: "SW1A 1AA" }, "GB").zip, "SW1A 1AA");
  assert.equal(requireShippingAddress({ zip: "10115", state: "Berlin" }, "DE").state, "BERLIN");
  assert.equal(requireShippingAddress({ zip: "2000" }, "AU").zip, "2000");
  assert.equal(requireShippingAddress({ zip: "100-0001" }, "JP").zip, "100-0001");
  assert.equal(requireShippingAddress({ zip: "1000001" }, "JP").zip, "1000001");
  assert.equal(requireShippingAddress({ zip: "04524" }, "KR").zip, "04524");
  assert.throws(() => requireShippingAddress({ zip: "100-001" }, "JP"), /postal code for Japan/);
  assert.throws(() => requireShippingAddress({ zip: "0452" }, "KR"), /postal code for South Korea/);
  assert.throws(() => requireShippingAddress({ zip: "30303" }, "CA"), /postal code for Canada/);
  assert.throws(() => requireShippingAddress({ zip: "" }, "AU"), /postal code for Australia/);
});

function variantOf(productId) {
  const product = PRODUCTS.find((entry) => entry.id === productId);
  const style = product.styles && product.styles.length ? product.styles[0].name : null;
  const color = (product.colors || []).find((c) => {
    const s = product.stock;
    if (!s) return true;
    const byStyle = style ? s[style] : s;
    const v = byStyle && byStyle[c];
    return typeof v === "number" ? v > 0 : v && Object.values(v).some((n) => n > 0);
  }) || null;
  let size = null;
  if (product.sizes && product.sizes.length) {
    const byStyle = style && product.stock ? product.stock[style] : product.stock;
    const sizes = byStyle && color ? byStyle[color] : null;
    size = sizes ? Object.keys(sizes).find((k) => sizes[k] > 0) : product.sizes[0];
  }
  return { style, color, size };
}

// ---------- Stripe ----------

function stripeStub() {
  let request;
  return {
    get request() { return request; },
    factory: () => ({ checkout: { sessions: { create: async (r) => { request = r; return { url: "https://stripe.test/s" }; } } } }),
  };
}

test("Stripe sessions lock to the chosen country with a server-computed shipping fee", async () => {
  const stripe = stripeStub();
  const handler = createStripeHandler({ stripeFactory: stripe.factory, siteUrl: "https://shop.test", logger: silent });
  const response = await handler(post({ items: [bag(2), phoneCase()], shipCountry: "CA", customer: { email: "a@b.co" } }));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(stripe.request.shipping_address_collection, { allowed_countries: ["CA"] });
  assert.deepEqual(stripe.request.shipping_options, [{
    shipping_rate_data: {
      type: "fixed_amount",
      fixed_amount: { amount: 2600, currency: "usd" },
      display_name: "Standard shipping to Canada",
    },
  }]);
  assert.equal(stripe.request.metadata.ship_country, "CA");
  assert.equal(stripe.request.metadata.shipping_cents, "2600");
});

test("Stripe US sessions stay free-shipping and US-only", async () => {
  const stripe = stripeStub();
  const handler = createStripeHandler({ stripeFactory: stripe.factory, siteUrl: "https://shop.test", logger: silent });
  await handler(post({ items: [bag(), pillow()], shipCountry: "US" }));
  assert.deepEqual(stripe.request.shipping_address_collection, { allowed_countries: ["US"] });
  assert.equal(stripe.request.shipping_options, undefined);
  assert.equal(stripe.request.metadata.ship_country, undefined);
});

test("Stripe refuses a pillow or an unsupported country abroad without calling Stripe", async () => {
  for (const [items, shipCountry, message] of [
    [[bag(), pillow()], "AU", /Test Pillow Case ships to the US only/],
    [[pillow()], "JP", /Test Pillow Case ships to the US only/],
    [[bag()], "FR", /only ship to the United States/],
  ]) {
    const stripe = stripeStub();
    const handler = createStripeHandler({ stripeFactory: stripe.factory, siteUrl: "https://shop.test", logger: silent });
    const response = await handler(post({ items, shipCountry }));
    assert.equal(response.statusCode, 400);
    assert.match(JSON.parse(response.body).error, message);
    assert.equal(stripe.request, undefined);
  }
});

// ---------- PayPal ----------

test("PayPal orders add international shipping to the breakdown and remember the country", async () => {
  let sent;
  const handler = createPayPalOrderHandler({
    paypalFactory: () => ({ createOrder: async (order) => { sent = order; return { links: [{ rel: "approve", href: "https://paypal.test/a" }] }; } }),
    environment: ENV,
    logger: silent,
  });
  const response = await handler(post({ items: [bag(), sleeve()], shipCountry: "GB" }));
  assert.equal(response.statusCode, 200);
  const unit = sent.purchase_units[0];
  // items $45 + $35 = $80; GB shipping bag $5 + sleeve $8 = $13
  assert.equal(unit.amount.value, "93.00");
  assert.deepEqual(unit.amount.breakdown, {
    item_total: { currency_code: "USD", value: "80.00" },
    shipping: { currency_code: "USD", value: "13.00" },
  });
  assert.equal(JSON.parse(unit.custom_id).c, "GB");
});

test("PayPal orders keep US shipping free and refuse pillows abroad", async () => {
  let sent;
  const handler = createPayPalOrderHandler({
    paypalFactory: () => ({ createOrder: async (order) => { sent = order; return { links: [{ rel: "approve", href: "x" }] }; } }),
    environment: ENV,
    logger: silent,
  });
  await handler(post({ items: [pillow()] }));
  assert.equal(sent.purchase_units[0].amount.breakdown.shipping, undefined);
  assert.equal(JSON.parse(sent.purchase_units[0].custom_id).c, undefined);
  const refused = await handler(post({ items: [pillow()], shipCountry: "DE" }));
  assert.equal(refused.statusCode, 400);
  assert.match(JSON.parse(refused.body).error, /ships to the US only/);
});

function payPalOrder({ status = "APPROVED", chosen = "CA", country = "CA" } = {}) {
  const order = {
    id: "5O190127TN364715T",
    status,
    payer: { email_address: "buyer@example.com" },
    purchase_units: [{
      amount: { currency_code: "USD", value: "53.00" },
      custom_id: JSON.stringify({ p: "", m: 0, ...(chosen !== "US" ? { c: chosen } : {}) }),
      items: [{ name: "Test Crossbody Bag", quantity: "1", unit_amount: { currency_code: "USD", value: "45.00" } }],
      shipping: { name: { full_name: "A B" }, address: { address_line_1: "1 Rd", admin_area_2: "Toronto", postal_code: "M5V 2T6", country_code: country } },
    }],
  };
  if (status === "COMPLETED") {
    order.purchase_units[0].payments = { captures: [{ id: "CAP1", status: "COMPLETED", amount: { currency_code: "USD", value: "53.00" } }] };
  }
  return order;
}

async function capture(approved) {
  let captured = 0;
  const handler = createPayPalCaptureHandler({
    paypalFactory: () => ({
      getOrder: async () => approved,
      captureOrder: async () => { captured += 1; return payPalOrder({ status: "COMPLETED" }); },
    }),
    recordOrder: async () => true,
    environment: ENV,
    logger: silent,
  });
  const response = await handler({ httpMethod: "GET", headers: {}, queryStringParameters: { token: "5O190127TN364715T" } });
  return { location: response.headers.Location, captured };
}

test("PayPal only captures when the PayPal address is in the country picked on the site", async () => {
  assert.deepEqual(await capture(payPalOrder({ chosen: "CA", country: "CA" })), { location: "https://shop.test/?checkout=success", captured: 1 });
  assert.deepEqual(await capture(payPalOrder({ chosen: "CA", country: "US" })), { location: "https://shop.test/?checkout=country-mismatch", captured: 0 });
  assert.deepEqual(await capture(payPalOrder({ chosen: "GB", country: "DE" })), { location: "https://shop.test/?checkout=country-mismatch", captured: 0 });
  assert.deepEqual(await capture(payPalOrder({ chosen: "US", country: "CA" })), { location: "https://shop.test/?checkout=us-only", captured: 0 });
  assert.deepEqual(await capture(payPalOrder({ chosen: "US", country: "US" })), { location: "https://shop.test/?checkout=success", captured: 1 });
});

test("PayPal webhook leaves approved orders uncaptured when the country doesn't match", async () => {
  let captured = 0;
  const handler = createPayPalWebhookHandler({
    paypalFactory: () => ({
      verifyWebhookSignature: async () => true,
      getOrder: async () => payPalOrder({ chosen: "AU", country: "GB" }),
      captureOrder: async () => { captured += 1; },
    }),
    recordOrder: async () => true,
    environment: {},
    logger: silent,
  });
  const response = await handler(post({ id: "WH-9", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "O9" } }));
  assert.deepEqual(JSON.parse(response.body), { received: true, processed: false, reason: "country-mismatch" });
  assert.equal(captured, 0);
});

test("captured international PayPal orders record the full amount including shipping", () => {
  const paid = paidPayPalOrder(payPalOrder({ status: "COMPLETED" }));
  assert.equal(paid.amountTotalCents, 5300);
  assert.equal(paid.shippingDestination.country, "CA");
});

// ---------- Crypto ----------

function coinbaseHandler() {
  const sent = [];
  const handler = createCoinbaseChargeHandler({
    fetchImpl: async (url, init) => {
      sent.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ data: { hosted_url: "https://commerce.test/pay" } }) };
    },
    environment: ENV,
    logger: silent,
  });
  return { handler, sent };
}

const intlCustomer = { email: "buyer@example.com", name: "A B", address: "1 Rd", city: "Toronto", zip: "M5V 2T6", country: "CA" };

test("crypto takes 20% off items only and adds full-price international shipping", async () => {
  const { handler, sent } = coinbaseHandler();
  const response = await handler(post({ items: [bag(2)], customer: intlCustomer, shipCountry: "CA" }));
  assert.equal(response.statusCode, 200);
  // $90 items -> $72 after 20%, plus CA shipping $8 x2 = $16 (not discounted)
  assert.deepEqual(sent[0].local_price, { amount: "88.00", currency: "USD" });
  assert.equal(sent[0].metadata.shipping_country, "CA");
  assert.equal(sent[0].metadata.shipping_zip, "M5V 2T6");
  assert.equal(sent[0].metadata.shipping_cents, "1600");
  assert.match(sent[0].name, /plus shipping/);
});

test("crypto uses customer.country when shipCountry isn't sent, and US stays free", async () => {
  const { handler, sent } = coinbaseHandler();
  await handler(post({ items: [bag()], customer: { ...intlCustomer, country: "AU", zip: "2000" } }));
  assert.equal(sent[0].local_price.amount, "44.00"); // $36 + AU $8
  await handler(post({ items: [bag()], customer: { ...intlCustomer, country: "US", state: "GA", zip: "30303" } }));
  assert.equal(sent[1].local_price.amount, "36.00");
  assert.equal(sent[1].metadata.shipping_cents, "0");
});

test("crypto refuses pillows abroad, bad postal codes, and unsupported countries", async () => {
  const { handler, sent } = coinbaseHandler();
  for (const [body, message] of [
    [{ items: [bag(), pillow()], customer: intlCustomer, shipCountry: "CA" }, /Test Pillow Case ships to the US only/],
    [{ items: [bag()], customer: { ...intlCustomer, zip: "12345" }, shipCountry: "CA" }, /postal code for Canada/],
    [{ items: [bag()], customer: { ...intlCustomer, country: "FR", zip: "75001" } }, /only ship to the United States/],
  ]) {
    const response = await handler(post(body));
    assert.equal(response.statusCode, 400);
    assert.match(JSON.parse(response.body).error, message);
  }
  assert.equal(sent.length, 0);
});

test("Japan and South Korea checkouts price shipping and keep pillows US-only", async () => {
  const { handler, sent } = coinbaseHandler();
  const jp = await handler(post({ items: [phoneCase()], customer: { ...intlCustomer, country: "JP", zip: "100-0001" } }));
  assert.equal(jp.statusCode, 200);
  assert.equal(sent[0].local_price.amount, "30.00"); // $30 case -> $24, plus JP $6
  const kr = await handler(post({ items: [pillow()], customer: { ...intlCustomer, country: "KR", zip: "04524" } }));
  assert.equal(kr.statusCode, 400);
  assert.match(JSON.parse(kr.body).error, /ship to South Korea/);

  const stripe = stripeStub();
  const stripeHandler = createStripeHandler({ stripeFactory: stripe.factory, siteUrl: "https://shop.test", logger: silent });
  await stripeHandler(post({ items: [sleeve()], shipCountry: "KR", customer: { pccc: "P123456789012" } }));
  assert.deepEqual(stripe.request.shipping_address_collection, { allowed_countries: ["KR"] });
  assert.equal(stripe.request.shipping_options[0].shipping_rate_data.fixed_amount.amount, 1800);
});

test("Japan and South Korea are approved and live: no PROPOSED flags left", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "..", "shipping-rates.js"), "utf8");
  assert.doesNotMatch(source, /PROPOSED/);
  assert.equal(SHIP_TO_COUNTRIES.JP, "Japan");
  assert.equal(SHIP_TO_COUNTRIES.KR, "South Korea");
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /<option value="JP">Japan<\/option>/);
  assert.match(html, /<option value="KR">South Korea<\/option>/);
  assert.match(html, /MagSafe cases to Japan &amp; South Korea take about 30 days/);
  assert.deepEqual(INTERNATIONAL_SHIPPING_PER_ITEM_USD.bag, { CA: 8, GB: 5, DE: 5, AU: 8, JP: 5, KR: 13 });
  assert.deepEqual(INTERNATIONAL_SHIPPING_PER_ITEM_USD.case, { CA: 10, GB: 3, DE: 8, AU: 9, JP: 6, KR: 9 });
  assert.deepEqual(INTERNATIONAL_SHIPPING_PER_ITEM_USD.sleeve, { CA: 10, GB: 8, DE: 8, AU: 13, JP: 8, KR: 18 });
});

test("only MagSafe cases to Japan/South Korea get the ~30-day note", () => {
  assert.deepEqual(Object.keys(SLOW_DELIVERY), ["case"]);
  const lines = [{ name: "Case", shipping: "case", quantity: 2 }, { name: "Bag", shipping: "bag", quantity: 1 }];
  assert.equal(slowDeliveryNote(lines, "JP"), "Case to Japan takes about 30 days to arrive.");
  assert.equal(slowDeliveryNote(lines, "KR"), "Case to South Korea takes about 30 days to arrive.");
  assert.equal(slowDeliveryNote(lines, "GB"), "");
  assert.equal(slowDeliveryNote(lines, "US"), "");
  assert.equal(slowDeliveryNote([{ name: "Bag", shipping: "bag", quantity: 1 }], "KR"), "");
});

test("Stripe accepts Japan and South Korea for bags, cases and sleeves, never pillows", async () => {
  for (const [country, zip] of [["JP", "150-0001"], ["KR", "06236"]]) {
    for (const item of [bag(), phoneCase(), sleeve()]) {
      const stripe = stripeStub();
      const handler = createStripeHandler({ stripeFactory: stripe.factory, siteUrl: "https://shop.test", logger: silent });
      const customer = { email: "a@b.co", ...(country === "KR" ? { pccc: "P123456789012" } : {}) };
      const response = await handler(post({ items: [item], shipCountry: country, customer }));
      assert.equal(response.statusCode, 200, `${country} ${item.productId}`);
      assert.deepEqual(stripe.request.shipping_address_collection, { allowed_countries: [country] });
      assert.equal(stripe.request.metadata.ship_country, country);
    }
    assert.equal(requireShippingAddress({ zip }, country).zip, zip);
  }
  const stripe = stripeStub();
  const handler = createStripeHandler({ stripeFactory: stripe.factory, siteUrl: "https://shop.test", logger: silent });
  const refused = await handler(post({ items: [pillow()], shipCountry: "JP" }));
  assert.equal(refused.statusCode, 400);
  assert.equal(stripe.request, undefined);
});

// ---------- Duties notice + South Korea customs code (CIG decision 10/21) ----------

const { DUTIES_NOTICE, normalizePccc } = require("../shipping-rates.js");
const { requireKoreaCustomsCode } = require("../netlify/lib/checkout-shipping.js");
const { addKoreaCustomsCode, printfulRecipient } = require("../netlify/functions/printful-fulfillment.js");

test("duties notice wording is in the checkout and the shipping policy on every page", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  assert.equal(
    DUTIES_NOTICE,
    "Duties and taxes may apply on delivery and are the buyer's responsibility. Shipping isn't refunded on refused parcels.",
  );
  const asHtml = "Duties and taxes may apply on delivery and are the buyer&rsquo;s responsibility. Shipping isn&rsquo;t refunded on refused parcels.";
  const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(index.includes(`<p id="checkout-duties-note" class="checkout-note checkout-duties-note" hidden>${asHtml}</p>`));
  for (const page of ["index.html", "gallery.html", "arcade.html"]) {
    const html = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
    assert.match(html, /id="shipping-policy"/, page);
    assert.ok(html.includes(`<p>${asHtml}</p>`), page);
  }
  assert.match(index, /id="checkout-pccc"/);
});

test("PCCC must be P + 12 digits; spaces/dashes/lowercase are cleaned up", () => {
  assert.equal(normalizePccc("P123456789012"), "P123456789012");
  assert.equal(normalizePccc(" p1234-5678-9012 "), "P123456789012");
  for (const bad of [undefined, null, "", "123456789012", "P12345678901", "P1234567890123", "PP23456789012", "P12345678901X", 123]) {
    assert.equal(normalizePccc(bad), null, String(bad));
  }
  assert.equal(requireKoreaCustomsCode("p123456789012", "KR"), "P123456789012");
  assert.throws(() => requireKoreaCustomsCode("", "KR"), /Personal Customs Clearance Code/);
  assert.throws(() => requireKoreaCustomsCode("P123", "KR"), RequestValidationError);
  assert.equal(requireKoreaCustomsCode(undefined, "JP"), null);
  assert.equal(requireKoreaCustomsCode("P123456789012", "US"), null);
});

test("Stripe South Korea sessions require a PCCC and carry it in metadata; other countries never do", async () => {
  for (const pccc of [undefined, "", "P12345"]) {
    const stripe = stripeStub();
    const handler = createStripeHandler({ stripeFactory: stripe.factory, siteUrl: "https://shop.test", logger: silent });
    const response = await handler(post({ items: [bag()], shipCountry: "KR", customer: { email: "a@b.co", pccc } }));
    assert.equal(response.statusCode, 400, String(pccc));
    assert.match(JSON.parse(response.body).error, /PCCC/);
    assert.equal(stripe.request, undefined);
  }
  const stripe = stripeStub();
  const handler = createStripeHandler({ stripeFactory: stripe.factory, siteUrl: "https://shop.test", logger: silent });
  const ok = await handler(post({ items: [bag()], shipCountry: "KR", customer: { email: "a@b.co", pccc: "p 1234 5678 9012" } }));
  assert.equal(ok.statusCode, 200);
  assert.equal(stripe.request.metadata.pccc, "P123456789012");
  assert.equal(stripe.request.metadata.ship_country, "KR");

  const jp = stripeStub();
  const jpHandler = createStripeHandler({ stripeFactory: jp.factory, siteUrl: "https://shop.test", logger: silent });
  await jpHandler(post({ items: [bag()], shipCountry: "JP", customer: { email: "a@b.co", pccc: "P123456789012" } }));
  assert.equal(jp.request.metadata.pccc, undefined);
});

test("PayPal and crypto also refuse South Korea without a valid PCCC", async () => {
  let created = 0;
  const paypal = createPayPalOrderHandler({
    paypalFactory: () => ({ createOrder: async () => { created += 1; return { links: [{ rel: "approve", href: "https://paypal.test/a" }] }; } }),
    environment: ENV,
    logger: silent,
  });
  const refused = await paypal(post({ items: [bag()], shipCountry: "KR" }));
  assert.equal(refused.statusCode, 400);
  assert.match(JSON.parse(refused.body).error, /PCCC/);
  assert.equal(created, 0);
  assert.equal((await paypal(post({ items: [bag()], shipCountry: "KR", customer: { pccc: "P123456789012" } }))).statusCode, 200);

  const { handler, sent } = coinbaseHandler();
  const krCustomer = { ...intlCustomer, country: "KR", zip: "04524" };
  assert.equal((await handler(post({ items: [bag()], customer: krCustomer }))).statusCode, 400);
  assert.equal(sent.length, 0);
  const ok = await handler(post({ items: [bag()], customer: { ...krCustomer, pccc: "P123456789012" } }));
  assert.equal(ok.statusCode, 200);
  assert.equal(sent[0].metadata.pccc, "P123456789012");
});

function paidSession({ country = "KR", line2 = null, pccc = "P123456789012", line1 = "12 Teheran-ro" } = {}) {
  return {
    metadata: pccc === null ? {} : { pccc },
    customer_details: { email: "buyer@example.com", name: "Kim Minji" },
    collected_information: {
      shipping_details: {
        name: "Kim Minji",
        address: { line1, line2, city: "Seoul", state: null, country, postal_code: "06236" },
      },
    },
  };
}

test("Printful gets the PCCC on address2 (Printful's instruction) and as tax_number for South Korea", () => {
  const plain = printfulRecipient(paidSession());
  assert.equal(plain.address2, "PCCC P123456789012");
  assert.equal(plain.tax_number, "P123456789012");
  assert.equal(plain.country_code, "KR");

  const shortLine2 = printfulRecipient(paidSession({ line2: "Apt 3" }));
  assert.equal(shortLine2.address2, "Apt 3 PCCC P123456789012");
  assert.ok(shortLine2.address2.length <= 30);

  const moved = printfulRecipient(paidSession({ line2: "Gangnam Tower 1502" }));
  assert.equal(moved.address1, "12 Teheran-ro, Gangnam Tower 1502");
  assert.equal(moved.address2, "PCCC P123456789012");

  const tooLong = addKoreaCustomsCode(
    { address1: "123 A Very Long Street Name Road", address2: "Building 7, Unit 1502" },
    "P123456789012",
  );
  assert.ok(tooLong.address2.startsWith("PCCC P123456789012"));
});

test("Printful fulfillment refuses a South Korea order with no PCCC; other countries are unchanged", () => {
  assert.throws(() => printfulRecipient(paidSession({ pccc: null })), /missing a valid PCCC/);
  assert.throws(() => printfulRecipient(paidSession({ pccc: "P12" })), /missing a valid PCCC/);
  const jp = printfulRecipient(paidSession({ country: "JP", pccc: "P123456789012" }));
  assert.equal(jp.tax_number, undefined);
  assert.equal(jp.address2, undefined);
});
