// Shareable product links (?product=<id>&color=..&size=..) and schema.org
// Product JSON-LD so Google can read each product's price (CIG 10/30:
// Google Merchant Center listings link straight to the product pop-up).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { PRODUCTS, activeSalePrice } = require("../products.js");
const links = require("../product-links.js");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const visible = PRODUCTS.filter((p) => !p.hidden);
const clone = (x) => JSON.parse(JSON.stringify(x));

function fnSource(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `app.js defines ${name}`);
  return app.slice(start, app.indexOf("\n}\n", start) + 2);
}

// app.js pricing/stock/image helpers, with a settable clock for sale days.
function appContext(nowMs, extra = {}) {
  const ctx = {
    PRODUCTS: extra.products || PRODUCTS,
    activeSalePrice,
    URL, URLSearchParams,
    Date: { now: () => nowMs, parse: Date.parse },
    ...links,
    ...extra,
  };
  const names = ["styleObj", "optionPriceFor", "salePriceNow", "currentPrice", "componentVariantStock", "variantStock",
    "productImageForColor", "structuredDataHelpers", "setJsonLd", "syncProductView", "openProductFromLink", "closeModal"];
  vm.runInNewContext(
    names.map(fnSource).join("\n") +
      "\nlet openProductId = null; let modalState = { style: null, color: null, size: null };" +
      "\nthis.api = { structuredDataHelpers, syncProductView, openProductFromLink, closeModal," +
      " setOpen: (id, ms) => { openProductId = id; modalState = ms; }, getOpen: () => openProductId };",
    ctx,
  );
  return ctx;
}
const SALE_DAY = Date.parse("2026-10-31T15:00:00-04:00");
const NORMAL_DAY = Date.parse("2026-11-02T15:00:00-05:00");

// ---------- Parsing links ----------
test("a product link opens that product with its color and size", () => {
  assert.deepEqual(links.parseProductLink("?product=0008&color=Red&size=1-Hole", PRODUCTS),
    { id: "0008", color: "Red", size: "1-Hole", style: null });
  assert.deepEqual(links.parseProductLink("https://cigcompany.com/?product=FW26-CASE&color=Burnt+Orange&size=iPhone+16+Pro", PRODUCTS),
    { id: "FW26-CASE", color: "Burnt Orange", size: "iPhone 16 Pro", style: null });
  // Case doesn't matter; the option comes back spelled the products.js way.
  assert.deepEqual(links.parseProductLink("?product=fw26-sleeve&color=GOLD&size=15%E2%80%B3", PRODUCTS),
    { id: "FW26-SLEEVE", color: "Gold", size: "15″", style: null });
  assert.deepEqual(links.parseProductLink("?product=0004&style=Bonnet&color=Pink", PRODUCTS),
    { id: "0004", color: "Pink", size: null, style: "Bonnet" });
});

test("bad links fall back: unknown/hidden product = grid, bad option = product default", () => {
  for (const bad of ["", "?", "?product=", "?product=NOPE", "?product=0010", "?product=0012", "?color=Red", "?product=%E0%A4%A", "not a url at all"]) {
    assert.equal(links.parseProductLink(bad, PRODUCTS), null, bad);
  }
  assert.equal(links.parseProductLink("?product=0008", null), null);
  assert.deepEqual(links.parseProductLink("?product=0008&color=Plaid&size=XXL&style=Set", PRODUCTS),
    { id: "0008", color: null, size: null, style: null });
  assert.deepEqual(links.parseProductLink("?product=0013&size=1-Hole", PRODUCTS),
    { id: "0013", color: null, size: null, style: null });
});

test("every visible variant's link round-trips to the same pick (feed links included)", () => {
  let n = 0;
  for (const p of visible) {
    for (const sel of links.productVariants(p)) {
      const url = links.productLinkUrl({ id: p.id, ...sel });
      assert.ok(url.startsWith("https://cigcompany.com/?product="), url);
      assert.deepEqual(links.parseProductLink(url, PRODUCTS), { id: p.id, ...sel }, url);
      n++;
    }
  }
  assert.ok(n > 200);
});

test("the address bar keeps other params and the #hash, and closing removes the product", () => {
  const sel = { id: "0008", color: "Red", size: "3-Hole" };
  assert.equal(links.urlWithProductView("https://cigcompany.com/?utm_source=google#shop", sel),
    "/?product=0008&color=Red&size=3-Hole&utm_source=google#shop");
  assert.equal(links.urlWithProductView("https://cigcompany.com/?product=0008&color=Red&size=3-Hole&utm_source=google#shop", null),
    "/?utm_source=google#shop");
  assert.equal(links.urlWithProductView("https://cigcompany.com/?product=0005&color=Gold", null), "/");
  // Switching products drops the old product's options.
  assert.equal(links.urlWithProductView("https://cigcompany.com/?product=0008&size=Skully", { id: "0013", color: "Purple" }),
    "/?product=0013&color=Purple");
});

// ---------- JSON-LD ----------
test("the open product's JSON-LD has name, image, brand, sku and an offer with today's price", () => {
  const ctx = appContext(NORMAL_DAY);
  const helpers = ctx.api.structuredDataHelpers();
  const ski = PRODUCTS.find((p) => p.id === "0008");
  const ld = links.productJsonLd(ski, { color: "Red", size: "1-Hole" }, helpers);
  assert.equal(ld["@context"], "https://schema.org");
  assert.equal(ld["@type"], "Product");
  assert.equal(ld.name, "CIG Ski Mask (Red / 1-Hole)");
  assert.equal(ld.image, "https://cigcompany.com/assets/products/skimask-red-1hole.jpg");
  assert.equal(ld.sku, "0008");
  assert.deepEqual(ld.brand, { "@type": "Brand", name: "Cig & Co." });
  assert.ok(ld.description);
  assert.deepEqual(ld.offers, {
    "@type": "Offer",
    url: "https://cigcompany.com/?product=0008&color=Red&size=1-Hole",
    price: "30.00",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    itemCondition: "https://schema.org/NewCondition",
  });
  const skully = links.productJsonLd(ski, { color: "Red", size: "Skully" }, helpers);
  assert.equal(skully.offers.availability, "https://schema.org/OutOfStock");
  const black = links.productJsonLd(PRODUCTS.find((p) => p.id === "0005"), { color: "Black" }, helpers);
  assert.equal(black.offers.availability, "https://schema.org/OutOfStock");
  // Per-size/per-color prices and made-to-order stock.
  const pillow = links.productJsonLd(PRODUCTS.find((p) => p.id === "FW26-PILLOW"), { color: "Gold", size: "22″×22″" }, helpers);
  assert.equal(pillow.offers.price, "58.00");
  assert.equal(pillow.offers.availability, "https://schema.org/InStock");
  assert.equal(links.productJsonLd(PRODUCTS.find((p) => p.id === "FW26-BAG"), { color: "Multi" }, helpers).offers.price, "75.00");
});

test("on the Halloween sale day the JSON-LD price is the sale price, and full price after", () => {
  const masks = { "0008": ["30.00", "24.00"], "0005": ["25.00", "20.00"], "0013": ["15.00", "12.00"] };
  for (const [id, [full, sale]] of Object.entries(masks)) {
    const p = PRODUCTS.find((x) => x.id === id);
    const sel = { color: p.colors[0], size: p.sizes[0] || null };
    assert.equal(links.productJsonLd(p, sel, appContext(SALE_DAY).api.structuredDataHelpers()).offers.price, sale, id);
    assert.equal(links.productJsonLd(p, sel, appContext(NORMAL_DAY).api.structuredDataHelpers()).offers.price, full, id);
  }
  // FW26 isn't on sale.
  const tote = PRODUCTS.find((p) => p.id === "FW26-TOTE");
  assert.equal(links.productJsonLd(tote, { color: "Gold" }, appContext(SALE_DAY).api.structuredDataHelpers()).offers.price, "35.00");
});

test("the homepage catalog JSON-LD covers every visible product and variant, never hidden ones", () => {
  const ld = links.catalogJsonLd(PRODUCTS, appContext(NORMAL_DAY).api.structuredDataHelpers());
  const ids = ld["@graph"].map((g) => g.productGroupID);
  assert.deepEqual(ids, visible.map((p) => p.id));
  for (const g of ld["@graph"]) {
    const p = PRODUCTS.find((x) => x.id === g.productGroupID);
    assert.equal(g["@type"], "ProductGroup");
    assert.equal(g.hasVariant.length, links.productVariants(p).length, p.id);
    for (const v of g.hasVariant) {
      assert.equal(v["@type"], "Product");
      assert.equal(v["@context"], undefined);
      assert.match(v.offers.price, /^\d+\.\d\d$/);
      assert.equal(v.offers.priceCurrency, "USD");
      assert.match(v.image, /^https:\/\/cigcompany\.com\//);
    }
  }
  assert.equal(ld["@graph"].find((g) => g.productGroupID === "FW26-CASE").hasVariant.length, 144);
});

test("JSON-LD text can't break out of its <script> tag", () => {
  const text = links.jsonLdText({ name: "</script><script>alert(1)</script>" });
  assert.ok(!text.includes("<"));
  assert.equal(JSON.parse(text).name, "</script><script>alert(1)</script>");
});

// ---------- Wiring in app.js ----------
function fakePage(href) {
  const head = { children: [], appendChild(el) { el.parentNode = head; this.children.push(el); } };
  head.removeChild = (el) => { head.children = head.children.filter((c) => c !== el); };
  const document = {
    head,
    getElementById: (id) => head.children.find((c) => c.id === id) || null,
    createElement: () => ({ type: "", id: "", textContent: "" }),
  };
  const url = new URL(href);
  const location = { get href() { return url.href; }, get pathname() { return url.pathname; }, get search() { return url.search; }, get hash() { return url.hash; } };
  const calls = [];
  const history = {
    state: null,
    replaceState(state, _t, next) { calls.push(next); const n = new URL(next, url.href); url.search = n.search; url.hash = n.hash; },
  };
  return { document, window: { location, history }, calls, url };
}

test("page load with a product link opens that pop-up; a bad link stays on the grid and drops the params", () => {
  const opened = [];
  const page = fakePage("https://cigcompany.com/?product=fw26-case&color=navy&size=iPhone+15&utm_source=google");
  const ctx = appContext(NORMAL_DAY, {
    ...page,
    openProductModal: (id, pick) => { opened.push([id, pick]); return true; },
  });
  assert.equal(ctx.api.openProductFromLink(), true);
  assert.deepEqual(opened, [["FW26-CASE", { id: "FW26-CASE", color: "Navy", size: "iPhone 15", style: null }]]);

  const bad = fakePage("https://cigcompany.com/?product=0010&color=Blue&utm_source=x#shop");
  const ctx2 = appContext(NORMAL_DAY, { ...bad, openProductModal: () => { throw new Error("should not open"); } });
  assert.equal(ctx2.api.openProductFromLink(), false);
  assert.equal(bad.url.search, "?utm_source=x");
  assert.equal(bad.url.hash, "#shop");
  assert.equal(bad.document.getElementById("product-jsonld"), null);

  // No product param: nothing happens at all.
  const plain = fakePage("https://cigcompany.com/?checkout=cancelled");
  const ctx3 = appContext(NORMAL_DAY, { ...plain, openProductModal: () => { throw new Error("no"); } });
  assert.equal(ctx3.api.openProductFromLink(), false);
  assert.deepEqual(plain.calls, []);
});

test("opening/changing a pick updates the URL and product JSON-LD; closing removes both", () => {
  const page = fakePage("https://cigcompany.com/?utm_source=ig");
  const ctx = appContext(NORMAL_DAY, { ...page });
  ctx.api.setOpen("0008", { style: null, color: "Gold", size: "3-Hole" });
  ctx.api.syncProductView();
  assert.equal(page.url.search, "?product=0008&color=Gold&size=3-Hole&utm_source=ig");
  const ld = JSON.parse(page.document.getElementById("product-jsonld").textContent);
  assert.equal(ld.offers.url, "https://cigcompany.com/?product=0008&color=Gold&size=3-Hole");
  assert.equal(ld.offers.price, "30.00");

  ctx.api.setOpen("0008", { style: null, color: "Blue", size: "1-Hole" });
  ctx.api.syncProductView();
  assert.equal(page.url.search, "?product=0008&color=Blue&size=1-Hole&utm_source=ig");
  assert.equal(page.calls.length, 2);

  ctx.api.closeModal("product-modal");
  assert.equal(ctx.api.getOpen(), null);
  assert.equal(page.url.search, "?utm_source=ig");
  assert.equal(page.document.getElementById("product-jsonld"), null);
});

test("app.js wires it up: links on load, pick changes, grid re-renders, and index.html loads the helper", () => {
  assert.match(app, /renderProductGrid\(\);\nopenProductFromLink\(\);/);
  assert.match(fnSource("renderProductGrid"), /renderCatalogJsonLd\(\);/);
  const open = fnSource("openProductModal");
  assert.match(open, /function openProductModal\(id, pick = null\)/);
  assert.match(open, /openProductId = p\.id;/);
  // The pop-up's history entry is pushed before the URL is synced, so Back
  // returns to the page without the product in it.
  assert.ok(open.indexOf("pushProductModalHistory();") < open.lastIndexOf("refreshAvailability();"));
  assert.match(open, /syncProductView\(\);/);
  assert.match(html, /<script src="products\.js"><\/script>[\s\S]*<script src="product-links\.js"><\/script>\s*<script src="app\.js"><\/script>/);
});
