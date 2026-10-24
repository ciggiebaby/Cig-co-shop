// MagSafe Case: one front photo per phone model and color (CIG 10/23: "can you grab the pics for
// each one [iphone 14 pics, iphone 15 pics] etc. so people can see how it looks on their phones").
// Picking a model swaps the main photo, like the per-size pillow photos.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { PRODUCTS } = require("../products.js");

const root = path.join(__dirname, "..");
const phoneCase = PRODUCTS.find((p) => p.id === "FW26-CASE");
const slug = (c) => c.toLowerCase().replace(/ /g, "-");
const MODELS = ["iPhone 14", "iPhone 14 Plus", "iPhone 14 Pro", "iPhone 14 Pro Max", "iPhone 15", "iPhone 15 Plus", "iPhone 15 Pro", "iPhone 15 Pro Max", "iPhone 16", "iPhone 16 Plus", "iPhone 16 Pro", "iPhone 16 Pro Max", "iPhone 17", "iPhone 17 Air", "iPhone 17 Pro", "iPhone 17 Pro Max", "iPhone 18 Pro", "iPhone 18 Pro Max"];

// Printful's iPhone 18 Pro / 18 Pro Max mockups are pixel-identical to its 17 Pro / 17 Pro Max ones
// (same template, checked 10/23), so those two models reuse the 17 Pro photos.
const SHARED = { "iPhone 18 Pro": "iPhone 17 Pro", "iPhone 18 Pro Max": "iPhone 17 Pro Max" };
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const ctx = {};
vm.runInNewContext(app.slice(app.indexOf("function productImageForColor"), app.indexOf("function renderCarousel")) + "\nthis.productImageForColor = productImageForColor; this.productGalleryImages = productGalleryImages;", ctx);

test("case models and price are unchanged, and every model and color is a real Printful variant", () => {
  assert.deepEqual(phoneCase.sizes, MODELS);
  assert.equal(phoneCase.price, 40);
  for (const color of phoneCase.colors) for (const m of MODELS) assert.ok(phoneCase.pod.variants[`${color} / ${m}`].syncVariantId, `${color} / ${m}`);
});

test("every case color has a front photo for every model (each model its own, except the 18 Pros)", () => {
  const all = new Set();
  for (const color of phoneCase.colors) {
    const entry = phoneCase.colorImages[color];
    assert.deepEqual(Object.keys(entry), MODELS, color);
    for (const [m18, m17] of Object.entries(SHARED)) assert.equal(entry[m18], entry[m17], `${color} ${m18}`);
    for (const m of MODELS.filter((x) => !SHARED[x])) {
      const f = entry[m];
      assert.equal(f, `assets/products/fw26/case_${slug(color)}_${slug(m)}.webp`, `${color} ${m}`);
      const buf = fs.readFileSync(path.join(root, f));
      const h = crypto.createHash("md5").update(buf).digest("hex");
      assert.ok(!all.has(h), `${f} duplicates another photo`);
      all.add(h);
    }
  }
  assert.equal(all.size, 8 * 16);
});

test("picking a model swaps the main photo; the 3-angle and exploded shots stay", () => {
  for (const color of phoneCase.colors) {
    const extra = (phoneCase.gallery[color]);
    assert.equal(extra.length, 2);
    let last = null;
    for (const m of MODELS) {
      const main = ctx.productImageForColor(phoneCase, color, m, null);
      assert.equal(main, phoneCase.colorImages[color][m]);
      if (!SHARED[m]) assert.notEqual(main, last, `${color} ${m}`);
      last = main;
      assert.deepEqual(Array.from(ctx.productGalleryImages(phoneCase, color, m, null)), [main, ...extra]);
    }
  }
  // With no model picked yet the first model's photo shows (the modal preselects iPhone 14).
  assert.equal(ctx.productImageForColor(phoneCase, "Navy", null, null), "assets/products/fw26/case_navy_iphone-14.webp");
  assert.match(app, /size: p\.sizes\[0\] \|\| null/);
});

test("the case card still shows Burgundy on iPhone 16 Pro, and no old one-size-fits-all photos remain", () => {
  assert.equal(phoneCase.image, "assets/products/fw26/case_burgundy_iphone-16-pro.webp");
  for (const color of phoneCase.colors) {
    assert.ok(!fs.existsSync(path.join(root, `assets/products/fw26/case_${slug(color)}.webp`)), color);
    for (const m of Object.keys(SHARED)) assert.ok(!fs.existsSync(path.join(root, `assets/products/fw26/case_${slug(color)}_${slug(m)}.webp`)), `${color} ${m}`);
  }
});
