// CIG Ventures services for /ventures.
// Add an object to VENTURES_SERVICES to introduce a new service later.
// Compliance: no past-performance, certification, win-rate, speed, or volume
// promises; no client logos or testimonials; no legal name, EIN, UEI, or
// phone; no payment or Stripe links on the page. paymentUrl is a reserved
// slot and must stay empty until sharing is approved. SIGNAL copy must keep
// "up to 5 qualified opportunities a week" immediately followed by the weekly
// count line, plus "Research, not legal or bidding advice."
// Prices, when shown, are CIG's week-1 reference prices from
// marketplace-listings.md: $149 Starter / $349 Professional, $249,
// $49 trial / $199/month.

const VENTURES_QUALITY_LINE = "AI-assisted research, quality-checked before delivery.";
const VENTURES_INTAKE_CONFIRMATION = "We'll reply within 1 business day with scope and a payment link.";
const VENTURES_SERVICE_IDS = ["lead-research", "competitor-intelligence", "signal-federal"];

const VENTURES_SERVICES = [
  {
    id: "lead-research",
    name: "B2B lead research",
    price: "$149 Starter · $349 Professional",
    paymentUrl: "",
    benefit: "Walk into outreach with more qualified prospects — business-level contacts researched from each firm’s own public pages, with the source on every row.",
    paragraphs: [
      "Hand-researched, business-level contacts from each firm’s own website and other permitted public sources, with the public source noted on every row. The Starter package is research of up to 25 businesses. The Professional package is a larger, source-cited sales-opportunity report in the segment you name.",
      "Lists are smaller and slower than a large purchased list, because sources are read one firm at a time. We do not use personal emails, and we do not promise a fixed count, verified inboxes, or database-style coverage. If fewer firms meet your criteria from permitted public sources, we deliver those rows and say so.",
    ],
    sample: {
      label: "Sample — illustrative format",
      caption: "Example rows only, to show the layout. This is not a list of past clients or a completed order.",
      kind: "table",
      columns: ["Business", "Public contact path", "Source (as published)"],
      rows: [
        ["Example Harbor Lighting Co.", "Sales inquiry form on the firm’s Contact page", "example-harbor-lighting.example (illustrative)"],
        ["Example Prairie Dental Group", "Office email listed on the firm’s website", "example-prairie-dental.example (illustrative)"],
        ["Example Northline Facilities LLC", "“Request a quote” form, no personal inbox published", "example-northline-facilities.example (illustrative)"],
      ],
    },
  },
  {
    id: "competitor-intelligence",
    name: "Competitor & market intelligence reports",
    price: "$249",
    paymentUrl: "",
    benefit: "Know competitors’ publicly advertised pricing, positioning, and gaps before you set your next move.",
    paragraphs: [
      "A written report on three to five competitors you name, or a public list we propose and you confirm. The memo covers public positioning, publicly advertised pricing where it exists, messaging themes, and noticeable gaps, with source links and access dates.",
      "It is not interviews, licensed data, or private financials. This is research, not a guarantee of wins, sales, or any market outcome.",
    ],
    sample: {
      label: "Sample — illustrative format",
      caption: "Fictional competitors in an example market, to show the memo format. Not a real engagement.",
      kind: "memo",
      body: [
        "Example market: regional specialty coffee equipment dealers (illustrative).",
        "Example Brand A — Publicly lists commercial grinder bundles from $1,890 on its shop page (accessed as an example). Messaging emphasizes same-week warehouse shipping. Gap: no published maintenance plan on the pricing page.",
        "Example Brand B — Advertises “plans starting at $99/month” for a service membership; the page does not itemize what is included (Unknown). Positioning is “white-glove setup.”",
        "Example Brand C — No public price list; the site routes all requests through a quote form. Messaging is trade-only. Gap: no comparison chart against mid-market kits.",
        "Sources in a paid report are live URLs with access dates. This sample uses clearly fictional names only.",
      ],
    },
  },
  {
    id: "signal-federal",
    name: "SIGNAL Federal",
    price: "$49 trial · $199/month",
    paymentUrl: "",
    benefit: "Never miss a fit federal contract in your codes and eligibility.",
    paragraphs: [
      "Weekly federal contracting opportunity briefs of up to 5 qualified opportunities a week. The weekly count depends on your codes and eligibility (size, set-aside, location); some weeks have fewer.",
      "Research, not legal or bidding advice. Briefs are prepared from public federal notice data. For each opportunity we include eligibility notes, historical awards, a bid recommendation, the deadline, and next steps. Contract value, scope, and remote-work terms may be marked Unknown when they are not in the public notice data. Short weeks are flagged, not padded.",
      "We do not claim government contracts, SAM.gov registration, or past performance, and we do not guarantee wins, leads, or any return. You remain responsible for your own eligibility and bids.",
    ],
    sample: {
      label: "Sample — illustrative format",
      caption: "Excerpt from a SAMPLE brief built from public SAM.gov extract and USAspending.gov records (read 11/19/2026) for an illustrative customer profile. Not a past-client deliverable.",
      kind: "signal",
      disclaimer: "Research, not legal or bidding advice.",
      body: [
        "SIGNAL Federal – Weekly Opportunity Brief (SAMPLE). Data as of 11/19/2026. Notices from the SAM.gov public Contract Opportunities extract; award history from the USAspending.gov API.",
        "Illustrative filter: NAICS 561492 / 561410, Total Small Business set-aside, deadline still open. Qualified is not a recommendation to bid. Contract value, scope, and remote-work terms may be marked Unknown when they are not in the public notice data.",
        "At a glance (excerpt): 1) DOJ / EOUSA — USAO Middle District of Georgia, Macon, GA, due Wed 12/2/2026, 1:00 PM ET, rated Pursue. 2) DOJ / EOUSA — USAO Southern District of Alabama, Mobile, AL, due Mon 11/30/2026, 12:00 PM ET, rated Pursue. Estimated value on both: Unknown (not in the public notice text).",
        "A paid brief includes eligibility notes, historical awards, a fit rating, the deadline, next steps, and source links. Ratings are research opinions, not a guarantee of wins or a recommendation to bid.",
      ],
    },
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
    <p class="ventures-service-benefit">${escapeHtml(service.benefit)}</p>
    ${body}
    <a class="btn btn-gold ventures-order-btn" href="/ventures#order" data-service="${escapeHtml(service.id)}">Order</a>
  </article>`;
}

function sampleCard(service) {
  const sample = service.sample;
  if (!sample) return "";
  let inner = "";
  if (sample.kind === "table") {
    const head = sample.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
    const rows = sample.rows.map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
    inner = `<div class="policy-table-wrap"><table class="ventures-sample-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  } else {
    const extra = sample.disclaimer ? `<p class="ventures-sample-disclaimer">${escapeHtml(sample.disclaimer)}</p>` : "";
    inner = `${extra}${sample.body.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}`;
  }
  return `<details class="ventures-sample" id="sample-${escapeHtml(service.id)}">
    <summary><span class="ventures-sample-name">${escapeHtml(service.name)}</span> <span class="ventures-sample-label">${escapeHtml(sample.label)}</span></summary>
    <p class="ventures-sample-caption">${escapeHtml(sample.caption)}</p>
    ${inner}
  </details>`;
}

function renderVenturesServices(root) {
  if (!root) return;
  root.innerHTML = VENTURES_SERVICES.map(serviceArticle).join("\n");
}

function renderVenturesSamples(root) {
  if (!root) return;
  root.innerHTML = VENTURES_SERVICES.map(sampleCard).join("\n");
}

function selectedServiceFromLocation(location) {
  try {
    const hash = new URL(location.href).hash || "";
    const params = new URLSearchParams((location.search || "").replace(/^\?/, ""));
    const fromQuery = params.get("service");
    if (VENTURES_SERVICE_IDS.includes(fromQuery)) return fromQuery;
    const match = hash.match(/service=([a-z0-9-]+)/i);
    if (match && VENTURES_SERVICE_IDS.includes(match[1])) return match[1];
  } catch {
    // Ignore malformed URLs and leave the select untouched.
  }
  return "";
}

function applyServiceSelection(serviceId, form) {
  const select = form && form.querySelector("#intake-service");
  if (select && VENTURES_SERVICE_IDS.includes(serviceId)) select.value = serviceId;
}

function wireVenturesOrderButtons(root, form) {
  if (!root) return;
  root.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-service]");
    if (!btn) return;
    applyServiceSelection(btn.getAttribute("data-service"), form);
  });
}

function wireVenturesIntake(form, fetchImpl) {
  if (!form) return;
  const request = fetchImpl || fetch;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = form.querySelector("#intake-message");
    const button = form.querySelector("#intake-submit");
    const honeypot = form.querySelector('input[name="website"]');
    const payload = {
      service: (form.querySelector("#intake-service") || {}).value,
      name: (form.querySelector("#intake-name") || {}).value,
      business: (form.querySelector("#intake-business") || {}).value,
      email: (form.querySelector("#intake-email") || {}).value,
      need: (form.querySelector("#intake-need") || {}).value,
      budgetTimeline: (form.querySelector("#intake-budget") || {}).value,
      website: honeypot ? honeypot.value : "",
    };
    if (button) button.disabled = true;
    if (message) message.textContent = "";
    try {
      const response = await request("/.netlify/functions/ventures-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Please email ventures@cigcompany.com — the form is unavailable right now.");
      }
      if (message) message.textContent = data.message || VENTURES_INTAKE_CONFIRMATION;
      form.reset();
      applyServiceSelection(payload.service, form);
    } catch (error) {
      if (message) message.textContent = error.message;
    } finally {
      if (button) button.disabled = false;
    }
  });
}

function stampVenturesYear(el, now) {
  if (el) el.textContent = String((now || new Date()).getFullYear());
}

function initVenturesPage(doc, location, fetchImpl) {
  const documentRef = doc || (typeof document !== "undefined" ? document : null);
  if (!documentRef) return;
  renderVenturesServices(documentRef.getElementById("ventures-services"));
  renderVenturesSamples(documentRef.getElementById("ventures-samples"));
  stampVenturesYear(documentRef.getElementById("year"));
  const form = documentRef.getElementById("ventures-intake");
  applyServiceSelection(selectedServiceFromLocation(location || (typeof window !== "undefined" ? window.location : { href: "", search: "" })), form);
  wireVenturesOrderButtons(documentRef, form);
  wireVenturesIntake(form, fetchImpl);
}

if (typeof document !== "undefined") {
  const mount = () => initVenturesPage(document, window.location, fetch);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    VENTURES_QUALITY_LINE,
    VENTURES_INTAKE_CONFIRMATION,
    VENTURES_SERVICE_IDS,
    VENTURES_SERVICES,
    renderVenturesServices,
    renderVenturesSamples,
    selectedServiceFromLocation,
    applyServiceSelection,
    wireVenturesIntake,
    initVenturesPage,
    escapeHtml,
  };
}
