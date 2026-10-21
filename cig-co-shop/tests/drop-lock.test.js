// FW26/27 drop lock: DROP_AT in products.js, enforced by every checkout.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { DROP_AT, PRODUCTS } = require("../products.js");
const { assertDropOpen, dropLabel, dropTestCodeValid } = require("../netlify/lib/drop-lock.js");
const { createHandler: createStripeHandler } = require("../netlify/functions/create-stripe-session.js");
const { createHandler: createPayPalOrderHandler } = require("../netlify/functions/create-paypal-order.js");

const silent = { log() {}, error() {} };
const BEFORE = Date.parse("2026-10-30T11:59:00-04:00");
const AFTER = Date.parse("2026-10-30T12:00:00-04:00");
const CODE = "test-drop-code-123";
const post = (body) => ({ httpMethod: "POST", headers: {}, body: JSON.stringify(body) });
const bag = { productId: "FW26-BAG", color: "Multi", quantity: 1 };

function stripe(now, environment = {}) {
  let request;
  const handler = createStripeHandler({
    stripeFactory: () => ({ checkout: { sessions: { create: async (r) => { request = r; return { url: "https://stripe.test/s" }; } } } }),
    siteUrl: "https://shop.test",
    environment,
    logger: silent,
    now: () => now,
  });
  return { handler, get request() { return request; } };
}

function paypal(now, environment = {}) {
  let created = 0;
  const handler = createPayPalOrderHandler({
    paypalFactory: () => ({ createOrder: async () => { created += 1; return { links: [{ rel: "approve", href: "https://paypal.test/a" }] }; } }),
    environment: { SITE_URL: "https://shop.test", ...environment },
    logger: silent,
    now: () => now,
  });
  return { handler, created: () => created };
}

test("DROP_AT is the Oct 30 noon ET placeholder and applies to exactly the four FW26 products", () => {
  assert.equal(DROP_AT, "2026-10-30T12:00:00-04:00");
  assert.deepEqual(PRODUCTS.filter((p) => p.dropAt).map((p) => p.id), ["FW26-BAG", "FW26-CASE", "FW26-SLEEVE", "FW26-PILLOW"]);
  assert.ok(PRODUCTS.filter((p) => p.dropAt).every((p) => p.dropAt === DROP_AT));
  assert.match(fs.readFileSync(path.join(__dirname, "..", "products.js"), "utf8"), /PLACEHOLDER: CIG hasn't picked the drop time yet/);
  assert.equal(dropLabel(Date.parse(DROP_AT)), "Oct 30 at 12:00 PM ET");
});

test("before DROP_AT, Stripe refuses FW26 items with a clear 400 and never calls Stripe", async () => {
  const s = stripe(BEFORE);
  const response = await s.handler(post({ items: [bag] }));
  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).error, "The FW26/27 collection drops Oct 30 at 12:00 PM ET. It can't be bought yet. Check back then!");
  assert.equal(s.request, undefined);
  // Older products are unaffected.
  assert.equal((await s.handler(post({ items: [{ productId: "0003", color: "Red", quantity: 1 }] }))).statusCode, 200);
});

test("before DROP_AT, PayPal refuses FW26 items with a clear 400", async () => {
  const p = paypal(BEFORE);
  const response = await p.handler(post({ items: [bag] }));
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /drops Oct 30/);
  assert.equal(p.created(), 0);
});

test("at DROP_AT the lock opens on its own", async () => {
  const s = stripe(AFTER);
  const response = await s.handler(post({ items: [bag] }));
  assert.equal(response.statusCode, 200);
  assert.equal(s.request.metadata.drop_test, undefined);
});

test("no DROP_TEST_CODE set means no bypass, whatever is sent", async () => {
  for (const environment of [{}, { DROP_TEST_CODE: "" }, { DROP_TEST_CODE: "   " }, { DROP_TEST_CODE: "short" }]) {
    for (const dropTestCode of [undefined, "", CODE, "short", "   "]) {
      const s = stripe(BEFORE, environment);
      assert.equal((await s.handler(post({ items: [bag], dropTestCode }))).statusCode, 400, JSON.stringify([environment, dropTestCode]));
    }
  }
});

test("with DROP_TEST_CODE set, only that exact code lets an order through early, flagged drop_test", async () => {
  const environment = { DROP_TEST_CODE: CODE };
  const wrong = stripe(BEFORE, environment);
  assert.equal((await wrong.handler(post({ items: [bag], dropTestCode: "test-drop-code-124" }))).statusCode, 400);
  assert.equal((await wrong.handler(post({ items: [bag], dropTestCode: CODE.toUpperCase() }))).statusCode, 400);

  const right = stripe(BEFORE, environment);
  const response = await right.handler(post({ items: [bag], dropTestCode: ` ${CODE} ` }));
  assert.equal(response.statusCode, 200);
  assert.equal(right.request.metadata.drop_test, "true");
  // Price is unchanged: the test code is not a discount.
  assert.equal(right.request.line_items[0].price_data.unit_amount, 7500);

  // PayPal passes the drop lock with the code, then card-only (POD_CARD_ONLY) still applies.
  const p = paypal(BEFORE, environment);
  const viaPayPal = await p.handler(post({ items: [bag], dropTestCode: CODE }));
  assert.equal(viaPayPal.statusCode, 400);
  assert.match(JSON.parse(viaPayPal.body).error, /only be paid by card/);
});

test("assertDropOpen checks every item in the cart", () => {
  const items = [{ productId: "0003" }, { productId: "FW26-PILLOW" }];
  assert.throws(() => assertDropOpen(items, { environment: {}, now: BEFORE }), /drops Oct 30/);
  assert.doesNotThrow(() => assertDropOpen(items, { environment: {}, now: AFTER }));
  assert.doesNotThrow(() => assertDropOpen([{ productId: "0003" }], { environment: {}, now: BEFORE }));
  assert.equal(dropTestCodeValid(CODE, { DROP_TEST_CODE: CODE }), true);
  assert.equal(dropTestCodeValid(CODE, {}), false);
});
