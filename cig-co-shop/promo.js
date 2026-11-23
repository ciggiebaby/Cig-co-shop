// CIG & CO. — promo codes + arcade prizes
// Shared by the checkout (index.html) and the Arcade games (arcade.html).
// discount is a fraction off each MASK's price (0.10 = 10% off); promos never
// touch FW26/27 pieces (see "Masks-only promos" below).
//
// Static codes live in PROMO_CODES below. Each entry:
//   discount       fraction off each eligible MASK's price (0.20 = 20% off)
//   label          short text shown at checkout ("20% off")
//   productIds     optional: which masks it covers (a subset of
//                  PROMO_ELIGIBLE_PRODUCT_IDS). Missing = all three masks.
//   eligibleLabel  optional: how those masks are named in checkout messages
//   startsAt       optional ISO time: the code is refused before this moment
//   endsAt         optional ISO time: the code is refused from this moment on
// Codes are UPPERCASE; customers can type them in any case. The server checks
// this same list (and the time window), so a code only works once it's here,
// deployed, and inside its window.
// Promo codes never stack with the 20% crypto discount — crypto checkout
// always uses the crypto discount instead of a promo code — and checkout
// takes one code per order, so codes never stack with each other.

const PROMO_CODES = {
  // Black Friday early access (CIG approved Mon 11/23/2026, 12:31 AM ET).
  // 20% off ski masks ($30 -> $24) and balaclavas ($25 -> $20) only. Moto
  // masks, FW26/27 pieces (Crossbody, MagSafe, the $99 bundle, sleeves,
  // pillows, tote) and Arcade prizes get nothing. One code per order.
  // Live Tue 11/24 12:00 AM ET through Mon 11/30 11:59 PM ET.
  EARLYCIG: {
    discount: 0.20,
    label: "20% off",
    productIds: ["0008", "0005"], // ski mask, balaclava (no moto)
    eligibleLabel: "ski masks and balaclavas",
    startsAt: "2026-11-24T05:00:00.000Z", // Tue 11/24 12:00 AM ET
    endsAt: "2026-12-01T05:00:00.000Z",   // refused from Tue 12/1 12:00 AM ET
  },
};

// "active", "not_started", "expired", or null (no such static code).
function promoCodeStatus(code, now = Date.now()) {
  const promo = PROMO_CODES[code];
  if (!promo) return null;
  const start = promo.startsAt == null ? -Infinity : Date.parse(promo.startsAt);
  const end = promo.endsAt == null ? Infinity : Date.parse(promo.endsAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return "expired"; // bad config: fail closed
  if (now < start) return "not_started";
  if (now >= end) return "expired";
  return "active";
}

// The PROMO_CODES entry if the code exists and is inside its window, else null.
function activePromoCode(code, now = Date.now()) {
  return promoCodeStatus(code, now) === "active" ? PROMO_CODES[code] : null;
}

// Arcade codes (e.g. CIG10-7KQ4XW2M) are different: each one is unique to the
// email that won it, single use, and expires 7 days after it's issued. They
// live in Supabase (arcade_codes) and the server checks them at checkout.
const ARCADE_CODE_PATTERN = /^CIG\d{2}-[A-HJKMNP-Z2-9]{8}$/;

function isArcadeCode(code) {
  return typeof code === "string" && ARCADE_CODE_PATTERN.test(code);
}

const PROMO_STORAGE_KEY = "cig_co_promo_v1";

function savePromoWin(code) {
  if (!activePromoCode(code) && !isArcadeCode(code)) return;
  localStorage.setItem(PROMO_STORAGE_KEY, code);
}

function clearSavedPromo() {
  localStorage.removeItem(PROMO_STORAGE_KEY);
}

function getSavedPromo() {
  const code = localStorage.getItem(PROMO_STORAGE_KEY);
  return code && (activePromoCode(code) || isArcadeCode(code)) ? code : null;
}

// ---------- Arcade prizes ----------
// Display copy for the Arcade wheel. Supabase (arcade_prizes) is what actually
// picks the prize — keep the ids here in sync with the active rows there.
// First play: always "p10" (a unique one-time 10% code, good for 7 days).
// Later plays: mostly free perks, with a rare one-time 15% code (~1 in 20).
const PRIZES = [
  { id: "p10",      type: "discount", code: null, label: "10% Off",        detail: "A one-time 10% off code, good for 7 days." },
  { id: "early",    type: "perk",     code: null, label: "Early Access",   detail: "You're on the early-access list for our next drop. Watch your inbox." },
  { id: "p15",      type: "discount", code: null, label: "15% Off",        detail: "A one-time 15% off code, good for 7 days." },
  { id: "giveaway", type: "perk",     code: null, label: "Giveaway Entry", detail: "You're entered in this month's giveaway for one free mask. The winner is emailed." },
];

function prizeById(id) {
  return PRIZES.find((p) => p.id === id) || null;
}

// ---------- Masks-only promos (CIG decision, Thu Oct 29, 2026) ----------
// Every promo code (Arcade codes and any static code above) takes money off
// MASK lines only: the ski mask, the balaclava and the moto mask. FW26/27
// Printful pieces always stay full price. A code on a cart with no mask is
// refused (so an Arcade code isn't burned for nothing). Arcade free-item
// prizes (giveaway win, Free Merch, Mystery Gift) can only be redeemed as one
// of these masks. The 20% crypto discount is separate and unchanged.
const PROMO_ELIGIBLE_PRODUCT_IDS = ["0008", "0005", "0013"]; // ski mask, balaclava, moto mask
const PROMO_ELIGIBLE_LABEL = "masks (ski mask, balaclava, moto mask)";

// Max promo discount on a mask: 20% (set by BG, Finance, Thu Oct 29, 2026).
// PROVISIONAL until we have mask unit costs (Alibaba invoices) and a mask
// label rate (weigh-in); BG may lower it then. A code worth more than this is
// cut down to this cap on each mask. Codes never stack: checkout takes one
// promo code per order, and crypto never takes one, so no order gets more
// than this off a mask.
const MASK_PROMO_MAX_DISCOUNT = 0.20;

// Lowest price a promo may take each mask to: wholesale (confirmed by BG,
// Oct 29, 2026; PROVISIONAL like the cap above). Must never go below wholesale (line sheet: ski $15, balaclava $12.50,
// moto $7.50). A promo can never push a mask's price under its floor, and a
// mask with no floor listed here gets no promo discount at all (fail safe).
const MASK_PROMO_PRICE_FLOOR_USD = {
  "0008": 15.00, // CIG Ski Mask ($30 retail, $15 wholesale)
  "0005": 12.50, // CIG Balaclava ($25 retail, $12.50 wholesale)
  "0013": 7.50,  // Moto Mask ($15 retail, $7.50 wholesale)
};

// Free prize masks ship separately on their own Pirate Ship label, so the
// winner always pays the standard mask shipping for the gift, even when their
// own order ships free. Kept at $8.95 on purpose: shop mask orders ship free in
// the US since 2026-11-01 (MASK_US_SHIPPING_CENTS = 0), but prize shipping was
// not part of that change.
// Winners abroad (CIG 2026-10-30) pay the international in-hand rate for one
// mask to their country instead (giftMaskShippingCents; $25 CA to $40 AU).
const GIFT_MASK_SHIPPING_CENTS = 895;
const GIFT_MASK_INTL_FROM_USD = 25; // cheapest country (Canada), for the prize text

// Shipping in cents for one free prize mask to `country` ("US" = $8.95).
function giftMaskShippingCents(country) {
  const code = typeof country === "string" ? country.trim().toUpperCase() : "US";
  if (!code || code === "US") return GIFT_MASK_SHIPPING_CENTS;
  const rates = typeof module !== "undefined" && module.exports && typeof require === "function"
    ? require("./shipping-rates.js")
    : (typeof inHandInternationalCents === "function" ? { inHandInternationalCents } : null);
  if (!rates) return null;
  return rates.inHandInternationalCents([{ name: "Prize mask", quantity: 1, inHand: true }], code);
}

// eligibleIds (optional) narrows a code to some of the masks (e.g. EARLYCIG:
// ski mask + balaclava). It can never widen past PROMO_ELIGIBLE_PRODUCT_IDS.
function isPromoEligibleProduct(productId, eligibleIds) {
  if (!PROMO_ELIGIBLE_PRODUCT_IDS.includes(productId)) return false;
  return Array.isArray(eligibleIds) ? eligibleIds.includes(productId) : true;
}

// Unit price in cents after a promo of `basisPoints` (1000 = 10% off), for one
// product. Non-mask products are returned unchanged. Shared by the checkout
// page (app.js) and the server (stripe-pricing.js) so totals match.
function promoUnitCents(productId, unitCents, basisPoints, eligibleIds) {
  if (!basisPoints || basisPoints <= 0 || !isPromoEligibleProduct(productId, eligibleIds)) return unitCents;
  const floorUsd = MASK_PROMO_PRICE_FLOOR_USD[productId];
  if (typeof floorUsd !== "number" || !Number.isFinite(floorUsd) || floorUsd <= 0) return unitCents;
  const capBasisPoints = Math.round(MASK_PROMO_MAX_DISCOUNT * 10000);
  const effective = Math.max(0, Math.min(basisPoints, capBasisPoints));
  const discounted = Math.round((unitCents * (10000 - effective)) / 10000);
  const floorCents = Math.min(unitCents, Math.round(floorUsd * 100));
  return Math.max(discounted, floorCents);
}

function cartHasPromoEligibleItem(productIds, eligibleIds) {
  return Array.isArray(productIds) && productIds.some((id) => isPromoEligibleProduct(id, eligibleIds));
}

// Masks-only terms shown under an Arcade prize (wheel/scratch/boxes banner and
// the prize email). Returns "" for prizes with nothing to redeem.
function prizeTermsNote(prize) {
  if (!prize) return "";
  const shipping = `$${(GIFT_MASK_SHIPPING_CENTS / 100).toFixed(2)}`;
  if (prize.type === "discount") {
    return `Good on ${PROMO_ELIGIBLE_LABEL} only. FW26/27 pieces stay full price.`;
  }
  if (prize.type === "merch" || prize.type === "gift" || prize.id === "giveaway") {
    return `Redeemable for one mask only (ski mask, balaclava or moto mask). `
      + `The free mask ships separately: you pay ${shipping} shipping for it in the US `
      + `(abroad, our international mask rate, from $${GIFT_MASK_INTL_FROM_USD}), even if your order ships free.`;
  }
  return "";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ARCADE_CODE_PATTERN,
    GIFT_MASK_SHIPPING_CENTS,
    giftMaskShippingCents,
    MASK_PROMO_MAX_DISCOUNT,
    MASK_PROMO_PRICE_FLOOR_USD,
    PROMO_CODES,
    PROMO_ELIGIBLE_LABEL,
    PROMO_ELIGIBLE_PRODUCT_IDS,
    PRIZES,
    activePromoCode,
    cartHasPromoEligibleItem,
    isArcadeCode,
    isPromoEligibleProduct,
    prizeTermsNote,
    promoCodeStatus,
    promoUnitCents,
  };
}
