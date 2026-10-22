// Backstock counted 10/21 (bg/backstock_2026-10-21.csv) with CIG-approved
// prices 10/22: Ski Mask $30, Balaclava $25, Moto Mask $15. Stock values are
// static caps (not decremented on sale).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { PRODUCTS } = require("../products.js");
const { priceCartForStripe } = require("../netlify/lib/stripe-pricing.js");
const { assertPodAllowedWithoutCard } = require("../netlify/lib/pod-payment.js");
const root = path.join(__dirname, "..");
const product = (id) => PRODUCTS.find((p) => p.id === id);

test("balaclava: $25, Red 70 / Blue 68 / Black 24, Gold gone, every color has a real photo", () => {
  const p = product("0005");
  assert.equal(p.price, 25);
  assert.deepEqual(p.colors, ["Red", "Blue", "Black"]);
  assert.deepEqual(p.stock, { Red: 70, Blue: 68, Black: 24 });
  for (const c of p.colors) assert.ok(fs.existsSync(path.join(root, p.colorImages[c])), c);
  assert.equal(p.colorImages.Gold, undefined);
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

test("moto mask is staged at $15 with in-stock colors but stays hidden until it has photos", () => {
  const p = product("0013");
  assert.equal(p.name, "Moto Mask");
  assert.equal(p.price, 15);
  assert.deepEqual(p.stock, { Yellow: 17, Pink: 22, Brown: 16, Purple: 14, Green: 13, Orange: 12 });
  for (const c of ["Red", "Black", "Blue", "Rainbow"]) assert.ok(!p.colors.includes(c), c);
  assert.equal(p.hidden, true);
  assert.deepEqual(p.colorImages, {});
  assert.throws(() => priceCartForStripe([{ productId: "0013", color: "Yellow", quantity: 1 }]), /not available/);
});

test("cart pricing uses the new mask prices and caps quantity at the counts", () => {
  const priced = priceCartForStripe([
    { productId: "0005", color: "Black", quantity: 24 },
    { productId: "0008", color: "Gold", size: "3-Hole", quantity: 1 },
  ]);
  assert.deepEqual(priced.lineItems.map((l) => l.price_data.unit_amount), [2500, 3000]);
  assert.throws(() => priceCartForStripe([{ productId: "0005", color: "Black", quantity: 25 }]));
  assert.throws(() => priceCartForStripe([{ productId: "0005", color: "Gold", quantity: 1 }]));
  assert.throws(() => priceCartForStripe([{ productId: "0008", color: "Red", size: "Skully", quantity: 1 }]));
});

test("masks take PayPal (not made-to-order), FW26 items stay card-only; the hero says so", () => {
  assert.doesNotThrow(() => assertPodAllowedWithoutCard([{ productId: "0005" }, { productId: "0008" }]));
  assert.throws(() => assertPodAllowedWithoutCard([{ productId: "FW26-BAG" }]), /only be paid by card/);
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /data-crypto-off>Card only for the FW26\/27 drop\. Masks also take PayPal\.<\/p>/);
  assert.doesNotMatch(html, /Pay with card or PayPal\./);
});
