const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
require("./legacy-fixture.js");
require("./promo-fixture.js");

const attr = require("../checkout-attribution.js");
const { campaignTag, orderAttributionParams } = require("../netlify/lib/attribution.js");
const { validatePayload } = require("../netlify/functions/track-visit.js");
const { buildPayPalOrder, paidPayPalOrder, parseCustomId } = require("../netlify/lib/paypal.js");
const { createHandler: createPayPalOrder } = require("../netlify/functions/create-paypal-order.js");
const { createHandler: createStripeWebhook } = require("../netlify/functions/stripe-webhook.js");
const { createCustomerStore } = require("../netlify/lib/customer-store.js");
const { recordPaidOrder } = require("../netlify/lib/order-recording.js");
const { SupabaseRequestError } = require("../netlify/lib/supabase.js");

const quiet = { log() {}, error() {}, warn() {} };
const DAY = 24 * 60 * 60 * 1000;

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test("first landing tags are kept for 30 days and a later link does not replace them", () => {
  const s = memStorage();
  const t0 = Date.parse("2026-11-01T00:00:00Z");
  assert.deepEqual(
    attr.capture("https://cigcompany.com/?src=IG&utm_content=reel1#p", s, t0),
    { src: "IG", utm_content: "reel1" },
  );
  assert.deepEqual(attr.capture("https://cigcompany.com/faq.html", s, t0 + DAY), { src: "IG", utm_content: "reel1" });
  assert.deepEqual(attr.capture("https://cigcompany.com/?src=tiktok&utm_source=tiktok", s, t0 + 29 * DAY), {
    src: "IG", utm_content: "reel1",
  });
  const saved = JSON.parse(s.getItem(attr.STORAGE_KEY));
  assert.equal(saved.savedAt, t0);
  assert.deepEqual(attr.capture("https://cigcompany.com/?src=tiktok", s, t0 + attr.TTL_MS + 1), { src: "tiktok" });
  assert.equal(attr.TTL_MS, 30 * DAY);
});

test("expired tags with no new link come back empty, and a broken store does not throw", () => {
  const s = memStorage();
  const t0 = Date.parse("2026-11-01T00:00:00Z");
  attr.capture("https://cigcompany.com/?src=qr", s, t0);
  assert.deepEqual(attr.capture("https://cigcompany.com/", s, t0 + attr.TTL_MS + 1), {});
  assert.equal(s.getItem(attr.STORAGE_KEY), null);

  assert.deepEqual(attr.capture("https://cigcompany.com/?src=ig", null), { src: "ig" });
  const broken = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("denied"); },
  };
  assert.deepEqual(attr.capture("https://cigcompany.com/?utm_medium=story", broken), { utm_medium: "story" });
  assert.deepEqual(attr.capture("not a url", s), {});
});

test("adopts the old flat sessionStorage shape and promotes it into localStorage", () => {
  const local = memStorage();
  const session = memStorage();
  session.setItem(attr.STORAGE_KEY, JSON.stringify({ src: "ig", utm_campaign: "FW26_Drop", junk: "<b>" }));
  global.window = {
    localStorage: local,
    sessionStorage: session,
    location: { href: "https://cigcompany.com/?src=tiktok" },
  };
  try {
    assert.deepEqual(attr.current(), { src: "ig", utm_campaign: "FW26_Drop" });
    const saved = JSON.parse(local.getItem(attr.STORAGE_KEY));
    assert.equal(saved.tags.src, "ig");
    assert.equal(typeof saved.savedAt, "number");
  } finally {
    delete global.window;
  }
});

test("drops junk values and uses the same slug rule as track-visit", () => {
  assert.deepEqual(attr.fromUrl("https://x.test/?src=%3Cb%3E&utm_source=ok"), { utm_source: "ok" });
  const base = { event: "pageview", path: "/", session_id: "abc123def456", device: "mobile" };
  const samples = [
    "ig", "IG", "FW26_Drop", "a".repeat(80), "a".repeat(81), "  tiktok  ",
    "fall winter", "a+b", "a~b", ".hidden", "<script>", "ok!", "", "   ", "café", "a/b", "has space",
  ];
  for (const sample of samples) {
    assert.equal(attr.clean(sample), campaignTag(sample), JSON.stringify(sample));
    const row = validatePayload({ ...base, src: sample, utm_source: sample, utm_medium: sample, utm_campaign: sample });
    assert.equal(row.src, campaignTag(sample), JSON.stringify(sample));
    assert.equal(row.utm_source, campaignTag(sample));
    assert.equal(row.utm_medium, campaignTag(sample));
    assert.equal(row.utm_campaign, campaignTag(sample));
  }
  assert.equal(campaignTag("a".repeat(81)), "a".repeat(80));
  assert.equal(campaignTag("  IG  "), "IG");
  assert.equal(campaignTag("<b>"), null);
});

test("PayPal custom_id carries src and utm tags and parses them back", () => {
  const order = buildPayPalOrder(
    { lineItems: [], totalCents: 1000, promoCode: null, stockLines: [] },
    { siteUrl: "https://x.test", attribution: { src: "Arcade", utm_source: "IG", utm_medium: "story", utm_campaign: "FW26_Drop", utm_content: "reel", evil: "<b>" } },
  );
  const custom = order.purchase_units[0].custom_id;
  assert.ok(custom.length <= 127);
  const parsed = parseCustomId(custom);
  assert.equal(parsed.src, "Arcade");
  assert.deepEqual(parsed.attribution, {
    src: "Arcade", utm_source: "IG", utm_medium: "story", utm_campaign: "FW26_Drop",
  });
  assert.equal(parsed.attribution.utm_content, undefined);
  assert.equal(parsed.attribution.evil, undefined);
});

test("PayPal drops tags that do not fit in custom_id and still keeps the sale fields", () => {
  const long = "a".repeat(80);
  const worst = buildPayPalOrder(
    { lineItems: [], totalCents: 1000, promoCode: "CIG15-ABCDEFGH", discountCents: 9999999, stockLines: [] },
    {
      siteUrl: "https://x.test",
      marketingConsent: true,
      shipping: { country: "KR", shippingCents: 4000 },
      pccc: "P123456789012",
      dropTest: true,
      attribution: { src: long, utm_source: long, utm_medium: long, utm_campaign: long },
    },
  );
  const raw = worst.purchase_units[0].custom_id;
  assert.ok(raw.length <= 127, String(raw.length));
  const custom = JSON.parse(raw);
  assert.equal(custom.p, "CIG15-ABCDEFGH");
  assert.equal(custom.d, 9999999);
  assert.equal(custom.m, 1);
  assert.equal(custom.c, "KR");
  assert.equal(custom.k, "P123456789012");
  assert.equal(custom.t, 1);
  for (const key of ["s", "us", "um", "uc"]) {
    if (custom[key] !== undefined) assert.equal(custom[key], long);
  }
  assert.equal(parseCustomId("not json").src, null);
  assert.deepEqual(parseCustomId("not json").attribution, {});
  assert.equal(parseCustomId(JSON.stringify({ s: "<script>", us: "ig" })).src, null);
  assert.deepEqual(parseCustomId(JSON.stringify({ s: "<script>", us: "ig" })).attribution, { utm_source: "ig" });
});

test("PayPal checkout still starts when attribution is missing or malformed", async () => {
  for (const attribution of [undefined, null, "ig", { src: "<script>" }, { src: "qr", utm_medium: "story" }]) {
    let sent;
    const handler = createPayPalOrder({
      paypalFactory: () => ({
        createOrder: async (order) => {
          sent = order;
          return { links: [{ rel: "approve", href: "https://paypal.test/approve" }] };
        },
      }),
      stockStoreFactory: () => ({ getStock: async () => [] }),
      environment: { SITE_URL: "https://cigcompany.com", PAYPAL_CLIENT_ID: "id", PAYPAL_SECRET: "secret" },
      logger: quiet,
    });
    const response = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({
        cart: [{ productId: "TEST-PILLOW", color: "Red", qty: 1 }],
        customer: { email: "b@example.com" },
        attribution,
      }),
    });
    assert.equal(response.statusCode, 200, JSON.stringify(attribution));
    assert.ok(sent.purchase_units[0].custom_id.length <= 127);
    const tags = parseCustomId(sent.purchase_units[0].custom_id).attribution;
    if (attribution && attribution.src === "qr") {
      assert.equal(tags.src, "qr");
      assert.equal(tags.utm_medium, "story");
    } else {
      assert.deepEqual(tags, {});
    }
  }
});

test("captured PayPal order carries attribution onto the order record", async () => {
  const built = buildPayPalOrder(
    { lineItems: [{ price_data: { unit_amount: 1000, product_data: { name: "Mask" } }, quantity: 1 }], totalCents: 1000, promoCode: "EARLYCIG", discountCents: 600, stockLines: [] },
    { siteUrl: "https://x.test", attribution: { src: "ig", utm_campaign: "early" } },
  );
  const paid = paidPayPalOrder({
    id: "PP1",
    status: "COMPLETED",
    payer: { email_address: "b@example.com", name: { given_name: "B", surname: "C" } },
    purchase_units: [{
      ...built.purchase_units[0],
      amount: { currency_code: "USD", value: "10.00" },
      items: [{ name: "Mask", quantity: "1", unit_amount: { currency_code: "USD", value: "10.00" } }],
      shipping: { address: { country_code: "US" } },
      payments: { captures: [{ id: "CAP1", status: "COMPLETED", amount: { currency_code: "USD", value: "10.00" }, create_time: "2026-11-24T17:00:00Z" }] },
    }],
  });
  assert.equal(paid.promoCode, "EARLYCIG");
  assert.deepEqual(paid.attribution, { src: "ig", utm_campaign: "early" });

  let sent;
  await recordPaidOrder({ ...paid, eventId: "paypal:CAP1", eventType: "paypal.capture" }, {
    storeFactory: () => ({
      processStripeOrder: async (order) => {
        sent = order;
        return { contact: { id: "c", marketing_consent: false }, order: { id: "o" } };
      },
    }),
    sendOrder: async () => {},
    syncKit: async () => {},
    logger: quiet,
  });
  assert.deepEqual(sent.attribution, { src: "ig", utm_campaign: "early" });
});

test("Stripe webhook passes landing tags to the order and ignores junk metadata", async () => {
  let processed;
  const session = {
    id: "cs_paid_1", mode: "payment", status: "complete", payment_status: "paid", payment_intent: "pi_1",
    amount_total: 4400, currency: "usd", customer_details: { email: "b@example.com", name: "B C" },
    metadata: {
      marketing_consent: "false", promo_code: "EARLYCIG", discount_cents: "1100",
      src: "IG", utm_source: "instagram", utm_medium: "<script>", utm_campaign: "fw26", evil: "x",
    },
    line_items: { data: [] },
  };
  const handler = createStripeWebhook({
    stripeFactory: () => ({
      webhooks: { constructEvent: () => ({ id: "evt_1", type: "checkout.session.completed", created: 1795000000, data: { object: { id: session.id } } }) },
      checkout: { sessions: { retrieve: async () => session } },
    }),
    storeFactory: () => ({
      processStripeOrder: async (order) => {
        processed = order;
        return { created: true, contact: { id: "c1", marketing_consent: false }, order: { id: "o1", order_number: "CIG-1" } };
      },
    }),
    stockStoreFactory: () => ({ commitOrder: async () => ({}) }),
    sendOrder: async () => {},
    syncKit: async () => {},
    environment: { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" },
    logger: quiet,
  });
  const response = await handler({ httpMethod: "POST", headers: { "stripe-signature": "ok" }, body: "raw" });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(processed.promoCode, "EARLYCIG");
  assert.deepEqual(processed.attribution, { src: "IG", utm_source: "instagram", utm_campaign: "fw26" });
});

function fakeClient(responses) {
  const calls = [];
  return {
    calls,
    rpc: async (name, params) => {
      calls.push({ name, params });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const baseOrder = {
  eventId: "e", eventType: "t", sessionId: "s", paymentIntentId: "p", email: "a@b.co", emailOriginal: "a@b.co",
  firstName: "A", lastName: null, amountTotalCents: 2400, currency: "usd", items: [], shippingDestination: null,
  marketingConsent: false, cartFingerprint: null, promoCode: null, paidAt: "2026-11-24T17:00:00Z",
};

test("customer store sends order attribution parameters and omits empty tags", async () => {
  const client = fakeClient([{ ok: 1 }]);
  await createCustomerStore(client).processStripeOrder({
    ...baseOrder,
    discountCents: 0,
    attribution: { src: "qr", utm_source: "ig", utm_medium: "story", utm_campaign: "fw26", utm_content: "reel", src2: "no" },
  });
  assert.deepEqual(orderAttributionParams({ src: "qr", utm_content: "reel", nope: "x" }), { p_src: "qr" });
  assert.equal(client.calls[0].params.p_src, "qr");
  assert.equal(client.calls[0].params.p_utm_source, "ig");
  assert.equal(client.calls[0].params.p_utm_medium, "story");
  assert.equal(client.calls[0].params.p_utm_campaign, "fw26");
  assert.equal("p_utm_content" in client.calls[0].params, false);
  assert.equal(client.calls[0].params.p_discount_cents, 0);

  const bare = fakeClient([{ ok: 1 }]);
  await createCustomerStore(bare).processStripeOrder({ ...baseOrder, discountCents: 0, attribution: { src: "<b>" } });
  assert.equal("p_src" in bare.calls[0].params, false);
});

test("customer store: if the attribution migration has not run, the order still records", async () => {
  const missing = new SupabaseRequestError("no signature", { status: 404, code: "PGRST202" });
  const client = fakeClient([missing, { recorded: true }]);
  const result = await createCustomerStore(client).processStripeOrder({
    ...baseOrder,
    discountCents: 600,
    attribution: { src: "ig", utm_campaign: "fw26" },
  });
  assert.deepEqual(result, { recorded: true });
  assert.equal(client.calls.length, 2);
  assert.equal(client.calls[0].params.p_src, "ig");
  assert.equal(client.calls[0].params.p_discount_cents, 600);
  assert.equal("p_src" in client.calls[1].params, false);
  assert.equal("p_utm_campaign" in client.calls[1].params, false);
  assert.equal(client.calls[1].params.p_discount_cents, 600);

  const neither = fakeClient([missing, missing, { recorded: true }]);
  const fallback = await createCustomerStore(neither).processStripeOrder({
    ...baseOrder,
    discountCents: 600,
    attribution: { src: "ig" },
  });
  assert.deepEqual(fallback, { recorded: true });
  assert.equal(neither.calls.length, 3);
  assert.equal("p_src" in neither.calls[2].params, false);
  assert.equal("p_discount_cents" in neither.calls[2].params, false);

  const other = fakeClient([new SupabaseRequestError("x", { status: 500, code: "XX000" })]);
  await assert.rejects(
    createCustomerStore(other).processStripeOrder({ ...baseOrder, discountCents: 0, attribution: { src: "ig" } }),
    (error) => error.code === "XX000",
  );
  assert.equal(other.calls.length, 1);
});

test("migration adds nullable order attribution columns and the RPC parameters", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../supabase/migrations/202611250001_orders_attribution.sql"), "utf8");
  for (const column of ["src", "utm_source", "utm_medium", "utm_campaign"]) {
    assert.match(sql, new RegExp(`add column if not exists ${column} text`));
    assert.match(sql, new RegExp(`p_${column} text default null`));
  }
  assert.match(sql, /cigco_campaign_tag/);
  assert.match(sql, /drop function if exists public\.cigco_process_stripe_order\(/);
  assert.match(sql, /grant execute on function public\.cigco_process_stripe_order\([\s\S]*text, text, text, text\s*\) to service_role;/);
  assert.match(sql, /revoke all on function public\.cigco_campaign_tag\(text\) from public, anon, authenticated;/);
});
