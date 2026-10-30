// Halloween mask sale (CIG approved Fri 10/30/2026 via YG: "Have G set the
// mask sale prices on the site for Saturday, ending 11:59 PM ET").
// Sat 10/31 12:00 AM ET to 11:59:59 PM ET (EDT, UTC-4): ski $30 -> $24,
// balaclava $25 -> $20, moto $15 -> $12. 20% off (BG's cap), masks only, no
// code, and no promo/Arcade code stacks on top. Prices flip back on their
// own at midnight: the storefront and the server both read the window from
// products.js. This file sees the real catalog (no fixtures) and pins the
// clock with an injected `now`, so it passes on any day it's run.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { PRODUCTS, activeSalePrice, saleActive, saleBlocksPromo } = require("../products.js");
const { MASK_PROMO_MAX_DISCOUNT, MASK_PROMO_PRICE_FLOOR_USD } = require("../promo.js");
const {
  MASKS_ONLY_PROMO_MESSAGE,
  SALE_NO_STACK_PROMO_MESSAGE,
  PricingValidationError,
  priceCartForStripe,
} = require("../netlify/lib/stripe-pricing.js");
const { resolveCheckoutShipping } = require("../netlify/lib/checkout-shipping.js");
const { createHandler: createStripeSession } = require("../netlify/functions/create-stripe-session.js");
const { createHandler: createPayPalOrder } = require("../netlify/functions/create-paypal-order.js");

const root = path.join(__dirname, "..");
const quiet = { log() {}, error() {}, warn() {} };
const product = (id) => PRODUCTS.find((p) => p.id === id);

const START = Date.parse("2026-10-31T04:00:00.000Z"); // Sat 12:00 AM ET
const END = Date.parse("2026-11-01T04:00:00.000Z");   // Sun 12:00 AM ET (exclusive)
const BEFORE = Date.parse("2026-10-30T20:30:00.000Z"); // Fri 4:30 PM ET (deploy day)
const DURING = Date.parse("2026-10-31T16:00:00.000Z"); // Sat noon ET
const AFTER = Date.parse("2026-11-01T14:00:00.000Z");  // Sun 9 AM ET (after DST ends too)

const ski = (quantity = 1) => ({ productId: "0008", color: "Red", size: "3-Hole", quantity });
const balaclava = (quantity = 1) => ({ productId: "0005", color: "Red", quantity });
const moto = (quantity = 1) => ({ productId: "0013", color: "Purple", quantity });
const tote = (quantity = 1) => ({ productId: "FW26-TOTE", color: "Hunter", quantity });
const P = (bp) => ({ code: "CIG10-ABCDEFGH", discountBasisPoints: bp });
const units = (priced) => priced.lineItems.map((l) => l.price_data.unit_amount);

const SALE = { "0008": [30, 24], "0005": [25, 20], "0013": [15, 12] };

test("the three masks carry the sale prices and the Saturday ET window; nothing else is on sale", () => {
  for (const [id, [price, sale]] of Object.entries(SALE)) {
    const p = product(id);
    assert.equal(p.price, price, id);
    assert.equal(p.salePrice, sale, id);
    assert.equal(Date.parse(p.saleStart), START, id);
    assert.equal(Date.parse(p.saleEnd), END, id);
    // Exactly 20% off = BG's cap, and above wholesale.
    assert.equal(Math.round(price * (1 - MASK_PROMO_MAX_DISCOUNT) * 100), Math.round(sale * 100), id);
    assert.ok(sale > MASK_PROMO_PRICE_FLOOR_USD[id], id);
  }
  // The window is midnight to midnight Eastern on Oct 31 (EDT, UTC-4).
  assert.equal(new Date(START).toLocaleString("en-US", { timeZone: "America/New_York" }), "10/31/2026, 12:00:00 AM");
  assert.equal(new Date(END - 1).toLocaleString("en-US", { timeZone: "America/New_York" }), "10/31/2026, 11:59:59 PM");
  const others = PRODUCTS.filter((p) => !SALE[p.id] && p.salePrice != null);
  assert.deepEqual(others.map((p) => p.id), []);
});

test("saleActive: off before 12:00 AM ET, on through 11:59:59.999 PM ET, off at midnight", () => {
  const p = product("0005");
  assert.equal(saleActive(p, START - 1), false);
  assert.equal(saleActive(p, START), true);
  assert.equal(saleActive(p, END - 1), true);
  assert.equal(saleActive(p, END), false);
  assert.equal(activeSalePrice(p, BEFORE), null);
  assert.equal(activeSalePrice(p, DURING), 20);
  assert.equal(activeSalePrice(p, AFTER), null);
  assert.equal(saleBlocksPromo(p, DURING), true);
  assert.equal(saleBlocksPromo(p, AFTER), false);
  // Fail safe: an unreadable time means full price; no window = always on (older rule).
  assert.equal(saleActive({ salePrice: 5, saleStart: "nope" }, DURING), false);
  assert.equal(saleActive({ salePrice: 5 }, DURING), true);
  assert.equal(saleBlocksPromo({ salePrice: 5 }, DURING), false);
  assert.equal(saleActive({ salePrice: null, saleStart: "2026-10-31T04:00:00Z" }, DURING), false);
});

test("server: full price before, sale price during, full price after", () => {
  const cart = [ski(), balaclava(), moto(), tote()];
  assert.deepEqual(units(priceCartForStripe(cart, null, undefined, { now: BEFORE })), [3000, 2500, 1500, 3500]);
  assert.deepEqual(units(priceCartForStripe(cart, null, undefined, { now: DURING })), [2400, 2000, 1200, 3500]);
  assert.deepEqual(units(priceCartForStripe(cart, null, undefined, { now: END - 1 })), [2400, 2000, 1200, 3500]);
  assert.deepEqual(units(priceCartForStripe(cart, null, undefined, { now: END })), [3000, 2500, 1500, 3500]);
  assert.deepEqual(units(priceCartForStripe(cart, null, undefined, { now: AFTER })), [3000, 2500, 1500, 3500]);
  // The sale is the price, not a discount line: discountCents stays 0.
  const during = priceCartForStripe(cart, null, undefined, { now: DURING });
  assert.equal(during.discountCents, 0);
  assert.equal(during.totalCents, 2400 + 2000 + 1200 + 3500);
});

test("no stacking: during the sale a promo or Arcade code is refused, so it isn't burned", () => {
  for (const cart of [[balaclava()], [ski(), moto()], [ski(), tote()]]) {
    assert.throws(
      () => priceCartForStripe(cart, null, P(1000), { now: DURING }),
      (error) => error instanceof PricingValidationError && error.message === SALE_NO_STACK_PROMO_MESSAGE,
    );
  }
  // FW26-only bag: still the masks-only message.
  assert.throws(() => priceCartForStripe([tote()], null, P(1000), { now: DURING }), { message: MASKS_ONLY_PROMO_MESSAGE });
  // Before and after the sale, codes work on masks as before (10% off ski = $27).
  assert.deepEqual(units(priceCartForStripe([ski(), tote()], null, P(1000), { now: BEFORE })), [2700, 3500]);
  assert.deepEqual(units(priceCartForStripe([ski(), tote()], null, P(1000), { now: AFTER })), [2700, 3500]);
  // Never below the sale price during the window, whatever the code.
  for (const bp of [1000, 2000, 9000]) {
    assert.throws(() => priceCartForStripe([ski()], null, P(bp), { now: DURING }), PricingValidationError);
  }
});

test("shipping: US $8.95 / free over $75 uses the merchandise total at sale prices; intl rates unchanged", () => {
  const usShip = (cart, now) => resolveCheckoutShipping(priceCartForStripe(cart, null, undefined, { now }), "US").shippingCents;
  // 3 ski masks: $90 full price (free) but $72 on sale (pays $8.95).
  assert.equal(usShip([ski(3)], BEFORE), 0);
  assert.equal(usShip([ski(3)], DURING), 895);
  // 4 ski masks on sale: $96 > $75, free.
  assert.equal(usShip([ski(4)], DURING), 0);
  // 1 balaclava: $8.95 either way.
  assert.equal(usShip([balaclava()], BEFORE), 895);
  assert.equal(usShip([balaclava()], DURING), 895);
  // International mask rates don't change with the sale (Korea $30, Canada $25).
  for (const [country, cents] of [["KR", 3000], ["CA", 2500]]) {
    for (const now of [BEFORE, DURING, AFTER]) {
      const pricing = priceCartForStripe([balaclava()], null, undefined, { now });
      assert.equal(resolveCheckoutShipping(pricing, country).shippingCents, cents, `${country} ${now}`);
    }
  }
});

function stripeStub() {
  const requests = [];
  return {
    requests,
    factory: () => ({ checkout: { sessions: { create: async (r) => { requests.push(r); return { url: "https://checkout.stripe.test/s" }; } } } }),
  };
}

async function stripeCheckout(now, extra = {}) {
  const stripe = stripeStub();
  const handler = createStripeSession({
    environment: { STRIPE_SECRET_KEY: "sk_test_x", SITE_URL: "https://cigcompany.com" },
    stripeFactory: stripe.factory,
    stockStoreFactory: () => ({ getStock: async () => [{ product_id: "0005", color: "Red", size: "", quantity: 50 }] }),
    promoResolver: async ({ promoCode }) => (promoCode ? P(1000) : null),
    logger: quiet,
    now: () => now,
  });
  const body = JSON.stringify({
    items: [balaclava()],
    shipCountry: "US",
    customer: { email: "buyer@example.com" },
    ...extra,
  });
  const response = await handler({ httpMethod: "POST", headers: {}, body });
  return { response, requests: stripe.requests };
}

test("Stripe checkout session: $25 before, $20 during, $25 after; a code during the sale makes no session", async () => {
  for (const [now, cents] of [[BEFORE, 2500], [DURING, 2000], [AFTER, 2500]]) {
    const { response, requests } = await stripeCheckout(now);
    assert.equal(response.statusCode, 200, String(now));
    assert.equal(requests[0].line_items[0].price_data.unit_amount, cents, String(now));
  }
  const stacked = await stripeCheckout(DURING, { promoCode: "CIG10-ABCDEFGH" });
  assert.equal(stacked.response.statusCode, 400);
  assert.match(JSON.parse(stacked.response.body).error, /don't stack/);
  assert.equal(stacked.requests.length, 0);
});

test("PayPal order: sale price only inside the window", async () => {
  for (const [now, value] of [[BEFORE, "25.00"], [DURING, "20.00"], [AFTER, "25.00"]]) {
    let sent;
    const handler = createPayPalOrder({
      environment: { PAYPAL_CLIENT_ID: "x", PAYPAL_SECRET: "y", SITE_URL: "https://cigcompany.com" },
      paypalFactory: () => ({ createOrder: async (order) => { sent = order; return { links: [{ rel: "approve", href: "https://paypal.test/a" }] }; } }),
      stockStoreFactory: () => ({ getStock: async () => [{ product_id: "0005", color: "Red", size: "", quantity: 50 }] }),
      logger: quiet,
      now: () => now,
    });
    const body = JSON.stringify({ cart: [{ productId: "0005", color: "Red", qty: 1 }], shipCountry: "US", customer: { email: "b@example.com", name: "B" } });
    const response = await handler({ httpMethod: "POST", headers: {}, body });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(sent.purchase_units[0].items[0].unit_amount.value, value, String(now));
  }
});

// Storefront: products.js, promo.js, shipping-rates.js, cart.js and app.js
// loaded like the browser does, with the page clock pinned via Date.now.
function loadStorefront(now, storedCart = null) {
  const store = new Map(storedCart ? [["cig_co_cart_v1", JSON.stringify(storedCart)]] : []);
  const node = () => ({ addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, style: {}, querySelectorAll: () => [], setAttribute() {}, appendChild() {} });
  const grid = { ...node(), innerHTML: "" };
  const context = vm.createContext({
    console: quiet,
    setTimeout: () => 0,
    clearTimeout() {},
    URL,
    URLSearchParams,
    localStorage: { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
    document: { getElementById: (id) => (id === "product-grid" ? grid : null), querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, createElement: node, body: node() },
    window: { location: { href: "https://cigcompany.com/", search: "", hash: "", pathname: "/" }, addEventListener() {}, history: { replaceState() {} } },
    module: { exports: {} },
  });
  vm.runInContext(`Date.now = () => ${now};`, context);
  for (const file of ["products.js", "promo.js", "shipping-rates.js", "cart.js", "app.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }
  vm.runInContext("renderProductGrid()", context);
  return { context, grid, run: (code) => vm.runInContext(code, context) };
}

function cardHtml(grid, id) {
  const start = grid.innerHTML.indexOf(`data-id="${id}"`);
  assert.ok(start >= 0, id);
  const next = grid.innerHTML.indexOf('class="product-card ', start);
  return grid.innerHTML.slice(start, next < 0 ? undefined : next);
}

test("storefront before the sale: full prices, no strikethrough", () => {
  const { grid, run } = loadStorefront(BEFORE);
  for (const [id, [price]] of Object.entries(SALE)) {
    const card = cardHtml(grid, id);
    assert.doesNotMatch(card, /price-strike/, id);
    assert.match(card, new RegExp(`\\$${price}\\.00`), id);
    assert.equal(run(`currentPrice(PRODUCTS.find((p) => p.id === "${id}"), null, null, null)`), price, id);
  }
  assert.doesNotMatch(grid.innerHTML, /price-strike/);
});

test("storefront during the sale: struck-through regular price and the sale price", () => {
  const { grid, run } = loadStorefront(DURING);
  for (const [id, [price, sale]] of Object.entries(SALE)) {
    const card = cardHtml(grid, id);
    assert.match(card, new RegExp(`<span class="price-strike">\\$${price}\\.00</span><span class="price-sale">\\$${sale}\\.00</span>`), id);
    assert.equal(run(`currentPrice(PRODUCTS.find((p) => p.id === "${id}"), null, null, null)`), sale, id);
  }
  // Only the masks are struck through.
  assert.equal((grid.innerHTML.match(/price-strike/g) || []).length, 3);
});

test("storefront after the sale: back to full price", () => {
  const { grid } = loadStorefront(AFTER);
  assert.doesNotMatch(grid.innerHTML, /price-strike/);
  assert.match(cardHtml(grid, "0005"), /\$25\.00/);
});

test("saved bag reprices across the window edges and the checkout total matches the server", () => {
  const bag = [
    { productId: "0005", name: "CIG Balaclava", price: 20, color: "Red", size: null, style: null, qty: 1 },
    { productId: "0008", name: "CIG Ski Mask", price: 30, color: "Red", size: "3-Hole", style: null, qty: 3 },
  ];
  const during = loadStorefront(DURING, bag).run("getCart().map((i) => i.price)");
  assert.deepEqual([...during], [20, 24]);
  const after = loadStorefront(AFTER, bag).run("getCart().map((i) => i.price)");
  assert.deepEqual([...after], [25, 30]);

  const server = priceCartForStripe([balaclava(1), ski(3)], null, undefined, { now: DURING }).totalCents;
  const site = loadStorefront(DURING, bag).run("cartMerchandiseCents(getCart(), null)");
  assert.equal(site, server);
  // A code shown on the site during the sale takes nothing off the sale masks (no stacking).
  const withCode = loadStorefront(DURING, bag).run("cartMerchandiseCents(getCart(), { discount: 0.1 })");
  assert.equal(withCode, server);
  // Before the sale, the same code takes 10% off the masks, as the server does.
  const beforeServer = priceCartForStripe([balaclava(1), ski(3)], null, P(1000), { now: BEFORE }).totalCents;
  assert.equal(loadStorefront(BEFORE, bag).run("cartMerchandiseCents(getCart(), { discount: 0.1 })"), beforeServer);
});
