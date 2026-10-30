// Thank-you email for Printful-fulfilled orders (CIG, Oct 29, 2026). Those
// boxes ship straight from Printful with no QR card, so the email carries the
// Arcade link (?src=thankyou) instead.
//
// Trigger: Printful v2 webhooks (netlify/functions/printful-webhook.js).
//   shipment_delivered -> send now (what the team wants).
//   shipment_sent      -> send at shipped + THANKYOU_DELAY_DAYS (default 5)
//                         via the hourly sweep, for carriers whose tracking
//                         never reports "delivered".
// Once per Printful order (thankyou_emails row + atomic claim). Off unless
// THANKYOU_EMAIL_ENABLED=true.
const crypto = require("node:crypto");
const { PRODUCTS } = require("../../products.js");
const { safeIdentifier } = require("./customer-utils.js");

const DEFAULT_DELAY_DAYS = 5;
const MAX_DELAY_DAYS = 60;

function thankyouEnabled(environment = process.env) {
  return String(environment.THANKYOU_EMAIL_ENABLED || "").trim().toLowerCase() === "true";
}

function thankyouDelayDays(environment = process.env) {
  const raw = String(environment.THANKYOU_DELAY_DAYS ?? "").trim();
  if (!/^\d+$/.test(raw)) return DEFAULT_DELAY_DAYS;
  return Math.min(Number(raw), MAX_DELAY_DAYS);
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
  cigShippedItems,
  processThankYou,
  thankyouDelayDays,
  thankyouEnabled,
  verifyPrintfulSignature,
};
