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

// Arcade prize email is intentionally not sent from the browser. A confirmed
// server-side Arcade claim reserves and sends the transactional email.
