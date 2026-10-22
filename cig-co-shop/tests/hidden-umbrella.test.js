// CIG 10/22 4:59 PM ET: "take the umbrella out we're gonna replace with moto
// masks". The Toile Umbrella (0010) is hidden (hidden: true): nothing is
// deleted, so it can come back. The moto mask (0013) took its spot on 10/22
// 5:27 PM once CIG's new photos arrived. This file does NOT load soldout-fixture.js, so it
// sees the real catalog.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { PRODUCTS } = require("../products.js");
const { priceCartForStripe } = require("../netlify/lib/stripe-pricing.js");
const { createHandler: createStripeSession } = require("../netlify/functions/create-stripe-session.js");
const { createHandler: createPayPalOrder } = require("../netlify/functions/create-paypal-order.js");

const root = path.join(__dirname, "..");
const quiet = { log() {}, error() {}, warn() {} };
const product = (id) => PRODUCTS.find((p) => p.id === id);

test("umbrella is hidden, with its data, photos and stock kept", () => {
  const u = product("0010");
  assert.equal(u.hidden, true);
  assert.equal(u.name, "Toile Umbrella");
  assert.equal(u.price, 35);
  assert.deepEqual(u.stock, { Blue: 2, Green: 0, Red: 2, Rainbow: 6 });
  assert.ok(u.image);
  assert.ok(fs.existsSync(path.join(root, u.image)), u.image);
  for (const img of Object.values(u.colorImages || {})) assert.ok(fs.existsSync(path.join(root, img)), img);
  assert.equal(product("0012").hidden, true);
});

test("site: hidden products never render on the grid or open a product view", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /PRODUCTS\.filter\(\(p\) => !p\.hidden\)\.map/);
  assert.match(app, /if \(!p \|\| p\.hidden\) return;/);
  const listed = PRODUCTS.filter((p) => !p.hidden).map((p) => p.id);
  for (const id of ["0010", "0012"]) assert.ok(!listed.includes(id), id);
  // The moto mask sits where the umbrella was (between the ski mask and the bikini).
  assert.deepEqual(listed.filter((id) => /^00/.test(id)), ["0004", "0005", "0008", "0013", "0011"]);
});

test("a saved bag drops the umbrella", () => {
  const store = new Map([["cig_co_cart_v1", JSON.stringify([
    { productId: "0010", name: "Toile Umbrella", price: 35, color: "Blue", qty: 1 },
    { productId: "0005", name: "CIG Balaclava", price: 25, color: "Gold", qty: 1 },
  ])]]);
  const context = vm.createContext({
    PRODUCTS,
    localStorage: { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v) },
    document: { getElementById: () => null },
  });
  vm.runInContext(fs.readFileSync(path.join(root, "cart.js"), "utf8"), context);
  const cart = JSON.parse(JSON.stringify(vm.runInContext("getCart()", context)));
  assert.deepEqual(cart.map((i) => i.productId), ["0005"]);
});

test("checkout refuses the umbrella: pricing, Stripe and PayPal", async () => {
  const item = { productId: "0010", color: "Blue", quantity: 1 };
  assert.throws(() => priceCartForStripe([item]), /not available/);
  const stripe = createStripeSession({
    environment: { STRIPE_SECRET_KEY: "sk_test", SITE_URL: "https://cigcompany.com" },
    stripeFactory: () => ({ checkout: { sessions: { create: async () => { throw new Error("should not be called"); } } } }),
    stockStoreFactory: () => ({ getStock: async () => [] }),
    logger: quiet,
  });
  const paypal = createPayPalOrder({
    environment: { PAYPAL_CLIENT_ID: "x", PAYPAL_SECRET: "y", SITE_URL: "https://cigcompany.com" },
    paypalFactory: () => ({ createOrder: async () => { throw new Error("should not be called"); } }),
    stockStoreFactory: () => ({ getStock: async () => [] }),
    logger: quiet,
  });
  const body = JSON.stringify({ items: [item], shipCountry: "US" });
  assert.equal((await stripe({ httpMethod: "POST", headers: {}, body })).statusCode, 400);
  assert.equal((await paypal({ httpMethod: "POST", headers: {}, body })).statusCode, 400);
});
