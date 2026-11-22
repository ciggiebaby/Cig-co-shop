const { createCustomerStore } = require("../lib/customer-store.js");
const {
  csvCell,
  timingSafeTokenMatch,
} = require("../lib/customer-utils.js");
const { isValidSource } = require("../lib/subscribers.js");

// Email list exports (subscribers table), separate from the contact filters:
//   ?filter=subscribers                 every sign-up, all sources
//   ?filter=subscribers&source=qr       one source (arcade, qr, shop, fani,
//                                       any card slug, checkout, notify_me,
//                                       early_access)
//   ?filter=subscriber_counts           per-source totals for BG's recaps
const SUBSCRIBER_FILTERS = new Set(["subscribers", "subscriber_counts"]);

const SUBSCRIBER_HEADERS = [
  "Email", "Source", "Product", "Variant", "Marketing consent", "Consent date",
  "First signed up", "Last signed up", "Sign-up count", "Unsubscribed",
  "Restock emailed", "Customer",
];
const SUBSCRIBER_COLUMNS = [
  "email", "source", "product_id", "variant", "marketing_consent", "consent_at",
  "first_seen_at", "last_seen_at", "signup_count", "unsubscribed_at",
  "notified_at", "is_customer",
];
const COUNT_HEADERS = [
  "Source", "Sign-ups", "Unique emails", "Marketing consent (active)",
  "Unsubscribed", "Last 7 days", "Became customers",
];
const COUNT_COLUMNS = [
  "source", "signups", "unique_emails", "marketing_consent", "unsubscribed",
  "last_7_days", "became_customers",
];

function tableToCsv(headers, columns, rows) {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

const FILTERS = new Set([
  "all",
  "arcade_leads",
  "customers",
  "arcade_never_purchased",
  "first_time_customers",
  "repeat_customers",
  "marketing_subscribers",
  "non_subscribed_customers",
  "prize_winners",
  "failed_kit_sync",
  "failed_transactional_email",
]);

const HEADERS = [
  "Email",
  "Name",
  "Arcade status",
  "Marketing consent",
  "Customer status",
  "Order count",
  "Lifetime value",
  "Last order date",
  "Last Arcade play",
  "Last prize",
  "Kit synchronization status",
  "Failed transactional email",
  "Created date",
];

function bearerToken(event) {
  const authorization = event.headers.authorization || event.headers.Authorization || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function rowsToCsv(rows) {
  const lines = [HEADERS.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push([
      row.email,
      row.name,
      row.arcade_status,
      row.marketing_consent,
      row.customer_status,
      row.order_count,
      (Number(row.lifetime_value_cents || 0) / 100).toFixed(2),
      row.last_order_at,
      row.last_arcade_play_at,
      row.last_prize,
      row.kit_sync_status,
      row.failed_transactional_email,
      row.created_at,
    ].map(csvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

function createHandler({
  storeFactory = createCustomerStore,
  environment = process.env,
  logger = console,
} = {}) {
  return async (event) => {
    if (event.httpMethod !== "GET") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }
    if (!timingSafeTokenMatch(bearerToken(event), environment.ADMIN_EXPORT_TOKEN)) {
      return {
        statusCode: 401,
        headers: {
          "Cache-Control": "no-store",
          "WWW-Authenticate": "Bearer",
        },
        body: "Unauthorized",
      };
    }

    const filter = event.queryStringParameters && event.queryStringParameters.filter || "all";
    if (SUBSCRIBER_FILTERS.has(filter)) {
      const source = event.queryStringParameters.source || null;
      if (source && !isValidSource(source)) {
        return {
          statusCode: 400,
          headers: { "Cache-Control": "no-store" },
          body: "Unknown subscriber source.",
        };
      }
      try {
        const store = storeFactory();
        const counts = filter === "subscriber_counts";
        const rows = counts ? await store.subscriberCounts() : await store.exportSubscribers(source);
        const name = counts ? "cigco-subscriber-counts" : `cigco-subscribers-${source || "all"}`;
        return {
          statusCode: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${name}.csv"`,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
          body: counts
            ? tableToCsv(COUNT_HEADERS, COUNT_COLUMNS, rows || [])
            : tableToCsv(SUBSCRIBER_HEADERS, SUBSCRIBER_COLUMNS, rows || []),
        };
      } catch (error) {
        logger.error("Subscriber export failed.", { error: error && error.name });
        return {
          statusCode: 500,
          headers: { "Cache-Control": "no-store" },
          body: "Export could not be created.",
        };
      }
    }
    if (!FILTERS.has(filter)) {
      return {
        statusCode: 400,
        headers: { "Cache-Control": "no-store" },
        body: "Unknown export filter.",
      };
    }

    try {
      const rows = await storeFactory().exportContacts(filter);
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="cigco-customers-${filter}.csv"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
        body: rowsToCsv(rows || []),
      };
    } catch (error) {
      logger.error("Customer export failed.", { error: error && error.name });
      return {
        statusCode: 500,
        headers: { "Cache-Control": "no-store" },
        body: "Export could not be created.",
      };
    }
  };
}

const handler = createHandler();

module.exports = {
  FILTERS,
  SUBSCRIBER_FILTERS,
  tableToCsv,
  createHandler,
  handler,
  rowsToCsv,
};
