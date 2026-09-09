const { createCustomerStore } = require("../lib/customer-store.js");
const {
  RequestValidationError,
  jsonResponse,
  optionalTrimmedString,
  parseJsonBody,
  timingSafeTokenMatch,
} = require("../lib/customer-utils.js");
const { createResendClient } = require("../lib/resend.js");
const { runReservedIntegration } = require("../lib/integrations.js");

function bearerToken(event) {
  const authorization = event.headers.authorization || event.headers.Authorization || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function createHandler({
  storeFactory = createCustomerStore,
  resendFactory = createResendClient,
  environment = process.env,
  logger = console,
} = {}) {
  return async (event) => {
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { error: "Method not allowed." }, { Allow: "POST" });
    }
    if (!timingSafeTokenMatch(bearerToken(event), environment.ADMIN_EXPORT_TOKEN)) {
      return jsonResponse(401, { error: "Unauthorized." }, {
        "WWW-Authenticate": "Bearer",
      });
    }

    try {
      const body = parseJsonBody(event);
      const orderNumber = optionalTrimmedString(body.orderNumber, 40);
      const carrier = optionalTrimmedString(body.carrier, 80);
      const trackingNumber = optionalTrimmedString(body.trackingNumber, 120);
      const trackingUrl = optionalTrimmedString(body.trackingUrl, 500);
      const shipmentDate = optionalTrimmedString(body.shipmentDate, 10);
      if (!orderNumber || !carrier || !trackingNumber || !trackingUrl || !shipmentDate) {
        throw new RequestValidationError("Shipment details are incomplete.");
      }
      let parsedUrl;
      try {
        parsedUrl = new URL(trackingUrl);
      } catch {
        throw new RequestValidationError("Shipment details are invalid.");
      }
      const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(shipmentDate)
        ? new Date(`${shipmentDate}T00:00:00.000Z`)
        : null;
      if (
        parsedUrl.protocol !== "https:"
        || !parsedDate
        || Number.isNaN(parsedDate.getTime())
        || parsedDate.toISOString().slice(0, 10) !== shipmentDate
      ) {
        throw new RequestValidationError("Shipment details are invalid.");
      }

      const store = storeFactory();
      const record = await store.getOrderForShipment(orderNumber);
      if (!record || !record.order || !record.contact) {
        return jsonResponse(404, { error: "Order was not found." });
      }
      await store.recordShipment(record.order.id, {
        carrier,
        trackingNumber,
        trackingUrl,
        shipmentDate,
      });
      const order = {
        ...record.order,
        shipment_carrier: carrier,
        shipment_tracking_number: trackingNumber,
        shipment_tracking_url: trackingUrl,
        shipment_date: shipmentDate,
      };
      const result = await runReservedIntegration({
        store,
        kind: "resend_shipment",
        operationKey: `shipment/${order.id}/${trackingNumber}`,
        contactId: record.contact.id,
        orderId: order.id,
        logger,
        action: () => resendFactory().sendShipment({
          contact: record.contact,
          order,
        }),
      });
      if (!result.skipped) {
        await store.recordOrderEmail(order.id, "shipment", !!result.succeeded);
      }
      if (result.skipped) {
        return jsonResponse(200, { sent: true, duplicate: true });
      }
      if (!result.succeeded) {
        return jsonResponse(502, {
          error: "Shipment was saved, but its email is pending retry.",
        });
      }
      return jsonResponse(200, { sent: true });
    } catch (error) {
      if (error instanceof RequestValidationError) {
        return jsonResponse(400, { error: error.message });
      }
      logger.error("Shipment email failed.", { error: error && error.name });
      return jsonResponse(500, { error: "Shipment email could not be processed." });
    }
  };
}

const handler = createHandler();

module.exports = { createHandler, handler };
