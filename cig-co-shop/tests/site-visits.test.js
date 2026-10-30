// First-party site-visit tracking (CIG 10/30): beacon on every page, DNT/GPC skip,
// payload validation, bot drop, no IP stored, weekly summary is read-only.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const beacon = require("../site-visits.js");
const { createHandler, validatePayload, isBot, countryFrom, MAX_BODY_BYTES } = require("../netlify/functions/track-visit.js");
const { formatSummary } = require("../scripts/weekly-visits.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const good = { event: "pageview", path: "/", session_id: "abc123def456", device: "mobile", src: "qr", referrer_host: "t.co" };
const post = (body, headers = {}) => ({ httpMethod: "POST", headers: { "user-agent": UA, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

function setup() {
  const rows = [];
  const handler = createHandler({ logger: { error() {} }, clientFactory: () => ({ insert: async (table, row) => rows.push([table, row]) }) });
  return { handler, rows };
}

test("every HTML page loads site-visits.js once, before the other scripts", () => {
  const pages = fs.readdirSync(root).filter((f) => f.endsWith(".html"));
  assert.ok(pages.length >= 5);
  for (const f of pages) {
    const html = read(f);
    assert.equal(html.split('<script src="site-visits.js"></script>').length - 1, 1, f);
    assert.ok(html.indexOf("site-visits.js") < html.indexOf('<script src="products.js">'), f);
  }
  assert.ok(read("scripts/build-policy-pages.py").includes('<script src="site-visits.js"></script>'));
});

test("no third-party trackers or cookies", () => {
  for (const f of fs.readdirSync(root).filter((x) => x.endsWith(".html"))) {
    assert.doesNotMatch(read(f), /googletagmanager|gtag\(|google-analytics|plausible|segment\.com|hotjar|fbq\(|clarity\.ms/i, f);
  }
  assert.doesNotMatch(read("site-visits.js"), /document\.cookie|localStorage/);
});

test("Do Not Track and Global Privacy Control skip tracking", () => {
  assert.equal(beacon.privacyOptOut({ doNotTrack: "1" }), true);
  assert.equal(beacon.privacyOptOut({ globalPrivacyControl: true }), true);
  assert.equal(beacon.privacyOptOut({ msDoNotTrack: "1" }), true);
  assert.equal(beacon.privacyOptOut({}, { doNotTrack: "1" }), true);
  assert.equal(beacon.privacyOptOut({ doNotTrack: "0" }), false);
  assert.equal(beacon.privacyOptOut({ doNotTrack: "unspecified" }), false);
});

test("beacon payload: path, outside referrer only, utm/src kept for the tab, device, session id", () => {
  const store = {};
  const storage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const p = beacon.buildPayload("pageview", null, {
    location: { href: "https://cigcompany.com/gallery.html?src=qr&utm_source=ig&utm_medium=story&utm_campaign=fw26", pathname: "/gallery.html", hostname: "cigcompany.com" },
    referrer: "https://t.co/abc?x=1", width: 390, storage,
  });
  assert.deepEqual({ ...p, session_id: undefined }, {
    event: "pageview", path: "/gallery.html", product_id: null, referrer_host: "t.co",
    utm_source: "ig", utm_medium: "story", utm_campaign: "fw26", src: "qr", device: "mobile", session_id: undefined,
  });
  assert.match(p.session_id, /^[a-z0-9]{8,40}$/);
  const later = beacon.buildPayload("add_to_bag", "0013", {
    location: { href: "https://cigcompany.com/", pathname: "/", hostname: "cigcompany.com" }, referrer: "https://cigcompany.com/gallery.html", width: 1440, storage,
  });
  assert.equal(later.session_id, p.session_id);
  assert.equal(later.src, "qr");
  assert.equal(later.product_id, "0013");
  assert.equal(later.referrer_host, null);
  assert.equal(later.device, "desktop");
  assert.equal(beacon.referrerHost("https://cigcompany.com/x", "cigcompany.com"), null);
  assert.equal(beacon.referrerHost("not a url", "cigcompany.com"), null);
});

test("cigTrack never throws, and does nothing outside a browser", () => {
  assert.equal(beacon.cigTrack("pageview"), false);
  assert.equal(beacon.cigTrack("made_up_event"), false);
});

test("add-to-bag, product view and checkout start fire the tracking hook", () => {
  assert.match(read("cart.js"), /trackSiteEvent\("add_to_bag", item\.productId\)/);
  assert.match(read("app.js"), /trackSiteEvent\("product_view", p\.id\)/);
  assert.match(read("app.js"), /trackSiteEvent\("checkout_start"\)/);
  assert.match(read("cart.js"), /function trackSiteEvent[\s\S]*?try \{[\s\S]*?catch/);
});

test("payload validation keeps known fields only and rejects bad input", () => {
  const row = validatePayload({ ...good, ip: "1.2.3.4", email: "a@b.co", referrer_host: "T.CO" });
  assert.deepEqual(row, {
    session_id: "abc123def456", path: "/", event: "pageview", product_id: null, referrer_host: "t.co",
    utm_source: null, utm_medium: null, utm_campaign: null, src: "qr", device: "mobile",
  });
  for (const bad of [
    null, [], "x", { ...good, event: "purchase" }, { ...good, path: "gallery" }, { ...good, path: "/<script>" },
    { ...good, event: "product_view" }, { ...good, src: "<b>" }, { ...good, utm_source: 5 }, { ...good, session_id: "BAD!" },
  ]) {
    assert.throws(() => validatePayload(bad), JSON.stringify(bad));
  }
  assert.equal(validatePayload({ ...good, device: "fridge" }).device, null);
  assert.equal(validatePayload({ ...good, event: "product_view", product_id: "0013" }).product_id, "0013");
});

test("stores a valid visit with country from Netlify geo and no IP or user agent", async () => {
  const { handler, rows } = setup();
  const res = await handler(post(good, { "x-country": "us", "x-nf-client-connection-ip": "9.9.9.9" }));
  assert.equal(res.statusCode, 204);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0], "site_visits");
  assert.equal(rows[0][1].country, "US");
  assert.doesNotMatch(JSON.stringify(rows[0][1]), /9\.9\.9\.9|iPhone|Mozilla/);
  const geo = Buffer.from(JSON.stringify({ country: { code: "GB" } })).toString("base64");
  assert.equal(countryFrom({ headers: { "x-nf-geo": geo } }), "GB");
  assert.equal(countryFrom({ headers: {} }, { geo: { country: { code: "ca" } } }), "CA");
  assert.equal(countryFrom({ headers: { "x-country": "nope" } }), null);
});

test("accepts base64 beacon bodies", async () => {
  const { handler, rows } = setup();
  const ev = post("", {});
  ev.body = Buffer.from(JSON.stringify(good)).toString("base64");
  ev.isBase64Encoded = true;
  assert.equal((await handler(ev)).statusCode, 204);
  assert.equal(rows.length, 1);
});

test("drops bots, oversized and bad payloads silently", async () => {
  for (const ua of ["Googlebot/2.1 (+http://www.google.com/bot.html)", "curl/8.4.0", "facebookexternalhit/1.1", "Mozilla/5.0 HeadlessChrome/120", "", undefined]) {
    assert.equal(isBot(ua), true, String(ua));
  }
  assert.equal(isBot(UA), false);
  const { handler, rows } = setup();
  assert.equal((await handler(post(good, { "user-agent": "Googlebot/2.1" }))).statusCode, 204);
  assert.equal((await handler(post({ ...good, utm_campaign: "x".repeat(MAX_BODY_BYTES) }))).statusCode, 204);
  assert.equal((await handler(post("{not json"))).statusCode, 204);
  assert.equal((await handler(post({ ...good, event: "nope" }))).statusCode, 204);
  assert.equal((await handler({ httpMethod: "GET", headers: {} })).statusCode, 405);
  assert.equal(rows.length, 0);
});

test("a Supabase failure still answers 204", async () => {
  const handler = createHandler({ logger: { error() {} }, clientFactory: () => ({ insert: async () => { throw new Error("down"); } }) });
  assert.equal((await handler(post(good))).statusCode, 204);
});

test("migration: RLS on, no public policies, summary function locked to service role", () => {
  const sql = read("supabase/migrations/202610300002_site_visits.sql");
  assert.match(sql, /create table if not exists public\.site_visits/);
  assert.match(sql, /alter table public\.site_visits enable row level security/);
  assert.doesNotMatch(sql, /create policy/i);
  assert.match(sql, /revoke all on table public\.site_visits from public, anon, authenticated/);
  assert.match(sql, /revoke execute on function public\.cigco_site_visits_summary\(integer\) from public, anon, authenticated/);
  assert.doesNotMatch(sql, /\bip\b|user_agent/i);
  for (const col of ["session_id", "path", "event", "product_id", "referrer_host", "utm_source", "utm_medium", "utm_campaign", "src", "device", "country"]) {
    assert.match(sql, new RegExp(`\\n  ${col} text`), col);
  }
});

test("weekly report is read-only and formats a summary", () => {
  const script = read("scripts/weekly-visits.js");
  assert.doesNotMatch(script, /\.insert\(|method: "(POST|PATCH|DELETE)"/);
  const text = formatSummary({
    days: 7,
    totals: { visits: 12, unique_sessions: 5, product_views: 8, add_to_bag: 2, checkout_start: 1 },
    by_day: [{ day: "2026-10-30", visits: 12, unique_sessions: 5, product_views: 8, add_to_bag: 2, checkout_start: 1 }],
    top_pages: [{ path: "/", visits: 10 }], top_products: [{ product_id: "0013", views: 4, add_to_bag: 1 }],
    referrers: [{ referrer: "t.co", visits: 3 }], src: [{ src: "qr", visits: 2 }], utm: [], countries: [{ country: "US", visits: 12 }], devices: [{ device: "mobile", visits: 9 }],
  });
  for (const s of ["Visits (page views): 12", "Unique sessions: 5", "Add to Bag: 2", "Checkout starts: 1", "2026-10-30  12 / 5 / 8 / 2 / 1", "0013  4 / 1", "qr  2", "US  12"]) {
    assert.ok(text.includes(s), s);
  }
});
