// CIG & CO. — promo codes + arcade prizes
// Shared by the checkout (index.html) and the Arcade games (arcade.html).
// discount is a fraction off the subtotal (0.10 = 10% off).
//
// No codes are active right now — every code entered at checkout shows
// "That code isn't valid." To add one, put a line inside the braces, e.g.
//   SUMMER15: { discount: 0.15, label: "15% off" },
// Codes are UPPERCASE; customers can type them in any case. The server checks
// this same list, so a code only works once it's here and deployed.
// Promo codes never stack with the 20% crypto discount — crypto checkout
// always uses the crypto discount instead of a promo code.

const PROMO_CODES = {
};

// Arcade codes (e.g. CIG10-7KQ4XW2M) are different: each one is unique to the
// email that won it, single use, and expires 7 days after it's issued. They
// live in Supabase (arcade_codes) and the server checks them at checkout.
const ARCADE_CODE_PATTERN = /^CIG\d{2}-[A-HJKMNP-Z2-9]{8}$/;

function isArcadeCode(code) {
  return typeof code === "string" && ARCADE_CODE_PATTERN.test(code);
}

const PROMO_STORAGE_KEY = "cig_co_promo_v1";

function savePromoWin(code) {
  if (!PROMO_CODES[code] && !isArcadeCode(code)) return;
  localStorage.setItem(PROMO_STORAGE_KEY, code);
}

function clearSavedPromo() {
  localStorage.removeItem(PROMO_STORAGE_KEY);
}

function getSavedPromo() {
  const code = localStorage.getItem(PROMO_STORAGE_KEY);
  return code && (PROMO_CODES[code] || isArcadeCode(code)) ? code : null;
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
  { id: "giveaway", type: "perk",     code: null, label: "Giveaway Entry", detail: "You're entered in this month's giveaway for one free item. The winner is emailed." },
];

function prizeById(id) {
  return PRIZES.find((p) => p.id === id) || null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ARCADE_CODE_PATTERN, PROMO_CODES, PRIZES, isArcadeCode };
}
