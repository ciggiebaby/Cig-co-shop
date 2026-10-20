// PayPal Orders v2 helpers shared by create-paypal-order, paypal-capture, and paypal-webhook.
// Requires env vars: PAYPAL_CLIENT_ID, PAYPAL_SECRET
// Optional: PAYPAL_API_BASE (defaults to live), PAYPAL_WEBHOOK_ID (for paypal-webhook)
const { recordPaidOrder } = require("./order-recording.js");

class PayPalError extends Error {
  constructor(message, { status = null, issue = null } = {}) {
    super(message);
    this.name = "PayPalError";
    this.status = status;
    this.issue = issue;
  }
}

function centsToValue(cents) {
  return (cents / 100).toFixed(2);
}

function valueToCents(value) {
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) throw new PayPalError("Invalid PayPal amount.");
  return cents;
}

function createPayPalClient({ environment = process.env, fetchImpl = fetch } = {}) {
  const base = environment.PAYPAL_API_BASE || "https://api-m.paypal.com";

  async function getAccessToken() {
    const auth = Buffer.from(
      `${environment.PAYPAL_CLIENT_ID}:${environment.PAYPAL_SECRET}`
    ).toString("base64");
    const res = await fetchImpl(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const data = await res.json();
    if (!res.ok) throw new PayPalError(data.error_description || "PayPal auth failed", { status: res.status });
    return data.access_token;
  }

  async function request(method, path, { body, rawBody, headers = {} } = {}) {
    const accessToken = await getAccessToken();
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...headers,
      },
      body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const issue = data.details && data.details[0] && data.details[0].issue;
      throw new PayPalError(data.message || `PayPal request failed (${res.status}).`, { status: res.status, issue });
    }
    return data;
  }

  function createOrder(order) {
    return request("POST", "/v2/checkout/orders", { body: order });
  }

  function getOrder(orderId) {
    return request("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  }

  // Safe to call more than once: PayPal-Request-Id makes the capture idempotent,
  // and an already-captured order is simply re-read.
  async function captureOrder(orderId) {
    try {
      return await request("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        headers: {
          "PayPal-Request-Id": `capture-${orderId}`,
          Prefer: "return=representation",
        },
      });
    } catch (error) {
      if (error instanceof PayPalError && error.issue === "ORDER_ALREADY_CAPTURED") {
        return getOrder(orderId);
      }
      throw error;
    }
  }

  // Asks PayPal whether a webhook delivery is genuine. The raw body is embedded
  // as-is so re-serializing the JSON can't change what PayPal checks.
  async function verifyWebhookSignature(headers, rawBody) {
    const header = (name) => headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
    if (!environment.PAYPAL_WEBHOOK_ID) throw new PayPalError("PAYPAL_WEBHOOK_ID is not configured.");
    const fields = {
      auth_algo: header("paypal-auth-algo"),
      cert_url: header("paypal-cert-url"),
      transmission_id: header("paypal-transmission-id"),
      transmission_sig: header("paypal-transmission-sig"),
      transmission_time: header("paypal-transmission-time"),
      webhook_id: environment.PAYPAL_WEBHOOK_ID,
    };
    if (Object.values(fields).some((value) => typeof value !== "string" || !value)) return false;
    const payload = `${JSON.stringify(fields).slice(0, -1)},"webhook_event":${rawBody}}`;
    const result = await request("POST", "/v1/notifications/verify-webhook-signature", { rawBody: payload });
    return result.verification_status === "SUCCESS";
  }

  return { captureOrder, createOrder, getOrder, verifyWebhookSignature };
}

// Builds the PayPal order from server-side pricing (priceCartForStripe).
// Each item's sku carries the catalog selection for the order record.
function buildPayPalOrder(pricing, { siteUrl, marketingConsent = false }) {
  const items = pricing.lineItems.map((line) => ({
    name: line.price_data.product_data.name.slice(0, 127),
    quantity: String(line.quantity),
    unit_amount: { currency_code: "USD", value: centsToValue(line.price_data.unit_amount) },
    category: "PHYSICAL_GOODS",
  }));
  return {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: {
          currency_code: "USD",
          value: centsToValue(pricing.totalCents),
          breakdown: { item_total: { currency_code: "USD", value: centsToValue(pricing.totalCents) } },
        },
        description: "CIG & CO. order",
        custom_id: JSON.stringify({ p: pricing.promoCode || "", m: marketingConsent ? 1 : 0 }),
        items,
      },
    ],
    application_context: {
      return_url: `${siteUrl}/.netlify/functions/paypal-capture`,
      cancel_url: `${siteUrl}/?checkout=cancelled`,
      brand_name: "CIG & CO.",
      shipping_preference: "GET_FROM_FILE",
      user_action: "PAY_NOW",
    },
  };
}

function parseCustomId(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return { promoCode: parsed.p || null, marketingConsent: parsed.m === 1 };
  } catch {
    return { promoCode: null, marketingConsent: false };
  }
}

// Returns the order details to record, or null if the money isn't captured yet.
function paidPayPalOrder(order) {
  const unit = order && order.purchase_units && order.purchase_units[0];
  const capture = unit && unit.payments && unit.payments.captures && unit.payments.captures[0];
  if (!order || order.status !== "COMPLETED" || !capture || capture.status !== "COMPLETED") {
    return null;
  }
  // Only orders made by create-paypal-order (other PayPal sales are left alone).
  if (!unit.custom_id || !Array.isArray(unit.items) || unit.items.length === 0) {
    return null;
  }
  if (capture.amount.value !== unit.amount.value || capture.amount.currency_code !== unit.amount.currency_code) {
    throw new PayPalError("Captured amount does not match the order.");
  }
  const shipping = unit.shipping || {};
  const address = shipping.address || {};
  const payer = order.payer || {};
  const payerName = payer.name ? [payer.name.given_name, payer.name.surname].filter(Boolean).join(" ") : null;
  const summary = [address.admin_area_2, address.admin_area_1, address.postal_code, address.country_code]
    .filter(Boolean).join(", ");
  const custom = parseCustomId(unit.custom_id);
  return {
    sessionId: `paypal:${order.id}`,
    paymentId: `paypal:${capture.id}`,
    emailOriginal: payer.email_address,
    name: payerName,
    amountTotalCents: valueToCents(capture.amount.value),
    currency: capture.amount.currency_code.toLowerCase(),
    items: (unit.items || []).map((item) => ({
      description: item.name,
      quantity: Number(item.quantity) || 1,
      amountTotalCents: valueToCents(item.unit_amount.value) * (Number(item.quantity) || 1),
      currency: item.unit_amount.currency_code.toLowerCase(),
    })),
    shippingDestination: shipping.address ? {
      name: (shipping.name && shipping.name.full_name) || null,
      line1: address.address_line_1 || null,
      line2: address.address_line_2 || null,
      city: address.admin_area_2 || null,
      state: address.admin_area_1 || null,
      postalCode: address.postal_code || null,
      country: address.country_code || null,
      summary: summary || null,
    } : null,
    marketingConsent: custom.marketingConsent,
    promoCode: custom.promoCode,
    paidAt: capture.create_time || new Date().toISOString(),
  };
}

// Records a captured PayPal order; returns false if it isn't paid yet.
async function recordPayPalOrder(order, { eventId, eventType }, options = {}) {
  const paid = paidPayPalOrder(order);
  if (!paid) return false;
  await recordPaidOrder({ ...paid, eventId, eventType }, options);
  return true;
}

module.exports = {
  PayPalError,
  buildPayPalOrder,
  createPayPalClient,
  paidPayPalOrder,
  recordPayPalOrder,
};
