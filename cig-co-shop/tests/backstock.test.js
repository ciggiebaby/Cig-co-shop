// Backstock counted 10/21 (bg/backstock_2026-10-21.csv) with CIG-approved
// prices 10/22: Ski Mask $30, Balaclava $25, Moto Mask $15. Stock values are
// static caps (not decremented on sale).
require("./full-price-clock-fixture.js");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { PRODUCTS } = require("../products.js");
const { priceCartForStripe } = require("../netlify/lib/stripe-pricing.js");
const { assertPodAllowedWithoutCard } = require("../netlify/lib/pod-payment.js");
const root = path.join(__dirname, "..");
const product = (id) => PRODUCTS.find((p) => p.id === id);

test("balaclava: $25, Red 70 / Blue 68 / Gold 24 (CIG confirmed the 24 are Gold), Black 0", () => {
  const p = product("0005");
  assert.equal(p.price, 25);
  assert.deepEqual(p.colors, ["Red", "Blue", "Gold", "Black"]);
  assert.deepEqual(p.stock, { Red: 70, Blue: 68, Gold: 24, Black: 0 });
  for (const c of p.colors) assert.ok(fs.existsSync(path.join(root, p.colorImages[c])), c);
  // CIG's names: Gold = black with gold print, Black = black with white print.
  assert.equal(p.colorImages.Gold, "assets/products/balaclava-gold-front-upright.jpg");
  assert.deepEqual(p.gallery.Gold, ["assets/products/balaclava-gold-back-upright.jpg"]);
  assert.equal(p.colorImages.Black, "assets/products/balaclava-black.jpg");
});

test("ski mask: $30, 1-Hole/3-Hole counts from BG (BG 'Yellow' = site 'Gold'), Skully 0", () => {
  const p = product("0008");
  assert.equal(p.price, 30);
  assert.deepEqual(p.stock, {
    Blue: { "1-Hole": 56, "3-Hole": 70, Skully: 0 },
    Red: { "1-Hole": 59, "3-Hole": 80, Skully: 0 },
    Green: { "1-Hole": 71, "3-Hole": 77, Skully: 0 },
    Gold: { "1-Hole": 73, "3-Hole": 81, Skully: 0 },
  });
  assert.match(p.colorImages.Gold["1-Hole"], /skimask-gold-/);
});

test("moto mask: $15, listed again with CIG's new photos (10/22 5:27 PM); Purple first and default; one photo per color", () => {
  const p = product("0013");
  assert.equal(p.name, "Moto Mask");
  assert.equal(p.price, 15);
  assert.notEqual(p.hidden, true);
  assert.equal(p.liveStock, true);
  assert.deepEqual(p.stock, { Yellow: 17, Pink: 22, Brown: 16, Purple: 14, Green: 13, Orange: 12 });
  for (const c of ["Red", "Black", "Blue", "Rainbow"]) assert.ok(!p.colors.includes(c), c);
  assert.deepEqual(p.colors, ["Purple", "Green", "Brown", "Yellow", "Pink", "Orange"]);
  assert.equal(p.defaultColor, "Purple");
  assert.equal(p.image, "assets/products/moto-purple.jpg");
  assert.equal(p.photoComingSoon, undefined);
  assert.equal(p.gallery, undefined);
  for (const c of p.colors) {
    const img = p.colorImages[c];
    assert.equal(img, `assets/products/moto-${c.toLowerCase()}.jpg`, c);
    assert.ok(fs.existsSync(path.join(root, img)), img);
    assert.ok(fs.statSync(path.join(root, img)).size < 300 * 1024, img);
    assert.match(p.colorHex[c], /^#[0-9a-f]{6}$/);
  }
  // Old moto photos and the placeholder are gone.
  const files = fs.readdirSync(path.join(root, "assets/products")).filter((f) => f.startsWith("moto-")).sort();
  assert.deepEqual(files, ["moto-brown.jpg", "moto-green.jpg", "moto-orange.jpg", "moto-pink.jpg", "moto-purple.jpg", "moto-yellow.jpg"]);
  // Checkout takes it again at $15, as a mask (US only, mask shipping rules).
  const priced = priceCartForStripe([{ productId: "0013", color: "Purple", quantity: 2 }]);
  assert.deepEqual(priced.lineItems.map((l) => [l.price_data.product_data.name, l.price_data.unit_amount, l.quantity]), [["Moto Mask — Purple", 1500, 2]]);
  assert.deepEqual(priced.shippingLines.map((l) => l.mask), [true]);
  assert.throws(() => priceCartForStripe([{ productId: "0013", color: "Purple", quantity: 15 }]));
});

test("cart pricing uses the new mask prices and caps quantity at the counts", () => {
  const priced = priceCartForStripe([
    { productId: "0005", color: "Red", quantity: 70 },
    { productId: "0008", color: "Gold", size: "3-Hole", quantity: 1 },
  ]);
  assert.deepEqual(priced.lineItems.map((l) => l.price_data.unit_amount), [2500, 3000]);
  assert.throws(() => priceCartForStripe([{ productId: "0005", color: "Red", quantity: 71 }]));
  assert.ok(priceCartForStripe([{ productId: "0005", color: "Gold", quantity: 24 }]));
  assert.throws(() => priceCartForStripe([{ productId: "0005", color: "Gold", quantity: 25 }]));
  assert.throws(() => priceCartForStripe([{ productId: "0005", color: "Black", quantity: 1 }]), /unavailable/);
  assert.throws(() => priceCartForStripe([{ productId: "0008", color: "Red", size: "Skully", quantity: 1 }]));
});

test("masks and FW26 items both take PayPal (CIG 10/22); the hero says card or PayPal", () => {
  assert.doesNotThrow(() => assertPodAllowedWithoutCard([{ productId: "0005" }, { productId: "0008" }]));
  assert.doesNotThrow(() => assertPodAllowedWithoutCard([{ productId: "FW26-BAG" }, { productId: "FW26-TOTE" }]));
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /data-crypto-off>Pay with card or PayPal\.<\/p>/);
  for (const file of ["index.html", "faq.html", "shipping-returns.html", "docs/policies/faq.md", "docs/policies/shipping-returns.md"]) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(text, /Card only|card-only|Masks also take PayPal|only be paid by card/i, file);
  }
  assert.match(fs.readFileSync(path.join(root, "faq.html"), "utf8"), /<p>Card or PayPal at checkout, for everything in the store\.<\/p>/);
});
