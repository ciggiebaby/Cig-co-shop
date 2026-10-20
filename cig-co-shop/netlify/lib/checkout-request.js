// Shared request helpers for the PayPal and Coinbase checkout functions.
const DEFAULT_SITE_URL = "https://cigcompany.com";

// Only the catalog selection is trusted from the browser; names and prices are
// looked up from products.js by priceCartForStripe.
function trustedCartItems(body) {
  const submitted = body.items !== undefined ? body.items : body.cart;
  if (!Array.isArray(submitted)) return submitted;
  return submitted.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return {
      productId: item.productId,
      color: item.color,
      size: item.size,
      style: item.style,
      quantity: item.quantity ?? item.qty,
    };
  });
}

// SITE_URL, or the fixed canonical domain — never the request Host header.
function checkoutSiteUrl(value) {
  const url = new URL(value || DEFAULT_SITE_URL);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("SITE_URL is invalid.");
  }
  return url.href.replace(/\/+$/, "");
}

module.exports = { checkoutSiteUrl, trustedCartItems };
