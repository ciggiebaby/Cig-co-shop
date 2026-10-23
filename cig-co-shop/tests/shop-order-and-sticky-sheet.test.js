// CIG 10/23: (1) sold-out products go to the end of the shop grid, by sold-out status, so
// anything marked sold out later moves too; (2) on phones the product photo stays pinned
// at the top of the sheet while the options scroll, and still swaps on color/size taps.
// Uses the real catalog (no soldout-fixture), so the live sold-out flags apply.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { PRODUCTS } = require("../products.js");

const root = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

// Pull top-level functions out of app.js by name (each ends at the first "\n}\n").
function fnSource(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `app.js defines ${name}`);
  return app.slice(start, app.indexOf("\n}\n", start) + 2);
}
const ctx = {};
vm.runInNewContext(
  ["styleObj", "componentVariantStock", "variantStock", "colorStock", "productTotalStock", "isSoldOutForGrid", "shopGridProducts", "updateModalMediaCompact"]
    .map(fnSource).join("\n") +
    "\nconst PD_COMPACT_AT = 120; const PD_EXPAND_AT = 24;" +
    "\nthis.shopGridProducts = shopGridProducts; this.isSoldOutForGrid = isSoldOutForGrid; this.updateModalMediaCompact = updateModalMediaCompact;",
  ctx,
);
const ids = (list) => list.map((p) => p.id);
const clone = (p) => JSON.parse(JSON.stringify(p));

test("the shop grid lists in-stock products first and sold-out products last", () => {
  const order = ids(ctx.shopGridProducts(PRODUCTS));
  assert.deepEqual(order, [
    "FW26-BAG", "FW26-CASE", "FW26-SLEEVE", "FW26-PILLOW", "FW26-TOTE",
    "0005", "0008", "0013",
    "0004", "0011",
  ]);
  const firstSoldOut = order.findIndex((id) => ctx.isSoldOutForGrid(PRODUCTS.find((p) => p.id === id)));
  assert.ok(order.slice(firstSoldOut).every((id) => ctx.isSoldOutForGrid(PRODUCTS.find((p) => p.id === id))));
});

test("both groups keep their products.js order (stable)", () => {
  const visible = PRODUCTS.filter((p) => !p.hidden);
  const order = ids(ctx.shopGridProducts(PRODUCTS));
  assert.deepEqual(order.filter((id) => !ctx.isSoldOutForGrid(PRODUCTS.find((p) => p.id === id))),
    ids(visible.filter((p) => !ctx.isSoldOutForGrid(p))));
  assert.deepEqual(order.filter((id) => ctx.isSoldOutForGrid(PRODUCTS.find((p) => p.id === id))),
    ids(visible.filter((p) => ctx.isSoldOutForGrid(p))));
});

test("anything marked sold out later moves to the end on its own", () => {
  const catalog = PRODUCTS.map(clone);
  catalog.find((p) => p.id === "FW26-CASE").soldOut = true;
  // Live stock running out (every variant at 0) counts too.
  const ski = catalog.find((p) => p.id === "0008");
  for (const color of Object.keys(ski.stock)) {
    const node = ski.stock[color];
    if (typeof node === "number") ski.stock[color] = 0;
    else for (const size of Object.keys(node)) node[size] = 0;
  }
  assert.deepEqual(ids(ctx.shopGridProducts(catalog)), [
    "FW26-BAG", "FW26-SLEEVE", "FW26-PILLOW", "FW26-TOTE", "0005", "0013",
    "FW26-CASE", "0004", "0008", "0011",
  ]);
  // Back in stock -> back in its original spot.
  catalog.find((p) => p.id === "FW26-CASE").soldOut = false;
  assert.deepEqual(ids(ctx.shopGridProducts(catalog)).slice(0, 2), ["FW26-BAG", "FW26-CASE"]);
});

test("hidden products stay off the grid and coming-soon products aren't treated as sold out", () => {
  const catalog = PRODUCTS.map(clone);
  assert.ok(!ids(ctx.shopGridProducts(catalog)).includes("0010"));
  assert.ok(!ids(ctx.shopGridProducts(catalog)).includes("0012"));
  const soon = { id: "SOON", comingSoon: true, colors: ["Black"], stock: { Black: 0 } };
  assert.equal(ctx.isSoldOutForGrid(soon), false);
});

test("the grid renders through the sold-out-last order (and re-renders on live stock)", () => {
  assert.match(app, /grid\.innerHTML = shopGridProducts\(\)\.map/);
  const live = fs.readFileSync(path.join(root, "live-stock-client.js"), "utf8");
  assert.match(live, /onUpdate: \(\) => \{ if \(typeof renderProductGrid === "function"\) renderProductGrid\(\); \}/);
});

// ---------- Pinned photo on phones ----------
function mobileSheetCss() {
  const start = css.indexOf("/* ---------- Product sheet on phones: pinned photo");
  assert.ok(start >= 0);
  return css.slice(start);
}

test("product sheet wraps the carousel in a media block that every product uses", () => {
  assert.match(app, /<div class="pd-media" id="pd-media">\s*<div class="pd-carousel" id="pd-carousel"><\/div>\s*<\/div>/);
  // Color and size taps still re-render the carousel (the image swap) inside that block.
  const swaps = app.match(/renderCarousel\(p\);/g) || [];
  assert.ok(swaps.length >= 3, "carousel re-renders on open and on option taps");
});

test("on <=768px the photo is sticky, contained and ~42% of the screen (dvh with vh fallback)", () => {
  const block = mobileSheetCss();
  assert.match(block, /@media \(max-width: 768px\) \{/);
  const media = block.slice(block.indexOf(".pd-media {"), block.indexOf("}", block.indexOf(".pd-media {")));
  assert.match(media, /position: -webkit-sticky;\s*position: sticky;/);
  assert.match(media, /top: 0;/);
  assert.match(media, /background: #111;/);
  const img = block.slice(block.indexOf(".pd-media .pd-image {"), block.indexOf("}", block.indexOf(".pd-media .pd-image {")));
  assert.match(img, /object-fit: contain;/);
  assert.match(img, /height: 42vh;\s*height: 42dvh;/);
  assert.match(block, /\.pd-media\.is-compact \.pd-image \{ height: 30vh; height: 30dvh; \}/);
  assert.match(block, /max-height: 92vh;\s*max-height: 92dvh;/);
  assert.match(block, /env\(safe-area-inset-bottom, 0px\)/);
  // The close button takes no flow height and sits in the band above the photo.
  assert.match(block, /#product-modal \.modal-close \{[^}]*margin: 6px -6px -46px auto;/);
  assert.match(media, /padding: 52px 20px 8px;/);
});

test("desktop styles are untouched: all pinned-photo rules live inside the phone media query", () => {
  const block = mobileSheetCss();
  const before = css.slice(0, css.indexOf("/* ---------- Product sheet on phones: pinned photo"));
  assert.ok(!before.includes(".pd-media"), "no .pd-media rules outside the phone block");
  // Every rule in the block is inside an @media (max-width: 768px) query: at brace depth 0
  // only the two phone @media preludes appear.
  const noComments = block.replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0, top = "";
  for (const ch of noComments) {
    if (ch === "{") { if (depth === 0) top += "{"; depth++; }
    else if (ch === "}") depth--;
    else if (depth === 0) top += ch;
  }
  assert.equal(depth, 0);
  assert.deepEqual(top.split("{").map((x) => x.trim()).filter(Boolean),
    ["@media (max-width: 768px)", "@media (max-width: 768px) and (prefers-reduced-motion: reduce)"]);
  // The desktop photo rule itself is unchanged (square, cover).
  assert.ok(css.includes(".pd-image { width: 100%; aspect-ratio: 1/1; object-fit: cover; display: block; background: #000; }"));
});

test("photo eases smaller once the options scroll up, with hysteresis", () => {
  const classes = new Set();
  const media = { classList: { contains: (c) => classes.has(c), add: (c) => classes.add(c), remove: (c) => classes.delete(c) } };
  assert.equal(ctx.updateModalMediaCompact(0, media), false);
  assert.equal(ctx.updateModalMediaCompact(100, media), false);
  assert.equal(ctx.updateModalMediaCompact(140, media), true);
  assert.equal(ctx.updateModalMediaCompact(60, media), true, "doesn't flip back from the height change");
  assert.equal(ctx.updateModalMediaCompact(10, media), false);
  assert.equal(ctx.updateModalMediaCompact(500, null), false);
  assert.match(app, /const PD_COMPACT_AT = 120;\s*const PD_EXPAND_AT = 24;/);
  assert.match(app, /renderCarousel\(p\);\s*watchModalScroll\(\);/);
});
