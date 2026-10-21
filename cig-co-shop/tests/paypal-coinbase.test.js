const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
require("./promo-fixture.js");

const { createHandler: createPayPalOrderHandler } = require("../netlify/functions/create-paypal-order.js");
const { createHandler: createPayPalCaptureHandler } = require("../netlify/functions/paypal-capture.js");
const { createHandler: createPayPalWebhookHandler } = require("../netlify/functions/paypal-webhook.js");
const { createHandler: createCoinbaseChargeHandler } = require("../netlify/functions/create-coinbase-charge.js");
const { createHandler: createCoinbaseWebhookHandler } = require("../netlify/functions/coinbase-webhook.js");
const { createPayPalClient, paidPayPalOrder } = require("../netlify/lib/paypal.js");
const { recordPaidOrder } = require("../netlify/lib/order-recording.js");

const silent = { log() {}, error() {} };
const ENV = { SITE_URL: "https://shop.test" };
const customer = {
  email: "Buyer@Example.com",
  name: "Ada Lovelace",
  address: "1 Main St",
  city: "Austin",
  state: "tx",
  zip: "78701",
  country: "US",
};
// Browser prices are deliberately wrong; the server must ignore them.
const tamperedCart = [{ productId: "0003", color: "Red", size: null, style: null, qty: 2, price: 0.01, name: "x" }];

function post(body, headers = {}) {
  return { httpMethod: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) };
}

// ---------- PayPal order creation ----------

test("PayPal orders are priced from products.js, not the browser", async () => {
  let sent;
  const handler = createPayPalOrderHandler({
    paypalFactory: () => ({
      createOrder: async (order) => {
        sent = order;
        return { links: [{ rel: "approve", href: "https://paypal.test/approve" }] };
      },
    }),
    environment: ENV,
    logger: silent,
  });
  const response = await handler(post({ cart: tamperedCart, customer: { ...customer, marketingConsent: true }, promoCode: "CIG10" }));
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).url, "https://paypal.test/approve");
  const unit = sent.purchase_units[0];
  assert.equal(unit.amount.value, "18.00"); // $10 sale price x2, 10% off
  assert.equal(unit.amount.breakdown.item_total.value, "18.00");
  assert.deepEqual(unit.items[0].unit_amount, { currency_code: "USD", value: "9.00" });
  assert.equal(unit.items[0].quantity, "2");
  assert.deepEqual(JSON.parse(unit.custom_id), { p: "CIG10", m: 1 });
  assert.equal(sent.application_context.return_url, "https://shop.test/.netlify/functions/paypal-capture");
  assert.equal(sent.application_context.shipping_preference, "GET_FROM_FILE");
});

test("PayPal order creation rejects unknown products and sold-out stock", async () => {
  const handler = createPayPalOrderHandler({
    paypalFactory: () => { throw new Error("should not be called"); },
    environment: ENV,
    logger: silent,
  });
  assert.equal((await handler(post({ cart: [{ productId: "nope", qty: 1 }] }))).statusCode, 400);
  assert.equal((await handler(post({ cart: [{ productId: "0003", color: "Black", qty: 1 }] }))).statusCode, 400);
});

test("PayPal checkout applies a valid Arcade code bound to the site email", async () => {
  const { resolvePromo } = require("../netlify/lib/promo-codes.js");
  let sent;
  const checks = [];
  const handler = createPayPalOrderHandler({
    paypalFactory: () => ({
      createOrder: async (order) => {
        sent = order;
        return { links: [{ rel: "approve", href: "https://paypal.test/approve" }] };
      },
    }),
    promoResolver: (args) => resolvePromo({
      ...args,
      storeFactory: () => ({
        checkArcadeCode: async (code, email) => {
          checks.push({ code, email });
          return { valid: true, code, discountBasisPoints: 1500 };
        },
      }),
    }),
    environment: ENV,
    logger: silent,
  });
  const response = await handler(post({ cart: tamperedCart, customer, promoCode: "CIG15-ABCDEFGH" }));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(checks, [{ code: "CIG15-ABCDEFGH", email: "buyer@example.com" }]);
  assert.equal(sent.purchase_units[0].amount.value, "17.00"); // $10 x2, 15% off
  assert.deepEqual(JSON.parse(sent.purchase_units[0].custom_id), { p: "CIG15-ABCDEFGH", m: 0 });
});

// ---------- PayPal capture + recording ----------

function completedOrder(overrides = {}) {
  return {
    id: "5O190127TN364715T",
    status: "COMPLETED",
    payer: { email_address: "buyer@example.com", name: { given_name: "Ada", surname: "Lovelace" } },
    purchase_units: [{
      amount: { currency_code: "USD", value: "18.00" },
      custom_id: JSON.stringify({ p: "CIG10", m: 0 }),
      items: [{ name: "CIG Pillow Case — Red", quantity: "2", unit_amount: { currency_code: "USD", value: "9.00" } }],
      shipping: {
        name: { full_name: "Ada Lovelace" },
        address: { address_line_1: "1 Main St", admin_area_2: "Austin", admin_area_1: "TX", postal_code: "78701", country_code: "US" },
      },
      payments: { captures: [{ id: "3C679366HH908993F", status: "COMPLETED", amount: { currency_code: "USD", value: "18.00" }, create_time: "2026-10-20T20:00:00Z" }] },
    }],
    ...overrides,
  };
}

// What PayPal returns for an approved-but-not-yet-captured order.
function approvedOrder(overrides = {}, country = "US") {
  const order = completedOrder({ status: "APPROVED", ...overrides });
  delete order.purchase_units[0].payments;
  if (country === null) delete order.purchase_units[0].shipping;
  else order.purchase_units[0].shipping.address.country_code = country;
  return order;
}

test("captured PayPal orders map to the same order record as Stripe", () => {
  const paid = paidPayPalOrder(completedOrder());
  assert.equal(paid.sessionId, "paypal:5O190127TN364715T");
  assert.equal(paid.paymentId, "paypal:3C679366HH908993F");
  assert.equal(paid.amountTotalCents, 1800);
  assert.equal(paid.promoCode, "CIG10");
  assert.equal(paid.marketingConsent, false);
  assert.deepEqual(paid.items, [{ description: "CIG Pillow Case — Red", quantity: 2, amountTotalCents: 1800, currency: "usd" }]);
  assert.equal(paid.shippingDestination.line1, "1 Main St");
  assert.equal(paid.shippingDestination.summary, "Austin, TX, 78701, US");
});

test("uncaptured or mismatched PayPal orders are not recorded", () => {
  assert.equal(paidPayPalOrder(completedOrder({ status: "APPROVED" })), null);
  const pending = completedOrder();
  pending.purchase_units[0].payments.captures[0].status = "PENDING";
  assert.equal(paidPayPalOrder(pending), null);
  const mismatch = completedOrder();
  mismatch.purchase_units[0].payments.captures[0].amount.value = "1.00";
  assert.throws(() => paidPayPalOrder(mismatch));
});

test("PayPal return URL captures, records, and redirects", async () => {
  const recorded = [];
  const handler = createPayPalCaptureHandler({
    paypalFactory: () => ({
      getOrder: async (id) => approvedOrder({ id }),
      captureOrder: async (id) => completedOrder({ id }),
    }),
    recordOrder: async (order, meta) => { recorded.push({ order, meta }); return true; },
    environment: ENV,
    logger: silent,
  });
  const response = await handler({ httpMethod: "GET", headers: {}, queryStringParameters: { token: "5O190127TN364715T", PayerID: "X" } });
  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.Location, "https://shop.test/?checkout=success");
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].meta.eventId, "paypal-return:5O190127TN364715T");
});

test("PayPal return URL reports failed captures and ignores junk tokens", async () => {
  const handler = createPayPalCaptureHandler({
    paypalFactory: () => ({
      getOrder: async (id) => approvedOrder({ id }),
      captureOrder: async () => { throw new Error("INSTRUMENT_DECLINED"); },
    }),
    recordOrder: async () => { throw new Error("should not record"); },
    environment: ENV,
    logger: silent,
  });
  const failed = await handler({ httpMethod: "GET", headers: {}, queryStringParameters: { token: "5O190127TN364715T" } });
  assert.equal(failed.headers.Location, "https://shop.test/?checkout=failed");
  const junk = await handler({ httpMethod: "GET", headers: {}, queryStringParameters: { token: "../../x" } });
  assert.equal(junk.headers.Location, "https://shop.test/?checkout=cancelled");
});

test("PayPal capture is idempotent and re-reads already-captured orders", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/v1/oauth2/token")) return { ok: true, status: 200, json: async () => ({ access_token: "t" }) };
    if (url.endsWith("/capture")) {
      return { ok: false, status: 422, json: async () => ({ message: "x", details: [{ issue: "ORDER_ALREADY_CAPTURED" }] }) };
    }
    return { ok: true, status: 200, json: async () => completedOrder() };
  };
  const client = createPayPalClient({ environment: { PAYPAL_API_BASE: "https://paypal.test" }, fetchImpl });
  const order = await client.captureOrder("5O190127TN364715T");
  assert.equal(order.status, "COMPLETED");
  const capture = calls.find((call) => call.url.endsWith("/capture"));
  assert.equal(capture.init.headers["PayPal-Request-Id"], "capture-5O190127TN364715T");
});

test("PayPal return URL never captures orders shipping outside the US", async () => {
  for (const country of ["CA", "GB", null]) {
    const calls = { captured: 0, recorded: 0, logged: [] };
    const handler = createPayPalCaptureHandler({
      paypalFactory: () => ({
        getOrder: async (id) => approvedOrder({ id }, country),
        captureOrder: async () => { calls.captured += 1; return completedOrder(); },
      }),
      recordOrder: async () => { calls.recorded += 1; return true; },
      environment: ENV,
      logger: { log() {}, error(message, details) { calls.logged.push(details); } },
    });
    const response = await handler({ httpMethod: "GET", headers: {}, queryStringParameters: { token: "5O190127TN364715T" } });
    assert.equal(response.headers.Location, "https://shop.test/?checkout=us-only");
    assert.equal(calls.captured, 0);
    assert.equal(calls.recorded, 0);
    assert.equal(calls.logged[0].country, country || "missing");
    assert.doesNotMatch(JSON.stringify(calls.logged), /5O190127TN364715T|buyer@example.com|Main St/);
  }
});

test("PayPal return URL records an order the webhook already captured without re-capturing", async () => {
  let captured = 0;
  const recorded = [];
  const handler = createPayPalCaptureHandler({
    paypalFactory: () => ({
      getOrder: async (id) => completedOrder({ id }),
      captureOrder: async () => { captured += 1; return completedOrder(); },
    }),
    recordOrder: async (order) => { recorded.push(order); return true; },
    environment: ENV,
    logger: silent,
  });
  const response = await handler({ httpMethod: "GET", headers: {}, queryStringParameters: { token: "5O190127TN364715T" } });
  assert.equal(response.headers.Location, "https://shop.test/?checkout=success");
  assert.equal(captured, 0);
  assert.equal(recorded.length, 1);
});

test("PayPal client can read an order before capture", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method });
    if (url.endsWith("/v1/oauth2/token")) return { ok: true, status: 200, json: async () => ({ access_token: "t" }) };
    return { ok: true, status: 200, json: async () => approvedOrder() };
  };
  const client = createPayPalClient({ environment: { PAYPAL_API_BASE: "https://paypal.test" }, fetchImpl });
  const order = await client.getOrder("5O190127TN364715T");
  assert.equal(order.status, "APPROVED");
  assert.deepEqual(calls[1], { url: "https://paypal.test/v2/checkout/orders/5O190127TN364715T", method: "GET" });
});

// ---------- PayPal webhook ----------

test("PayPal webhook verification embeds the raw event and needs every header", async () => {
  let verifyBody;
  const fetchImpl = async (url, init) => {
    if (url.endsWith("/v1/oauth2/token")) return { ok: true, status: 200, json: async () => ({ access_token: "t" }) };
    verifyBody = init.body;
    return { ok: true, status: 200, json: async () => ({ verification_status: "SUCCESS" }) };
  };
  const client = createPayPalClient({
    environment: { PAYPAL_API_BASE: "https://paypal.test", PAYPAL_WEBHOOK_ID: "WH-1" },
    fetchImpl,
  });
  const headers = {
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.paypal.com/cert",
    "paypal-transmission-id": "id",
    "paypal-transmission-sig": "sig",
    "paypal-transmission-time": "2026-10-20T20:00:00Z",
  };
  const raw = '{"id":"WH-EVT","amount":1.10}';
  assert.equal(await client.verifyWebhookSignature(headers, raw), true);
  assert.ok(verifyBody.endsWith(`"webhook_event":${raw}}`));
  assert.equal(JSON.parse(verifyBody).webhook_id, "WH-1");
  const { "paypal-transmission-sig": omitted, ...missing } = headers;
  assert.equal(await client.verifyWebhookSignature(missing, raw), false);
});

function payPalWebhook({ verified = true, order = completedOrder(), fetched = order } = {}) {
  const calls = { captured: [], fetched: [], recorded: [] };
  const handler = createPayPalWebhookHandler({
    paypalFactory: () => ({
      verifyWebhookSignature: async () => verified,
      captureOrder: async (id) => { calls.captured.push(id); return order; },
      getOrder: async (id) => { calls.fetched.push(id); return fetched; },
    }),
    recordOrder: async (paidOrder, meta) => { calls.recorded.push(meta); return true; },
    environment: {},
    logger: silent,
  });
  return { handler, calls };
}

test("PayPal webhook rejects unverified deliveries", async () => {
  const { handler, calls } = payPalWebhook({ verified: false });
  const response = await handler(post({ id: "WH-1", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "O1" } }));
  assert.equal(response.statusCode, 400);
  assert.equal(calls.captured.length + calls.recorded.length, 0);
});

test("PayPal webhook captures approved orders and records completed captures", async () => {
  const approved = payPalWebhook({ fetched: approvedOrder() });
  assert.equal((await approved.handler(post({ id: "WH-1", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "O1" } }))).statusCode, 200);
  assert.deepEqual(approved.calls.captured, ["O1"]);
  assert.equal(approved.calls.recorded[0].eventId, "paypal:WH-1");

  const completed = payPalWebhook();
  await completed.handler(post({
    id: "WH-2",
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: { id: "C1", custom_id: "{}", supplementary_data: { related_ids: { order_id: "O2" } } },
  }));
  assert.deepEqual(completed.calls.fetched, ["O2"]);
  assert.equal(completed.calls.recorded.length, 1);
});

test("PayPal webhook leaves approved non-US orders uncaptured", async () => {
  for (const country of ["MX", null]) {
    const webhook = payPalWebhook({ fetched: approvedOrder({}, country) });
    const response = await webhook.handler(post({ id: "WH-4", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "O4" } }));
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { received: true, processed: false, reason: "us-only" });
    assert.deepEqual(webhook.calls.fetched, ["O4"]);
    assert.deepEqual(webhook.calls.captured, []);
    assert.equal(webhook.calls.recorded.length, 0);
  }
});

test("PayPal sales not made by this shop are left alone", async () => {
  const other = payPalWebhook();
  const response = await other.handler(post({
    id: "WH-3",
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: { id: "C9", supplementary_data: { related_ids: { order_id: "O9" } } },
  }));
  assert.equal(response.statusCode, 200);
  assert.equal(other.calls.fetched.length + other.calls.recorded.length, 0);
  const noCustomId = completedOrder();
  delete noCustomId.purchase_units[0].custom_id;
  assert.equal(paidPayPalOrder(noCustomId), null);
});

// ---------- Coinbase charge creation ----------

test("Coinbase charges use server prices and never stack a promo code with the 20% crypto discount", async () => {
  let sent;
  const handler = createCoinbaseChargeHandler({
    fetchImpl: async (url, init) => {
      sent = JSON.parse(init.body);
      return { ok: true, json: async () => ({ data: { hosted_url: "https://commerce.test/pay" } }) };
    },
    environment: ENV,
    logger: silent,
  });
  const response = await handler(post({ cart: tamperedCart, customer, promoCode: "CIG10" }));
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).url, "https://commerce.test/pay");
  // $10 x2 = $20, 20% crypto discount only (CIG10 ignored) = $16.00.
  assert.deepEqual(sent.local_price, { amount: "16.00", currency: "USD" });
  assert.equal(sent.metadata.customer_email, "buyer@example.com");
  assert.equal(sent.metadata.shipping_address, "1 Main St");
  assert.equal(sent.metadata.shipping_city, "Austin");
  assert.equal(sent.metadata.shipping_state, "TX");
  assert.equal(sent.metadata.shipping_zip, "78701");
  assert.equal(sent.metadata.shipping_country, "US");
  assert.equal(sent.metadata.promo_code, undefined);
  assert.deepEqual(JSON.parse(sent.metadata.items), [["CIG Pillow Case — Red", 2]]);
  assert.equal(sent.redirect_url, "https://shop.test/?checkout=success");
});

test("Coinbase charges without promo are 20% off the catalog price", async () => {
  let sent;
  const handler = createCoinbaseChargeHandler({
    fetchImpl: async (url, init) => {
      sent = JSON.parse(init.body);
      return { ok: true, json: async () => ({ data: { hosted_url: "https://commerce.test/pay" } }) };
    },
    environment: ENV,
    logger: silent,
  });
  await handler(post({ cart: [{ productId: "0003", color: "Red", qty: 1 }], customer }));
  assert.equal(sent.local_price.amount, "8.00");
});

test("Coinbase charges require a valid email", async () => {
  const handler = createCoinbaseChargeHandler({
    fetchImpl: async () => { throw new Error("should not be called"); },
    environment: ENV,
    logger: silent,
  });
  const response = await handler(post({ cart: tamperedCart, customer: { ...customer, email: "nope" } }));
  assert.equal(response.statusCode, 400);
});

test("Coinbase charges are US-only and need a state and ZIP", async () => {
  let called = 0;
  const handler = createCoinbaseChargeHandler({
    fetchImpl: async () => { called += 1; throw new Error("should not be called"); },
    environment: ENV,
    logger: silent,
  });
  const cases = [
    [{ country: "CA" }, /only ship to US/],
    [{ country: undefined }, /only ship to US/],
    [{ state: "" }, /US state/],
    [{ state: "ON" }, /US state/],
    [{ zip: "" }, /ZIP/],
    [{ zip: "M5V 2T6" }, /ZIP/],
  ];
  for (const [change, message] of cases) {
    const response = await handler(post({ cart: tamperedCart, customer: { ...customer, ...change } }));
    assert.equal(response.statusCode, 400);
    assert.match(JSON.parse(response.body).error, message);
  }
  assert.equal(called, 0);
});

// ---------- Coinbase webhook ----------

const COINBASE_SECRET = "cc_shared_secret";

function signedCoinbase(eventBody, secret = COINBASE_SECRET) {
  const raw = JSON.stringify(eventBody);
  return post(raw, {
    "x-cc-webhook-signature": crypto.createHmac("sha256", secret).update(raw).digest("hex"),
  });
}

function paidCharge(status = "COMPLETED") {
  return {
    id: "c0a3b1d2-0000-0000-0000-000000000000",
    code: "ABCD1234",
    pricing: { local: { amount: "16.00", currency: "USD" } },
    timeline: [{ status: "NEW", time: "2026-10-20T19:59:00Z" }, { status, time: "2026-10-20T20:10:00Z" }],
    metadata: {
      customer_email: "buyer@example.com",
      customer_name: "Ada Lovelace",
      shipping_address: "1 Main St",
      shipping_city: "Austin",
      shipping_state: "TX",
      shipping_zip: "78701",
      shipping_country: "US",
      marketing_consent: "true",
      items: JSON.stringify([["CIG Pillow Case — Red", 2]]),
    },
  };
}

function coinbaseWebhook({ charge = paidCharge(), environment = { COINBASE_COMMERCE_WEBHOOK_SECRET: COINBASE_SECRET } } = {}) {
  const recorded = [];
  const handler = createCoinbaseWebhookHandler({
    fetchImpl: async () => ({ ok: true, json: async () => ({ data: charge }) }),
    recordOrder: async (order) => { recorded.push(order); },
    environment,
    logger: silent,
  });
  return { handler, recorded };
}

const confirmedEvent = { event: { id: "evt-1", type: "charge:confirmed", data: { id: "x", code: "ABCD1234" } } };

test("Coinbase webhook rejects bad signatures and fails closed without a secret", async () => {
  const bad = coinbaseWebhook();
  assert.equal((await bad.handler(signedCoinbase(confirmedEvent, "wrong"))).statusCode, 400);
  assert.equal(bad.recorded.length, 0);
  const unconfigured = coinbaseWebhook({ environment: {} });
  assert.equal((await unconfigured.handler(signedCoinbase(confirmedEvent))).statusCode, 500);
  assert.equal(unconfigured.recorded.length, 0);
});

test("Coinbase webhook records confirmed charges with shipping from metadata", async () => {
  const { handler, recorded } = coinbaseWebhook();
  const response = await handler(signedCoinbase(confirmedEvent));
  assert.equal(response.statusCode, 200);
  assert.equal(recorded.length, 1);
  const order = recorded[0];
  assert.equal(order.sessionId, "coinbase:ABCD1234");
  assert.equal(order.eventId, "coinbase:evt-1");
  assert.equal(order.amountTotalCents, 1600);
  assert.equal(order.emailOriginal, "buyer@example.com");
  assert.equal(order.marketingConsent, true);
  assert.equal(order.shippingDestination.line1, "1 Main St");
  assert.equal(order.shippingDestination.city, "Austin");
  assert.equal(order.shippingDestination.state, "TX");
  assert.equal(order.shippingDestination.postalCode, "78701");
  assert.equal(order.shippingDestination.country, "US");
  assert.equal(order.shippingDestination.summary, "Austin, TX, 78701, US");
  assert.deepEqual(order.items.map((item) => [item.description, item.quantity]), [["CIG Pillow Case — Red", 2]]);
});

test("Coinbase webhook ignores pending events and unpaid charges", async () => {
  const pending = coinbaseWebhook();
  await pending.handler(signedCoinbase({ event: { ...confirmedEvent.event, type: "charge:pending" } }));
  assert.equal(pending.recorded.length, 0);
  const unpaid = coinbaseWebhook({ charge: paidCharge("PENDING") });
  await unpaid.handler(signedCoinbase(confirmedEvent));
  assert.equal(unpaid.recorded.length, 0);
  const foreign = coinbaseWebhook({ charge: { ...paidCharge(), metadata: {} } });
  assert.equal((await foreign.handler(signedCoinbase(confirmedEvent))).statusCode, 200);
  assert.equal(foreign.recorded.length, 0);
});

// ---------- Shared order recording ----------

test("recordPaidOrder stores, emails, and syncs Kit only with consent", async () => {
  let stored;
  let emails = 0;
  let kit = 0;
  const run = (consent) => recordPaidOrder({
    eventId: "paypal:WH-1",
    eventType: "PAYMENT.CAPTURE.COMPLETED",
    sessionId: "paypal:O1",
    paymentId: "paypal:C1",
    emailOriginal: "Buyer@Example.com",
    name: "Ada Lovelace",
    amountTotalCents: 1800,
    currency: "usd",
    items: [],
    shippingDestination: null,
    marketingConsent: consent,
  }, {
    storeFactory: () => ({
      processStripeOrder: async (order) => {
        stored = order;
        return { contact: { id: "c1", marketing_consent: consent }, order: { id: "o1" } };
      },
    }),
    sendOrder: async () => { emails += 1; },
    syncKit: async () => { kit += 1; },
    environment: {},
    logger: silent,
  });
  await run(false);
  assert.equal(stored.sessionId, "paypal:O1");
  assert.equal(stored.paymentIntentId, "paypal:C1");
  assert.equal(stored.email, "buyer@example.com");
  assert.equal(stored.firstName, "Ada");
  assert.equal(emails, 1);
  assert.equal(kit, 0);
  await run(true);
  assert.equal(kit, 1);
});
