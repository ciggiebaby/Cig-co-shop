// Creates a PayPal order for the whole cart and returns the approval URL.
// Requires env vars: PAYPAL_CLIENT_ID, PAYPAL_SECRET
// (from https://developer.paypal.com/dashboard/applications — use Live keys once you're ready to go live, Sandbox keys to test)
// Optional: PAYPAL_API_BASE — defaults to live API. Set to https://api-m.sandbox.paypal.com while testing.

const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE || "https://api-m.paypal.com";

async function getAccessToken() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`
  ).toString("base64");

  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || "PayPal auth failed");
  return data.access_token;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { cart } = JSON.parse(event.body);
    if (!cart || cart.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "Cart is empty." }) };
    }

    const subtotal = cart
      .reduce((sum, item) => sum + item.price * item.qty, 0)
      .toFixed(2);

    const accessToken = await getAccessToken();
    const siteUrl = process.env.SITE_URL || `https://${event.headers.host}`;

    const orderRes = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: { currency_code: "USD", value: subtotal },
            description: "CIG & CO. order",
          },
        ],
        application_context: {
          return_url: `${siteUrl}/?checkout=success`,
          cancel_url: `${siteUrl}/?checkout=cancelled`,
          brand_name: "CIG & CO.",
          user_action: "PAY_NOW",
        },
      }),
    });

    const order = await orderRes.json();
    if (!orderRes.ok) throw new Error(order.message || "PayPal order creation failed");

    const approveLink = order.links.find((l) => l.rel === "approve");
    return { statusCode: 200, body: JSON.stringify({ url: approveLink.href }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
