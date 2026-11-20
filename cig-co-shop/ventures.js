// CIG Ventures services for /ventures.
// Add an object to VENTURES_SERVICES to introduce a new service later.
// Compliance: no past-performance, certification, win-rate, speed, or volume
// promises; no client logos or testimonials; no legal name, EIN, UEI, address,
// or phone; no payment or Stripe links; no intake form. SIGNAL copy must keep
// "up to 5 qualified opportunities a week" immediately followed by the weekly
// count line, plus "Research, not legal or bidding advice."
// Prices, when shown, are CIG's week-1 reference prices from
// marketplace-listings.md: $149 Starter / $349 Professional, $249,
// $49 trial / $199/month.

const VENTURES_QUALITY_LINE = "AI-assisted research, quality-checked before delivery.";

const VENTURES_SERVICES = [
  {
    id: "lead-research",
    name: "B2B lead research",
    price: "$149 Starter · $349 Professional",
    paragraphs: [
      "Hand-researched, business-level contacts from each firm’s own website and other permitted public sources, with the public source noted on every row. The Starter package is research of up to 25 businesses. The Professional package is a larger, source-cited sales-opportunity report in the segment you name.",
      "Lists are smaller and slower than a large purchased list, because sources are read one firm at a time. We do not use personal emails, and we do not promise a fixed count, verified inboxes, or database-style coverage. If fewer firms meet your criteria from permitted public sources, we deliver those rows and say so.",
    ],
  },
  {
    id: "competitor-intelligence",
    name: "Competitor & market intelligence reports",
    price: "$249",
    paragraphs: [
      "A written report on three to five competitors you name, or a public list we propose and you confirm. The memo covers public positioning, publicly advertised pricing where it exists, messaging themes, and noticeable gaps, with source links and access dates.",
      "It is not interviews, licensed data, or private financials. This is research, not a guarantee of wins, sales, or any market outcome.",
    ],
  },
  {
    id: "signal-federal",
    name: "SIGNAL Federal",
    price: "$49 trial · $199/month",
    paragraphs: [
      "Weekly federal contracting opportunity briefs of up to 5 qualified opportunities a week. The weekly count depends on your codes and eligibility (size, set-aside, location); some weeks have fewer.",
      "Research, not legal or bidding advice. Briefs are prepared from public federal notice data. For each opportunity we include eligibility notes, historical awards, a bid recommendation, the deadline, and next steps. Contract value, scope, and remote-work terms may be marked Unknown when they are not in the public notice data. Short weeks are flagged, not padded.",
      "We do not claim government contracts, SAM.gov registration, or past performance, and we do not guarantee wins, leads, or any return. You remain responsible for your own eligibility and bids.",
    ],
  },
];

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function serviceArticle(service, index) {
  const n = String(index + 1).padStart(2, "0");
  const body = service.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n    ");
  return `<article class="ventures-service" id="${escapeHtml(service.id)}">
    <p class="ventures-service-index">${n}</p>
    <h2>${escapeHtml(service.name)}</h2>
    <p class="ventures-service-price">${escapeHtml(service.price)}</p>
    ${body}
  </article>`;
}

function renderVenturesServices(root) {
  if (!root) return;
  root.innerHTML = VENTURES_SERVICES.map(serviceArticle).join("\n");
}

if (typeof document !== "undefined") {
  const mount = () => renderVenturesServices(document.getElementById("ventures-services"));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { VENTURES_QUALITY_LINE, VENTURES_SERVICES, renderVenturesServices, escapeHtml };
}
