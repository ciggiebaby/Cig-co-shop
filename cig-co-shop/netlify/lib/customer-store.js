const { createSupabaseClient } = require("./supabase.js");

function createCustomerStore(client = createSupabaseClient()) {
  return {
    checkArcadeRateLimit(rateKey, limit = 12, windowSeconds = 60) {
      return client.rpc("cigco_check_arcade_rate_limit", {
        p_rate_key: rateKey,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });
    },

    registerArcade({
      email,
      emailOriginal,
      marketingConsent,
      consentSource,
    }) {
      return client.rpc("cigco_arcade_register", {
        p_email: email,
        p_email_original: emailOriginal,
        p_marketing_consent: marketingConsent,
        p_consent_source: consentSource,
      });
    },

    claimArcade({ email, game, requestId }) {
      return client.rpc("cigco_arcade_claim", {
        p_email: email,
        p_game: game,
        p_request_id: requestId,
      });
    },

    checkArcadeCode(code, email = null) {
      return client.rpc("cigco_check_arcade_code", {
        p_code: code,
        p_email: email,
      });
    },

    getArcadePlayDelivery(playId) {
      return client.rpc("cigco_get_arcade_play_delivery", {
        p_play_id: playId,
      });
    },

    processStripeOrder(order) {
      return client.rpc("cigco_process_stripe_order", {
        p_event_id: order.eventId,
        p_event_type: order.eventType,
        p_session_id: order.sessionId,
        p_payment_intent_id: order.paymentIntentId,
        p_email: order.email,
        p_email_original: order.emailOriginal,
        p_first_name: order.firstName,
        p_last_name: order.lastName,
        p_amount_total_cents: order.amountTotalCents,
        p_currency: order.currency,
        p_items: order.items,
        p_shipping_destination: order.shippingDestination,
        p_marketing_consent: order.marketingConsent,
        p_cart_fingerprint: order.cartFingerprint,
        p_promo_code: order.promoCode,
        p_paid_at: order.paidAt,
      });
    },

    reserveIntegration({
      kind,
      operationKey,
      contactId = null,
      orderId = null,
      maxAttempts = 5,
    }) {
      return client.rpc("cigco_reserve_integration", {
        p_kind: kind,
        p_operation_key: operationKey,
        p_contact_id: contactId,
        p_order_id: orderId,
        p_max_attempts: maxAttempts,
      });
    },

    completeIntegration({
      kind,
      operationKey,
      leaseId,
      succeeded,
      errorCode = null,
    }) {
      return client.rpc("cigco_complete_integration", {
        p_kind: kind,
        p_operation_key: operationKey,
        p_lease_id: leaseId,
        p_succeeded: succeeded,
        p_error_code: errorCode,
      });
    },

    recordKitResult(contactId, status, subscriberId = null) {
      return client.rpc("cigco_record_kit_result", {
        p_contact_id: contactId,
        p_status: status,
        p_subscriber_id: subscriberId,
      });
    },

    recordOrderEmail(orderId, emailKind, succeeded) {
      return client.rpc("cigco_record_order_email", {
        p_order_id: orderId,
        p_email_kind: emailKind,
        p_succeeded: succeeded,
      });
    },

    getOrderForShipment(orderNumber) {
      return client.rpc("cigco_get_order_for_shipment", {
        p_order_number: orderNumber,
      });
    },

    recordShipment(orderId, shipment) {
      return client.rpc("cigco_record_shipment", {
        p_order_id: orderId,
        p_carrier: shipment.carrier,
        p_tracking_number: shipment.trackingNumber,
        p_tracking_url: shipment.trackingUrl,
        p_shipment_date: shipment.shipmentDate,
      });
    },

    recordPrizeRedemption(playId, status, notes = null) {
      return client.rpc("cigco_record_prize_redemption", {
        p_play_id: playId,
        p_status: status,
        p_notes: notes,
      });
    },

    // Email list (supabase/migrations/202610310001_email_list_subscribers.sql)
    subscribe({
      email,
      emailOriginal = null,
      source,
      productId = null,
      variant = null,
      marketingConsent = false,
      consentText = null,
    }) {
      return client.rpc("cigco_subscribe", {
        p_email: email,
        p_email_original: emailOriginal,
        p_source: source,
        p_product_id: productId,
        p_variant: variant,
        p_marketing_consent: marketingConsent,
        p_consent_text: consentText,
      });
    },

    unsubscribe(email) {
      return client.rpc("cigco_unsubscribe", { p_email: email });
    },

    exportSubscribers(source = null) {
      return client.rpc("cigco_export_subscribers", { p_source: source });
    },

    subscriberCounts() {
      return client.rpc("cigco_subscriber_counts", {});
    },

    // Printful thank-you email
    // (supabase/migrations/202610310002_printful_thankyou_emails.sql)
    thankyouRecordEvent({ printfulOrderId, externalId = null, event, occurredAt = null, delayDays = 5 }) {
      return client.rpc("cigco_thankyou_record_event", {
        p_printful_order_id: printfulOrderId,
        p_external_id: externalId,
        p_event: event,
        p_occurred_at: occurredAt,
        p_delay_days: delayDays,
      });
    },

    thankyouClaim(printfulOrderId) {
      return client.rpc("cigco_thankyou_claim", { p_printful_order_id: printfulOrderId });
    },

    thankyouComplete(printfulOrderId, status, reason = null) {
      return client.rpc("cigco_thankyou_complete", {
        p_printful_order_id: printfulOrderId,
        p_status: status,
        p_reason: reason,
      });
    },

    thankyouDue(limit = 25) {
      return client.rpc("cigco_thankyou_due", { p_limit: limit });
    },

    exportContacts(filter) {
      return client.rpc("cigco_export_contacts", { p_filter: filter });
    },
  };
}

module.exports = { createCustomerStore };
