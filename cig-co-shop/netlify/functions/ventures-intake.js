// Public CIG Ventures order intake from /ventures.
// Stores a row in Supabase `ventures_intake` (service role; RLS on, no
// public policies). Optionally emails ventures@cigcompany.com via Resend.
// No payment links and no secret keys are returned to the browser.
const {
  RequestValidationError,
  jsonResponse,
  normalizeEmail,
  optionalTrimmedString,
  parseJsonBody,
  rateLimitKey,
} = require("../lib/customer-utils.js");
const { createCustomerStore } = require("../lib/customer-store.js");
const { createSupabaseClient } = require("../lib/supabase.js");
const { honeypotTripped } = require("../lib/subscribers.js");

const SERVICE_IDS = new Set([
  "lead-research",
  "competitor-intelligence",
  "signal-federal",
]);
const SERVICE_NAMES = {
  "lead-research": "B2B lead research",
  "competitor-intelligence": "Competitor & market intelligence",
  "signal-federal": "SIGNAL Federal",
};
const CONFIRMATION = "We'll reply within 1 business day with scope and a payment link.";
const NOTICE_TO = "ventures@cigcompany.com";

function requiredText(value, label, maximumLength) {
  const text = optionalTrimmedString(value, maximumLength);
  if (!text) throw new RequestValidationError(`Please enter your ${label}.`);
  return text;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createHandler({
  storeFactory = createCustomerStore,
  supabaseFactory = createSupabaseClient,
  mailer = null,
  environment = process.env,
  logger = console,
  fetchImpl = fetch,
} = {}) {
  return async (event) => {
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { error: "Method not allowed." }, { Allow: "POST" });
    }
    try {
      const body = parseJsonBody(event);
      if (honeypotTripped(body)) return jsonResponse(200, { ok: true, message: CONFIRMATION });

      const serviceId = optionalTrimmedString(body.service, 80);
      if (!SERVICE_IDS.has(serviceId)) {
        throw new RequestValidationError("Please choose a service.");
      }
      const name = requiredText(body.name, "name", 200);
      const business = requiredText(body.business, "business name", 200);
      const email = normalizeEmail(body.email);
      const need = requiredText(body.need, "research request", 4000);
      const budgetTimeline = optionalTrimmedString(body.budgetTimeline, 400);

      const store = storeFactory();
      const allowed = await store.checkArcadeRateLimit(
        rateLimitKey(event, "ventures-intake", environment.SUPABASE_SECRET_KEY),
        5,
        60,
      );
      if (!allowed) {
        return jsonResponse(429, { error: "Too many attempts. Please wait a moment and try again." });
      }

      const supabase = supabaseFactory({
        url: environment.SUPABASE_URL,
        secretKey: environment.SUPABASE_SECRET_KEY,
        fetchImpl,
      });
      await supabase.insert("ventures_intake", {
        service_id: serviceId,
        name,
        business,
        email_normalized: email,
        email_original: String(body.email || "").trim(),
        need,
        budget_timeline: budgetTimeline,
        status: "new",
      });

      let notified = false;
      try {
        notified = await sendIntakeNotice({
          mailer,
          environment,
          fetchImpl,
          row: { serviceId, name, business, email, need, budgetTimeline },
        });
      } catch (error) {
        logger.error("Ventures intake notice failed.", { error: error && (error.code || error.name) });
      }

      return jsonResponse(200, { ok: true, message: CONFIRMATION, notified });
    } catch (error) {
      if (error instanceof RequestValidationError) {
        return jsonResponse(400, { error: error.message });
      }
      logger.error("Ventures intake failed.", { error: error && (error.code || error.name || error.message) });
      return jsonResponse(500, { error: "Please email ventures@cigcompany.com — the form is unavailable right now." });
    }
  };
}

async function sendIntakeNotice({ mailer, environment, fetchImpl, row }) {
  if (typeof mailer === "function") {
    await mailer(row);
    return true;
  }
  const apiKey = environment && environment.RESEND_API_KEY;
  const fromEmail = environment && environment.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) return false;

  const serviceName = SERVICE_NAMES[row.serviceId] || row.serviceId;
  const html = `<div style="font-family:Georgia,serif;background:#0a0a0a;color:#fff;padding:32px;max-width:620px;margin:0 auto;">
    <h1 style="color:#D4AF37;letter-spacing:2px;font-size:20px;margin:0 0 24px;">CIG Ventures</h1>
    <h2 style="font-size:22px;margin:0 0 18px;">New site order request</h2>
    <p>Service: ${escapeHtml(serviceName)}</p>
    <p>Name: ${escapeHtml(row.name)}</p>
    <p>Business: ${escapeHtml(row.business)}</p>
    <p>Email: ${escapeHtml(row.email)}</p>
    <p>Budget / timeline: ${escapeHtml(row.budgetTimeline || "—")}</p>
    <p>What they need:</p>
    <p>${escapeHtml(row.need).replaceAll("\n", "<br />")}</p>
    <p style="color:#999;font-size:12px;">Reply within 1 business day with scope and a payment link. This is an internal notice, not a customer receipt.</p>
  </div>`;
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `ventures-intake/${row.email}/${row.serviceId}/${Date.now()}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: NOTICE_TO,
      subject: `Ventures intake: ${serviceName} — ${row.business}`,
      html,
    }),
  });
  if (!response.ok) {
    throw new Error(`resend_http_${response.status}`);
  }
  return true;
}

const handler = createHandler();

module.exports = {
  CONFIRMATION,
  NOTICE_TO,
  SERVICE_IDS,
  SERVICE_NAMES,
  createHandler,
  handler,
};
