// Live backstock counts for the masks (0005, 0008, 0013): checked at checkout
// creation, decremented once per paid order (Stripe + PayPal), shown on the site.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { PRODUCTS } = require("../products.js");
const live = require("../netlify/lib/live-stock.js");
const { priceCartForStripe } = require("../netlify/lib/stripe-pricing.js");
const { buildPayPalOrder, recordPayPalOrder } = require("../netlify/lib/paypal.js");
const { createHandler: createStripeSession } = require("../netlify/functions/create-stripe-session.js");
const { createHandler: createPayPalOrder } = require("../netlify/functions/create-paypal-order.js");
const { createHandler: createStripeWebhook } = require("../netlify/functions/stripe-webhook.js");
const { createHandler: createStockEndpoint } = require("../netlify/functions/stock.js");
const { applyLiveStock, loadLiveStock } = require("../live-stock-client.js");

const quiet = { error() {} };

// In-memory twin of the Supabase functions in 202610220001_live_stock.sql.
function fakeStockStore(rows) {
  const counts = new Map(rows.map((r) => [live.stockKey(r.product_id, r.color, r.size), r.quantity]));
  const orders = new Map();
  return {
    counts, orders,
    async getStock() {
      return [...counts.entries()].map(([k, quantity]) => { const [product_id, color, size] = JSON.parse(k); return { product_id, color, size, quantity }; });
    },
    async commitOrder(orderKey, lines) {
      if (orders.has(orderKey)) return { applied: false, oversold: [] };
      orders.set(orderKey, lines);
      const oversold = [];
      for (const l of lines) {
        const k = live.stockKey(l.productId, l.color, l.size);
        const have = counts.get(k) || 0;
        if (have < l.quantity) oversold.push({ product_id: l.productId, requested: l.quantity, available: have });
        if (counts.has(k)) counts.set(k, Math.max(0, have - l.quantity));
      }
      return { applied: true, oversold };
    },
  };
}
const seed = () => fakeStockStore([
  { product_id: "0005", color: "Blue", size: "", quantity: 2 },
  { product_id: "0005", color: "Red", size: "", quantity: 70 },
  { product_id: "0008", color: "Gold", size: "3-Hole", quantity: 1 },
]);

test("only the three backstock masks are live-tracked; Printful items never are", () => {
  assert.deepEqual(PRODUCTS.filter((p) => p.liveStock).map((p) => p.id), ["0005", "0008", "0013"]);
  for (const p of PRODUCTS.filter((x) => x.pod)) assert.ok(!p.liveStock, p.id);
  const pricing = priceCartForStripe([
    { productId: "0005", color: "Blue", quantity: 1 },
    { productId: "0010", color: "Blue", quantity: 1 },
    { productId: "0008", color: "Gold", size: "3-Hole", quantity: 1 },
  ]);
  assert.deepEqual(pricing.stockLines, [
    { productId: "0005", color: "Blue", size: "", quantity: 1 },
    { productId: "0008", color: "Gold", size: "3-Hole", quantity: 1 },
  ]);
  assert.equal(pricing.lineStock[1], null);
});

test("checkout is refused when the live count is lower than the request, with a clear message", async () => {
  const store = seed();
  await live.assertLiveStock([{ productId: "0005", color: "Blue", size: "", quantity: 2 }], { stockStoreFactory: () => store });
  await assert.rejects(live.assertLiveStock([{ productId: "0005", color: "Blue", size: "", quantity: 3 }], { stockStoreFactory: () => store }), /Only 2 left of 0005 Blue/);
  await assert.rejects(live.assertLiveStock([{ productId: "0005", color: "Gold", size: "", quantity: 1 }], { stockStoreFactory: () => store }), /just sold out/);
  await assert.rejects(
    live.assertLiveStock([{ productId: "0005", color: "Red", size: "", quantity: 1 }], { stockStoreFactory: () => ({ getStock: async () => { throw new Error("down"); } }), logger: quiet }),
    live.LiveStockUnavailableError,
  );
  let calls = 0;
  await live.assertLiveStock([], { stockStoreFactory: () => { calls += 1; } });
  assert.equal(calls, 0, "carts without masks never touch Supabase");
});

test("Stripe: session creation checks live stock and carries the lines for the webhook", async () => {
  const store = seed();
  let created = null;
  const handler = createStripeSession({
    environment: { STRIPE_SECRET_KEY: "sk_test", SITE_URL: "https://cigcompany.com" },
    stripeFactory: () => ({ checkout: { sessions: { create: async (a) => { created = a; return { url: "https://stripe.test/s" }; } } } }),
    stockStoreFactory: () => store,
    logger: quiet,
  });
  const post = (items) => handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ items }) });
  const ok = await post([{ productId: "0005", color: "Blue", quantity: 2 }, { productId: "0008", color: "Gold", size: "3-Hole", quantity: 1 }]);
  assert.equal(ok.statusCode, 200);
  assert.equal(created.metadata.stock_0, "0005|Blue||2;0008|Gold|3-Hole|1");
  const over = await post([{ productId: "0008", color: "Gold", size: "3-Hole", quantity: 2 }]);
  assert.equal(over.statusCode, 400);
  assert.match(JSON.parse(over.body).error, /Only 1 left/);
  const down = createStripeSession({
    environment: { STRIPE_SECRET_KEY: "sk_test" }, stripeFactory: () => ({}), logger: quiet,
    stockStoreFactory: () => ({ getStock: async () => { throw new Error("x"); } }),
  });
  assert.equal((await down({ httpMethod: "POST", headers: {}, body: JSON.stringify({ items: [{ productId: "0005", color: "Red", quantity: 1 }] }) })).statusCode, 503);
});

test("Stripe metadata round-trips and splits across keys under Stripe's 500-char limit", () => {
  const lines = Array.from({ length: 40 }, (_, i) => ({ productId: "0008", color: `Color${i}`, size: "3-Hole", quantity: i + 1 }));
  const meta = live.encodeStockMetadata(lines);
  assert.ok(Object.keys(meta).length > 1);
  for (const v of Object.values(meta)) assert.ok(v.length <= 500);
  assert.deepEqual(live.decodeStockMetadata({ ...meta, promo_code: "X" }), lines);
  assert.deepEqual(live.encodeStockMetadata([]), {});
});

function paidSession(metadata) {
  return {
    id: "cs_test_123", mode: "payment", status: "complete", payment_status: "paid",
    amount_total: 5000, currency: "usd", payment_intent: "pi_1",
    customer_details: { email: "buyer@example.com", name: "A B" },
    metadata: { marketing_consent: "false", ...metadata },
    line_items: { data: [{ description: "CIG Paisley Balaclava — Blue", quantity: 2, amount_total: 5000, currency: "usd" }] },
  };
}
function webhook(session, store, extra = {}) {
  return createStripeWebhook({
    stripeFactory: () => ({
      webhooks: { constructEvent: () => ({ id: "evt_1", type: "checkout.session.completed", created: 1790000000, data: { object: { id: session.id } } }) },
      checkout: { sessions: { retrieve: async () => session } },
    }),
    storeFactory: () => ({ processStripeOrder: async () => ({ created: true, contact: { id: "c", marketing_consent: false }, order: { id: "o" } }) }),
    sendOrder: async () => {}, syncKit: async () => {},
    stockStoreFactory: () => store,
    environment: { STRIPE_SECRET_KEY: "sk", STRIPE_WEBHOOK_SECRET: "wh" },
    logger: quiet,
    ...extra,
  })({ httpMethod: "POST", headers: { "stripe-signature": "ok" }, body: "{}" });
}

test("Stripe webhook decrements once per session; replays don't double-count", async () => {
  const store = seed();
  const session = paidSession({ stock_0: "0005|Blue||2" });
  assert.equal((await webhook(session, store)).statusCode, 200);
  assert.equal(store.counts.get(live.stockKey("0005", "Blue", "")), 0);
  assert.equal((await webhook(session, store)).statusCode, 200);
  assert.equal(store.counts.get(live.stockKey("0005", "Blue", "")), 0);
  assert.deepEqual([...store.orders.keys()], ["stripe:cs_test_123"]);
});

test("Stripe webhook: a stock write failure returns 500 so Stripe retries; no-mask orders skip it", async () => {
  const failing = { commitOrder: async () => { throw new Error("db"); } };
  assert.equal((await webhook(paidSession({ stock_0: "0005|Blue||1" }), failing)).statusCode, 500);
  assert.equal((await webhook(paidSession({}), failing)).statusCode, 200);
});

test("an oversold order (two buyers, last unit) floors at 0 and is logged for a refund", async () => {
  const store = seed();
  const errors = [];
  await live.commitOrderStock("stripe:a", [{ productId: "0008", color: "Gold", size: "3-Hole", quantity: 1 }], { stockStoreFactory: () => store, logger: quiet });
  const second = await live.commitOrderStock("stripe:b", [{ productId: "0008", color: "Gold", size: "3-Hole", quantity: 1 }], { stockStoreFactory: () => store, logger: { error: (m) => errors.push(m) } });
  assert.equal(store.counts.get(live.stockKey("0008", "Gold", "3-Hole")), 0);
  assert.equal(second.oversold.length, 1);
  assert.match(errors[0], /oversold/);
});

test("PayPal: order creation checks live stock; items carry the variant sku; capture decrements once", async () => {
  const store = seed();
  const handler = createPayPalOrder({
    environment: { PAYPAL_CLIENT_ID: "x", PAYPAL_SECRET: "y", SITE_URL: "https://cigcompany.com" },
    paypalFactory: () => ({ createOrder: async () => ({ links: [{ rel: "approve", href: "https://paypal.test/a" }] }) }),
    stockStoreFactory: () => store,
    logger: quiet,
  });
  const over = await handler({ httpMethod: "POST", body: JSON.stringify({ items: [{ productId: "0005", color: "Blue", quantity: 3 }] }) });
  assert.equal(over.statusCode, 400);
  assert.equal((await handler({ httpMethod: "POST", body: JSON.stringify({ items: [{ productId: "0005", color: "Blue", quantity: 2 }] }) })).statusCode, 200);

  const pricing = priceCartForStripe([{ productId: "0010", color: "Blue", quantity: 1 }, { productId: "0005", color: "Blue", quantity: 2 }]);
  const built = buildPayPalOrder(pricing, { siteUrl: "https://cigcompany.com" });
  assert.equal(built.purchase_units[0].items[0].sku, undefined);
  assert.equal(built.purchase_units[0].items[1].sku, "stock:0005|Blue|");

  const unit = built.purchase_units[0];
  const order = {
    id: "PAYPAL123", status: "COMPLETED",
    payer: { email_address: "buyer@example.com", name: { given_name: "A", surname: "B" } },
    purchase_units: [{ ...unit, payments: { captures: [{ id: "CAP1", status: "COMPLETED", amount: { ...unit.amount } }] } }],
  };
  const deps = {
    storeFactory: () => ({ processStripeOrder: async () => ({ contact: { id: "c", marketing_consent: false }, order: { id: "o" } }) }),
    sendOrder: async () => {}, syncKit: async () => {}, stockStoreFactory: () => store, logger: quiet,
  };
  assert.equal(await recordPayPalOrder(order, { eventId: "paypal-return:PAYPAL123", eventType: "x" }, deps), true);
  assert.equal(await recordPayPalOrder(order, { eventId: "paypal:WH-1", eventType: "y" }, deps), true);
  assert.equal(store.counts.get(live.stockKey("0005", "Blue", "")), 0);
  assert.deepEqual([...store.orders.keys()], ["paypal:PAYPAL123"]);
});

test("the public stock endpoint returns live counts for listed live-stock products only", async () => {
  const store = fakeStockStore([
    { product_id: "0005", color: "Blue", size: "", quantity: 0 },
    { product_id: "0013", color: "Pink", size: "", quantity: 22 },
    { product_id: "0010", color: "Black", size: "", quantity: 9 },
  ]);
  const res = await createStockEndpoint({ stockStoreFactory: () => store, logger: quiet })({ httpMethod: "GET" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body).items, [
    { productId: "0005", color: "Blue", size: "", quantity: 0 },
    { productId: "0013", color: "Pink", size: "", quantity: 22 },
  ]);
  assert.match(res.headers["Cache-Control"], /max-age=20/);
  const down = await createStockEndpoint({ stockStoreFactory: () => ({ getStock: async () => { throw new Error("x"); } }), logger: quiet })({ httpMethod: "GET" });
  assert.equal(down.statusCode, 503);
});

test("the site swaps in live counts so a variant at 0 shows sold out; failures keep the static counts", async () => {
  const products = JSON.parse(JSON.stringify(PRODUCTS.filter((p) => ["0005", "0008", "0010"].includes(p.id))));
  const updated = applyLiveStock(products, [
    { productId: "0005", color: "Blue", size: "", quantity: 0 },
    { productId: "0005", color: "Red", size: "", quantity: 5 },
    { productId: "0008", color: "Gold", size: "1-Hole", quantity: 3 },
  ]);
  assert.deepEqual(updated, ["0005", "0008"]);
  const bala = products.find((p) => p.id === "0005");
  assert.deepEqual(bala.stock, { Red: 5, Blue: 0, Gold: 0, Black: 0 });
  assert.deepEqual(products.find((p) => p.id === "0008").stock.Gold, { "1-Hole": 3, "3-Hole": 0, Skully: 0 });
  assert.deepEqual(products.find((p) => p.id === "0010").stock, PRODUCTS.find((p) => p.id === "0010").stock);

  const keep = JSON.parse(JSON.stringify(PRODUCTS.filter((p) => p.id === "0005")));
  assert.deepEqual(await loadLiveStock({ products: keep, fetchImpl: async () => { throw new Error("offline"); } }), []);
  assert.deepEqual(keep[0].stock, { Red: 70, Blue: 68, Gold: 24, Black: 0 });
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /<script src="app\.js"><\/script>\s*<script src="live-stock-client\.js"><\/script>/);
});

test("the migration creates the tables/functions, locks them to the server, and seeds BG's counts without overwriting", () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "supabase/migrations/202610220001_live_stock.sql"), "utf8");
  for (const s of ["create table if not exists public.live_stock", "create table if not exists public.live_stock_orders", "cigco_get_live_stock", "cigco_commit_stock_order", "on conflict (order_key) do nothing", "on conflict (product_id, color, size) do nothing", "revoke execute on function public.cigco_commit_stock_order"]) {
    assert.ok(sql.includes(s), s);
  }
  const seedRows = [...sql.matchAll(/\('(\d{4})', '([^']*)', '([^']*)', (\d+)\)/g)].map((m) => [m[1], m[2], m[3], Number(m[4])]);
  const fromSeed = (id) => Object.fromEntries(seedRows.filter((r) => r[0] === id).map((r) => [r[2] ? `${r[1]}/${r[2]}` : r[1], r[3]]));
  const fromCatalog = (p) => Object.fromEntries(Object.entries(p.stock).flatMap(([c, v]) => (typeof v === "number" ? [[c, v]] : Object.entries(v).map(([s, n]) => [`${c}/${s}`, n]))));
  for (const id of ["0005", "0008", "0013"]) {
    assert.deepEqual(fromSeed(id), fromCatalog(PRODUCTS.find((p) => p.id === id)), id);
  }
});

test("crypto checkout refuses the live-tracked masks (its webhook doesn't decrement)", async () => {
  require("./crypto-fixture.js");
  const { createHandler } = require("../netlify/functions/create-coinbase-charge.js");
  const res = await createHandler({ environment: { COINBASE_COMMERCE_API_KEY: "k" }, logger: quiet })({
    httpMethod: "POST",
    body: JSON.stringify({ items: [{ productId: "0005", color: "Red", quantity: 1 }], customer: { email: "a@b.co", name: "A B", address: "1 St", city: "X", state: "GA", zip: "30301" }, shipCountry: "US" }),
  });
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /card or PayPal/);
});

test("FW26 cards and product pages open on CIG's colors", () => {
  const want = { "FW26-BAG": ["Navy", "crossbody_navy_front"], "FW26-CASE": ["Burgundy", "case_burgundy"], "FW26-SLEEVE": ["Grape", "sleeve_grape"], "FW26-PILLOW": ["Black", "pillow_black_front"] };
  for (const [id, [color, file]] of Object.entries(want)) {
    const p = PRODUCTS.find((x) => x.id === id);
    assert.equal(p.defaultColor, color);
    assert.equal(p.image, `assets/products/fw26/${file}.webp`);
    assert.equal(p.image, p.colorImages[color]);
  }
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.match(app, /color: \(p\.defaultColor && p\.colors\.includes\(p\.defaultColor\) \? p\.defaultColor : p\.colors\[0\]\)/);
});
