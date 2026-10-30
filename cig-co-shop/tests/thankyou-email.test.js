// Printful thank-you email (CIG, Oct 29, 2026).
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const {
  cigShippedItems, processThankYou, thankyouDelayDays, thankyouEnabled, verifyPrintfulSignature,
} = require("../netlify/lib/thankyou.js");
const { LINKS, THANKYOU_COPY, renderThankYouEmail } = require("../netlify/lib/thankyou-email-template.js");
const { createHandler: webhookHandler } = require("../netlify/functions/printful-webhook.js");
const { createHandler: sweepHandler } = require("../netlify/functions/thankyou-email-sweep.js");
const { createResendClient } = require("../netlify/lib/resend.js");
const { createCustomerStore } = require("../netlify/lib/customer-store.js");
const { arcadeSource } = require("../netlify/lib/subscribers.js");

const quiet = { error() {}, warn() {}, log() {} };
const SECRET = crypto.randomBytes(32).toString("hex");
const sign = (body, secret = SECRET) => crypto.createHmac("sha256", Buffer.from(secret, "hex")).update(body).digest("hex");

// ---------- In-memory store that behaves like the SQL (claim once, sent once) ----------
function fakeStore({ order = { id: "o1", order_number: "CIG-1042", items: [{ description: "Tote Bag — Paisley", quantity: 1 }] },
  contact = { id: "c1", email_normalized: "buyer@example.com", first_name: "Ana" }, unsubscribed = false } = {}) {
  const rows = new Map();
  const calls = { record: [], complete: [] };
  const ctx = (id) => ({ thankyou: rows.get(id), order, contact, unsubscribed });
  return {
    rows,
    calls,
    async thankyouRecordEvent({ printfulOrderId, externalId, event, occurredAt, delayDays }) {
      calls.record.push({ printfulOrderId, externalId, event, occurredAt, delayDays });
      const at = occurredAt ? Date.parse(occurredAt) : Date.now();
      const row = rows.get(printfulOrderId) || { status: "waiting", attempts: 0, due: null };
      if (event === "delivered") row.due = Math.min(row.due ?? Date.now(), Date.now());
      else if (row.due == null) row.due = at + delayDays * 86400000;
      rows.set(printfulOrderId, row);
      return ctx(printfulOrderId);
    },
    async thankyouClaim(id) {
      const row = rows.get(id);
      if (!row || row.due > Date.now() || row.attempts >= 5 || !["waiting", "failed"].includes(row.status)) return null;
      row.status = "sending";
      row.attempts += 1;
      return ctx(id);
    },
    async thankyouComplete(id, status, reason) {
      calls.complete.push([id, status, reason]);
      const row = rows.get(id);
      if (row.status !== "sent") Object.assign(row, { status, reason });
    },
    async thankyouDue() {
      return [...rows.entries()].filter(([, r]) => r.due <= Date.now() && ["waiting", "failed"].includes(r.status) && r.attempts < 5).map(([id]) => id);
    },
  };
}

function fakeResend() {
  const sent = [];
  const factory = () => ({ sendThankYou: async (args) => { sent.push(args); return { id: "re_1" }; } });
  return { sent, factory };
}

function printfulEvent(type, { orderId = 9001, externalId = "pi_123", shippedAt = new Date().toISOString(), deliveredAt = null } = {}) {
  return JSON.stringify({
    type,
    occurred_at: new Date().toISOString(),
    retries: 0,
    store_id: 1,
    data: {
      shipment: { id: 1, status: "shipped", tracking_number: "1Z", shipped_at: shippedAt, delivered_at: deliveredAt, reshipment: false },
      order: { id: orderId, external_id: externalId, status: "fulfilled", store_id: 1 },
    },
  });
}

const ENABLED = { PRINTFUL_WEBHOOK_SECRET: SECRET, THANKYOU_EMAIL_ENABLED: "true" };
function post(body, signature = sign(body)) {
  return { httpMethod: "POST", headers: { "X-PF-Webhook-Signature": signature }, body };
}

// ---------- Flags ----------
test("off by default; delay defaults to 5 days", () => {
  assert.equal(thankyouEnabled({}), false);
  assert.equal(thankyouEnabled({ THANKYOU_EMAIL_ENABLED: "false" }), false);
  assert.equal(thankyouEnabled({ THANKYOU_EMAIL_ENABLED: "TRUE" }), true);
  assert.equal(thankyouDelayDays({}), 5);
  assert.equal(thankyouDelayDays({ THANKYOU_DELAY_DAYS: "7" }), 7);
  assert.equal(thankyouDelayDays({ THANKYOU_DELAY_DAYS: "0" }), 0);
  assert.equal(thankyouDelayDays({ THANKYOU_DELAY_DAYS: "-3" }), 5);
  assert.equal(thankyouDelayDays({ THANKYOU_DELAY_DAYS: "abc" }), 5);
  assert.equal(thankyouDelayDays({ THANKYOU_DELAY_DAYS: "999" }), 60);
  assert.match(read(".env.example"), /THANKYOU_EMAIL_ENABLED=false/);
});

// ---------- Signature ----------
test("Printful v2 signature: hex HMAC-SHA256 of the raw body with the hex-decoded secret", () => {
  const body = printfulEvent("shipment_delivered");
  assert.equal(verifyPrintfulSignature(Buffer.from(body), sign(body), SECRET), true);
  assert.equal(verifyPrintfulSignature(Buffer.from(body), sign(body).toUpperCase(), SECRET), true);
  assert.equal(verifyPrintfulSignature(Buffer.from(body + " "), sign(body), SECRET), false);
  assert.equal(verifyPrintfulSignature(Buffer.from(body), sign(body, crypto.randomBytes(32).toString("hex")), SECRET), false);
  assert.equal(verifyPrintfulSignature(Buffer.from(body), undefined, SECRET), false);
  assert.equal(verifyPrintfulSignature(Buffer.from(body), "zz", SECRET), false);
  assert.equal(verifyPrintfulSignature(Buffer.from(body), sign(body), ""), false);
});

// ---------- Webhook ----------
test("webhook rejects unsigned/forged events and needs its secret", async () => {
  const store = fakeStore();
  const handler = webhookHandler({ storeFactory: () => store, resendFactory: fakeResend().factory, environment: ENABLED, logger: quiet });
  const body = printfulEvent("shipment_delivered");
  assert.equal((await handler(post(body, "deadbeef"))).statusCode, 401);
  assert.equal((await handler({ httpMethod: "POST", headers: {}, body })).statusCode, 401);
  assert.equal((await handler({ httpMethod: "GET", headers: {} })).statusCode, 405);
  const noSecret = webhookHandler({ storeFactory: () => store, environment: { THANKYOU_EMAIL_ENABLED: "true" }, logger: quiet });
  assert.equal((await noSecret(post(body))).statusCode, 500);
  assert.equal(store.calls.record.length, 0);
});

test("delivered -> thank-you sent right away, exactly once", async () => {
  const store = fakeStore();
  const resend = fakeResend();
  const handler = webhookHandler({ storeFactory: () => store, resendFactory: resend.factory, environment: ENABLED, logger: quiet });
  const body = printfulEvent("shipment_delivered", { deliveredAt: new Date().toISOString() });
  const res = await handler(post(body));
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).thankyou, "sent");
  assert.deepEqual(resend.sent, [{ email: "buyer@example.com", orderRef: "CIG-1042", firstName: "Ana", printfulOrderId: "9001" }]);
  assert.equal(store.calls.record[0].externalId, "pi_123");
  assert.equal(store.calls.record[0].event, "delivered");
  // Printful retries the same event, another shipment is delivered, the sweep runs: no second email.
  await handler(post(body));
  await handler(post(printfulEvent("shipment_delivered")));
  await sweepHandler({ storeFactory: () => store, resendFactory: resend.factory, environment: ENABLED, logger: quiet })();
  assert.equal(resend.sent.length, 1);
  assert.equal(store.rows.get("9001").status, "sent");
});

test("shipped -> waits THANKYOU_DELAY_DAYS, then the sweep sends it (fallback when delivered never comes)", async () => {
  const store = fakeStore();
  const resend = fakeResend();
  const env = { ...ENABLED, THANKYOU_DELAY_DAYS: "5" };
  const handler = webhookHandler({ storeFactory: () => store, resendFactory: resend.factory, environment: env, logger: quiet });
  const sweep = sweepHandler({ storeFactory: () => store, resendFactory: resend.factory, environment: env, logger: quiet });

  // Shipped just now: nothing yet, even after a sweep.
  let res = await handler(post(printfulEvent("shipment_sent", { orderId: 1 })));
  assert.equal(JSON.parse(res.body).thankyou, "not_claimed");
  assert.equal(store.calls.record[0].delayDays, 5);
  await sweep();
  assert.equal(resend.sent.length, 0);

  // Shipped 6 days ago, never delivered: the sweep sends it.
  const sixDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString();
  await handler(post(printfulEvent("shipment_sent", { orderId: 2, shippedAt: sixDaysAgo })));
  assert.equal(resend.sent.length, 1, "already past due when the shipped event lands");
  assert.equal(resend.sent[0].printfulOrderId, "2");

  // Shipped recently, then delivered: sent at delivery, not later.
  await handler(post(printfulEvent("shipment_sent", { orderId: 3 })));
  await handler(post(printfulEvent("shipment_delivered", { orderId: 3 })));
  assert.deepEqual(resend.sent.map((s) => s.printfulOrderId), ["2", "3"]);
  const tally = JSON.parse((await sweep()).body);
  assert.equal(tally.processed, 0);
});

test("disabled flag: events are ignored and nothing is recorded or sent", async () => {
  const store = fakeStore();
  const resend = fakeResend();
  const env = { PRINTFUL_WEBHOOK_SECRET: SECRET };
  const res = await webhookHandler({ storeFactory: () => store, resendFactory: resend.factory, environment: env, logger: quiet })(
    post(printfulEvent("shipment_delivered")));
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).reason, "thankyou_disabled");
  const sweep = await sweepHandler({ storeFactory: () => { throw new Error("must not touch the DB"); }, environment: env, logger: quiet })();
  assert.equal(JSON.parse(sweep.body).reason, "thankyou_disabled");
  assert.equal(store.calls.record.length + resend.sent.length, 0);
});

test("other Printful events are acknowledged and ignored", async () => {
  const store = fakeStore();
  const handler = webhookHandler({ storeFactory: () => store, resendFactory: fakeResend().factory, environment: ENABLED, logger: quiet });
  for (const type of ["order_created", "order_failed", "shipment_returned", "package_shipped"]) {
    const res = await handler(post(printfulEvent(type)));
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).processed, false);
  }
  assert.equal(store.calls.record.length, 0);
});

test("a DB error returns 500 so Printful retries", async () => {
  const handler = webhookHandler({
    storeFactory: () => ({ thankyouRecordEvent: async () => { throw Object.assign(new Error("x"), { code: "supabase_down" }); } }),
    resendFactory: fakeResend().factory, environment: ENABLED, logger: quiet,
  });
  assert.equal((await handler(post(printfulEvent("shipment_delivered")))).statusCode, 500);
});

// ---------- Skips ----------
test("orders with masks (or anything CIG ships himself) are skipped", async () => {
  assert.equal(cigShippedItems([{ description: "Tote Bag — Paisley" }, { description: "Throw Pillow" }]).length, 0);
  for (const description of ["CIG Ski Mask — Red — 1-Hole", "CIG Balaclava — Black", "Moto Mask — Pink", "cig ski mask", "Silky Bonnet & Durag — Red"]) {
    assert.equal(cigShippedItems([{ description: "Tote Bag" }, { description }]).length, 1, description);
  }
  const store = fakeStore({ order: { id: "o2", order_number: "CIG-2001", items: [{ description: "Tote Bag" }, { description: "CIG Ski Mask — Blue — 3-Hole" }] } });
  const resend = fakeResend();
  await webhookHandler({ storeFactory: () => store, resendFactory: resend.factory, environment: ENABLED, logger: quiet })(post(printfulEvent("shipment_delivered")));
  assert.equal(resend.sent.length, 0);
  assert.deepEqual(store.calls.complete[0], ["9001", "skipped", "cig_ships_order"]);
});

test("unsubscribed buyers, unknown orders and send failures", async () => {
  let store = fakeStore({ unsubscribed: true });
  let resend = fakeResend();
  await processThankYou({ store, printfulOrderId: "1", resend: resend.factory, logger: quiet }).catch(() => {});
  await store.thankyouRecordEvent({ printfulOrderId: "1", event: "delivered", delayDays: 5 });
  assert.equal((await processThankYou({ store, printfulOrderId: "1", resend: resend.factory, logger: quiet })).reason, "unsubscribed");
  assert.equal(resend.sent.length, 0);

  store = fakeStore({ order: null });
  await store.thankyouRecordEvent({ printfulOrderId: "2", event: "delivered", delayDays: 5 });
  assert.deepEqual(await processThankYou({ store, printfulOrderId: "2", resend: resend.factory, logger: quiet }), { status: "failed", reason: "order_not_found" });

  store = fakeStore();
  await store.thankyouRecordEvent({ printfulOrderId: "3", event: "delivered", delayDays: 5 });
  const failing = () => ({ sendThankYou: async () => { throw Object.assign(new Error("x"), { code: "resend_http_500" }); } });
  assert.deepEqual(await processThankYou({ store, printfulOrderId: "3", resend: failing, logger: quiet }), { status: "failed", reason: "resend_http_500" });
  // The sweep retries it.
  resend = fakeResend();
  await sweepHandler({ storeFactory: () => store, resendFactory: resend.factory, environment: ENABLED, logger: quiet })();
  assert.equal(resend.sent.length, 1);
});

// ---------- Email content ----------
test("email: order ref, Arcade button ?src=thankyou, complete-the-fit masks, early access, no QR by default", () => {
  const { subject, html } = renderThankYouEmail({ orderRef: "CIG-1042", firstName: "Ana", unsubscribeUrl: "https://cigcompany.com/.netlify/functions/unsubscribe?e=a&t=b" });
  assert.match(subject, /CIG-1042/);
  assert.match(html, /CIG-1042/);
  assert.match(html, /Hey Ana,/);
  assert.match(html, /href="https:\/\/cigcompany\.com\/arcade\.html\?src=thankyou"[^>]*>Play the Arcade<\/a>/);
  assert.equal(arcadeSource(new URL(LINKS.arcade).searchParams.get("src")), "thankyou");
  assert.match(html, /Complete the fit:/);
  for (const id of ["0008", "0005", "0013"]) assert.ok(html.includes(`https://cigcompany.com/#product-${id}`), id);
  assert.match(html, /href="https:\/\/cigcompany\.com\/#early-access"/);
  assert.match(html, /Unsubscribe<\/a>/);
  assert.match(html, /Paisley streetwear &amp; home goods/);
  assert.doesNotMatch(html, /<img/i, "no QR unless THANKYOU_QR_IMAGE_URL is set");
});

test("email: optional https QR at the bottom, names are escaped, copy is swappable", () => {
  const { html } = renderThankYouEmail({ orderRef: "CIG-1", firstName: "<b>x</b>", qrImageUrl: "https://cdn.example.com/qr.png" });
  assert.match(html, /<img src="https:\/\/cdn\.example\.com\/qr\.png"/);
  assert.ok(html.indexOf("<img") > html.indexOf("Play the Arcade"), "QR sits at the bottom");
  assert.ok(!html.includes("<b>x</b>"));
  assert.match(html, /reply \u201cunsubscribe\u201d/);
  assert.doesNotMatch(renderThankYouEmail({ orderRef: "CIG-1", qrImageUrl: "javascript:alert(1)" }).html, /<img/);
  const custom = renderThankYouEmail({ orderRef: "CIG-9", copy: { ...THANKYOU_COPY, heading: "YG copy here", subject: "Hi {orderRef}" } });
  assert.equal(custom.subject, "Hi CIG-9");
  assert.match(custom.html, /YG copy here/);
});

test("Resend: from the store address, idempotent per Printful order, unsubscribe headers", async () => {
  let payload;
  let idem;
  const client = createResendClient({
    apiKey: "re_test", fromEmail: "CIG & CO. <info@cigcompany.com>",
    environment: { UNSUBSCRIBE_SECRET: "s", SITE_URL: "https://cigcompany.com", THANKYOU_QR_IMAGE_URL: "https://cdn.example.com/qr.png" },
    fetchImpl: async (url, opts) => { payload = JSON.parse(opts.body); idem = opts.headers["Idempotency-Key"]; return { ok: true, json: async () => ({ id: "1" }) }; },
  });
  await client.sendThankYou({ email: "buyer@example.com", orderRef: "CIG-1042", firstName: null, printfulOrderId: "9001" });
  assert.equal(payload.from, "CIG & CO. <info@cigcompany.com>");
  assert.equal(payload.to, "buyer@example.com");
  assert.equal(idem, "thankyou/9001");
  assert.match(payload.subject, /CIG-1042/);
  assert.match(payload.html, /Hey,/);
  assert.match(payload.html, /cdn\.example\.com\/qr\.png/);
  assert.match(payload.headers["List-Unsubscribe"], /unsubscribe\?e=buyer%40example\.com&t=/);
  assert.equal(payload.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

// ---------- Plumbing ----------
test("store maps to the thank-you RPCs", async () => {
  const rpcs = [];
  const store = createCustomerStore({ rpc: async (name, params) => { rpcs.push([name, params]); return null; } });
  await store.thankyouRecordEvent({ printfulOrderId: "9", externalId: "pi_1", event: "shipped", occurredAt: "2026-11-01T00:00:00Z", delayDays: 5 });
  await store.thankyouClaim("9");
  await store.thankyouComplete("9", "sent");
  await store.thankyouDue(10);
  assert.deepEqual(rpcs.map((r) => r[0]), ["cigco_thankyou_record_event", "cigco_thankyou_claim", "cigco_thankyou_complete", "cigco_thankyou_due"]);
  assert.deepEqual(rpcs[0][1], { p_printful_order_id: "9", p_external_id: "pi_1", p_event: "shipped", p_occurred_at: "2026-11-01T00:00:00Z", p_delay_days: 5 });
});

test("migration: one row per Printful order, sent flag, locked down, PayPal external id matches printful.js", () => {
  const sql = read("supabase/migrations/202610310002_printful_thankyou_emails.sql");
  assert.match(sql, /printful_order_id text primary key/);
  assert.match(sql, /sent_at timestamptz/);
  assert.match(sql, /status in \('waiting', 'sending', 'sent', 'skipped', 'failed'\)/);
  assert.match(sql, /alter table public\.thankyou_emails enable row level security;/);
  assert.match(sql, /revoke all on table public\.thankyou_emails from public, anon, authenticated;/);
  assert.match(sql, /POST-MERGE STEP/);
  // Same hashing rule as printfulExternalId() for "paypal:..." payment ids.
  assert.match(sql, /'h_' \|\| left\(encode\(sha256\(convert_to\(p_payment_id, 'UTF8'\)\), 'hex'\), 30\)/);
  const { printfulExternalId } = require("../netlify/lib/printful.js");
  const id = "paypal:8AB12345CD678901E";
  assert.equal(printfulExternalId(id), "h_" + crypto.createHash("sha256").update(id).digest("hex").slice(0, 30));
  assert.equal(printfulExternalId("pi_3Q"), "pi_3Q");
});

test("hourly sweep is scheduled in netlify.toml", () => {
  assert.match(read("netlify.toml"), /\[functions\."thankyou-email-sweep"\]\s*\n\s*schedule = "@hourly"/);
});

test("#product-<id> deep links open the product (complete-the-fit links)", () => {
  const app = read("app.js");
  const ctx = {};
  vm.runInNewContext(app.slice(app.indexOf("function productIdFromHash"), app.indexOf("(function openLinkedProduct")) + "\nthis.f = productIdFromHash;", ctx);
  assert.equal(ctx.f("#product-0008"), "0008");
  assert.equal(ctx.f("#product-FW26-TOTE"), "FW26-TOTE");
  assert.equal(ctx.f("#shop"), null);
  assert.equal(ctx.f("#product-<x>"), null);
  assert.match(app, /if \(id && document\.getElementById\("modal-content"\)\) openProductModal\(id\);/);
});
