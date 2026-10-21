// CIG & CO. — shipping rates (one table for the checkout page AND the server)
//
// Status of each country's rates:
//   CA, GB, DE, AU: APPROVED by CIG on 2026-10-21.
//   JP, KR:         APPROVED by CIG on 2026-10-21.
//
// US: free shipping on everything (unchanged).
// International: only the countries below, and only for products whose
// products.js entry has a `shipping` class listed here. Anything else
// (pillows, and any product without a class) ships to the US only.
//
// Each number is the charge PER ITEM in whole US dollars: Printful's cheapest
// standard per-unit shipping for that country, rounded UP to the next dollar.
// Printful quotes (USD, one unit, pulled Oct 2026) are in the comments. We
// charge the per-unit rate on every item, even though Printful charges less
// for additional items in the same box, so margin is never at risk.
// To change a rate, edit the number here; the site and checkout both use it.

const SHIP_TO_COUNTRIES = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  DE: "Germany",
  AU: "Australia",
  JP: "Japan",
  KR: "South Korea",
};

const INTERNATIONAL_SHIPPING_PER_ITEM_USD = {
  // crossbody bags (incl. Multi; all are Printful product 744, variant 19256)
  //   Printful per-unit: CA 7.29  GB 4.59  DE 4.99  AU 7.99 | JP 4.89  KR 12.49
  bag:    { CA: 8,  GB: 5, DE: 5, AU: 8,  JP: 5, KR: 13 },
  // MagSafe phone cases (JP/KR delivery is slow: ~30 days)
  //   Printful per-unit: CA 9.29  GB 2.59  DE 7.29  AU 8.39 | JP 5.19  KR 8.29
  case:   { CA: 10, GB: 3, DE: 8, AU: 9,  JP: 6, KR: 9 },
  // laptop sleeves
  //   Printful per-unit: CA 9.79  GB 7.29  DE 7.29  AU 12.49 | JP 7.89  KR 17.69
  sleeve: { CA: 10, GB: 8, DE: 8, AU: 13, JP: 8, KR: 18 },
  // pillow: US only (Printful: CA 12.69, GB 11.49, DE 13.79, AU 37.59, JP 55.99, KR 51.99)
};

// Slow routes: shown to the buyer at checkout so the wait isn't a surprise.
// Printful's standard estimate for MagSafe cases to Japan/South Korea is up
// to 30 days (bags and sleeves are ~8-11 days).
const SLOW_DELIVERY = {
  case: { JP: "about 30 days", KR: "about 30 days" },
};

// Returns the per-item charge in cents, or null if that class can't ship there.
function shippingCentsPerItem(shippingClass, country) {
  if (country === "US") return 0;
  const rates = INTERNATIONAL_SHIPPING_PER_ITEM_USD[shippingClass];
  const dollars = rates && rates[country];
  return Number.isInteger(dollars) && dollars >= 0 ? dollars * 100 : null;
}

// lines: [{ name, shipping, quantity }] (shipping = the product's class).
// Returns { country, shippingCents, blocked } where blocked lists the product
// names that can't ship to that country (shippingCents is null if any).
function quoteShipping(lines, country) {
  if (!Object.prototype.hasOwnProperty.call(SHIP_TO_COUNTRIES, country)) {
    return { country, shippingCents: null, blocked: [], unsupportedCountry: true };
  }
  let shippingCents = 0;
  const blocked = [];
  lines.forEach((line) => {
    const perItem = shippingCentsPerItem(line.shipping, country);
    if (perItem === null) {
      if (!blocked.includes(line.name)) blocked.push(line.name);
      return;
    }
    shippingCents += perItem * line.quantity;
  });
  return { country, shippingCents: blocked.length ? null : shippingCents, blocked, unsupportedCountry: false };
}

// lines: [{ name, shipping }]. Returns a short note for items on a slow route
// to that country, or "" if none.
function slowDeliveryNote(lines, country) {
  const notes = [];
  lines.forEach((line) => {
    const route = SLOW_DELIVERY[line.shipping];
    const eta = route && route[country];
    if (eta && !notes.some((n) => n.name === line.name)) notes.push({ name: line.name, eta });
  });
  if (!notes.length) return "";
  const place = SHIP_TO_COUNTRIES[country] || country;
  return notes.map((n) => `${n.name} to ${place} takes ${n.eta} to arrive.`).join(" ");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    INTERNATIONAL_SHIPPING_PER_ITEM_USD,
    SHIP_TO_COUNTRIES,
    SLOW_DELIVERY,
    quoteShipping,
    slowDeliveryNote,
    shippingCentsPerItem,
  };
}
