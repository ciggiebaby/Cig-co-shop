// CIG & CO. — shipping rates (one table for the checkout page AND the server)
//
// Status of each country's rates:
//   CA, GB, DE, AU: APPROVED by CIG on 2026-10-21.
//   JP, KR:         APPROVED by CIG on 2026-10-21.
//
// US: free shipping on FW26/Printful pieces. In-hand backstock masks (products
// with `liveStock`, flagged `mask: true` on shipping lines) ship from CIG:
// any US order with a mask pays a flat MASK_US_SHIPPING_CENTS per ORDER,
// free when the merchandise total after promo (before shipping) is OVER
// MASK_FREE_SHIPPING_OVER_CENTS. Exactly $75.00 still pays. (CIG, 2026-10-22.)
// International: only the countries below.
//   - In-hand items (everything CIG ships himself via Pirate Ship: masks and
//     any other non-Printful product, flagged `inHand: true` on shipping
//     lines) ship to ALL of them for one per-ORDER charge by package weight
//     (IN_HAND_INTL_SHIPPING_USD below). CIG 2026-10-30: "There's no reason
//     any on hand item is blocked from anywhere." No US free-over-$75 abroad.
//   - Printful pieces ship abroad only if their products.js `shipping` class is
//     listed in INTERNATIONAL_SHIPPING_PER_ITEM_USD (pillows: US only; MagSafe
//     cases: not JP/KR). A cart with both pays the in-hand order charge PLUS
//     the Printful per-item charges (they ship in separate parcels).
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
  // and the tote (Printful product 274, variant 9039; quoted identically 10/22)
  //   Printful per-unit: CA 7.29  GB 4.59  DE 4.99  AU 7.99 | JP 4.89  KR 12.49
  bag:    { CA: 8,  GB: 5, DE: 5, AU: 8,  JP: 5, KR: 13 },
  // MagSafe phone cases: NOT to JP/KR. Printful's product page says this case
  //   can't ship to South Korea, Hong Kong, Taiwan, Japan, or Singapore
  //   (CIG pasted it 10/30), so JP/KR are blocked even though the rate API quoted them.
  //   Printful per-unit: CA 9.29  GB 2.59  DE 7.29  AU 8.39
  case:   { CA: 10, GB: 3, DE: 8, AU: 9 },
  // laptop sleeves
  //   Printful per-unit: CA 9.79  GB 7.29  DE 7.29  AU 12.49 | JP 7.89  KR 17.69
  sleeve: { CA: 10, GB: 8, DE: 8, AU: 13, JP: 8, KR: 18 },
  // pillow: US only (Printful: CA 12.69, GB 11.49, DE 13.79, AU 37.59, JP 55.99, KR 51.99)
};

// Shown at checkout for every non-US ship-to country and in the shipping &
// returns policy (CIG decision 2026-10-21: international orders ship DDU).
const DUTIES_NOTICE =
  "Duties and taxes may apply on delivery and are the buyer's responsibility. Shipping isn't refunded on refused parcels.";

// South Korea customs needs the buyer's Personal Customs Clearance Code
// (PCCC): the letter P followed by 12 digits. Returns the cleaned code
// ("P123456789012") or null if it isn't valid.
const PCCC_PATTERN = /^P\d{12}$/;
function normalizePccc(value) {
  if (typeof value !== "string") return null;
  const code = value.replace(/[\s-]/g, "").toUpperCase();
  return PCCC_PATTERN.test(code) ? code : null;
}

// Slow routes: shown to the buyer at checkout so the wait isn't a surprise.
// No slow routes right now (MagSafe cases to Japan/South Korea were here, but
// Printful can't ship cases there, so those routes are blocked instead).
const SLOW_DELIVERY = {};

const MASK_US_SHIPPING_CENTS = 895;
const MASK_FREE_SHIPPING_OVER_CENTS = 7500;
const MASK_SHIPPING_NOTE = "US mask orders ship for $8.95 \u2014 free over $75. Abroad, mask orders pay one USPS rate per order, priced by package weight and shown at checkout.";

// ---------- In-hand items abroad (CIG ships via Pirate Ship, USPS) ----------
// Service: USPS First-Class Package International (FCPI), the cheapest USPS
// international service for parcels up to 4 lb. FCPI price is set by weight
// band + destination group (no zones, so the Atlanta, GA origin doesn't change it).
// SOURCE: Pirate Ship's published rate sheet "Pirate-Ship-October-30-2026-USPS-
//   Rates.xlsx", tab "First Class Package Intl" ("USPS October 2026 Rates,
//   Effective October 30th 2026"), linked from
//   https://www.pirateship.com/usps/first-class-package-international
//   (pulled 2026-10-30, no login). It matches USPS's published Commercial Base
//   file s-fcpis-com-base.csv (2026, "Final 9/14/2026") to the cent.
// Groups (same sheet, "International Country Codes" tab):
//   CA 1, GB 20, DE 16, AU 12, JP 17, KR 18.
// Raw Pirate Ship quotes, USD per parcel:
//   band       CA     GB     DE     AU     JP     KR
//   1-8 oz   18.48  21.95  20.75  23.62  22.99  21.94   (1 mask, ~6 oz est.)
//   9-16 oz  24.69  30.34  27.92  39.16  32.24  29.90   (2-3 masks, ~9-12 oz est.)
//   17-32 oz 27.65  33.98  31.27  43.86  36.11  33.49
//   33-48 oz 36.57  46.33  45.33  62.00  53.78  48.19
//   49-64 oz 39.59  53.43  54.10  65.75  64.27  55.44
// Our charge = that band's quote rounded UP to the whole dollar. Cushion: the
// smallest band we charge is 9-16 oz, so a 1-mask order pays the 2-3 mask rate
// (CIG's packed mask weigh-in is still pending; the 6 oz guess is close to
// the 8 oz break). Once real weights are in, the 1-8 oz band could be used for
// single small items (about $6-$16 less per order).
// Weight estimate: IN_HAND_MAILER_OZ for the poly mailer + each unit's
// products.js `shipWeightOz` (default IN_HAND_DEFAULT_ITEM_OZ): 1 mask = 6 oz,
// 2 = 9 oz, 3 = 12 oz, same as the orders-export Pirate Ship CSV estimate.
// FCPI caps a parcel at 64 oz (4 lb) and $400 declared value: heavier orders
// are charged as several parcels (each with its own mailer). Orders over
// $400 in in-hand goods may need splitting or Priority Mail Intl by hand.
const IN_HAND_MAILER_OZ = 3;
const IN_HAND_DEFAULT_ITEM_OZ = 3;
const IN_HAND_MAX_PARCEL_OZ = 64;
const IN_HAND_INTL_SHIPPING_USD = [
  // [max parcel oz, { country: whole dollars per parcel }]
  [16, { CA: 25, GB: 31, DE: 28, AU: 40, JP: 33, KR: 30 }],
  [32, { CA: 28, GB: 34, DE: 32, AU: 44, JP: 37, KR: 34 }],
  [48, { CA: 37, GB: 47, DE: 46, AU: 62, JP: 54, KR: 49 }],
  [64, { CA: 40, GB: 54, DE: 55, AU: 66, JP: 65, KR: 56 }],
];

function inHandLine(line) {
  return !!(line && (line.inHand || line.mask));
}

function lineWeightOz(line) {
  const each = Number(line && line.weightOz);
  const unit = Number.isFinite(each) && each > 0 ? each : IN_HAND_DEFAULT_ITEM_OZ;
  const qty = Number.isInteger(line && line.quantity) && line.quantity > 0 ? line.quantity : 1;
  return unit * qty;
}

function parcelCents(parcelOz, country) {
  const band = IN_HAND_INTL_SHIPPING_USD.find(([maxOz]) => parcelOz <= maxOz);
  const dollars = band && band[1][country];
  return Number.isInteger(dollars) && dollars >= 0 ? dollars * 100 : null;
}

// Per-order charge abroad for the in-hand lines, in cents; 0 if there are none,
// null if the country isn't served. Splits into <= 64 oz parcels when needed.
function inHandInternationalCents(lines, country) {
  const itemsOz = (lines || []).filter(inHandLine).reduce((sum, line) => sum + lineWeightOz(line), 0);
  if (!itemsOz) return 0;
  const perParcelItemsOz = IN_HAND_MAX_PARCEL_OZ - IN_HAND_MAILER_OZ;
  const parcels = Math.ceil(itemsOz / perParcelItemsOz);
  let cents = 0;
  let remaining = itemsOz;
  for (let i = 0; i < parcels; i += 1) {
    const chunk = Math.min(remaining, perParcelItemsOz);
    remaining -= chunk;
    const one = parcelCents(chunk + IN_HAND_MAILER_OZ, country);
    if (one === null) return null;
    cents += one;
  }
  return cents;
}

// US shipping for a cart: $8.95 per order if any line is a mask and the
// merchandise total after promo is not over $75; otherwise free. A missing
// merchandiseCents is treated as under the threshold (never undercharges).
function usShippingCents(lines, merchandiseCents) {
  const hasMask = lines.some((line) => line && line.mask);
  if (!hasMask) return 0;
  return Number.isFinite(merchandiseCents) && merchandiseCents > MASK_FREE_SHIPPING_OVER_CENTS
    ? 0
    : MASK_US_SHIPPING_CENTS;
}

// Returns the per-item charge in cents, or null if that class can't ship there.
function shippingCentsPerItem(shippingClass, country) {
  if (country === "US") return 0;
  const rates = INTERNATIONAL_SHIPPING_PER_ITEM_USD[shippingClass];
  const dollars = rates && rates[country];
  return Number.isInteger(dollars) && dollars >= 0 ? dollars * 100 : null;
}

// True if the shipping class ships to at least one country outside the US.
function shipsAbroad(shippingClass) {
  const rates = INTERNATIONAL_SHIPPING_PER_ITEM_USD[shippingClass];
  return !!rates && Object.keys(rates).length > 0;
}

// lines: [{ name, shipping, quantity, mask, inHand, weightOz }] (shipping = the
// product's class; mask = live-stock mask (US $8.95 rule); inHand = shipped by
// CIG, priced abroad by weight; weightOz = per unit). merchandiseCents = items
// total after promo, before shipping (only used for the US mask rule).
// Returns { country, shippingCents, blocked, usOnly } where blocked lists the
// product names that can't ship to that country (shippingCents is null if any)
// and usOnly is the subset that can't ship outside the US at all (pillows);
// the rest (e.g. MagSafe cases to JP/KR) only miss that one country.
function quoteShipping(lines, country, { merchandiseCents } = {}) {
  if (!Object.prototype.hasOwnProperty.call(SHIP_TO_COUNTRIES, country)) {
    return { country, shippingCents: null, blocked: [], usOnly: [], unsupportedCountry: true };
  }
  if (country === "US") {
    return { country, shippingCents: usShippingCents(lines, merchandiseCents), blocked: [], usOnly: [], unsupportedCountry: false };
  }
  let shippingCents = 0;
  const blocked = [];
  const usOnly = [];
  lines.forEach((line) => {
    if (inHandLine(line)) return; // priced per order below
    const perItem = shippingCentsPerItem(line.shipping, country);
    if (perItem === null) {
      if (!blocked.includes(line.name)) blocked.push(line.name);
      if (!shipsAbroad(line.shipping) && !usOnly.includes(line.name)) usOnly.push(line.name);
      return;
    }
    shippingCents += perItem * line.quantity;
  });
  const inHandCents = inHandInternationalCents(lines, country);
  if (inHandCents === null) {
    lines.filter(inHandLine).forEach((line) => { if (!blocked.includes(line.name)) blocked.push(line.name); });
  } else {
    shippingCents += inHandCents;
  }
  return { country, shippingCents: blocked.length ? null : shippingCents, blocked, usOnly, unsupportedCountry: false };
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
    DUTIES_NOTICE,
    IN_HAND_DEFAULT_ITEM_OZ,
    IN_HAND_INTL_SHIPPING_USD,
    IN_HAND_MAILER_OZ,
    INTERNATIONAL_SHIPPING_PER_ITEM_USD,
    MASK_FREE_SHIPPING_OVER_CENTS,
    MASK_SHIPPING_NOTE,
    MASK_US_SHIPPING_CENTS,
    PCCC_PATTERN,
    SHIP_TO_COUNTRIES,
    SLOW_DELIVERY,
    inHandInternationalCents,
    normalizePccc,
    quoteShipping,
    slowDeliveryNote,
    shippingCentsPerItem,
    shipsAbroad,
    usShippingCents,
  };
}
