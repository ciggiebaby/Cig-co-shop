// Hourly sweep for the Printful thank-you email (schedule in netlify.toml).
// Sends what's due: shipped + the fallback delay when Printful never reported
// "delivered" (THANKYOU_DELAY_DAYS in the US, THANKYOU_INTL_DELAY_DAYS
// elsewhere), plus retries of failed sends. The delay was chosen when the
// shipment was recorded. Rows already sent are not due. Off unless
// THANKYOU_EMAIL_ENABLED=true.
const { createCustomerStore } = require("../lib/customer-store.js");
const { createResendClient } = require("../lib/resend.js");
const { processThankYou, thankyouEnabled } = require("../lib/thankyou.js");

const BATCH = 25;

function createHandler({
  storeFactory = createCustomerStore,
  resendFactory = createResendClient,
  environment = process.env,
  logger = console,
} = {}) {
  return async () => {
    if (!thankyouEnabled(environment)) {
      return { statusCode: 200, body: JSON.stringify({ processed: 0, reason: "thankyou_disabled" }) };
    }
    const tally = { processed: 0 };
    try {
      const store = storeFactory();
      const due = await store.thankyouDue(BATCH);
      for (const printfulOrderId of Array.isArray(due) ? due : []) {
        try {
          const result = await processThankYou({ store, printfulOrderId: String(printfulOrderId), resend: resendFactory, logger });
          tally.processed += 1;
          tally[result.status] = (tally[result.status] || 0) + 1;
        } catch (error) {
          logger.error("Thank-you sweep item failed.", { error: error && (error.code || error.name) });
        }
      }
    } catch (error) {
      logger.error("Thank-you sweep failed.", { error: error && (error.code || error.name) });
      return { statusCode: 500, body: JSON.stringify({ error: "sweep_failed" }) };
    }
    return { statusCode: 200, body: JSON.stringify(tally) };
  };
}

const handler = createHandler();

module.exports = { BATCH, createHandler, handler };
