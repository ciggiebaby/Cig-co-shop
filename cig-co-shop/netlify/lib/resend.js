const { requiredEnvironment } = require("./supabase.js");
const { prizeTermsNote } = require("../../promo.js");
const { unsubscribeUrl } = require("./subscribers.js");
const { renderThankYouEmail } = require("./thankyou-email-template.js");

class ResendRequestError extends Error {
  constructor(code, status) {
    super("Transactional email delivery failed.");
    this.name = "ResendRequestError";
    this.code = code;
    this.status = status;
  }
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function money(cents, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: String(currency).toUpperCase(),
  }).format(Number(cents) / 100);
}

function emailFrame(title, content) {
  return `<div style="font-family:Georgia,serif;background:#0a0a0a;color:#fff;padding:32px;max-width:620px;margin:0 auto;">
    <h1 style="color:#D4AF37;letter-spacing:2px;font-size:20px;margin:0 0 24px;">CIG &amp; CO.</h1>
    <h2 style="font-size:22px;margin:0 0 18px;">${escapeHtml(title)}</h2>
    ${content}
  </div>`;
}

function createResendClient({
  apiKey = requiredEnvironment("RESEND_API_KEY"),
  fromEmail = requiredEnvironment("RESEND_FROM_EMAIL"),
  fetchImpl = fetch,
  environment = process.env,
} = {}) {
  async function send({ to, subject, html, idempotencyKey, headers = null }) {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(headers
        ? { from: fromEmail, to, subject, html, headers }
        : { from: fromEmail, to, subject, html }),
    });
    if (!response.ok) {
      throw new ResendRequestError(`resend_http_${response.status}`, response.status);
    }
    return response.json();
  }

  return {
    sendPrize({ email, prize, playId }) {
      const codeBlock = prize.code
        ? `<p style="font-size:26px;letter-spacing:3px;font-weight:bold;color:#D4AF37;margin:16px 0;">${escapeHtml(prize.code)}</p>
           <p style="color:#ccc;">${escapeHtml(prize.detail || "Enter this code at checkout to redeem your discount.")}</p>`
        : `<p style="color:#ccc;">${escapeHtml(prize.detail)}</p>`;
      const terms = prizeTermsNote(prize);
      const termsBlock = terms ? `<p style="color:#ccc;">${escapeHtml(terms)}</p>` : "";
      const unsubscribe = unsubscribeUrl(email, environment);
      const unsubscribeBlock = unsubscribe
        ? `<p style="color:#777;font-size:12px;">You're getting this because you played the CIG &amp; CO. Arcade with this email. <a style="color:#999;" href="${escapeHtml(unsubscribe)}">Unsubscribe</a> from CIG &amp; CO. emails anytime.</p>`
        : `<p style="color:#777;font-size:12px;">You're getting this because you played the CIG &amp; CO. Arcade with this email. To unsubscribe from CIG &amp; CO. emails, reply &ldquo;unsubscribe&rdquo;.</p>`;
      return send({
        to: email,
        subject: `You won: ${prize.label} — CIG & CO. Arcade`,
        idempotencyKey: `arcade-prize/${playId}`,
        headers: unsubscribe
          ? { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
          : null,
        html: emailFrame(`You won: ${prize.label}`, `${codeBlock}${termsBlock}
          <p style="margin-top:28px;color:#777;font-size:12px;">This prize is yours to use right away.</p>
          ${unsubscribeBlock}`),
      });
    },

    // Printful-fulfilled orders (no QR card in the box). Copy and layout:
    // netlify/lib/thankyou-email-template.js.
    sendThankYou({ email, orderRef, firstName = null, printfulOrderId }) {
      const unsubscribe = unsubscribeUrl(email, environment);
      const { subject, html } = renderThankYouEmail({
        orderRef,
        firstName,
        unsubscribeUrl: unsubscribe,
        qrImageUrl: environment.THANKYOU_QR_IMAGE_URL || null,
      });
      return send({
        to: email,
        subject,
        idempotencyKey: `thankyou/${printfulOrderId}`,
        headers: unsubscribe
          ? { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
          : null,
        html,
      });
    },

    sendOrderReceived({ contact, order }) {
      const items = Array.isArray(order.items) ? order.items : [];
      const itemRows = items.map((item) =>
        `<li>${escapeHtml(item.description || item.name || "Item")} &times; ${escapeHtml(item.quantity || 1)}</li>`,
      ).join("");
      const shipping = order.shipping_destination || order.shippingDestination;
      const shippingLine = shipping && shipping.summary
        ? `<p><strong>Shipping to:</strong> ${escapeHtml(shipping.summary)}</p>`
        : "";
      const greeting = contact.first_name
        ? `<p>${escapeHtml(contact.first_name)},</p>`
        : "";
      return send({
        to: contact.email_normalized,
        subject: "Thank you for your CIG & CO. order",
        idempotencyKey: `order-received/${order.stripe_session_id}`,
        html: emailFrame("Thank you for your order.", `
          ${greeting}
          <p>We’ve received it and are getting everything packed. We’ll send another email with your tracking information as soon as your package is on the way.</p>
          <p><strong>Order:</strong> ${escapeHtml(order.order_number)}</p>
          ${itemRows ? `<ul>${itemRows}</ul>` : ""}
          <p><strong>Total:</strong> ${escapeHtml(money(order.amount_total_cents, order.currency))}</p>
          ${shippingLine}
          <p>Questions? Reply to this email for support.</p>
          <p>— CIG &amp; CO.</p>`),
      });
    },

    sendShipment({ contact, order }) {
      return send({
        to: contact.email_normalized,
        subject: `Your CIG & CO. order ${order.order_number} is on the way`,
        idempotencyKey: `shipment/${order.id}/${order.shipment_tracking_number}`,
        html: emailFrame("Your order is on the way.", `
          <p><strong>Order:</strong> ${escapeHtml(order.order_number)}</p>
          <p><strong>Carrier:</strong> ${escapeHtml(order.shipment_carrier)}</p>
          <p><strong>Tracking number:</strong> ${escapeHtml(order.shipment_tracking_number)}</p>
          <p><strong>Shipment date:</strong> ${escapeHtml(order.shipment_date)}</p>
          <p><a style="color:#D4AF37;" href="${escapeHtml(order.shipment_tracking_url)}">Track your package</a></p>
          <p>— CIG &amp; CO.</p>`),
      });
    },
  };
}

module.exports = {
  ResendRequestError,
  createResendClient,
  escapeHtml,
  money,
};
