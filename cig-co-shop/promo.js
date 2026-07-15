// CIG & CO. — promo codes + arcade prizes
// Shared by the checkout (index.html) and the Arcade games (arcade.html).
// discount is a fraction off the subtotal (0.10 = 10% off).

const PROMO_CODES = {
  CIG5:  { discount: 0.05, label: "5% off" },
  CIG10: { discount: 0.10, label: "10% off" },
  CIG20: { discount: 0.20, label: "20% off" },
};

const PROMO_STORAGE_KEY = "cig_co_promo_v1";

function savePromoWin(code) {
  if (!PROMO_CODES[code]) return;
  localStorage.setItem(PROMO_STORAGE_KEY, code);
}

function getSavedPromo() {
  const code = localStorage.getItem(PROMO_STORAGE_KEY);
  return code && PROMO_CODES[code] ? code : null;
}

// ---------- Arcade prizes ----------
// type "discount" auto-links to a PROMO_CODES entry (usable at checkout).
// type "merch" / "gift" have no auto-fulfillment — instruct the winner to
// screenshot their result and reach out (email/DM) to redeem. Edit freely.
const PRIZES = [
  { id: "p5",     type: "discount", code: "CIG5",  label: "5% Off",         detail: "Use code CIG5 at checkout." },
  { id: "p10",    type: "discount", code: "CIG10", label: "10% Off",        detail: "Use code CIG10 at checkout." },
  { id: "p20",    type: "discount", code: "CIG20", label: "20% Off",        detail: "Use code CIG20 at checkout." },
  { id: "merch",  type: "merch",    code: null,    label: "Free Merch",     detail: "Screenshot this and email or DM us to claim your free item." },
  { id: "gift",   type: "gift",     code: null,    label: "Mystery Gift",   detail: "Screenshot this and email or DM us to claim your gift." },
  { id: "again1", type: "none",     code: null,    label: "Try Again",      detail: "No luck this time — come back soon." },
  { id: "again2", type: "none",     code: null,    label: "So Close",       detail: "No luck this time — come back soon." },
];

function prizeById(id) {
  return PRIZES.find((p) => p.id === id) || null;
}
