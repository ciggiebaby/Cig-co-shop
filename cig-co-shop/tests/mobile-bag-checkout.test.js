// Mobile bag + checkout fixes (11/3):
//  1. Tapping Checkout in the bag closes the bag before opening the checkout
//     form (the full-width drawer used to sit on top of it on phones).
//  2. The drawer fits the visible screen on iOS Safari (100dvh + safe area).
//  3. The bag shows US shipping (from shipping-rates.js) and a total.
//  4. A MagSafe Case without a Crossbody gets a one-tap switch to the existing
//     $99 FW26-BUNDLE, solid Crossbody colors only: never the Multi colorway.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const catalog = require("../products.js");
const shipping = require("../shipping-rates.js");
const { priceCartForStripe } = require("../netlify/lib/stripe-pricing.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const PAGES = ["index.html", "gallery.html", "arcade.html", "faq.html", "shipping-returns.html"];
const plain = (v) => JSON.parse(JSON.stringify(v));

function fakeEl() {
  return {
    hidden: true, textContent: "", innerHTML: "", listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    classList: { add() {}, remove() {} },
  };
}

// cart.js in a sandbox with a tiny DOM. withShipping: load shipping-rates.js.
function loadCart({ items = [], products = catalog.PRODUCTS, withShipping = true, quoteShipping } = {}) {
  const store = new Map([["cig_co_cart_v1", JSON.stringify(items)]]);
  const els = {};
  const ids = ["cart-count", "cart-items", "cart-subtotal-amount", "cart-shipping-row", "cart-shipping-amount",
    "cart-total-row", "cart-total-amount", "cart-ship-note", "cart-bundle-offer", "cart-drawer", "cart-backdrop"];
  ids.forEach((id) => { els[id] = fakeEl(); });
  const tracked = [];
  const ctx = {
    PRODUCTS: products,
    localStorage: { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v) },
    document: { getElementById: (id) => els[id] || null },
    cigTrack: (event, productId) => tracked.push([event, productId]),
  };
  if (withShipping) ctx.quoteShipping = quoteShipping || shipping.quoteShipping;
  vm.createContext(ctx);
  vm.runInContext(read("cart.js"), ctx);
  return {
    els, tracked,
    run: (code) => vm.runInContext(code, ctx),
    cart: () => JSON.parse(store.get("cig_co_cart_v1")),
  };
}

const caseLine = (extra = {}) => ({ productId: "FW26-CASE", sku: "FW26-CASE", name: "MagSafe Case", price: 40, image: "x.jpg", color: "Burgundy", size: "iPhone 16 Pro", qty: 1, ...extra });
const bag = catalog.PRODUCTS.find((p) => p.id === "FW26-BAG");
const pcCase = catalog.PRODUCTS.find((p) => p.id === "FW26-CASE");
const bundle = catalog.PRODUCTS.find((p) => p.id === "FW26-BUNDLE");

test("Checkout closes the bag before opening the checkout form; checkout_start still tracked", () => {
  const app = read("app.js");
  const start = app.indexOf('checkoutBtn.addEventListener("click"');
  const handler = app.slice(start, app.indexOf("});", start));
  const track = handler.indexOf('trackSiteEvent("checkout_start")');
  const close = handler.indexOf("closeCart();");
  const open = handler.indexOf('setAttribute("aria-hidden", "false")');
  assert.ok(track > 0 && close > 0 && open > 0, "handler tracks, closes the bag and opens the form");
  assert.ok(track < open && close < open, "bag closes before the form opens");
});

test("checkout form stacks above the bag drawer", () => {
  const css = read("styles.css");
  const z = (selector) => Number(css.match(new RegExp(`\\n${selector.replace(".", "\\.")} \\{[^}]*?z-index:\\s*(\\d+)`))[1]);
  assert.ok(z(".modal") > z(".cart-drawer"), `.modal ${z(".modal")} > .cart-drawer ${z(".cart-drawer")}`);
});

test("drawer fits the visible screen on iOS Safari: 100vh fallback, then 100dvh, safe-area padding", () => {
  const css = read("styles.css");
  const drawer = css.match(/\n\.cart-drawer \{([^}]*)\}/)[1];
  assert.ok(drawer.indexOf("height: 100vh") >= 0 && drawer.indexOf("height: 100dvh") > drawer.indexOf("height: 100vh"));
  assert.match(css, /\.cart-footer \{[^}]*padding-bottom: calc\(20px \+ env\(safe-area-inset-bottom/);
  for (const page of PAGES) {
    const html = read(page);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" \/>/, page);
    for (const id of ["cart-shipping-row", "cart-shipping-amount", "cart-total-row", "cart-total-amount", "cart-bundle-offer"]) {
      assert.ok(html.includes(`id="${id}"`), `${page} has #${id}`);
    }
  }
});

test("bag shows US shipping from shipping-rates.js and a total (FW26 and masks are free in the US)", () => {
  const mask = catalog.PRODUCTS.find((p) => p.liveStock);
  for (const items of [[caseLine()], [{ productId: mask.id, name: mask.name, price: 30, color: mask.colors[0], qty: 2 }]]) {
    const c = loadCart({ items });
    c.run("renderCart()");
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    assert.equal(c.els["cart-shipping-amount"].textContent, "Free (US)");
    assert.equal(c.els["cart-total-amount"].textContent, `$${subtotal.toFixed(2)}`);
    assert.equal(c.els["cart-shipping-row"].hidden, false);
    assert.equal(c.els["cart-total-row"].hidden, false);
    assert.equal(c.els["cart-ship-note"].hidden, false);
  }
});

test("the bag's shipping figure is whatever shipping-rates.js quotes for the US (not hardcoded)", () => {
  const seen = [];
  const c = loadCart({ items: [caseLine()], quoteShipping: (lines, country) => { seen.push(country); return { shippingCents: 895 }; } });
  c.run("renderCart()");
  assert.deepEqual(seen, ["US"]);
  assert.equal(c.els["cart-shipping-amount"].textContent, "$8.95 (US)");
  assert.equal(c.els["cart-total-amount"].textContent, "$48.95");
});

test("without shipping-rates.js (gallery/arcade) or with an empty bag the extra lines stay hidden", () => {
  const c = loadCart({ items: [caseLine()], withShipping: false });
  c.run("renderCart()");
  assert.equal(c.els["cart-shipping-row"].hidden, true);
  assert.equal(c.els["cart-total-row"].hidden, true);
  const empty = loadCart({ items: [] });
  empty.run("renderCart()");
  assert.equal(empty.els["cart-total-row"].hidden, true);
  assert.equal(empty.els["cart-bundle-offer"].hidden, true);
});

test("MagSafe Case alone: one-tap switch to the $99 bundle, savings from catalog prices", () => {
  const c = loadCart({ items: [caseLine()] });
  const offer = plain(c.run("bundleOffer(getCart())"));
  assert.equal(offer.bundle.id, "FW26-BUNDLE");
  assert.equal(offer.extra, bundle.price - pcCase.price);
  assert.equal(offer.savings, bag.price + pcCase.price - bundle.price);
  assert.equal(offer.crossbodyColor, "Navy");
  c.run("renderCart()");
  const html = c.els["cart-bundle-offer"].innerHTML;
  assert.equal(c.els["cart-bundle-offer"].hidden, false);
  assert.match(html, new RegExp(`for \\$${bundle.price - pcCase.price} more`));
  assert.match(html, new RegExp(`save \\$${bag.price + pcCase.price - bundle.price}`));
  assert.match(html, /Burgundy case for iPhone 16 Pro/);

  assert.equal(c.run('switchCaseToBundle(bundleOffer(getCart()).caseKey, "Black")'), true);
  const cart = c.cart();
  assert.equal(cart.length, 1);
  assert.deepEqual(
    { productId: cart[0].productId, color: cart[0].color, style: cart[0].style, size: cart[0].size, price: cart[0].price, qty: cart[0].qty },
    { productId: "FW26-BUNDLE", color: "Black", style: "Burgundy", size: "iPhone 16 Pro", price: bundle.price, qty: 1 },
  );
  assert.deepEqual(c.tracked.at(-1), ["add_to_bag", "FW26-BUNDLE"]);
  // The server prices the new line as the bundle.
  const priced = priceCartForStripe([{ productId: "FW26-BUNDLE", color: "Black", style: "Burgundy", size: "iPhone 16 Pro", quantity: 1 }]);
  assert.equal(priced.lineItems[0].price_data.unit_amount, bundle.price * 100);
  // Offer is gone once the bundle is in the bag.
  c.run("renderCart()");
  assert.equal(c.els["cart-bundle-offer"].hidden, true);
});

test("two cases: switching takes one, the other stays", () => {
  const c = loadCart({ items: [caseLine({ qty: 2 })] });
  c.run('switchCaseToBundle(bundleOffer(getCart()).caseKey, "Navy")');
  const cart = c.cart();
  assert.deepEqual(cart.map((i) => [i.productId, i.qty]), [["FW26-CASE", 1], ["FW26-BUNDLE", 1]]);
});

test("no offer when a Crossbody or the bundle is already in the bag, or no case", () => {
  for (const other of [
    { productId: "FW26-BAG", name: "Crossbody Bag", price: 65, color: "Navy", qty: 1 },
    { productId: "FW26-BAG", name: "Crossbody Bag", price: 75, color: "Multi", qty: 1 },
    { productId: "FW26-BUNDLE", name: bundle.name, price: 99, color: "Navy", style: "Black", size: "iPhone 15", qty: 1 },
  ]) {
    const c = loadCart({ items: [caseLine(), other] });
    assert.equal(c.run("bundleOffer(getCart())"), null, other.color);
  }
  const masksOnly = loadCart({ items: [{ productId: "0005", name: "m", price: 30, color: catalog.PRODUCTS.find((p) => p.id === "0005").colors[0], qty: 1 }] });
  assert.equal(masksOnly.run("bundleOffer(getCart())"), null);
});

test("the bundle offer never shows or uses the Multi Crossbody", () => {
  assert.ok(bag.colors.includes("Multi"), "Multi still exists on the Crossbody itself");
  const c = loadCart({ items: [caseLine()] });
  const offer = plain(c.run("bundleOffer(getCart())"));
  assert.ok(!offer.colors.includes("Multi"));
  assert.ok(offer.colors.length > 0 && offer.colors.every((col) => bundle.colors.includes(col)));
  c.run("renderCart()");
  assert.doesNotMatch(c.els["cart-bundle-offer"].innerHTML, /Multi/i);
  // Asking for Multi directly does nothing.
  assert.equal(c.run('switchCaseToBundle(bundleOffer(getCart()).caseKey, "Multi")'), false);
  assert.deepEqual(c.cart().map((i) => i.productId), ["FW26-CASE"]);

  // Even if Multi slipped into the bundle's colors (or became its default), the offer drops it.
  const tampered = catalog.PRODUCTS.map((p) => (p.id === "FW26-BUNDLE" ? { ...p, colors: ["Multi", ...p.colors], defaultColor: "Multi" } : p));
  const t = loadCart({ items: [caseLine()], products: tampered });
  const tOffer = plain(t.run("bundleOffer(getCart())"));
  assert.ok(!tOffer.colors.includes("Multi"));
  assert.notEqual(tOffer.crossbodyColor, "Multi");
  t.run("renderCart()");
  assert.doesNotMatch(t.els["cart-bundle-offer"].innerHTML, /Multi/i);
  assert.equal(t.run('switchCaseToBundle(bundleOffer(getCart()).caseKey, "Multi")'), false);
  t.run('switchCaseToBundle(bundleOffer(getCart()).caseKey, bundleOffer(getCart()).crossbodyColor)');
  assert.ok(t.cart().every((i) => i.color !== "Multi"));
});

const bagLine = (extra = {}) => ({ productId: "FW26-BAG", sku: "FW26-BAG", name: "Crossbody Bag", price: 65, image: "x.jpg", color: "Navy", size: null, style: null, qty: 1, ...extra });

test("Crossbody without a MagSafe case: one-tap switch to the $99 bundle", () => {
  const c = loadCart({ items: [bagLine()] });
  const offer = plain(c.run("bagBundleOffer(getCart())"));
  assert.equal(c.run("bundleOffer(getCart())"), null);
  assert.equal(offer.kind, "bag");
  assert.equal(offer.bundle.id, "FW26-BUNDLE");
  assert.equal(offer.extra, bundle.price - bag.price);
  assert.equal(offer.savings, bag.price + pcCase.price - bundle.price);
  assert.equal(offer.caseColor, "Burgundy");
  assert.equal(offer.phone, "iPhone 16 Pro");
  assert.ok(!offer.caseColors.includes("Multi"));
  c.run("renderCart()");
  const html = c.els["cart-bundle-offer"].innerHTML;
  assert.equal(c.els["cart-bundle-offer"].hidden, false);
  assert.match(html, /Add the MagSafe Case for \$34 more/);
  assert.match(html, /save \$6/);
  assert.match(html, /Keeps your Navy Crossbody/);
  assert.match(html, /Switch to bundle/);
  assert.doesNotMatch(html, /Multi/);
  assert.deepEqual(c.tracked[0], ["bag_upsell_shown", "FW26-BUNDLE"]);

  assert.equal(c.run('switchBagToBundle(bagBundleOffer(getCart()).lineKey, "Gold", "iPhone 15")'), true);
  const cart = c.cart();
  assert.equal(cart.length, 1);
  assert.deepEqual(
    { productId: cart[0].productId, color: cart[0].color, style: cart[0].style, size: cart[0].size, price: cart[0].price, qty: cart[0].qty },
    { productId: "FW26-BUNDLE", color: "Navy", style: "Gold", size: "iPhone 15", price: bundle.price, qty: 1 },
  );
  assert.deepEqual(c.tracked.at(-2), ["bag_upsell_accepted", "FW26-BUNDLE"]);
  assert.deepEqual(c.tracked.at(-1), ["add_to_bag", "FW26-BUNDLE"]);
  const priced = priceCartForStripe([{ productId: "FW26-BUNDLE", color: "Navy", style: "Gold", size: "iPhone 15", quantity: 1 }]);
  assert.equal(priced.lineItems[0].price_data.unit_amount, bundle.price * 100);
  c.run("renderCart()");
  assert.equal(c.els["cart-bundle-offer"].hidden, true);
});

test("two Crossbodies: the upsell takes one; Multi and a case already in the bag get no offer", () => {
  const two = loadCart({ items: [bagLine({ qty: 2 })] });
  two.run('switchBagToBundle(bagBundleOffer(getCart()).lineKey, "Burgundy", "iPhone 16 Pro")');
  assert.deepEqual(two.cart().map((i) => [i.productId, i.qty]), [["FW26-BAG", 1], ["FW26-BUNDLE", 1]]);

  const multi = loadCart({ items: [bagLine({ color: "Multi", price: 75 })] });
  assert.equal(multi.run("bagBundleOffer(getCart())"), null);
  multi.run("renderCart()");
  assert.equal(multi.els["cart-bundle-offer"].hidden, true);

  const withCase = loadCart({ items: [bagLine(), caseLine()] });
  assert.equal(withCase.run("bagBundleOffer(getCart())"), null);
  assert.equal(withCase.run("bundleOffer(getCart())"), null);
  withCase.run("renderCart()");
  assert.equal(withCase.els["cart-bundle-offer"].hidden, true);

  assert.equal(loadCart({ items: [bagLine()] }).run('switchBagToBundle(bagBundleOffer(getCart()).lineKey, "Multi", "iPhone 16 Pro")'), false);
  assert.equal(loadCart({ items: [bagLine()] }).run('switchBagToBundle(bagBundleOffer(getCart()).lineKey, "Burgundy", "Galaxy")'), false);
});

test("card and PayPal checkout asks for an email, and the street address is crypto-only", () => {
  for (const page of ["index.html", "faq.html", "shipping-returns.html"]) {
    const html = read(page);
    const fieldsStart = html.indexOf('class="checkout-fields"');
    const pay = html.indexOf("Choose payment method", fieldsStart);
    const fields = html.slice(fieldsStart, pay);
    assert.match(fields, /id="checkout-email"/, page);
    assert.match(fields, /id="checkout-intl-toggle"/, page);
    assert.match(fields, /Shipping outside the US\?/, page);
    assert.match(fields, /collect your shipping address on the next page/, page);
    const addressAt = fields.indexOf('id="checkout-address"');
    const cryptoAt = fields.lastIndexOf("data-crypto-only", addressAt);
    assert.ok(cryptoAt > 0 && cryptoAt < addressAt, `${page} address stays in the crypto block`);
    assert.doesNotMatch(fields.slice(0, cryptoAt), /id="checkout-name"|id="checkout-address"|id="checkout-city"/, page);
  }
});
