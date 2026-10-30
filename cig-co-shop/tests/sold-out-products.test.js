// CIG 10/22: the bonnet & durag, umbrella and bikini are sold out as whole
// products, and the backstock got plainer names. This file does NOT load
// soldout-fixture.js, so it sees the real catalog.
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
const SOLD_OUT = {
  "0004": { color: "Red", style: "Set" },
  "0010": { color: "Blue" },
  "0011": { color: "Pink", size: "M", style: "Set" },
};

test("exactly the bonnet & durag, umbrella and bikini are marked sold out", () => {
  assert.deepEqual(PRODUCTS.filter((p) => p.soldOut).map((p) => p.id), ["0004", "0010", "0011"]);
  // The umbrella was also hidden 10/22 4:59 PM (tests/hidden-umbrella.test.js).
  for (const id of ["0004", "0011"]) assert.notEqual(product(id).hidden, true, id);
  assert.equal(product("0010").hidden, true);
});

test("backstock has CIG's new customer-facing names; ids and stock keys are unchanged", () => {
  const want = {
    "0008": "CIG Ski Mask",
    "0005": "CIG Balaclava",
    "0011": "Paisley Bikini",
    "0010": "Toile Umbrella",
    "0004": "Silky Bonnet & Durag",
  };
  for (const [id, name] of Object.entries(want)) assert.equal(product(id).name, name, id);
  // No two listed products share a name.
  const names = PRODUCTS.filter((p) => !p.hidden).map((p) => p.name);
  assert.equal(new Set(names).size, names.length);
  // The moto mask keeps its name (listed again 10/22 5:27 PM).
  assert.equal(product("0013").name, "Moto Mask");
  assert.notEqual(product("0013").hidden, true);
  // Counts untouched (live masks come from Supabase; these are the in-file ones).
  assert.deepEqual(product("0010").stock, { Blue: 2, Green: 0, Red: 2, Rainbow: 6 });
  assert.equal(product("0005").liveStock, true);
  assert.equal(product("0008").liveStock, true);
});

test("new names reach Stripe/PayPal line items (and so receipts)", () => {
  const priced = priceCartForStripe([
    { productId: "0008", color: "Red", size: "3-Hole", quantity: 1 },
    { productId: "0005", color: "Red", quantity: 1 },
  ]);
  assert.deepEqual(priced.lineItems.map((l) => l.price_data.product_data.name), ["CIG Ski Mask — Red — 3-Hole", "CIG Balaclava — Red"]);
});

test("the server refuses sold-out products (stale bag): pricing, Stripe and PayPal", async () => {
  for (const [id, sel] of Object.entries(SOLD_OUT)) {
    assert.throws(() => priceCartForStripe([{ productId: id, quantity: 1, ...sel }]), /unavailable|not available/, id);
  }
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
  for (const [id, sel] of Object.entries(SOLD_OUT)) {
    const body = JSON.stringify({ items: [{ productId: id, quantity: 1, ...sel }], shipCountry: "US" });
    assert.equal((await stripe({ httpMethod: "POST", headers: {}, body })).statusCode, 400, `stripe ${id}`);
    assert.equal((await paypal({ httpMethod: "POST", headers: {}, body })).statusCode, 400, `paypal ${id}`);
  }
});

test("site: sold-out cards and product views show Sold Out and can't be added", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /function variantStock\(p, style, color, size\) \{\n  if \(p\.soldOut\) return 0;/);
  assert.match(app, /function productTotalStock\(p\) \{\n  if \(p\.soldOut\) return 0;/);
  assert.match(app, /productTotalStock\(p\) <= 0 \? `<div class="soldout-badge">Sold Out<\/div>`/);
  // Product page: Sold Out wins over the "New" badge (Moto Mask re-drop).
  assert.match(app, /\$\{p\.soldOut \? `<div class="soldout-badge pd-soldout-badge">Sold Out<\/div>` : p\.isNew \? `<div class="soldout-badge pd-soldout-badge new-badge">New<\/div>` : ""\}/);
  assert.match(app, /else if \(avail <= 0\) \{\n      addBtn\.textContent = "Sold Out";\n      addBtn\.disabled = true;/);
});

test("a saved bag drops sold-out lines and shows current names", () => {
  const store = new Map([["cig_co_cart_v1", JSON.stringify([
    { productId: "0010", name: "CIG Toile Umbrella", price: 35, color: "Blue", qty: 1 },
    { productId: "0004", name: "CIG Silky Bonnet & Durag (Set)", style: "Set", color: "Red", qty: 1 },
    { productId: "0005", name: "CIG Paisley Balaclava", price: 25, color: "Red", qty: 1 },
    { productId: "0008", name: "CIG Acrylic Ski Mask", price: 25, color: "Red", size: "3-Hole", qty: 2 },
  ])]]);
  const context = vm.createContext({
    PRODUCTS,
    localStorage: { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v) },
    document: { getElementById: () => null },
  });
  vm.runInContext(fs.readFileSync(path.join(root, "cart.js"), "utf8"), context);
  const cart = JSON.parse(JSON.stringify(vm.runInContext("getCart()", context)));
  assert.deepEqual(cart.map((i) => [i.productId, i.name, i.qty]), [["0005", "CIG Balaclava", 1], ["0008", "CIG Ski Mask", 2]]);
  assert.deepEqual(JSON.parse(store.get("cig_co_cart_v1")).map((i) => i.name), ["CIG Balaclava", "CIG Ski Mask"]);
});

test("policy mask terms use the new mask names", () => {
  for (const file of ["docs/policies/shipping-returns.md", "shipping-returns.html"]) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(text, /the CIG Ski Mask, the CIG Balaclava, and the Moto Mask/, file);
    assert.doesNotMatch(text, /Acrylic Ski Mask|Paisley Balaclava/, file);
  }
});
