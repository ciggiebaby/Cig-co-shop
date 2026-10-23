// MagSafe Case gallery (CIG 10/23): the back first, then the 3-angle shot (Printful "Flat 2"),
// then the exploded view ("Lifestyle"), every color and every model (one set, rendered on
// iPhone 16 Pro Matte from CIG’s 5700px print files).
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
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const ctx = {};
vm.runInNewContext(app.slice(app.indexOf("function productImageForColor"), app.indexOf("function renderCarousel")) + "\nthis.productGalleryImages = productGalleryImages;", ctx);

function webpSize(buf) {
  assert.equal(buf.subarray(0, 4).toString("latin1"), "RIFF");
  assert.equal(buf.subarray(8, 12).toString("latin1"), "WEBP");
  const chunk = buf.subarray(12, 16).toString("latin1");
  if (chunk === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3), alpha: !!(buf[20] & 0x10) };
  if (chunk === "VP8L") { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1, alpha: !!((b >> 28) & 1) }; }
  return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, alpha: false };
}

test("every case color shows the back, then 3 angles, then the exploded view, on every model", () => {
  assert.equal(phoneCase.colors.length, 8);
  for (const color of phoneCase.colors) {
    const want = ["", "_angles", "_exploded"].map((v) => `assets/products/fw26/case_${slug(color)}${v}.webp`);
    for (const size of phoneCase.sizes) {
      assert.deepEqual(Array.from(ctx.productGalleryImages(phoneCase, color, size, null)), want, `${color} ${size}`);
    }
  }
});

test("new case photos match the back shot: 1600px square transparent WebP under 400 KB, each its own picture", () => {
  const seen = new Set();
  for (const color of phoneCase.colors) {
    for (const v of ["", "_angles", "_exploded"]) {
      const buf = fs.readFileSync(path.join(root, `assets/products/fw26/case_${slug(color)}${v}.webp`));
      assert.ok(buf.length < 400 * 1024, `${color}${v} is ${buf.length} bytes`);
      assert.deepEqual(webpSize(buf), { w: 1600, h: 1600, alpha: true }, `${color}${v}`);
      const h = crypto.createHash("md5").update(buf).digest("hex");
      assert.ok(!seen.has(h), `${color}${v} duplicates another photo`);
      seen.add(h);
    }
  }
});
