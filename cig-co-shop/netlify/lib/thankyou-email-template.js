// Thank-you email for Printful-fulfilled orders: COPY + LAYOUT IN ONE FILE.
//
// YG: swap the words in THANKYOU_COPY and the look in renderThankYouEmail().
// Nothing else needs to change. Rules the tests check, so keep them:
//   * {orderRef} must appear somewhere (subject or body).
//   * Keep the Arcade button pointing at LINKS.arcade (?src=thankyou is how BG
//     counts these sign-ups) and keep the unsubscribe footer.
//   * No QR image is embedded from the repo. The optional QR at the bottom is
//     an image URL set in Netlify (THANKYOU_QR_IMAGE_URL); leave it unset to
//     hide it.
// {firstName}, {orderRef} placeholders are filled in and HTML-escaped.

const SITE = "https://cigcompany.com";

const LINKS = Object.freeze({
  arcade: `${SITE}/arcade.html?src=thankyou`,
  earlyAccess: `${SITE}/#early-access`,
  // "Complete the fit": open each mask straight from the email (app.js
  // opens #product-<id> on load). 0008 ski mask, 0005 balaclava, 0013 moto.
  skiMask: `${SITE}/#product-0008`,
  balaclava: `${SITE}/#product-0005`,
  motoMask: `${SITE}/#product-0013`,
  shop: `${SITE}/#shop`,
});

const THANKYOU_COPY = Object.freeze({
  subject: "Thank you from Cig & Co. (order {orderRef})",
  preheader: "Your order made it. One more thing: the Arcade is open.",
  heading: "Thank you.",
  greeting: "Hey {firstName},",
  greetingNoName: "Hey,",
  intro: "Your Cig & Co. order {orderRef} should be with you now. Every piece is printed to order in our paisley, so it's one of a kind in your hands. We hope it looks as good on you (or your couch) as it did in our heads.",
  arcadeLine: "Our boxes usually come with a card to the Cig & Co. Arcade. Yours shipped straight from the print shop, so here's your pass. Play free for a shot at mask prizes.",
  arcadeButton: "Play the Arcade",
  fitLead: "Complete the fit:",
  fitSki: "Ski Mask",
  fitBalaclava: "Balaclava",
  fitMoto: "Moto Mask",
  earlyAccessLead: "Want first dibs on the next drop and our Black Friday code?",
  earlyAccessLink: "Get early access",
  qrCaption: "Reading on a laptop? Scan to play on your phone.",
  signoff: "With love, Cig & Co.",
  tagline: "Paisley streetwear & home goods",
  support: "Questions about your order? Just reply to this email.",
  footer: "You're getting this because you ordered from Cig & Co. ({orderRef}).",
  unsubscribeLink: "Unsubscribe",
  unsubscribeAfterLink: "from Cig & Co. emails anytime.",
  unsubscribeByReply: "To stop Cig & Co. emails, reply \u201cunsubscribe\u201d.",
});

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Fill {placeholders}; escaped for HTML unless raw = true (subject line).
function fill(text, values, { raw = false } = {}) {
  const out = String(text).replace(/\{(\w+)\}/g, (match, key) =>
    (Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? "") : match));
  return raw ? out : escapeHtml(out);
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// Returns { subject, html }. copy/links can be overridden (tests, previews).
function renderThankYouEmail({
  orderRef,
  firstName = null,
  unsubscribeUrl = null,
  qrImageUrl = null,
  copy = THANKYOU_COPY,
  links = LINKS,
} = {}) {
  const values = { orderRef: orderRef || "", firstName: firstName || "" };
  const gold = "#D4AF37";
  const link = (href, text) => `<a style="color:${gold};" href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;
  const qr = safeHttpsUrl(qrImageUrl);
  const qrBlock = qr
    ? `<div style="text-align:center;margin:28px 0 8px;">
        <a href="${escapeHtml(links.arcade)}"><img src="${escapeHtml(qr)}" width="96" height="96" alt="QR code: Play the Cig &amp; Co. Arcade" style="display:inline-block;border:0;background:#fff;padding:6px;"></a>
        <p style="color:#999;font-size:12px;margin:6px 0 0;">${fill(copy.qrCaption, values)}</p>
      </div>`
    : "";
  const unsubscribeBlock = unsubscribeUrl
    ? `${link(unsubscribeUrl, copy.unsubscribeLink).replace(`color:${gold}`, "color:#999")} ${fill(copy.unsubscribeAfterLink, values)}`
    : fill(copy.unsubscribeByReply, values);

  const html = `<div style="display:none;max-height:0;overflow:hidden;">${fill(copy.preheader, values)}</div>
  <div style="font-family:Georgia,serif;background:#0a0a0a;color:#fff;padding:32px;max-width:620px;margin:0 auto;">
    <h1 style="color:${gold};letter-spacing:2px;font-size:20px;margin:0 0 4px;">CIG &amp; CO.</h1>
    <p style="color:#999;font-size:12px;letter-spacing:1px;margin:0 0 24px;">${fill(copy.tagline, values)}</p>
    <h2 style="font-size:22px;margin:0 0 18px;">${fill(copy.heading, values)}</h2>
    <p>${fill(firstName ? copy.greeting : copy.greetingNoName, values)}</p>
    <p>${fill(copy.intro, values)}</p>
    <p>${fill(copy.arcadeLine, values)}</p>
    <p style="margin:24px 0;"><a href="${escapeHtml(links.arcade)}" style="display:inline-block;background:${gold};color:#0a0a0a;text-decoration:none;font-weight:bold;letter-spacing:1px;padding:12px 22px;border-radius:4px;">${fill(copy.arcadeButton, values)}</a></p>
    <p>${fill(copy.fitLead, values)} ${link(links.skiMask, copy.fitSki)} &middot; ${link(links.balaclava, copy.fitBalaclava)} &middot; ${link(links.motoMask, copy.fitMoto)}</p>
    <p>${fill(copy.earlyAccessLead, values)} ${link(links.earlyAccess, copy.earlyAccessLink)}</p>
    <p>${fill(copy.support, values)}</p>
    <p>${fill(copy.signoff, values)}</p>
    ${qrBlock}
    <p style="color:#777;font-size:12px;margin-top:28px;">${fill(copy.footer, values)} ${unsubscribeBlock}</p>
  </div>`;
  return { subject: fill(copy.subject, values, { raw: true }), html };
}

module.exports = { LINKS, THANKYOU_COPY, renderThankYouEmail };
