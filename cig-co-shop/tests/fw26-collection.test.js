// FW26/27 collection (Printful store 18936848): one site product per item
// type, each color/size option mapped to its own Printful sync variant.
const assert = require("node:assert/strict");
const test = require("node:test");

const { PRODUCTS, POD_CARD_ONLY } = require("../products.js");
const { priceCartForStripe } = require("../netlify/lib/stripe-pricing.js");
const { printfulItemForLine } = require("../netlify/lib/printful.js");
const { podLines } = require("../netlify/functions/printful-fulfillment.js");
const { quoteShipping } = require("../shipping-rates.js");

const COLORWAYS = ["Black", "Burgundy", "Navy", "Hunter", "Grape", "Gold", "Burnt Orange", "Espresso"];
const product = (id) => PRODUCTS.find((p) => p.id === id);

test("one product per item type, with every colorway (and Multi for the bag)", () => {
  const ids = PRODUCTS.filter((p) => p.id.startsWith("FW26-")).map((p) => p.id);
  assert.deepEqual(ids, ["FW26-BAG", "FW26-CASE", "FW26-SLEEVE", "FW26-PILLOW"]);
  assert.deepEqual(product("FW26-BAG").colors, [...COLORWAYS, "Multi"]);
  for (const id of ["FW26-CASE", "FW26-SLEEVE", "FW26-PILLOW"]) assert.deepEqual(product(id).colors, COLORWAYS);
  assert.equal(product("FW26-CASE").sizes.length, 18);
  assert.deepEqual(product("FW26-SLEEVE").sizes, ["13″", "15″"]);
  assert.deepEqual(product("FW26-PILLOW").sizes, ["14″×14″", "16″×16″", "18″×18″", "20″×12″", "22″×22″"]);
});

test("every color/size option maps to a distinct Printful sync variant (209 total)", () => {
  const seen = new Set();
  for (const id of ["FW26-BAG", "FW26-CASE", "FW26-SLEEVE", "FW26-PILLOW"]) {
    const p = product(id);
    const keys = p.sizes.length
      ? p.colors.flatMap((c) => p.sizes.map((s) => `${c} / ${s}`))
      : p.colors.slice();
    assert.deepEqual(Object.keys(p.pod.variants).sort(), keys.sort(), id);
    for (const key of keys) {
      const id2 = p.pod.variants[key].syncVariantId;
      assert.ok(Number.isInteger(id2) && id2 > 5586000000, `${id} ${key}`);
      assert.ok(!seen.has(id2), `duplicate ${id2}`);
      seen.add(id2);
    }
  }
  assert.equal(seen.size, 209);
});

test("spot-check mappings against the Printful inventory", () => {
  const sync = (id, key) => product(id).pod.variants[key].syncVariantId;
  assert.equal(sync("FW26-BAG", "Multi"), 5586110183);
  assert.equal(sync("FW26-BAG", "Black"), 5586102158);
  assert.equal(sync("FW26-BAG", "Navy"), 5586097945);
  assert.equal(sync("FW26-CASE", "Black / iPhone 16"), 5586083601);
  assert.equal(sync("FW26-CASE", "Burgundy / iPhone 18 Pro Max"), 5586080290);
  assert.equal(sync("FW26-SLEEVE", "Gold / 13″"), 5586091630);
  assert.equal(sync("FW26-SLEEVE", "Burnt Orange / 15″"), 5586096986);
  assert.equal(sync("FW26-PILLOW", "Espresso / 14″×14″"), 5586120150);
  assert.equal(sync("FW26-PILLOW", "Burgundy / 20″×12″"), 5586111649);
});

test("shipping classes: bag/case/sleeve ship abroad, pillows stay US-only", () => {
  assert.equal(product("FW26-BAG").shipping, "bag");
  assert.equal(product("FW26-CASE").shipping, "case");
  assert.equal(product("FW26-SLEEVE").shipping, "sleeve");
  assert.equal(product("FW26-PILLOW").shipping, "pillow");
  assert.equal(quoteShipping([{ name: "Pillow", shipping: "pillow", quantity: 1 }], "JP").shippingCents, null);
});

test("MagSafe case description carries the ~30-day Asia note", () => {
  assert.match(product("FW26-CASE").description, /Japan & South Korea takes about 30 days/);
});

test("only CIG-approved prices are live: bag $65 solids / $75 Multi; the rest stay hidden with no price", () => {
  const bag = product("FW26-BAG");
  assert.equal(bag.price, 65);
  assert.deepEqual(bag.colorPrices, { Multi: 75 });
  assert.notEqual(bag.hidden, true);
  for (const id of ["FW26-CASE", "FW26-SLEEVE", "FW26-PILLOW"]) {
    const p = product(id);
    assert.equal(p.hidden, true, id);
    assert.equal(p.price, null, id);
    assert.equal(p.sizePrices, undefined, id);
    assert.equal(p.colorPrices, undefined, id);
    assert.throws(() => priceCartForStripe([{ productId: id, color: "Black", size: p.sizes[0], quantity: 1 }]), /not available/);
  }
});

test("the server charges $65 for a solid and $75 for Multi, and tags each line for Printful", () => {
  const pricing = priceCartForStripe([
    { productId: "FW26-BAG", color: "Black", quantity: 2 },
    { productId: "FW26-BAG", color: "Multi", quantity: 1 },
  ]);
  const [solid, multi] = pricing.lineItems;
  assert.equal(solid.price_data.unit_amount, 6500);
  assert.equal(solid.quantity, 2);
  assert.equal(multi.price_data.unit_amount, 7500);
  assert.deepEqual(multi.price_data.product_data.metadata, { pod: "true", product_id: "FW26-BAG", style: "", color: "Multi", size: "" });
  assert.equal(pricing.totalCents, 20500);
  assert.throws(() => priceCartForStripe([{ productId: "FW26-BAG", color: "Teal", quantity: 1 }]));
  assert.equal(POD_CARD_ONLY, true);
});

test("a paid Stripe line for the Multi crossbody becomes the Multi sync variant at Printful", () => {
  const pricing = priceCartForStripe([{ productId: "FW26-BAG", color: "Multi", quantity: 1 }, { productId: "FW26-BAG", color: "Hunter", quantity: 1 }]);
  // What Stripe hands back to printful-fulfillment (listLineItems, expanded product).
  const stripeLines = pricing.lineItems.map((line) => ({
    quantity: line.quantity,
    amount_total: line.price_data.unit_amount * line.quantity,
    price: { product: { metadata: line.price_data.product_data.metadata } },
  }));
  const items = podLines(stripeLines).map(printfulItemForLine);
  assert.deepEqual(items.map((i) => [i.sync_variant_id, i.retail_price]), [[5586110183, "75.00"], [5586109178, "65.00"]]);
});

test("images are Printful mockups per color (and per model/size) until CIG's photos land", () => {
  for (const id of ["FW26-BAG", "FW26-CASE", "FW26-SLEEVE", "FW26-PILLOW"]) {
    const p = product(id);
    assert.match(p.image, /^https:\/\/files\.cdn\.printful\.com\//);
    for (const color of p.colors) {
      const entry = p.colorImages[color];
      const urls = typeof entry === "string" ? [entry] : p.sizes.map((s) => entry[s]);
      for (const url of urls) assert.match(url, /^https:\/\/files\.cdn\.printful\.com\/files\/.+_preview\.png$/, `${id} ${color}`);
      assert.match(p.colorSwatches[color], /_thumb\.png$/);
    }
  }
});
