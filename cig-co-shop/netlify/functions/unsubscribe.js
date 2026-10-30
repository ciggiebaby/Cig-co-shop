// Unsubscribe link from CIG & CO. emails:
//   GET  /.netlify/functions/unsubscribe?e=<email>&t=<token>  -> confirm page
//   POST same URL (the page's button, or a mail app's one-click unsubscribe,
//        RFC 8058)                                          -> unsubscribes
// GET never unsubscribes, so link scanners in inboxes can't do it by accident.
// The token is an HMAC of the email with UNSUBSCRIBE_SECRET (server-side only),
// so nobody can unsubscribe someone else's address.
const { normalizeEmail, safeIdentifier } = require("../lib/customer-utils.js");
const { createCustomerStore } = require("../lib/customer-store.js");
const { escapeHtml } = require("../lib/resend.js");
const { verifyUnsubscribeToken } = require("../lib/subscribers.js");

function page(statusCode, title, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
    body: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="robots" content="noindex" /><title>${escapeHtml(title)} — CIG &amp; CO.</title></head>
<body style="font-family:Georgia,serif;background:#0a0a0a;color:#fff;padding:40px 24px;max-width:560px;margin:0 auto;">
<h1 style="color:#D4AF37;letter-spacing:2px;font-size:20px;">CIG &amp; CO.</h1>
<h2 style="font-size:22px;">${escapeHtml(title)}</h2>
${body}
<p style="margin-top:32px;"><a style="color:#D4AF37;" href="/">Back to the shop</a></p>
</body></html>`,
  };
}

function createHandler({
  storeFactory = createCustomerStore,
  environment = process.env,
  logger = console,
} = {}) {
  return async (event) => {
    const method = event.httpMethod;
    if (method !== "GET" && method !== "POST") {
      return { statusCode: 405, headers: { Allow: "GET, POST" }, body: "Method Not Allowed" };
    }
    const params = event.queryStringParameters || {};
    let email;
    try {
      email = normalizeEmail(params.e);
    } catch {
      email = null;
    }
    const secret = environment.UNSUBSCRIBE_SECRET;
    if (!email || !verifyUnsubscribeToken(email, params.t, secret)) {
      return page(400, "Link not valid",
        `<p>This unsubscribe link isn't valid or has been cut off. Reply "unsubscribe" to any CIG &amp; CO. email, or write to <a style="color:#D4AF37;" href="mailto:orders@cigcompany.com">orders@cigcompany.com</a>, and we'll take you off the list.</p>`);
    }

    if (method === "GET") {
      const action = `?${new URLSearchParams({ e: email, t: params.t }).toString()}`;
      return page(200, "Unsubscribe",
        `<p>Stop all CIG &amp; CO. marketing emails to <strong>${escapeHtml(email)}</strong>? Order and shipping emails still arrive.</p>
<form method="post" action="${escapeHtml(action)}"><button type="submit" style="background:#D4AF37;color:#000;border:0;padding:12px 22px;font-size:15px;cursor:pointer;">Unsubscribe</button></form>`);
    }

    try {
      await storeFactory().unsubscribe(email);
    } catch (error) {
      logger.error("Unsubscribe failed.", {
        email: safeIdentifier(email),
        error: error && (error.code || error.name),
      });
      return page(500, "Something went wrong",
        `<p>We couldn't update your preferences just now. Please try again, or reply "unsubscribe" to any of our emails.</p>`);
    }
    return page(200, "You're unsubscribed",
      `<p>${escapeHtml(email)} won't get CIG &amp; CO. marketing emails anymore. Order and shipping emails still arrive.</p>`);
  };
}

const handler = createHandler();

module.exports = { createHandler, handler };
