const { createCustomerStore } = require("../lib/customer-store.js");
const {
  csvCell,
  timingSafeTokenMatch,
} = require("../lib/customer-utils.js");

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
  createHandler,
  handler,
  rowsToCsv,
};
