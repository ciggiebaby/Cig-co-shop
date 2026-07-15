// Creates a Stripe Checkout Session for the whole cart and returns its hosted URL.
// Requires env var: STRIPE_SECRET_KEY (from https://dashboard.stripe.com/apikeys)
const Stripe = require("stripe");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const { cart, customer } = JSON.parse(event.body);

    if (!cart || cart.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "Cart is empty." }) };
    }

    const line_items = cart.map((item) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: [item.name, item.color, item.size].filter(Boolean).join(" — "),
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.qty,
    }));

    const siteUrl = process.env.SITE_URL || `https://${event.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      customer_email: customer && customer.email ? customer.email : undefined,
      shipping_address_collection: { allowed_countries: ["US"] },
      success_url: `${siteUrl}/?checkout=success`,
      cancel_url: `${siteUrl}/?checkout=cancelled`,
    });

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
