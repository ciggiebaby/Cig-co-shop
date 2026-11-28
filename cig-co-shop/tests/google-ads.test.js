const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ads = require("../google-ads.js");
const page = require("../product-page.js");

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  };
}

function calls() {
  const sent = [];
  return { sent, gtag: (...args) => sent.push(args) };
}

test("add to bag sends only the add-to-cart conversion", () => {
  const { sent, gtag } = calls();
  assert.equal(ads.addToCart({ gtag, navigator: {}, window: {} }), true);
  assert.deepEqual(sent, [["event", "conversion", { send_to: ads.ADD_TO_CART_SEND_TO }]]);
  assert.equal(ads.addToCart({ gtag, navigator: { globalPrivacyControl: true }, window: {} }), false);
  assert.equal(ads.addToCart({ gtag, navigator: { doNotTrack: "1" }, window: {} }), false);
  assert.equal(sent.length, 1);
});

test("purchase fires once after confirmed payment, in USD, and not before", () => {
  const { sent, gtag } = calls();
  const storage = memStorage();
  const order = { confirmed: true, value: 44, transactionId: "pi_123" };
  assert.equal(ads.purchase({ value: 44, transactionId: "pi_123" }, { gtag, storage }), false);
  assert.equal(ads.purchase({ confirmed: true, transactionId: "pi_123" }, { gtag, storage }), false);
  assert.equal(ads.purchase({ confirmed: true, value: -1, transactionId: "pi_123" }, { gtag, storage }), false);
  assert.equal(ads.purchase({ confirmed: true, value: 44, transactionId: "buyer@x.co" }, { gtag, storage }), false);
  assert.equal(sent.length, 0);
  assert.equal(ads.purchase(order, { gtag, storage, navigator: {} }), true);
  assert.deepEqual(sent[0], ["event", "conversion", {
    send_to: ads.PURCHASE_SEND_TO,
    value: 44,
    currency: "USD",
    transaction_id: "pi_123",
  }]);
  assert.equal(ads.purchase({ ...order, value: 99 }, { gtag, storage }), false);
  assert.equal(sent.length, 1);
  assert.equal(ads.purchase({ confirmed: true, value: "18.5", transactionId: "paypal:CAP1" }, { gtag, storage }), true);
  assert.equal(sent[1][2].value, 18.5);
  assert.equal(sent[1][2].currency, "USD");
  assert.equal(sent[1][2].transaction_id, "paypal:CAP1");
  assert.equal(ads.purchase(order, { gtag, storage, navigator: { globalPrivacyControl: true } }), false);
  assert.equal(sent.length, 2);
});

test("the pending checkout return is not a purchase", () => {
  const app = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  assert.match(app, /Payment confirmation is still pending/);
  assert.doesNotMatch(app, /CIGGoogleAds|\.purchase\(|AW-18545350125/);
  assert.match(ads.purchase.toString(), /confirmed !== true/);
});

test("install loads gtag.js for AW-18545350125 once", () => {
  const nodes = [];
  const byId = {};
  const doc = {
    head: { appendChild(node) { nodes.push(node); } },
    createElement() {
      return {};
    },
    getElementById(id) { return byId[id] || null; },
  };
  const win = {};
  assert.equal(ads.install(doc, win), true);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].src, ads.SCRIPT_SRC);
  assert.ok(ads.SCRIPT_SRC.endsWith(ads.AW_ID));
  assert.equal(nodes[0].async, true);
  assert.equal(nodes[0].id, "cig-google-ads");
  byId["cig-google-ads"] = nodes[0];
  assert.equal(ads.install(doc, win), true);
  assert.equal(nodes.length, 1);
  assert.equal(win.dataLayer.length >= 2, true);
  assert.equal(win.dataLayer[1][0], "config");
  assert.equal(win.dataLayer[1][1], ads.AW_ID);
});

test("product buy links keep a Google click id", () => {
  assert.deepEqual(page.attributionParams("?color=Gold&gclid=CjwKCAjw&foo=1"), { gclid: "CjwKCAjw" });
  assert.equal(
    page.withAttribution("/?product=0008", { gclid: "CjwKCAjw" }),
    "/?product=0008&gclid=CjwKCAjw",
  );
});
