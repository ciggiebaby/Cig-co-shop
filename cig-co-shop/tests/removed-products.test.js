// CIG Pillow Case (0003) and CIG Metallic Puffer Jacket (0009) were taken off
// the site 10/22. Their photos are gone too, and an old bag that still holds
// them drops those lines quietly.
require("./soldout-fixture.js");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { PRODUCTS } = require("../products.js");
const root = path.join(__dirname, "..");

test("0003 and 0009 are no longer in the catalog, pages or sitemap", () => {
  for (const id of ["0003", "0009"]) assert.equal(PRODUCTS.find((p) => p.id === id), undefined, id);
  for (const name of ["CIG Pillow Case", "CIG Metallic Puffer Jacket"]) assert.equal(PRODUCTS.find((p) => p.name === name), undefined, name);
  for (const file of ["products.js", "index.html", "gallery.html", "arcade.html", "sitemap.xml", "gallery-data.js"]) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    // "CIG Pillow Case" (the removed product), not the Throw Pillow's Printful
    // spec line "Print on both sides of the pillow case".
    assert.doesNotMatch(text.replace(/Print on both sides of the pillow case/g, ""), /Pillow Case|Puffer|pillow-(red|blue|purple|teal|black)\.jpg|puffer-jacket/i, file);
  }
  for (const f of ["pillow-red.jpg", "pillow-black.jpg", "puffer-jacket-front.jpg"]) assert.equal(fs.existsSync(path.join(root, "assets/products", f)), false, f);
});

test("a saved bag with removed products drops them and keeps the rest", () => {
  const store = new Map();
  store.set("cig_co_cart_v1", JSON.stringify([
    { productId: "0003", name: "CIG Pillow Case", price: 10, color: "Red", qty: 2 },
    { productId: "0010", name: "Toile Umbrella", price: 35, color: "Blue", qty: 1 },
    { productId: "0009", name: "CIG Metallic Puffer Jacket", price: 150, color: "Blue", qty: 1 },
    { productId: "0012", name: "CIG Corona Masks", price: 0, color: "Blue", qty: 1 },
  ]));
  const context = vm.createContext({
    PRODUCTS,
    localStorage: { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v) },
    document: { getElementById: () => null },
  });
  vm.runInContext(fs.readFileSync(path.join(root, "cart.js"), "utf8"), context);
  const cart = vm.runInContext("getCart()", context);
  assert.deepEqual(JSON.parse(JSON.stringify(cart)).map((i) => i.productId), ["0010"]);
  assert.deepEqual(JSON.parse(store.get("cig_co_cart_v1")).map((i) => i.productId), ["0010"]);
  store.set("cig_co_cart_v1", "not json");
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext("getCart()", context))), []);
});

test("the server refuses checkout for removed products", () => {
  const { priceCartForStripe } = require("../netlify/lib/stripe-pricing.js");
  for (const id of ["0003", "0009"]) {
    assert.throws(() => priceCartForStripe([{ productId: id, color: "Red", quantity: 1 }]));
  }
});
