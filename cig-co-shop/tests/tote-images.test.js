// Tote Bag photos (CIG 10/23: "the Tote Bag photos look blurry"). Re-rendered with the Printful
// Mockup Generator from CIG's 5700px print files instead of Printful's 800px preview copy.
// Printful renders the standing (angle) and product-details views at 2000px (saved at 1600px,
// like the crossbody) but caps the flat Front/Back/Inside Pocket views at 1000px.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { PRODUCTS } = require("../products.js");

const root = path.join(__dirname, "..");
const tote = PRODUCTS.find((p) => p.id === "FW26-TOTE");
const slug = (c) => c.toLowerCase().replace(/ /g, "-");
const SIZE = { _angle: 1600, _detail: 1600, _front: 1000, _back: 1000, _pocket: 1000, _swatch: 165 };

function webpSize(buf) {
  assert.equal(buf.subarray(0, 4).toString("latin1"), "RIFF");
  assert.equal(buf.subarray(8, 12).toString("latin1"), "WEBP");
  const chunk = buf.subarray(12, 16).toString("latin1");
  if (chunk === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3), alpha: !!(buf[20] & 0x10) };
  if (chunk === "VP8L") { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1, alpha: !!((b >> 28) & 1) }; }
  return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, alpha: false };
}

test("every tote color has angle and detail photos at 1600px, flat views at Printful's 1000px max, with transparency", () => {
  assert.equal(tote.colors.length, 8);
  for (const color of tote.colors) {
    for (const [v, px] of Object.entries(SIZE)) {
      const f = `assets/products/fw26/tote_${slug(color)}${v}.webp`;
      const size = webpSize(fs.readFileSync(path.join(root, f)));
      assert.deepEqual(size, { w: px, h: px, alpha: true }, f);
    }
  }
});

test("each tote view is its own picture (the inside-pocket photo is not a copy of the front)", () => {
  for (const color of tote.colors) {
    const seen = new Map();
    for (const v of ["_front", "_angle", "_back", "_detail", "_pocket"]) {
      const f = `assets/products/fw26/tote_${slug(color)}${v}.webp`;
      const h = crypto.createHash("md5").update(fs.readFileSync(path.join(root, f))).digest("hex");
      assert.ok(!seen.has(h), `${f} duplicates ${seen.get(h)}`);
      seen.set(h, f);
    }
  }
});
