// Laptop Sleeve gallery (CIG 10/23): front first, then the open sleeve with the laptop sliding
// out (Printful "Product details"), then the zipper close-up ("Product details 2"), every color,
// rendered from CIG's 5700px print files.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { PRODUCTS } = require("../products.js");

const root = path.join(__dirname, "..");
const sleeve = PRODUCTS.find((p) => p.id === "FW26-SLEEVE");
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

test("every sleeve color shows front, then open (laptop), then zipper, for both sizes", () => {
  assert.equal(sleeve.colors.length, 8);
  for (const color of sleeve.colors) {
    const want = ["", "_open", "_zipper"].map((v) => `assets/products/fw26/sleeve_${slug(color)}${v}.webp`);
    for (const size of sleeve.sizes) {
      assert.deepEqual(Array.from(ctx.productGalleryImages(sleeve, color, size, null)), want, `${color} ${size}`);
    }
  }
});

test("new sleeve photos match the front shot: 1600px square transparent WebP under 400 KB, each its own picture", () => {
  const seen = new Set();
  for (const color of sleeve.colors) {
    for (const v of ["", "_open", "_zipper"]) {
      const buf = fs.readFileSync(path.join(root, `assets/products/fw26/sleeve_${slug(color)}${v}.webp`));
      assert.ok(buf.length < 400 * 1024, `${color}${v} is ${buf.length} bytes`);
      assert.deepEqual(webpSize(buf), { w: 1600, h: 1600, alpha: true }, `${color}${v}`);
      const h = crypto.createHash("md5").update(buf).digest("hex");
      assert.ok(!seen.has(h), `${color}${v} duplicates another photo`);
      seen.add(h);
    }
  }
});
