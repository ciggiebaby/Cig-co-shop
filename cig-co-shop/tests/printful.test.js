const assert = require("node:assert/strict");
const test = require("node:test");

const { PRODUCTS } = require("../products.js");
const { priceCartForStripe } = require("../netlify/lib/stripe-pricing.js");
const {
  createPrintfulClient,
  podVariantKey,
  printfulExternalId,
  printfulItemForLine,
} = require("../netlify/lib/printful.js");
const {
  createHandler,
} = require("../netlify/functions/printful-fulfillment.js");
const paypal = require("../netlify/functions/create-paypal-order.js");
const coinbase = require("../netlify/functions/create-coinbase-charge.js");

const POD_PRODUCT = {
  id: "test-pod-hoodie",
  sku: "TEST-POD",
  name: "Test Paisley Hoodie",
  price: 65.00,
  image: "",
  colors: [],
  sizes: ["M", "L"],
  pod: {
    files: [{ type: "default", url: "https://example.com/front.png" }],
    variants: { "M": 10871, "L": { syncVariantId: 555 } },
  },
};

test.before(() => PRODUCTS.push(POD_PRODUCT));
test.after(() => PRODUCTS.splice(PRODUCTS.indexOf(POD_PRODUCT), 1));

test("archive items are priced exactly as before (no POD metadata)", () => {
  const pricing = priceCartForStripe([{ productId: "0003", color: "Red", quantity: 1 }]);
  assert.deepEqual(pricing.lineItems[0].price_data.product_data, {
    name: "CIG Pillow Case — Red",
  });
});

test("POD items carry their selection to Stripe as product metadata", () => {
  const pricing = priceCartForStripe([{ productId: POD_PRODUCT.id, size: "M", quantity: 2 }]);
  assert.deepEqual(pricing.lineItems[0].price_data.product_data.metadata, {
    pod: "true",
    product_id: POD_PRODUCT.id,
    style: "",
    color: "",
    size: "M",
  });
  assert.equal(pricing.lineItems[0].price_data.unit_amount, 6500);
});

test("maps selections to Printful catalog or sync variants", () => {
  assert.equal(podVariantKey({ color: "Black", size: "M" }), "Black / M");
  assert.equal(podVariantKey({}), "default");
  assert.deepEqual(
    printfulItemForLine({ productId: POD_PRODUCT.id, size: "M", quantity: 1, retailPrice: "65.00" }),
    {
      quantity: 1,
      name: "Test Paisley Hoodie — M",
      retail_price: "65.00",
      variant_id: 10871,
      files: [{ type: "default", url: "https://example.com/front.png" }],
    },
  );
  assert.equal(
    printfulItemForLine({ productId: POD_PRODUCT.id, size: "L", quantity: 1 }).sync_variant_id,
    555,
  );
  assert.throws(() => printfulItemForLine({ productId: POD_PRODUCT.id, size: "XL", quantity: 1 }));
  assert.throws(() => printfulItemForLine({ productId: "0003", color: "Red", quantity: 1 }));
});

test("product-level options are sent with catalog variants", () => {
  POD_PRODUCT.pod.options = { stitch_color: "black" };
  try {
    assert.deepEqual(
      printfulItemForLine({ productId: POD_PRODUCT.id, size: "M", quantity: 1 }).options,
      [{ id: "stitch_color", value: "black" }],
    );
  } finally {
    delete POD_PRODUCT.pod.options;
  }
});

test("external ids are the payment id, or a short hash when too long", () => {
  assert.equal(printfulExternalId("pi_3Abc123"), "pi_3Abc123");
  const long = printfulExternalId(`cs_live_${"a".repeat(60)}`);
  assert.equal(long.length, 32);
  assert.equal(long, printfulExternalId(`cs_live_${"a".repeat(60)}`));
});

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const route = routes.find((entry) => url.includes(entry.match) && entry.method === init.method);
    const { status = 200, result = {} } = route ? route.respond() : { status: 404, result: "Not found" };
    return { ok: status < 400, status, json: async () => ({ code: status, result }) };
  };
  return { calls, impl };
}

const ENV = { PRINTFUL_API_TOKEN: "test-token", PRINTFUL_STORE_ID: "42" };

test("createOrder creates a draft once and reuses it afterwards", async () => {
  let exists = false;
  const fetchStub = fakeFetch([
    { method: "GET", match: "/orders/@pi_1", respond: () => (exists ? { result: { id: 9, status: "draft" } } : { status: 404, result: "Not found" }) },
    { method: "POST", match: "/orders?confirm=false", respond: () => { exists = true; return { result: { id: 9, status: "draft" } }; } },
  ]);
  const client = createPrintfulClient({ environment: ENV, fetchImpl: fetchStub.impl });
  const first = await client.createOrder({ paymentId: "pi_1", recipient: {}, items: [] });
  const second = await client.createOrder({ paymentId: "pi_1", recipient: {}, items: [] });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  const posts = fetchStub.calls.filter((call) => call.init.method === "POST");
  assert.equal(posts.length, 1);
  assert.equal(JSON.parse(posts[0].init.body).external_id, "pi_1");
  assert.equal(posts[0].init.headers["X-PF-Store-Id"], "42");
});

test("PRINTFUL_AUTO_CONFIRM=true confirms the order", async () => {
  const fetchStub = fakeFetch([
    { method: "POST", match: "/orders?confirm=true", respond: () => ({ result: { id: 1, status: "pending" } }) },
  ]);
  const client = createPrintfulClient({
    environment: { ...ENV, PRINTFUL_AUTO_CONFIRM: "true" },
    fetchImpl: fetchStub.impl,
  });
  const { created } = await client.createOrder({ paymentId: "pi_2", recipient: {}, items: [] });
  assert.equal(created, true);
});

function stripeStub({ session, lineItems, badSignature = false }) {
  return () => ({
    webhooks: {
      constructEvent(body, signature, secret) {
        if (badSignature) {
          const error = new Error("bad");
          error.type = "StripeSignatureVerificationError";
          throw error;
        }
        assert.equal(secret, "whsec_printful");
        return JSON.parse(body);
      },
    },
    checkout: {
      sessions: {
        retrieve: async () => session,
        listLineItems: async () => ({ data: lineItems }),
      },
    },
  });
}

const PAID_SESSION = {
  id: "cs_test_1",
  mode: "payment",
  status: "complete",
  payment_status: "paid",
  payment_intent: "pi_paid",
  customer_details: { email: "buyer@example.com", name: "Buyer" },
  collected_information: {
    shipping_details: {
      name: "Buyer Name",
      address: { line1: "1 Main St", line2: null, city: "Austin", state: "TX", postal_code: "78701", country: "US" },
    },
  },
};

function webhookEvent() {
  return {
    httpMethod: "POST",
    headers: { "stripe-signature": "sig" },
    body: JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_test_1" } } }),
  };
}

const POD_LINE = {
  quantity: 1,
  amount_total: 6500,
  price: { product: { metadata: { pod: "true", product_id: POD_PRODUCT.id, style: "", color: "", size: "M" } } },
};
const ARCHIVE_LINE = { quantity: 1, amount_total: 1000, price: { product: { metadata: {} } } };

function handlerWith(stripeOptions) {
  const orders = [];
  const handler = createHandler({
    stripeFactory: stripeStub(stripeOptions),
    printfulFactory: () => ({
      createOrder: async (order) => {
        orders.push(order);
        return { order: { id: 1, status: "draft" }, created: true };
      },
    }),
    environment: { STRIPE_PRINTFUL_WEBHOOK_SECRET: "whsec_printful" },
    logger: { log() {}, error() {} },
  });
  return { handler, orders };
}

test("webhook rejects invalid signatures", async () => {
  const { handler, orders } = handlerWith({ session: PAID_SESSION, lineItems: [POD_LINE], badSignature: true });
  const response = await handler(webhookEvent());
  assert.equal(response.statusCode, 400);
  assert.equal(orders.length, 0);
});

test("webhook fails closed when its signing secret is missing", async () => {
  const handler = createHandler({
    stripeFactory: () => { throw new Error("should not be called"); },
    environment: {},
    logger: { log() {}, error() {} },
  });
  assert.equal((await handler(webhookEvent())).statusCode, 500);
});

test("webhook ignores orders without POD items", async () => {
  const { handler, orders } = handlerWith({ session: PAID_SESSION, lineItems: [ARCHIVE_LINE] });
  const response = await handler(webhookEvent());
  assert.equal(response.statusCode, 200);
  assert.equal(orders.length, 0);
});

test("webhook ignores unpaid sessions", async () => {
  const { handler, orders } = handlerWith({
    session: { ...PAID_SESSION, payment_status: "unpaid" },
    lineItems: [POD_LINE],
  });
  assert.equal((await handler(webhookEvent())).statusCode, 200);
  assert.equal(orders.length, 0);
});

test("webhook sends only POD lines to Printful with the shipping address", async () => {
  const { handler, orders } = handlerWith({ session: PAID_SESSION, lineItems: [ARCHIVE_LINE, POD_LINE] });
  const response = await handler(webhookEvent());
  assert.equal(response.statusCode, 200);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].paymentId, "pi_paid");
  assert.equal(orders[0].confirm, false);
  assert.equal(orders[0].items.length, 1);
  assert.equal(orders[0].items[0].variant_id, 10871);
  assert.equal(orders[0].recipient.address1, "1 Main St");
  assert.equal(orders[0].recipient.state_code, "TX");
  assert.equal(orders[0].recipient.email, "buyer@example.com");
});

test("PayPal and Coinbase refuse POD items (card only)", async () => {
  for (const fn of [paypal, coinbase]) {
    const response = await fn.handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({ cart: [{ productId: POD_PRODUCT.id, size: "M", price: 65, qty: 1 }] }),
    });
    assert.equal(response.statusCode, 400);
    assert.match(JSON.parse(response.body).error, /card/);
  }
});

test("POD_CARD_ONLY in products.js is the one switch for the card-only rule", async () => {
  const catalog = require("../products.js");
  assert.equal(catalog.POD_CARD_ONLY, true); // CIG hasn't changed the rule yet
  const handler = paypal.createHandler({
    paypalFactory: () => ({ createOrder: async () => ({ links: [{ rel: "approve", href: "https://paypal.test/a" }] }) }),
    environment: { SITE_URL: "https://shop.test" },
    logger: { error() {} },
  });
  const request = {
    httpMethod: "POST",
    headers: {},
    body: JSON.stringify({ items: [{ productId: POD_PRODUCT.id, size: "M", quantity: 1 }] }),
  };
  assert.equal((await handler(request)).statusCode, 400);
  catalog.POD_CARD_ONLY = false;
  try {
    assert.equal((await handler(request)).statusCode, 200);
  } finally {
    catalog.POD_CARD_ONLY = true;
  }
});
