const { createKitClient, kitTagIds } = require("./kit.js");
const { createResendClient } = require("./resend.js");

function integrationErrorCode(error) {
  return error && typeof error.code === "string"
    ? error.code.slice(0, 80)
    : "integration_error";
}

async function runReservedIntegration({
  store,
  kind,
  operationKey,
  contactId = null,
  orderId = null,
  action,
  logger = console,
}) {
  const leaseId = await store.reserveIntegration({
    kind,
    operationKey,
    contactId,
    orderId,
  });
  if (!leaseId) return { skipped: true };

  try {
    const result = await action();
    await store.completeIntegration({
      kind,
      operationKey,
      leaseId,
      succeeded: true,
    });
    return { succeeded: true, result };
  } catch (error) {
    const errorCode = integrationErrorCode(error);
    await store.completeIntegration({
      kind,
      operationKey,
      leaseId,
      succeeded: false,
      errorCode,
    });
    logger.error("Third-party synchronization failed.", {
      kind,
      operationKey,
      errorCode,
    });
    return { succeeded: false };
  }
}

async function syncContactToKit({
  store,
  contact,
  kitClient = null,
  environment = process.env,
  logger = console,
}) {
  const consent = contact.marketing_consent ?? contact.marketingConsent;
  if (!consent) return { skipped: true, reason: "no_consent" };

  const contactId = contact.id || contact.contactId;
  const email = contact.email_normalized || contact.email;
  const operationKey = `contact/${contactId}/orders/${contact.order_count ?? contact.orderCount ?? 0}`;

  const result = await runReservedIntegration({
    store,
    kind: "kit",
    operationKey,
    contactId,
    logger,
    action: async () => {
      const client = kitClient || createKitClient();
      const { subscriber, suppressed } = await client.upsertSubscriber({
        email,
        firstName: contact.first_name || contact.firstName || null,
      });
      if (suppressed) {
        await store.recordKitResult(contactId, "suppressed", subscriber.id);
        return { suppressed: true };
      }
      await client.addTags(subscriber.id, kitTagIds(contact, environment));
      await store.recordKitResult(contactId, "synced", subscriber.id);
      return { subscriberId: subscriber.id };
    },
  });
  if (result.succeeded === false) {
    await store.recordKitResult(contactId, "failed");
  }
  return result;
}

async function sendPrizeTransaction({
  store,
  claim,
  resendClient = null,
  logger = console,
}) {
  if (!claim.claimed || claim.replayedRequest || claim.prize.type === "none") {
    return { skipped: true };
  }
  return runReservedIntegration({
    store,
    kind: "resend_prize",
    operationKey: `play/${claim.playId}`,
    contactId: claim.contactId,
    logger,
    action: () => (resendClient || createResendClient()).sendPrize({
      email: claim.email,
      prize: claim.prize,
      playId: claim.playId,
    }),
  });
}

async function sendOrderTransaction({
  store,
  contact,
  order,
  resendClient = null,
  logger = console,
}) {
  const result = await runReservedIntegration({
    store,
    kind: "resend_order",
    operationKey: `order/${order.stripe_session_id}`,
    contactId: contact.id,
    orderId: order.id,
    logger,
    action: () => (resendClient || createResendClient())
      .sendOrderReceived({ contact, order }),
  });
  if (!result.skipped) {
    await store.recordOrderEmail(order.id, "order", !!result.succeeded);
  }
  return result;
}

module.exports = {
  integrationErrorCode,
  runReservedIntegration,
  sendOrderTransaction,
  sendPrizeTransaction,
  syncContactToKit,
};
