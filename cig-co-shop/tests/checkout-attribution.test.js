const assert = require("node:assert/strict");
const test = require("node:test");
const attr = require("../checkout-attribution.js");
const { buildPayPalOrder, parseCustomId } = require("../netlify/lib/paypal.js");

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test("captures src and utm tags and keeps them for the tab", () => {
  const s = memStorage();
  assert.deepEqual(attr.capture("https://cigandco.com/?src=IG&utm_content=reel1#p", s), { src: "ig", utm_content: "reel1" });
  assert.deepEqual(attr.capture("https://cigandco.com/faq.html", s), { src: "ig", utm_content: "reel1" });
  assert.deepEqual(attr.capture("https://cigandco.com/?src=tiktok", s), { src: "tiktok" });
});

test("drops junk values", () => {
  assert.deepEqual(attr.fromUrl("https://x.test/?src=%3Cb%3E&utm_source=ok"), { utm_source: "ok" });
});

test("PayPal custom_id carries src and parses back", () => {
  assert.equal(typeof parseCustomId, "function");
  const order = buildPayPalOrder(
    { lineItems: [], totalCents: 1000, promoCode: null, stockLines: [] },
    { siteUrl: "https://x.test", src: "arcade" },
  );
  const custom = order.purchase_units[0].custom_id;
  assert.ok(custom.length <= 127);
  assert.equal(parseCustomId(custom).src, "arcade");
});
