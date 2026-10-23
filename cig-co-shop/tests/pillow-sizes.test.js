// Throw Pillow: one photo per color and size (CIG 10/22: "for the pillows.. can you add the
// pics for the different sizes so people can see how they look"). Printful Mockup Generator
// renders at a shared real-world scale, so picking a size shows that size's look.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { PRODUCTS } = require("../products.js");

const root = path.join(__dirname, "..");
const pillow = PRODUCTS.find((p) => p.id === "FW26-PILLOW");
const slug = (c) => c.toLowerCase().replace(/ /g, "-");
const SIZE_FILE = { "14″×14″": "14x14", "16″×16″": "16x16", "18″×18″": "front", "20″×12″": "20x12", "22″×22″": "22x22" };

// Load the real image helpers from app.js.
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const helpers = app.slice(app.indexOf("function productImageForColor"), app.indexOf("function renderCarousel"));
const ctx = {};
vm.runInNewContext(helpers + "\nthis.productImageForColor = productImageForColor; this.productGalleryImages = productGalleryImages;", ctx);

function webpSize(buf) {
  assert.equal(buf.subarray(0, 4).toString("latin1"), "RIFF");
  assert.equal(buf.subarray(8, 12).toString("latin1"), "WEBP");
  const chunk = buf.subarray(12, 16).toString("latin1");
  if (chunk === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3), alpha: !!(buf[20] & 0x10) };
  if (chunk === "VP8L") { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1, alpha: !!((b >> 28) & 1) }; }
  return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, alpha: false };
}

test("pillow sizes and prices are unchanged", () => {
  assert.deepEqual(pillow.sizes, ["14″×14″", "16″×16″", "18″×18″", "20″×12″", "22″×22″"]);
  assert.deepEqual(pillow.sizePrices, { "14″×14″": 45, "16″×16″": 48, "18″×18″": 52, "20″×12″": 48, "22″×22″": 58 });
});

test("every pillow color has its own photo for every size", () => {
  const all = new Set();
  for (const color of pillow.colors) {
    const entry = pillow.colorImages[color];
    assert.equal(typeof entry, "object", color);
    assert.deepEqual(Object.keys(entry), pillow.sizes, `${color} covers every size, in order`);
    for (const size of pillow.sizes) {
      assert.equal(entry[size], `assets/products/fw26/pillow_${slug(color)}_${SIZE_FILE[size]}.webp`, `${color} ${size}`);
      assert.ok(!all.has(entry[size]), `${color} ${size} is its own file`);
      all.add(entry[size]);
    }
  }
  assert.equal(all.size, pillow.colors.length * pillow.sizes.length);
});

test("pillow size photos match the drop's mockups: 1600px square transparent WebP under 400 KB", () => {
  for (const color of pillow.colors) {
    for (const size of pillow.sizes) {
      const f = path.join(root, pillow.colorImages[color][size]);
      const buf = fs.readFileSync(f);
      assert.ok(buf.length < 400 * 1024, `${f} is ${buf.length} bytes`);
      assert.deepEqual(webpSize(buf), { w: 1600, h: 1600, alpha: true }, `${color} ${size}`);
    }
  }
});

test("picking a pillow size (and color) swaps to that size's photo", () => {
  for (const color of pillow.colors) {
    for (const size of pillow.sizes) {
      assert.equal(ctx.productImageForColor(pillow, color, size, null), pillow.colorImages[color][size]);
      assert.deepEqual(Array.from(ctx.productGalleryImages(pillow, color, size, null)), [pillow.colorImages[color][size]]);
    }
  }
  assert.equal(ctx.productImageForColor(pillow, "Black", "20″×12″", null), "assets/products/fw26/pillow_black_20x12.webp");
  assert.equal(ctx.productImageForColor(pillow, "Gold", "22″×22″", null), "assets/products/fw26/pillow_gold_22x22.webp");
  assert.notEqual(ctx.productImageForColor(pillow, "Black", "14″×14″", null), ctx.productImageForColor(pillow, "Black", "22″×22″", null));
  // No size yet falls back to the color's first size, never to another color.
  assert.equal(ctx.productImageForColor(pillow, "Navy", null, null), pillow.colorImages.Navy["14″×14″"]);
});

test("pillow still lands on Black; the card keeps the 18″×18″ Black shot; the page opens on 14″×14″", () => {
  assert.equal(pillow.defaultColor, "Black");
  assert.equal(pillow.image, "assets/products/fw26/pillow_black_front.webp");
  assert.equal(pillow.image, pillow.colorImages.Black["18″×18″"]);
  assert.match(app, /size: p\.sizes\[0\]/);
  assert.equal(ctx.productImageForColor(pillow, pillow.defaultColor, pillow.sizes[0], null), "assets/products/fw26/pillow_black_14x14.webp");
});

test("clicking a size re-renders the photo", () => {
  assert.match(app, /modalState\.size = btn\.dataset\.size;\s*modalState\.slide = 0;[\s\S]{0,200}?renderCarousel\(p\);/);
  assert.match(app, /productGalleryImages\(p, modalState\.color, modalState\.size, modalState\.style\)/);
});
