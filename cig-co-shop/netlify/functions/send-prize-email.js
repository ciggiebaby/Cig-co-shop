// Emails an Arcade winner their prize code immediately, using Resend
// (https://resend.com — free tier, no credit card needed for testing).
// Requires env vars:
//   RESEND_API_KEY — from https://resend.com/api-keys
//   FROM_EMAIL     — e.g. "CIG & CO. <rewards@cigcompany.com>". Until you
//                    verify your own domain with Resend, sending is limited
//                    to your own Resend account email (fine for testing —
//                    see README for the domain verification step).
// If RESEND_API_KEY isn't set yet, this quietly no-ops so the Arcade still
// works end-to-end while you finish setting up email.

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { email, label, code, detail } = JSON.parse(event.body || "{}");
    if (!email || !label) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing email or prize label." }) };
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: "RESEND_API_KEY not set yet" }) };
    }

    const from = process.env.FROM_EMAIL || "CIG & CO. <onboarding@resend.dev>";

    const codeBlock = code
      ? `<p style="font-size:26px;letter-spacing:3px;font-weight:bold;color:#D4AF37;margin:16px 0;">${code}</p>
         <p style="color:#ccc;">Enter this code at checkout to redeem your discount right away.</p>`
      : `<p style="color:#ccc;">${detail || "Reply to this email or DM us to claim your prize."}</p>`;

    const html = `
      <div style="font-family:Georgia,serif;background:#0a0a0a;color:#fff;padding:32px;max-width:480px;margin:0 auto;">
        <h1 style="color:#D4AF37;letter-spacing:2px;font-size:20px;margin:0 0 24px;">CIG &amp; CO.</h1>
        <h2 style="font-size:22px;margin:0 0 8px;">You won: ${label}</h2>
        ${codeBlock}
        <p style="margin-top:28px;color:#666;font-size:12px;">This prize is yours to use right away — no waiting.</p>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: `You won: ${label} — CIG & CO. Arcade`,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { statusCode: 502, body: JSON.stringify({ error: errText }) };
    }

    return { statusCode: 200, body: JSON.stringify({ sent: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
