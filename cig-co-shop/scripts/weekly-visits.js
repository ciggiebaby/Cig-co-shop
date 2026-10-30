// Weekly site-visit report (read-only). Calls the Supabase function
// cigco_site_visits_summary (migration 202610300002_site_visits.sql) and prints
// a plain-text summary for the Sunday huddle. Never writes anything.
// Usage: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/weekly-visits.js [days=7] [--json]
const { createSupabaseClient } = require("../netlify/lib/supabase.js");

function list(rows, label, key, value = "visits") {
  if (!rows || rows.length === 0) return [`${label}: none yet`];
  return [`${label}:`, ...rows.map((r) => `  ${r[key]}  ${r[value]}`)];
}

function formatSummary(s) {
  const t = s.totals || {};
  const lines = [
    `CIG & CO. site visits, last ${s.days} days`,
    `Visits (page views): ${t.visits || 0}`,
    `Unique sessions: ${t.unique_sessions || 0}`,
    `Product views: ${t.product_views || 0}`,
    `Add to Bag: ${t.add_to_bag || 0}`,
    `Checkout starts: ${t.checkout_start || 0}`,
    "",
    "By day (ET): date  visits / sessions / product views / add to bag / checkout",
    ...(s.by_day || []).map((d) => `  ${d.day}  ${d.visits} / ${d.unique_sessions} / ${d.product_views} / ${d.add_to_bag} / ${d.checkout_start}`),
    "",
    ...list(s.top_pages, "Top pages", "path"),
    ...(s.top_products && s.top_products.length
      ? ["Top products (views / add to bag):", ...s.top_products.map((p) => `  ${p.product_id}  ${p.views} / ${p.add_to_bag}`)]
      : ["Top products: none yet"]),
    ...list(s.referrers, "Referrers", "referrer"),
    ...list(s.src, "Source tags (?src=)", "src"),
    ...((s.utm && s.utm.length)
      ? ["UTM tags:", ...s.utm.map((u) => `  ${[u.utm_source, u.utm_medium, u.utm_campaign].map((x) => x || "-").join(" / ")}  ${u.visits}`)]
      : []),
    ...list(s.countries, "Countries", "country"),
    ...list(s.devices, "Devices", "device"),
  ];
  return lines.join("\n");
}

async function weeklySummary({ days = 7, client = createSupabaseClient() } = {}) {
  return client.rpc("cigco_site_visits_summary", { p_days: days });
}

async function main(argv = process.argv.slice(2)) {
  const days = Number(argv.find((a) => /^\d+$/.test(a)) || 7);
  const summary = await weeklySummary({ days });
  console.log(argv.includes("--json") ? JSON.stringify(summary, null, 2) : formatSummary(summary));
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Weekly visits report failed:", error.message);
    process.exit(1);
  });
}

module.exports = { formatSummary, weeklySummary };
