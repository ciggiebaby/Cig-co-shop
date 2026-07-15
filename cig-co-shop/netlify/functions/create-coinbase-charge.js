// Creates a Coinbase Commerce charge for the cart, with your standing 20% crypto discount
// applied automatically, and returns the hosted checkout URL.
// Requires env var: COINBASE_COMMERCE_API_KEY (from https://beta.commerce.coinbase.com/settings/security)

const CRYPTO_DISCOUNT = 0.20; // 20% off for crypto payments, always

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { cart, customer } = JSON.parse(event.body);
    if (!cart || cart.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "Cart is empty." }) };
    }

    const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const discounted = (subtotal * (1 - CRYPTO_DISCOUNT)).toFixed(2);

    const description = cart
      .map((item) => `${item.name}${item.color ? " (" + item.color + (item.size ? ", " + item.size : "") + ")" : ""} x${item.qty}`)
      .join(", ");

    const siteUrl = process.env.SITE_URL || `https://${event.headers.host}`;

    const res = await fetch("https://api.commerce.coinbase.com/charges", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CC-Api-Key": process.env.COINBASE_COMMERCE_API_KEY,
        "X-CC-Version": "2018-03-22",
      },
      body: JSON.stringify({
        name: "CIG & CO. order (20% crypto discount applied)",
        description,
        pricing_type: "fixed_price",
        local_price: { amount: discounted, currency: "USD" },
        metadata: {
          customer_email: customer && customer.email ? customer.email : "",
          customer_name: customer && customer.name ? customer.name : "",
        },
        redirect_url: `${siteUrl}/?checkout=success`,
        cancel_url: `${siteUrl}/?checkout=cancelled`,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error((data.error && data.error.message) || "Coinbase Commerce charge failed");

    return { statusCode: 200, body: JSON.stringify({ url: data.data.hosted_url }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
