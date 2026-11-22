// CIG & CO. — email list capture
// Uses Netlify Forms (free, no API key/account signup beyond the Netlify
// account you already deploy with). Submissions show up in your Netlify
// dashboard under Site settings > Forms, where you can view/export them or
// wire up email notifications. Nothing to configure — it just works once
// this site is deployed on Netlify.
//
// A static, hidden copy of this form (see the "email-list" form in each
// page's HTML) is required so Netlify's build-time crawler can detect and
// register the form. This file only handles the live AJAX submission.

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || "").trim());
}

function submitEmail(email, source) {
  const body = new URLSearchParams({ "form-name": "email-list", email: email.trim(), source: source || "site" }).toString();
  return fetch("/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }).catch((err) => {
    // Non-fatal: if this fails (e.g. previewing locally, not yet deployed to
    // Netlify) we still let the visitor continue — never block the
    // experience on the mailing-list call.
    console.warn("Email list submission failed (this is expected until the site is deployed on Netlify):", err);
  });
}

// Email list sign-ups stored in Supabase (netlify/functions/subscribe.js):
// source "notify_me" (sold-out item, with productId + variant) or
// "early_access" (next drop + Black Friday code). Throws a readable error.
async function subscribeEmail({ email, source, productId = null, variant = null, website = "" }, fetchImpl = fetch) {
  const response = await fetchImpl("/.netlify/functions/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: (email || "").trim(), source, productId, variant, website }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Sign-up is unavailable right now. Please try again later.");
  }
  return data;
}

// Early-access form (index.html #early-access).
function wireEarlyAccess(form, fetchImpl = fetch) {
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = form.querySelector('input[type="email"]');
    const message = form.querySelector(".early-access-message");
    const button = form.querySelector('button[type="submit"]');
    const honeypot = form.querySelector('input[name="website"]');
    if (!isValidEmail(input && input.value)) {
      if (message) message.textContent = "Enter a valid email.";
      return;
    }
    if (button) button.disabled = true;
    try {
      await subscribeEmail({ email: input.value, source: "early_access", website: honeypot ? honeypot.value : "" }, fetchImpl);
      if (message) message.textContent = "You're in. Watch your inbox for early access and the Black Friday code.";
      input.value = "";
    } catch (error) {
      if (message) message.textContent = error.message;
    } finally {
      if (button) button.disabled = false;
    }
  });
}
if (typeof document !== "undefined" && document.getElementById) {
  wireEarlyAccess(document.getElementById("early-access-form"));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { isValidEmail, subscribeEmail, wireEarlyAccess };
}

// Arcade prize email is intentionally not sent from the browser. A confirmed
// server-side Arcade claim reserves and sends the transactional email.
