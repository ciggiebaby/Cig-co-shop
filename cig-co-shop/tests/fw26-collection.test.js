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
  assert.deepEqual(ids, ["FW26-BAG", "FW26-CASE", "FW26-SLEEVE", "FW26-PILLOW", "FW26-TOTE"]);
  assert.deepEqual(product("FW26-BAG").colors, [...COLORWAYS, "Multi"]);
  for (const id of ["FW26-CASE", "FW26-SLEEVE", "FW26-PILLOW", "FW26-TOTE"]) assert.deepEqual(product(id).colors, COLORWAYS);
  assert.deepEqual(product("FW26-TOTE").sizes, []);
  assert.equal(product("FW26-CASE").sizes.length, 18);
  assert.deepEqual(product("FW26-SLEEVE").sizes, ["13″", "15″"]);
  assert.deepEqual(product("FW26-PILLOW").sizes, ["14″×14″", "16″×16″", "18″×18″", "20″×12″", "22″×22″"]);
});

test("every color/size option maps to a distinct Printful sync variant (217 total)", () => {
  const seen = new Set();
  for (const id of ["FW26-BAG", "FW26-CASE", "FW26-SLEEVE", "FW26-PILLOW", "FW26-TOTE"]) {
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
  assert.equal(seen.size, 217);
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
  assert.equal(sync("FW26-TOTE", "Hunter"), 5589489621);
  assert.equal(sync("FW26-TOTE", "Espresso"), 5589504563);
  // Printful names this one "CIG Tote Bag [Espresso] copy", but its print file is the Gold design.
  assert.equal(sync("FW26-TOTE", "Gold"), 5589508290);
});

test("shipping classes: bag/case/sleeve ship abroad, pillows stay US-only", () => {
  assert.equal(product("FW26-BAG").shipping, "bag");
  // Printful quotes the tote at exactly the crossbody's rates to all six countries (10/22).
  assert.equal(product("FW26-TOTE").shipping, "bag");
  for (const [cc, cents] of Object.entries({ US: 0, CA: 800, GB: 500, DE: 500, AU: 800, JP: 500, KR: 1300 })) {
    assert.equal(quoteShipping([{ name: "Tote Bag", shipping: "bag", quantity: 1 }], cc).shippingCents, cents, cc);
  }
  assert.equal(product("FW26-CASE").shipping, "case");
  assert.equal(product("FW26-SLEEVE").shipping, "sleeve");
  assert.equal(product("FW26-PILLOW").shipping, "pillow");
  assert.equal(quoteShipping([{ name: "Pillow", shipping: "pillow", quantity: 1 }], "JP").shippingCents, null);
});

test("MagSafe case description carries the ~30-day Asia note", () => {
  assert.match(product("FW26-CASE").description, /Japan & South Korea takes about 30 days/);
});

test("plain product names (CIG 10/21)", () => {
  assert.deepEqual(
    ["FW26-BAG", "FW26-CASE", "FW26-SLEEVE", "FW26-PILLOW", "FW26-TOTE"].map((id) => product(id).name),
    ["Crossbody Bag", "MagSafe Case", "Laptop Sleeve", "Throw Pillow", "Tote Bag"],
  );
});

test("all five are purchasable at CIG's approved prices (10/21; tote 10/22), charged by the server", () => {
  const expected = {
    "FW26-BAG": { Black: 6500, Burgundy: 6500, Navy: 6500, Hunter: 6500, Grape: 6500, Gold: 6500, "Burnt Orange": 6500, Espresso: 6500, Multi: 7500 },
    "FW26-CASE": Object.fromEntries(product("FW26-CASE").sizes.map((s) => [s, 4000])),
    "FW26-SLEEVE": { "13″": 5000, "15″": 5500 },
    "FW26-PILLOW": { "14″×14″": 4500, "16″×16″": 4800, "18″×18″": 5200, "20″×12″": 4800, "22″×22″": 5800 },
    // CIG 10/22 4:22 PM ET: "Tote price $35".
    "FW26-TOTE": Object.fromEntries(product("FW26-TOTE").colors.map((c) => [c, 3500])),
  };
  for (const [id, prices] of Object.entries(expected)) {
    const p = product(id);
    assert.notEqual(p.hidden, true, id);
    for (const [option, cents] of Object.entries(prices)) {
      const item = p.sizes.length
        ? { productId: id, color: "Navy", size: option, quantity: 1 }
        : { productId: id, color: option, quantity: 1 };
      assert.equal(priceCartForStripe([item]).lineItems[0].price_data.unit_amount, cents, `${id} ${option}`);
    }
  }
  assert.equal(product("FW26-CASE").sizeLabel, "Model");
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
  assert.equal(POD_CARD_ONLY, false); // card or PayPal (CIG 10/22)
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

test("images are 2000px Printful Mockup Generator renders, web-optimized and shipped in the repo, one per colorway", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.join(__dirname, "..");
  const slug = (c) => c.toLowerCase().replace(/ /g, "-");
  const expect = {
    "FW26-BAG": { prefix: "crossbody", primary: "_front", extra: ["_right", "_left", "_back"] },
    "FW26-CASE": { prefix: "case", primary: "", extra: [] },
    "FW26-SLEEVE": { prefix: "sleeve", primary: "", extra: [] },
    "FW26-PILLOW": { prefix: "pillow", primary: "_front", extra: [] },
    "FW26-TOTE": { prefix: "tote", primary: "_front", extra: ["_angle", "_back", "_detail", "_pocket"] },
  };
  for (const [id, e] of Object.entries(expect)) {
    const p = product(id);
    const file = (c, v) => `assets/products/fw26/${e.prefix}_${slug(c)}${v}.webp`;
    assert.equal(p.image, file(p.defaultColor, e.primary));
    const seen = new Set();
    for (const color of p.colors) {
      assert.equal(p.colorImages[color], file(color, e.primary), `${id} ${color}`);
      assert.deepEqual((p.gallery && p.gallery[color]) || [], e.extra.map((v) => file(color, v)), `${id} ${color} gallery`);
      for (const f of [p.colorImages[color], ...e.extra.map((v) => file(color, v))]) {
        const stat = fs.statSync(path.join(root, f));
        assert.ok(stat.size < 400 * 1024, `${f} is ${stat.size} bytes`);
        const head = fs.readFileSync(path.join(root, f)).subarray(0, 12).toString("latin1");
        assert.ok(head.startsWith("RIFF") && head.endsWith("WEBP"), `${f} is WebP`);
      }
      assert.ok(!seen.has(p.colorImages[color]), `${id} ${color} has its own image`);
      seen.add(p.colorImages[color]);
      const sw = p.colorSwatches[color];
      if (sw.startsWith("assets/")) {
        assert.equal(sw, `assets/products/fw26/${e.prefix}_${slug(color)}_swatch.webp`, `${id} ${color} swatch`);
        const head = fs.readFileSync(path.join(root, sw)).subarray(0, 12).toString("latin1");
        assert.ok(head.startsWith("RIFF") && head.endsWith("WEBP"), `${sw} is WebP`);
      } else {
        assert.match(sw, /^https:\/\/files\.cdn\.printful\.com\/files\/.+_thumb\.png$/, `${id} ${color} swatch`);
      }
    }
  }
});

test("no swatch uses a Printful thumb with an opaque white background (they show as white circles on the dark site)", () => {
  // Checked 10/22: these four Printful thumbs are opaque white; every other FW26 thumb is transparent.
  const whiteThumbs = ["6aac2c3c795d892f99e788ec8dab9eca", "1fe4b88d136827c6f2be81865e2698fd", "6ba01b06fb44afa5630efafb59059050", "424e3d35abb05da320c39f248b28615c"];
  const all = JSON.stringify(PRODUCTS);
  for (const h of whiteThumbs) assert.ok(!all.includes(h), h);
  assert.equal(product("FW26-BAG").colorSwatches.Multi, "assets/products/fw26/crossbody_multi_swatch.webp");
  assert.equal(product("FW26-CASE").colorSwatches.Grape, "assets/products/fw26/case_grape_swatch.webp");
  assert.equal(product("FW26-CASE").colorSwatches.Espresso, "assets/products/fw26/case_espresso_swatch.webp");
  assert.equal(product("FW26-SLEEVE").colorSwatches.Burgundy, "assets/products/fw26/sleeve_burgundy_swatch.webp");
});

test("the case uses one photo per colorway for every model (CIG: no per-model photos)", () => {
  const p = product("FW26-CASE");
  assert.equal(p.sizes.length, 18);
  for (const c of p.colors) assert.equal(typeof p.colorImages[c], "string");
});

test("tote: POD bag at CIG's $35 price (10/22), card or PayPal", () => {
  const p = product("FW26-TOTE");
  assert.equal(p.dropAt, require("../products.js").DROP_AT);
  assert.equal(p.price, 35);
  assert.equal(p.salePrice, null);
  assert.equal(PRODUCTS.some((x) => "priceApproved" in x), false);
  const priced = priceCartForStripe([{ productId: "FW26-TOTE", color: "Hunter", quantity: 1 }]);
  assert.equal(priced.lineItems[0].price_data.unit_amount, 3500);
  assert.deepEqual(priced.lineItems[0].price_data.product_data.metadata, { pod: "true", product_id: "FW26-TOTE", style: "", color: "Hunter", size: "" });
  assert.match(priced.lineItems[0].price_data.product_data.name, /^Tote Bag/);
  assert.doesNotMatch(priced.lineItems[0].price_data.product_data.name, /FW26|CIG/);
  for (const color of p.colors) {
    assert.equal(priceCartForStripe([{ productId: "FW26-TOTE", color, quantity: 1 }]).lineItems[0].price_data.unit_amount, 3500, color);
  }
  assert.equal(POD_CARD_ONLY, false); // card or PayPal (CIG 10/22)
  const items = podLines(priced.lineItems.map((line) => ({
    quantity: line.quantity,
    amount_total: line.price_data.unit_amount * line.quantity,
    price: { product: { metadata: line.price_data.product_data.metadata } },
  }))).map(printfulItemForLine);
  assert.deepEqual(items.map((i) => [i.sync_variant_id, i.retail_price]), [[5589489621, "35.00"]]);
});

test("tote opens on green (Hunter) and its landing card shows the green tote", () => {
  const p = product("FW26-TOTE");
  assert.equal(p.defaultColor, "Hunter");
  assert.equal(p.image, "assets/products/fw26/tote_hunter_front.webp");
  assert.equal(p.image, p.colorImages.Hunter);
});
