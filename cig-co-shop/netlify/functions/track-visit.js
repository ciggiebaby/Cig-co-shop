// First-party site-visit tracking (CIG 10/30). Receives the beacon from
// site-visits.js and stores one row in Supabase `site_visits`.
// Stores no IP, no user agent, no cookies and nothing personal: just the page,
// event, product id, referring site, utm/src tags, mobile/desktop, a random
// per-tab session id and the visitor's country (from Netlify's geo header).
// Bots are dropped. Always answers 204 so the browser never retries or errors.
const { createSupabaseClient } = require("../lib/supabase.js");

const MAX_BODY_BYTES = 2048;
const EVENTS = new Set(["pageview", "product_view", "add_to_bag", "checkout_start"]);
const DEVICES = new Set(["mobile", "desktop"]);
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora link|whatsapp|telegram|discord|skypeuri|vkshare|pinterest|bitly|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl|wget|python|httpclient|go-http|java\/|okhttp|axios|node-fetch|undici|postman|insomnia|scrapy|ahrefs|semrush|mj12|dotbot|petal|bytespider|gptbot|claude|perplexity|ccbot|applebot|bingpreview|yandex|baidu/i;

const noContent = { statusCode: 204, headers: { "Cache-Control": "no-store" }, body: "" };

class PayloadError extends Error {}

function header(event, name) {
  const headers = (event && event.headers) || {};
  const want = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === want) return headers[key];
  }
  return undefined;
}

function isBot(userAgent) {
  if (typeof userAgent !== "string" || userAgent.trim().length < 10) return true;
  return BOT_UA.test(userAgent);
}

function rawBody(event) {
  const body = event && event.body;
  if (typeof body !== "string" || !body) throw new PayloadError("empty");
  const text = event.isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw new PayloadError("too_large");
  return text;
}

function tag(value, pattern, max) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new PayloadError("bad_type");
  const v = value.trim().slice(0, max);
  if (!v) return null;
  if (!pattern.test(v)) throw new PayloadError("bad_value");
  return v;
}

const SLUG = /^[A-Za-z0-9._~+\- ]+$/;

function validatePayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new PayloadError("not_object");
  if (!EVENTS.has(input.event)) throw new PayloadError("bad_event");
  const path = typeof input.path === "string" ? input.path.trim() : "";
  if (!/^\/[A-Za-z0-9._~\-\/%]*$/.test(path) || path.length > 200) throw new PayloadError("bad_path");
  const productId = tag(input.product_id, /^[A-Za-z0-9_\-]+$/, 40);
  if ((input.event === "product_view" || input.event === "add_to_bag") && !productId) {
    throw new PayloadError("missing_product");
  }
  const referrer = tag(input.referrer_host, /^[a-z0-9.\-]+$/i, 120);
  const device = DEVICES.has(input.device) ? input.device : null;
  return {
    session_id: tag(input.session_id, /^[a-z0-9]{8,40}$/, 40),
    path,
    event: input.event,
    product_id: productId,
    referrer_host: referrer ? referrer.toLowerCase() : null,
    utm_source: tag(input.utm_source, SLUG, 80),
    utm_medium: tag(input.utm_medium, SLUG, 80),
    utm_campaign: tag(input.utm_campaign, SLUG, 80),
    src: tag(input.src, SLUG, 80),
    device,
  };
}

function countryFrom(event, context) {
  const fromContext = context && context.geo && context.geo.country && context.geo.country.code;
  let code = fromContext || header(event, "x-country");
  if (!code) {
    const geo = header(event, "x-nf-geo");
    if (geo) {
      try {
        const parsed = JSON.parse(Buffer.from(geo, "base64").toString("utf8"));
        code = parsed && parsed.country && parsed.country.code;
      } catch {
        code = null;
      }
    }
  }
  return typeof code === "string" && /^[A-Za-z]{2}$/.test(code) ? code.toUpperCase() : null;
}

function createHandler({ clientFactory = () => createSupabaseClient(), logger = console } = {}) {
  return async (event, context) => {
    if (!event || event.httpMethod !== "POST") {
      return { statusCode: 405, headers: { Allow: "POST" }, body: "" };
    }
    try {
      if (isBot(header(event, "user-agent"))) return noContent;
      let row;
      try {
        row = validatePayload(JSON.parse(rawBody(event)));
      } catch {
        return noContent; // bad or oversized payload: drop silently
      }
      row.country = countryFrom(event, context);
      await clientFactory().insert("site_visits", row);
    } catch (error) {
      logger.error("Site visit not recorded.", { error: error && (error.code || error.status || error.name) });
    }
    return noContent;
  };
}

const handler = createHandler();

module.exports = { createHandler, handler, validatePayload, isBot, countryFrom, PayloadError, MAX_BODY_BYTES };
