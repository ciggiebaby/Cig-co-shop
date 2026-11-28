// First-party site-visit tracking (CIG 10/30): beacon on every page, DNT/GPC skip,
// payload validation, bot drop, no IP stored, weekly summary is read-only.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const beacon = require("../site-visits.js");
const { EVENTS, createHandler, validatePayload, isBot, countryFrom, MAX_BODY_BYTES } = require("../netlify/functions/track-visit.js");
const { SupabaseRequestError } = require("../netlify/lib/supabase.js");
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
    const visits = html.indexOf("site-visits.js");
    const products = html.indexOf('<script src="products.js">');
    if (products >= 0) assert.ok(visits < products, f);
  }
  assert.ok(read("scripts/build-policy-pages.py").includes('<script src="site-visits.js"></script>'));
});

function walkHtml(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === "tests") continue;
    const abs = path.join(dir, name);
    if (fs.statSync(abs).isDirectory()) out.push(...walkHtml(abs));
    else if (name.endsWith(".html")) out.push(path.relative(root, abs));
  }
  return out;
}

test("Google Ads tag is the next script after site-visits, and no other third-party trackers", () => {
  const pages = walkHtml(root);
  assert.ok(pages.length >= 15);
  for (const f of pages) {
    const html = read(f);
    const rooted = html.includes('src="/site-visits.js"');
    const visits = rooted ? '<script src="/site-visits.js"></script>' : '<script src="site-visits.js"></script>';
    const ads = rooted ? '<script src="/google-ads.js"></script>' : '<script src="google-ads.js"></script>';
    assert.equal(html.split(visits).length - 1, 1, f);
    assert.ok(html.includes(`${visits}\n${ads}`), f);
    assert.doesNotMatch(html, /googletagmanager|gtag\(|google-analytics|plausible|segment\.com|hotjar|fbq\(|clarity\.ms/i, f);
  }
  assert.ok(read("scripts/build-policy-pages.py").includes('<script src="google-ads.js"></script>'));
  assert.ok(read("scripts/build-product-pages.js").includes('<script src="/google-ads.js"></script>'));
  const tag = read("google-ads.js");
  assert.match(tag, /https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=AW-18545350125/);
  assert.match(tag, /AW-18545350125\/a3w3CNuOir8dEO2rjotF/);
  assert.match(tag, /AW-18545350125\/XPrBCMrq-cAdEO2rjotF/);
  assert.doesNotMatch(read("app.js"), /CIGGoogleAds|AW-18545350125|gtag\(/);
  assert.doesNotMatch(read("site-visits.js"), /document\.cookie|localStorage/);
  assert.match(read("cart.js"), /event !== "add_to_bag"[\s\S]*?ads\.addToCart\(\)/);
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

test("a gclid landing with no src is google-ads, and an existing src is kept", () => {
  const store = {};
  const storage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const gclid = `Cjw${"A".repeat(86)}`;
  assert.ok(gclid.length > 80);
  const p = beacon.buildPayload("pageview", null, {
    location: { href: `https://cigcompany.com/?gclid=${gclid}`, pathname: "/", hostname: "cigcompany.com" },
    referrer: "https://www.google.com/", width: 390, storage,
  });
  assert.equal(p.src, "google-ads");
  assert.equal(p.gclid, gclid);
  assert.equal(p.gbraid, undefined);
  const later = beacon.buildPayload("add_to_bag", "0013", {
    location: { href: "https://cigcompany.com/", pathname: "/", hostname: "cigcompany.com" },
    referrer: "", width: 1440, storage,
  });
  assert.equal(later.src, "google-ads");
  assert.equal(later.gclid, gclid);
  const fresh = {};
  const freshStorage = { getItem: (k) => (k in fresh ? fresh[k] : null), setItem: (k, v) => { fresh[k] = String(v); } };
  const kept = beacon.buildPayload("pageview", null, {
    location: { href: "https://cigcompany.com/?src=ig&wbraid=WB123", pathname: "/", hostname: "cigcompany.com" },
    referrer: "", width: 390, storage: freshStorage,
  });
  assert.equal(kept.src, "ig");
  assert.equal(kept.wbraid, "WB123");
  const junk = beacon.buildPayload("pageview", null, {
    location: { href: `https://cigcompany.com/?gclid=${"x".repeat(201)}`, pathname: "/", hostname: "cigcompany.com" },
    referrer: "", width: 390, storage: { getItem: () => null, setItem() {} },
  });
  assert.equal(junk.src, "google-ads");
  assert.equal(junk.gclid, undefined);
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

test("a ?product= landing pageview keeps the product id, referrer and src", () => {
  assert.equal(beacon.landingProductId("https://cigcompany.com/?product=FW26-BUNDLE&src=ig"), "FW26-BUNDLE");
  assert.equal(beacon.landingProductId("https://cigcompany.com/?product=%3Cbad%3E&src=ig"), null);
  assert.equal(beacon.landingProductId("https://cigcompany.com/"), null);
  const store = {};
  const storage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const p = beacon.buildPayload("pageview", beacon.landingProductId("https://cigcompany.com/?product=FW26-BUNDLE&src=tiktok"), {
    location: { href: "https://cigcompany.com/?product=FW26-BUNDLE&src=tiktok", pathname: "/", hostname: "cigcompany.com" },
    referrer: "https://www.tiktok.com/t/abc", width: 390, storage,
  });
  assert.equal(p.event, "pageview");
  assert.equal(p.path, "/");
  assert.equal(p.product_id, "FW26-BUNDLE");
  assert.equal(p.referrer_host, "www.tiktok.com");
  assert.equal(p.src, "tiktok");
  assert.equal(p.detail, undefined);
  assert.equal(beacon.buildPayload("checkout_pay_click", null, {
    location: { href: "https://cigcompany.com/", pathname: "/", hostname: "cigcompany.com" },
    referrer: "", width: 390, storage,
  }, "card").detail, "card");
  assert.equal(beacon.buildPayload("checkout_validation_error", null, {
    location: { href: "https://cigcompany.com/", pathname: "/", hostname: "cigcompany.com" },
    referrer: "", width: 390, storage,
  }, "a@b.co").detail, undefined);
});

test("client and server accept the same funnel events", () => {
  assert.deepEqual(beacon.EVENTS, [...EVENTS]);
});

test("payload validation keeps known fields only and rejects bad input", () => {
  const row = validatePayload({ ...good, ip: "1.2.3.4", email: "a@b.co", referrer_host: "T.CO" });
  assert.deepEqual(row, {
    session_id: "abc123def456", path: "/", event: "pageview", product_id: null, referrer_host: "t.co",
    utm_source: null, utm_medium: null, utm_campaign: null, src: "qr", device: "mobile",
  });
  for (const bad of [
    null, [], "x", { ...good, event: "purchase" }, { ...good, path: "gallery" }, { ...good, path: "/<script>" },
    { ...good, event: "product_view" }, { ...good, path: "/?product=FW26-BUNDLE" },
  ]) {
    assert.throws(() => validatePayload(bad), JSON.stringify(bad));
  }
  // A bad optional tag is dropped. The visit itself is kept, so a weird
  // referrer can't erase the pageview (and the src/utm that came with it).
  const messy = validatePayload({
    ...good, email: "a@b.co", src: "<b>", utm_source: 5, session_id: "BAD!",
    referrer_host: "not a host!", detail: "buyer@example.com",
  });
  assert.equal(messy.event, "pageview");
  assert.equal(messy.src, null);
  assert.equal(messy.utm_source, null);
  assert.equal(messy.session_id, null);
  assert.equal(messy.referrer_host, null);
  assert.equal(messy.detail, undefined);
  assert.equal(messy.email, undefined);
  assert.equal(validatePayload({ ...good, device: "fridge" }).device, null);
  assert.equal(validatePayload({ ...good, event: "product_view", product_id: "0013" }).product_id, "0013");
  assert.equal(validatePayload({ ...good, event: "pageview", product_id: "FW26-BUNDLE" }).product_id, "FW26-BUNDLE");
  const click = validatePayload({ ...good, event: "checkout_pay_click", detail: "card", email: "a@b.co", address: "1 Main" });
  assert.equal(click.event, "checkout_pay_click");
  assert.equal(click.detail, "card");
  assert.equal(click.email, undefined);
  assert.equal(click.address, undefined);
  assert.equal(validatePayload({ ...good, event: "checkout_validation_error", detail: "email" }).detail, "email");
  assert.equal(validatePayload({ ...good, event: "bag_upsell_shown", product_id: "FW26-BUNDLE", detail: "bag" }).detail, "bag");
  const gclid = `Cjw${"B".repeat(90)}`;
  const ads = validatePayload({ ...good, src: null, gclid, gbraid: "not a click id" });
  assert.equal(ads.src, "google-ads");
  assert.equal(ads.gclid, gclid);
  assert.equal(ads.gbraid, undefined);
  const both = validatePayload({ ...good, src: "qr", gclid });
  assert.equal(both.src, "qr");
  assert.equal(both.gclid, gclid);
  assert.equal(validatePayload({ ...good, gclid: "x".repeat(201) }).gclid, undefined);
  assert.equal(validatePayload({ ...good, src: "", gclid: "x".repeat(201) }).src, "google-ads");
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

test("a missing click-id column still records the visit without it", async () => {
  const rows = [];
  const handler = createHandler({
    logger: { error() {} },
    clientFactory: () => ({
      insert: async (table, row) => {
        if (row.gclid) throw new SupabaseRequestError("missing column", { status: 400, code: "PGRST204" });
        rows.push([table, row]);
      },
    }),
  });
  const res = await handler(post({ ...good, src: null, gclid: "CjwKCAjwtest" }));
  assert.equal(res.statusCode, 204);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][1].src, "google-ads");
  assert.equal(rows[0][1].gclid, undefined);
  assert.equal(rows[0][1].event, "pageview");
});

test("a Supabase failure still answers 204", async () => {
  const handler = createHandler({ logger: { error() {} }, clientFactory: () => ({ insert: async () => { throw new Error("down"); } }) });
  assert.equal((await handler(post(good))).statusCode, 204);
});

test("funnel migration allows the new events and a detail token, not personal data", () => {
  const sql = read("supabase/migrations/202611120001_site_visit_funnel.sql");
  for (const event of ["checkout_form_view", "checkout_pay_click", "checkout_validation_error", "checkout_session_error", "checkout_redirect", "bag_upsell_shown", "bag_upsell_accepted"]) {
    assert.match(sql, new RegExp(`'${event}'`), event);
  }
  assert.match(sql, /add column if not exists detail text/);
  assert.match(sql, /char_length\(detail\) <= 40/);
  assert.doesNotMatch(sql, /user_agent|\bemail text\b|\baddress text\b/);
  assert.match(sql, /revoke execute on function public\.cigco_site_visits_summary/);
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
    totals: {
      visits: 12, unique_sessions: 5, product_views: 8, add_to_bag: 2, checkout_start: 1,
      checkout_form_view: 1, checkout_pay_click: 1, checkout_validation_error: 1,
      checkout_session_error: 0, checkout_redirect: 0, bag_upsell_shown: 1, bag_upsell_accepted: 0,
    },
    by_day: [{ day: "2026-10-30", visits: 12, unique_sessions: 5, product_views: 8, add_to_bag: 2, checkout_start: 1 }],
    top_pages: [{ path: "/", visits: 10 }], top_products: [{ product_id: "0013", views: 4, add_to_bag: 1 }],
    referrers: [{ referrer: "t.co", visits: 3 }], src: [{ src: "qr", visits: 2 }], utm: [], countries: [{ country: "US", visits: 12 }], devices: [{ device: "mobile", visits: 9 }],
  });
  for (const s of ["Visits (page views): 12", "Unique sessions: 5", "Add to Bag: 2", "Checkout starts: 1", "Checkout form views: 1", "Pay clicks: 1", "Validation errors: 1", "Bag upsell shown / accepted: 1 / 0", "2026-10-30  12 / 5 / 8 / 2 / 1", "0013  4 / 1", "qr  2", "US  12"]) {
    assert.ok(text.includes(s), s);
  }
});
