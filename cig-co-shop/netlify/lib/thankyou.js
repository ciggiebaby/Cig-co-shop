// Thank-you email for Printful-fulfilled orders (CIG, Oct 29, 2026). Those
// boxes ship straight from Printful with no QR card, so the email carries the
// Arcade link (?src=thankyou) instead.
//
// Trigger: Printful v2 webhooks (netlify/functions/printful-webhook.js).
//   shipment_delivered -> send now (what the team wants).
//   shipment_sent      -> hourly sweep fallback, for carriers whose tracking
//                         never reports "delivered":
//                           US (or no country on the order): shipped +
//                           THANKYOU_DELAY_DAYS (default 5)
//                           any other country: shipped +
//                           THANKYOU_INTL_DELAY_DAYS (default 14)
// Country is orders.shipping_destination.country (ISO alpha-2). The choice is
// made in cigco_thankyou_record_event, which can see that column. Keep
// isInternationalShipCountry in step with that function.
// Once per Printful order (thankyou_emails row + atomic claim). A row already
// marked sent is never claimed again. Off unless THANKYOU_EMAIL_ENABLED=true.
const crypto = require("node:crypto");
const { PRODUCTS } = require("../../products.js");
const { safeIdentifier } = require("./customer-utils.js");

const DEFAULT_DELAY_DAYS = 5;
const DEFAULT_INTL_DELAY_DAYS = 14;
const MAX_DELAY_DAYS = 60;

function thankyouEnabled(environment = process.env) {
  return String(environment.THANKYOU_EMAIL_ENABLED || "").trim().toLowerCase() === "true";
}

function clampDelayDays(raw, fallback) {
  const text = String(raw ?? "").trim();
  if (!/^\d+$/.test(text)) return fallback;
  return Math.min(Number(text), MAX_DELAY_DAYS);
}

function thankyouDelayDays(environment = process.env) {
  return clampDelayDays(environment.THANKYOU_DELAY_DAYS, DEFAULT_DELAY_DAYS);
}

function thankyouIntlDelayDays(environment = process.env) {
  return clampDelayDays(environment.THANKYOU_INTL_DELAY_DAYS, DEFAULT_INTL_DELAY_DAYS);
}

// True when the ship-to country is present and is not the US. Blank means the
// order has no country on file, so the short US fallback stays in place.
function isInternationalShipCountry(country) {
  if (typeof country !== "string") return false;
  const code = country.trim().toUpperCase();
  return code !== "" && code !== "US";
}

function thankyouDelayForCountry(country, environment = process.env) {
  return isInternationalShipCountry(country)
    ? thankyouIntlDelayDays(environment)
    : thankyouDelayDays(environment);
}

// Printful v2 signs each event: x-pf-webhook-signature = hex HMAC-SHA256 of the
// raw body, keyed with the webhook config's secret_key (given as hex, so it is
// decoded to bytes first).
function verifyPrintfulSignature(rawBody, signature, secretHex) {
  if (!secretHex || typeof signature !== "string" || !/^[0-9a-f]+$/i.test(signature)) return false;
  const secret = String(secretHex).trim();
  const key = /^[0-9a-f]+$/i.test(secret) && secret.length % 2 === 0
    ? Buffer.from(secret, "hex")
    : Buffer.from(secret, "utf8");
  const expected = crypto.createHmac("sha256", key).update(rawBody).digest("hex");
  const given = signature.trim().toLowerCase();
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

// Items CIG packs and ships himself (masks, plus every other non-Printful
// product). Those boxes get his QR card, so the order gets no thank-you email.
const CIG_SHIPPED_NAMES = PRODUCTS
  .filter((product) => !product.pod)
  .map((product) => String(product.name).toLowerCase())
  .sort((a, b) => b.length - a.length);

function cigShippedItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => {
    const text = String((item && (item.description || item.name)) || "").trim().toLowerCase();
    return CIG_SHIPPED_NAMES.some((name) => text.startsWith(name));
  });
}

// Claim -> check -> send -> mark. Safe to call from both the webhook and the
// sweep: only one caller can claim a row, and a sent row is never re-sent.
async function processThankYou({ store, printfulOrderId, resend, logger = console }) {
  const context = await store.thankyouClaim(printfulOrderId);
  if (!context) return { status: "not_claimed" };

  const id = printfulOrderId;
  const finish = async (status, reason = null) => {
    await store.thankyouComplete(id, status, reason);
    return { status, reason };
  };

  if (!context.order) {
    // Not matched to a paid store order (yet). Retried hourly, up to 5 tries.
    return finish("failed", "order_not_found");
  }
  if (cigShippedItems(context.order.items).length > 0) {
    return finish("skipped", "cig_ships_order");
  }
  if (context.unsubscribed) return finish("skipped", "unsubscribed");
  const email = context.contact && context.contact.email_normalized;
  if (!email) return finish("skipped", "no_email");

  try {
    await resend().sendThankYou({
      email,
      orderRef: context.order.order_number,
      firstName: context.contact.first_name || null,
      printfulOrderId: id,
    });
  } catch (error) {
    logger.error("Thank-you email failed.", {
      printfulOrder: safeIdentifier(id),
      error: error && (error.code || error.name),
    });
    return finish("failed", (error && error.code) || "send_failed");
  }
  return finish("sent");
}

module.exports = {
  DEFAULT_DELAY_DAYS,
  DEFAULT_INTL_DELAY_DAYS,
  cigShippedItems,
  isInternationalShipCountry,
  processThankYou,
  thankyouDelayDays,
  thankyouDelayForCountry,
  thankyouEnabled,
  thankyouIntlDelayDays,
  verifyPrintfulSignature,
};
