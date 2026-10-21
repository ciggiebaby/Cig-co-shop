// Crypto checkout is off (CRYPTO_ENABLED=false in products.js, CIG 10/21:
// Coinbase Commerce waits for the new LLC). No crypto fixture here, so these
// run against the real switch.
const assert = require("node:assert/strict");
const test = require("node:test");

const catalog = require("../products.js");
const { cryptoCheckoutEnabled, cryptoWebhookEnabled, CRYPTO_DISABLED_MESSAGE } = require("../netlify/lib/crypto-payment.js");
const { createHandler: createCoinbaseChargeHandler } = require("../netlify/functions/create-coinbase-charge.js");
const { createHandler: createCoinbaseWebhookHandler } = require("../netlify/functions/coinbase-webhook.js");

const FULL_ENV = {
  SITE_URL: "https://shop.test",
  COINBASE_COMMERCE_API_KEY: "k",
  COINBASE_COMMERCE_WEBHOOK_SECRET: "s",
};
const post = (body) => ({ httpMethod: "POST", headers: {}, body: JSON.stringify(body) });
const order = {
  items: [{ productId: "0003", color: "Red", quantity: 1 }],
  customer: { email: "a@b.co", name: "A", address: "1 Main St", city: "Austin", state: "TX", zip: "78701", country: "US" },
};

function recordingLogger() {
  const errors = [];
  return { errors, logger: { log() {}, error: (...args) => errors.push(args) } };
}

test("CRYPTO_ENABLED is false, so crypto is off even when Coinbase keys exist", () => {
  assert.equal(catalog.CRYPTO_ENABLED, false);
  assert.equal(cryptoCheckoutEnabled(FULL_ENV), false);
  assert.equal(cryptoWebhookEnabled(FULL_ENV), false);
});

test("crypto charge creation refuses cleanly (503, no Coinbase call, no error log) while off", async () => {
  let called = 0;
  const { errors, logger } = recordingLogger();
  for (const environment of [FULL_ENV, { SITE_URL: "https://shop.test" }, {}]) {
    const handler = createCoinbaseChargeHandler({
      fetchImpl: async () => { called += 1; throw new Error("should not be called"); },
      environment,
      logger,
    });
    const response = await handler(post(order));
    assert.equal(response.statusCode, 503);
    assert.equal(JSON.parse(response.body).error, CRYPTO_DISABLED_MESSAGE);
    // Bad JSON is refused the same way, never a crash.
    assert.equal((await handler({ httpMethod: "POST", headers: {}, body: "{nope" })).statusCode, 503);
  }
  assert.equal(called, 0);
  assert.deepEqual(errors, []);
});

test("switched on but missing COINBASE_COMMERCE_API_KEY still refuses cleanly", async () => {
  catalog.CRYPTO_ENABLED = true;
  try {
    assert.equal(cryptoCheckoutEnabled({}), false);
    assert.equal(cryptoCheckoutEnabled({ COINBASE_COMMERCE_API_KEY: "k" }), true);
    assert.equal(cryptoWebhookEnabled({ COINBASE_COMMERCE_API_KEY: "k" }), false);
    assert.equal(cryptoWebhookEnabled(FULL_ENV), true);
    let called = 0;
    const handler = createCoinbaseChargeHandler({
      fetchImpl: async () => { called += 1; throw new Error("should not be called"); },
      environment: { SITE_URL: "https://shop.test" },
      logger: recordingLogger().logger,
    });
    const response = await handler(post(order));
    assert.equal(response.statusCode, 503);
    assert.equal(called, 0);
  } finally {
    catalog.CRYPTO_ENABLED = false;
  }
});

test("Coinbase webhook answers 503 without touching Coinbase or recording while off", async () => {
  let fetched = 0;
  let recorded = 0;
  const { errors, logger } = recordingLogger();
  const handler = createCoinbaseWebhookHandler({
    fetchImpl: async () => { fetched += 1; throw new Error("should not be called"); },
    recordOrder: async () => { recorded += 1; },
    environment: FULL_ENV,
    logger,
  });
  const response = await handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ event: { type: "charge:confirmed", data: { code: "X" } } }) });
  assert.equal(response.statusCode, 503);
  assert.equal(fetched, 0);
  assert.equal(recorded, 0);
  assert.deepEqual(errors, []);
});

test("card and PayPal checkouts don't read any Coinbase setting", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  for (const file of [
    "netlify/functions/create-stripe-session.js",
    "netlify/functions/stripe-webhook.js",
    "netlify/functions/printful-fulfillment.js",
    "netlify/functions/create-paypal-order.js",
    "netlify/functions/paypal-capture.js",
    "netlify/functions/paypal-webhook.js",
    "netlify/lib/paypal.js",
  ]) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.doesNotMatch(source, /COINBASE|CRYPTO_ENABLED|crypto-payment/, file);
  }
});
