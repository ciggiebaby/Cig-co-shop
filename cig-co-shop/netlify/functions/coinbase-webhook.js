// Signed Coinbase Commerce webhook: records confirmed crypto payments
// (Supabase order, email, Kit) the same way stripe-webhook.js records card orders.
// Requires env vars: COINBASE_COMMERCE_WEBHOOK_SECRET (Settings > Notifications > shared secret),
// COINBASE_COMMERCE_API_KEY (to re-read the charge from Coinbase)
const crypto = require("node:crypto");
const { recordPaidOrder } = require("../lib/order-recording.js");
const { cryptoWebhookEnabled } = require("../lib/crypto-payment.js");
const { safeIdentifier, timingSafeTokenMatch } = require("../lib/customer-utils.js");

const PAID_EVENTS = new Set(["charge:confirmed", "charge:resolved"]);
const PAID_STATUSES = new Set(["COMPLETED", "CONFIRMED", "RESOLVED"]);

function rawEventBody(event) {
  return event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64")
    : Buffer.from(event.body || "", "utf8");
}

function json(statusCode, body) {
  return { statusCode, body: JSON.stringify(body) };
}

function validSignature(rawBody, signature, secret) {
  if (!secret || typeof signature !== "string") return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeTokenMatch(signature.trim().toLowerCase(), expected);
}

async function fetchCharge(chargeId, { environment, fetchImpl }) {
  const res = await fetchImpl(`https://api.commerce.coinbase.com/charges/${encodeURIComponent(chargeId)}`, {
    headers: {
      "X-CC-Api-Key": environment.COINBASE_COMMERCE_API_KEY,
      "X-CC-Version": "2018-03-22",
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Coinbase Commerce charge lookup failed");
  return data.data;
}

function chargeIsPaid(charge) {
  const timeline = Array.isArray(charge.timeline) ? charge.timeline : [];
  return timeline.some((entry) => PAID_STATUSES.has(String(entry.status).toUpperCase()));
}

function chargeOrder(charge) {
  const metadata = charge.metadata || {};
  let lines = [];
  try {
    lines = JSON.parse(metadata.items || "[]");
  } catch {
    lines = [];
  }
  const local = (charge.pricing && charge.pricing.local) || {};
  const amountTotalCents = Math.round(Number(local.amount) * 100);
  if (!Number.isSafeInteger(amountTotalCents) || amountTotalCents < 0) {
    throw new Error("Charge amount is invalid.");
  }
  const paidEntry = (charge.timeline || []).find((entry) => PAID_STATUSES.has(String(entry.status).toUpperCase()));
  return {
    sessionId: `coinbase:${charge.code}`,
    paymentId: `coinbase:${charge.id}`,
    emailOriginal: metadata.customer_email,
    name: metadata.customer_name || null,
    amountTotalCents,
    currency: String(local.currency || "USD").toLowerCase(),
    items: Array.isArray(lines)
      ? lines.map(([description, quantity]) => ({
        description: String(description || "CIG & CO. item"),
        quantity: Number(quantity) || 1,
        amountTotalCents: null,
        currency: String(local.currency || "USD").toLowerCase(),
      }))
      : [],
    shippingDestination: metadata.shipping_address || metadata.shipping_city ? {
      name: metadata.customer_name || null,
      line1: metadata.shipping_address || null,
      line2: null,
      city: metadata.shipping_city || null,
      state: metadata.shipping_state || null,
      postalCode: metadata.shipping_zip || null,
      country: metadata.shipping_country || null,
      summary: [metadata.shipping_city, metadata.shipping_state, metadata.shipping_zip, metadata.shipping_country]
        .filter(Boolean).join(", ") || null,
    } : null,
    marketingConsent: metadata.marketing_consent === "true",
    promoCode: null, // promo codes never apply to crypto
    paidAt: (paidEntry && paidEntry.time) || new Date().toISOString(),
  };
}

function createHandler({
  fetchImpl = fetch,
  recordOrder = recordPaidOrder,
  environment = process.env,
  logger = console,
} = {}) {
  return async (event) => {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // Crypto is switched off (CRYPTO_ENABLED in products.js) or not configured:
    // answer cleanly without logging an error or touching Coinbase.
    if (!cryptoWebhookEnabled(environment)) {
      return json(503, { error: "Crypto checkout is turned off." });
    }

    const rawBody = rawEventBody(event);
    const headers = event.headers || {};
    const signature = headers["x-cc-webhook-signature"] || headers["X-CC-Webhook-Signature"];
    if (!environment.COINBASE_COMMERCE_WEBHOOK_SECRET) {
      logger.error("COINBASE_COMMERCE_WEBHOOK_SECRET is not configured.");
      return json(500, { error: "Webhook is not configured." });
    }
    if (!validSignature(rawBody, signature, environment.COINBASE_COMMERCE_WEBHOOK_SECRET)) {
      return json(400, { error: "Webhook signature is invalid." });
    }

    let webhookEvent;
    try {
      webhookEvent = JSON.parse(rawBody.toString("utf8")).event;
      if (!webhookEvent || !webhookEvent.data) throw new Error("Missing event.");
    } catch {
      return json(400, { error: "Webhook payload is invalid." });
    }
    if (!PAID_EVENTS.has(webhookEvent.type)) {
      return json(200, { received: true });
    }

    try {
      // Re-read the charge from Coinbase rather than trusting the payload.
      const charge = await fetchCharge(webhookEvent.data.code || webhookEvent.data.id, { environment, fetchImpl });
      // Skip charges not created by create-coinbase-charge (or still unpaid).
      if (!charge.metadata || !charge.metadata.items || !chargeIsPaid(charge)) {
        return json(200, { received: true, processed: false });
      }
      await recordOrder(
        { ...chargeOrder(charge), eventId: `coinbase:${webhookEvent.id}`, eventType: webhookEvent.type },
        { environment, logger },
      );
      return json(200, { received: true, processed: true });
    } catch (error) {
      logger.error("Coinbase webhook processing failed.", {
        event: safeIdentifier(webhookEvent.id),
        error: error && error.name,
      });
      return json(500, { error: "Webhook processing failed." });
    }
  };
}

const handler = createHandler();

module.exports = { chargeIsPaid, chargeOrder, createHandler, handler, validSignature };
