const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  normalizeEmail,
  RequestValidationError,
} = require("../netlify/lib/customer-utils.js");
const { createSupabaseClient } = require("../netlify/lib/supabase.js");
const { kitTagIds, createKitClient } = require("../netlify/lib/kit.js");
const { PRIZES } = require("../promo.js");
const {
  createHandler: createArcadeRegisterHandler,
} = require("../netlify/functions/arcade-register.js");
const {
  createHandler: createArcadeClaimHandler,
} = require("../netlify/functions/arcade-claim.js");
const {
  createHandler: createStripeWebhookHandler,
} = require("../netlify/functions/stripe-webhook.js");
const {
  createHandler: createExportHandler,
} = require("../netlify/functions/customer-export.js");
const {
  createHandler: createShipmentHandler,
} = require("../netlify/functions/send-shipment-email.js");
const {
  createHandler: createRedemptionHandler,
} = require("../netlify/functions/record-prize-redemption.js");
const {
  runReservedIntegration,
} = require("../netlify/lib/integrations.js");
const {
  COOLDOWN_MS,
  formatCountdown,
  msRemaining,
  registrationPlayRecord,
  renderPrizeBanner,
  wheelLabelLayout,
} = require("../arcade.js");

function event(body, {
  method = "POST",
  headers = {},
  queryStringParameters = null,
} = {}) {
  return {
    httpMethod: method,
    headers: {
      "x-nf-client-connection-ip": "203.0.113.42",
      ...headers,
    },
    queryStringParameters,
    body: body == null
      ? ""
      : typeof body === "string"
        ? body
        : JSON.stringify(body),
  };
}

function registrationStore(overrides = {}) {
  const calls = [];
  return {
    calls,
    checkArcadeRateLimit: async () => true,
    registerArcade: async (input) => {
      calls.push(input);
      return {
        contactId: "contact-1",
        marketingConsent: input.marketingConsent === true,
        sourceCheckout: false,
        orderCount: 0,
        eligible: true,
        serverNow: "2026-07-25T12:00:00.000Z",
        lastPlay: null,
      };
    },
    ...overrides,
  };
}

test("normalizes email and rejects malformed addresses", () => {
  assert.equal(normalizeEmail("  Customer@Example.COM "), "customer@example.com");
  assert.throws(() => normalizeEmail("not-an-email"), RequestValidationError);
});

test("Supabase sends modern secret keys only as API keys", async () => {
  let request;
  const client = createSupabaseClient({
    url: "https://project.supabase.co",
    secretKey: "sb_secret_example",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, text: async () => "true" };
    },
  });

  await client.rpc("cigco_example", {});

  assert.equal(request.options.headers.apikey, "sb_secret_example");
  assert.equal("Authorization" in request.options.headers, false);
});

test("Supabase supports legacy service-role JWT headers", async () => {
  let headers;
  const client = createSupabaseClient({
    url: "https://project.supabase.co",
    secretKey: "legacy.jwt.value",
    fetchImpl: async (url, options) => {
      headers = options.headers;
      return { ok: true, text: async () => "true" };
    },
  });

  await client.rpc("cigco_example", {});

  assert.equal(headers.apikey, "legacy.jwt.value");
  assert.equal(headers.Authorization, "Bearer legacy.jwt.value");
});

test("new and returning Arcade email use one normalized identity request", async () => {
  const store = registrationStore();
  const handler = createArcadeRegisterHandler({
    storeFactory: () => store,
    syncKit: async () => {
      throw new Error("Kit must not run without consent");
    },
    environment: { SUPABASE_SECRET_KEY: "server-only-secret" },
    logger: { error() {} },
  });

  for (const email of [" Customer@Example.COM ", "customer@example.com"]) {
    const response = await handler(event({
      email,
      marketingConsent: false,
      consentProvided: true,
    }));
    assert.equal(response.statusCode, 200);
  }

  assert.deepEqual(
    store.calls.map((call) => call.email),
    ["customer@example.com", "customer@example.com"],
  );
});

test("Arcade consent true syncs Kit and consent false does not", async () => {
  let syncCount = 0;
  for (const consent of [true, false]) {
    const store = registrationStore();
    const handler = createArcadeRegisterHandler({
      storeFactory: () => store,
      syncKit: async () => {
        syncCount += 1;
      },
      environment: { SUPABASE_SECRET_KEY: "server-only-secret" },
      logger: { error() {} },
    });
    const response = await handler(event({
      email: "arcade@example.com",
      marketingConsent: consent,
      consentProvided: true,
    }));
    assert.equal(response.statusCode, 200);
    assert.equal(store.calls[0].marketingConsent, consent);
  }
  assert.equal(syncCount, 1);
});

test("Kit failure does not block Arcade registration", async () => {
  const store = registrationStore();
  const response = await createArcadeRegisterHandler({
    storeFactory: () => store,
    syncKit: async () => {
      throw new Error("Kit unavailable");
    },
    environment: { SUPABASE_SECRET_KEY: "server-only-secret" },
    logger: { error() {} },
  })(event({
    email: "arcade@example.com",
    marketingConsent: true,
    consentProvided: true,
  }));

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).eligible, true);
});

test("Arcade registration rate limit fails closed before identity mutation", async () => {
  let registrations = 0;
  const response = await createArcadeRegisterHandler({
    storeFactory: () => ({
      checkArcadeRateLimit: async () => false,
      registerArcade: async () => {
        registrations += 1;
      },
    }),
    environment: { SUPABASE_SECRET_KEY: "server-only-secret" },
    logger: { error() {} },
  })(event({
    email: "arcade@example.com",
    marketingConsent: false,
    consentProvided: true,
  }));

  assert.equal(response.statusCode, 429);
  assert.equal(registrations, 0);
});

test("legacy Arcade cache is ignored and cannot influence eligibility", async () => {
  const store = registrationStore();
  const response = await createArcadeRegisterHandler({
    storeFactory: () => store,
    syncKit: async () => {},
    environment: { SUPABASE_SECRET_KEY: "server-only-secret" },
    logger: { error() {} },
  })(event({
    email: "legacy@example.com",
    consentProvided: false,
    legacyPlay: {
      playedAt: "2026-07-24T12:00:00.000Z",
      prizeId: "p10",
      game: "wheel",
      code: "ATTACKER_VALUE_IGNORED",
    },
  }));

  assert.equal(response.statusCode, 200);
  assert.equal("legacyPlay" in store.calls[0], false);
});

test("Arcade claim preserves first-play result and Resend failure is non-fatal", async () => {
  let emailAttempts = 0;
  const store = {
    checkArcadeRateLimit: async () => true,
    claimArcade: async () => ({
      claimed: true,
      replayedRequest: false,
      contactId: "contact-1",
      playId: "play-1",
      email: "winner@example.com",
      firstPlay: true,
      playedAt: "2026-07-25T12:00:00.000Z",
      nextEligibleAt: "2026-07-27T12:00:00.000Z",
      prize: {
        id: "p10",
        type: "discount",
        code: "CIG10",
        label: "10% Off",
        detail: "Use code CIG10 at checkout.",
      },
    }),
  };
  const response = await createArcadeClaimHandler({
    storeFactory: () => store,
    sendPrize: async () => {
      emailAttempts += 1;
      throw new Error("Resend unavailable");
    },
    environment: { SUPABASE_SECRET_KEY: "server-only-secret" },
    logger: { error() {} },
  })(event({
    email: "winner@example.com",
    game: "wheel",
    requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }));

  assert.equal(response.statusCode, 200);
  assert.equal(emailAttempts, 1);
  assert.equal(JSON.parse(response.body).firstPlay, true);
});

test("integration retries require and complete the exact database lease", async () => {
  const completions = [];
  const store = {
    reserveIntegration: async () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    completeIntegration: async (result) => {
      completions.push(result);
    },
  };
  const result = await runReservedIntegration({
    store,
    kind: "resend_order",
    operationKey: "order/cs_123",
    action: async () => "sent",
    logger: { error() {} },
  });

  assert.equal(result.succeeded, true);
  assert.equal(completions[0].leaseId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(completions[0].succeeded, true);
});

test("weekly Arcade cooldown and prize-history presentation remain intact", () => {
  const nextEligibleAt = new Date(Date.now() + 60_000).toISOString();
  assert.ok(msRemaining({ nextEligibleAt }) > 0);
  assert.equal(COOLDOWN_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(formatCountdown(COOLDOWN_MS), "7D 00:00:00");
  assert.equal(formatCountdown(60 * 60 * 1000), "01:00:00");

  const record = registrationPlayRecord({
    lastPlay: {
      playedAt: "2026-07-25T12:00:00.000Z",
      nextEligibleAt,
      prize: {
        id: "p20",
        type: "discount",
        code: "CIG20",
        label: "20% Off",
        detail: "Use code CIG20 at checkout.",
      },
    },
  });
  assert.equal(record.prizeId, "p20");
  assert.match(renderPrizeBanner(record.prize), /CIG20/);
});

test("wheel labels share one centered ring and remain readable", () => {
  const layouts = PRIZES.map((_, index) =>
    wheelLabelLayout(index, PRIZES.length));

  layouts.forEach((layout) => {
    // Percent of the wheel's box, not pixels — see wheelLabelLayout.
    assert.ok(Math.abs(Math.hypot(layout.x, layout.y) - 31.25) < 0.001);
    const readableRotation = ((layout.rotation % 360) + 360) % 360;
    assert.ok(readableRotation <= 90 || readableRotation >= 270);
  });
});

function paidSession(overrides = {}) {
  return {
    id: "cs_paid_123",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    payment_intent: "pi_123",
    amount_total: 4500,
    currency: "usd",
    customer_details: {
      email: " Customer@Example.COM ",
      name: "Ada Lovelace",
    },
    metadata: {
      marketing_consent: "false",
      cart_fingerprint: `v1:${"a".repeat(64)}`,
      promo_code: "CIG10",
    },
    line_items: {
      data: [{
        description: "CIG Paisley Bikini (Set) — Red — L",
        quantity: 1,
        amount_total: 4500,
        currency: "usd",
      }],
    },
    collected_information: {
      shipping_details: {
        name: "Ada Lovelace",
        address: {
          city: "New York",
          state: "NY",
          postal_code: "10001",
          country: "US",
        },
      },
    },
    ...overrides,
  };
}

function stripeStub(session, stripeEventOverrides = {}) {
  return () => ({
    webhooks: {
      constructEvent: () => ({
        id: "evt_123",
        type: "checkout.session.completed",
        created: 1784980800,
        data: { object: { id: session.id } },
        ...stripeEventOverrides,
      }),
    },
    checkout: {
      sessions: {
        retrieve: async () => session,
      },
    },
  });
}

test("paid webhook stores normalized customer and emails without marketing consent", async () => {
  let processedOrder;
  let orderEmails = 0;
  let kitSyncs = 0;
  const store = {
    processStripeOrder: async (order) => {
      processedOrder = order;
      return {
        created: true,
        contact: {
          id: "contact-1",
          email_normalized: order.email,
          first_name: order.firstName,
          marketing_consent: false,
          source_checkout: true,
          order_count: 1,
        },
        order: {
          id: "order-1",
          order_number: "CIG-ORDER1",
          stripe_session_id: order.sessionId,
          amount_total_cents: order.amountTotalCents,
          currency: order.currency,
          items: order.items,
          shipping_destination: order.shippingDestination,
        },
      };
    },
  };
  const response = await createStripeWebhookHandler({
    stripeFactory: stripeStub(paidSession()),
    storeFactory: () => store,
    sendOrder: async () => {
      orderEmails += 1;
    },
    syncKit: async () => {
      kitSyncs += 1;
    },
    environment: {
      STRIPE_SECRET_KEY: "sk_test_secret",
      STRIPE_WEBHOOK_SECRET: "whsec_secret",
    },
    logger: { error() {} },
  })(event("raw-body", {
    headers: { "stripe-signature": "valid" },
  }));

  assert.equal(response.statusCode, 200);
  assert.equal(processedOrder.email, "customer@example.com");
  assert.equal(processedOrder.firstName, "Ada");
  assert.equal(processedOrder.lastName, "Lovelace");
  assert.equal(orderEmails, 1);
  assert.equal(kitSyncs, 0);
});

test("Arcade lead becomes first/repeat customer with appropriate Kit tags", () => {
  const environment = {
    KIT_MARKETING_OPT_IN_TAG_ID: "1",
    KIT_ARCADE_TAG_ID: "2",
    KIT_CHECKOUT_TAG_ID: "3",
    KIT_CUSTOMER_TAG_ID: "4",
    KIT_FIRST_ORDER_TAG_ID: "5",
    KIT_REPEAT_CUSTOMER_TAG_ID: "6",
  };
  assert.deepEqual(
    kitTagIds({
      source_arcade: true,
      source_checkout: true,
      order_count: 1,
    }, environment),
    ["1", "2", "3", "4", "5"],
  );
  assert.deepEqual(
    kitTagIds({
      source_arcade: true,
      source_checkout: true,
      order_count: 2,
    }, environment),
    ["1", "2", "3", "4", "6"],
  );
});

test("webhook replay can retry integrations without creating another order", async () => {
  let orderCalls = 0;
  const store = {
    processStripeOrder: async () => {
      orderCalls += 1;
      return {
        created: orderCalls === 1,
        eventReplay: orderCalls > 1,
        contact: {
          id: "contact-1",
          email_normalized: "customer@example.com",
          marketing_consent: false,
        },
        order: {
          id: "order-1",
          order_number: "CIG-ORDER1",
          stripe_session_id: "cs_paid_123",
          amount_total_cents: 4500,
          currency: "usd",
          items: [],
        },
      };
    },
  };
  let emailAttempts = 0;
  const handler = createStripeWebhookHandler({
    stripeFactory: stripeStub(paidSession()),
    storeFactory: () => store,
    sendOrder: async () => {
      emailAttempts += 1;
    },
    syncKit: async () => {},
    environment: {
      STRIPE_SECRET_KEY: "sk_test_secret",
      STRIPE_WEBHOOK_SECRET: "whsec_secret",
    },
    logger: { error() {} },
  });

  await handler(event("raw", { headers: { "stripe-signature": "valid" } }));
  const replay = await handler(event("raw", { headers: { "stripe-signature": "valid" } }));
  assert.equal(replay.statusCode, 200);
  assert.equal(JSON.parse(replay.body).created, false);
  assert.equal(orderCalls, 2);
  assert.equal(emailAttempts, 2);
});

test("Resend and Kit failures never invalidate a paid order", async () => {
  const store = {
    processStripeOrder: async () => ({
      created: true,
      contact: {
        id: "contact-1",
        email_normalized: "customer@example.com",
        marketing_consent: true,
        source_checkout: true,
        order_count: 1,
      },
      order: {
        id: "order-1",
        order_number: "CIG-ORDER1",
        stripe_session_id: "cs_paid_123",
        amount_total_cents: 4500,
        currency: "usd",
        items: [],
      },
    }),
  };
  const response = await createStripeWebhookHandler({
    stripeFactory: stripeStub(paidSession({
      metadata: { marketing_consent: "true" },
    })),
    storeFactory: () => store,
    sendOrder: async () => {
      throw new Error("Resend unavailable");
    },
    syncKit: async () => {
      throw new Error("Kit unavailable");
    },
    environment: {
      STRIPE_SECRET_KEY: "sk_test_secret",
      STRIPE_WEBHOOK_SECRET: "whsec_secret",
    },
    logger: { error() {} },
  })(event("raw", { headers: { "stripe-signature": "valid" } }));

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).processed, true);
});

test("invalid Stripe signature is rejected without leaking secrets", async () => {
  const response = await createStripeWebhookHandler({
    stripeFactory: () => ({
      webhooks: {
        constructEvent: () => {
          const error = new Error("whsec_do_not_expose");
          error.name = "StripeSignatureVerificationError";
          throw error;
        },
      },
    }),
    environment: {
      STRIPE_SECRET_KEY: "sk_test_secret",
      STRIPE_WEBHOOK_SECRET: "whsec_do_not_expose",
    },
    logger: { error() {} },
  })(event("raw", { headers: { "stripe-signature": "bad" } }));

  assert.equal(response.statusCode, 400);
  assert.doesNotMatch(response.body, /do_not_expose/);
});

test("incomplete or unpaid Stripe sessions never reach order storage", async () => {
  for (const session of [
    paidSession({ status: "open" }),
    paidSession({ payment_status: "unpaid" }),
  ]) {
    let storageCalls = 0;
    const response = await createStripeWebhookHandler({
      stripeFactory: stripeStub(session),
      storeFactory: () => ({
        processStripeOrder: async () => {
          storageCalls += 1;
        },
      }),
      environment: {
        STRIPE_SECRET_KEY: "sk_test_secret",
        STRIPE_WEBHOOK_SECRET: "whsec_secret",
      },
      logger: { error() {} },
    })(event("raw", { headers: { "stripe-signature": "valid" } }));

    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).processed, false);
    assert.equal(storageCalls, 0);
  }
});

test("Kit does not reactivate an unsubscribed subscriber", async () => {
  let requests = 0;
  const client = createKitClient({
    apiKey: "kit-secret",
    fetchImpl: async () => {
      requests += 1;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          subscribers: [{
            id: 99,
            email_address: "customer@example.com",
            state: "cancelled",
          }],
        }),
      };
    },
  });
  const result = await client.upsertSubscriber({
    email: "customer@example.com",
    firstName: "Customer",
  });
  assert.equal(result.suppressed, true);
  assert.equal(requests, 1);
});

test("customer CSV export requires the exact admin bearer token", async () => {
  let exports = 0;
  const handler = createExportHandler({
    storeFactory: () => ({
      exportContacts: async () => {
        exports += 1;
        return [{
          email: "customer@example.com",
          name: "Customer",
          arcade_status: "arcade",
          marketing_consent: false,
          customer_status: "first_time_customer",
          order_count: 1,
          lifetime_value_cents: 4500,
          last_order_at: "2026-07-25T12:00:00Z",
          last_arcade_play_at: null,
          last_prize: null,
          kit_sync_status: "not_applicable",
          failed_transactional_email: false,
          created_at: "2026-07-25T12:00:00Z",
        }];
      },
    }),
    environment: { ADMIN_EXPORT_TOKEN: "correct-secret-token" },
    logger: { error() {} },
  });

  const unauthorized = await handler(event(null, {
    method: "GET",
    headers: { authorization: "Bearer wrong-token" },
    queryStringParameters: { filter: "all" },
  }));
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(exports, 0);

  const authorized = await handler(event(null, {
    method: "GET",
    headers: { authorization: "Bearer correct-secret-token" },
    queryStringParameters: { filter: "all" },
  }));
  assert.equal(authorized.statusCode, 200);
  assert.match(authorized.body, /customer@example\.com/);
  assert.equal(exports, 1);
});

test("protected shipment endpoint stores and emails validated tracking details", async () => {
  let storedShipment;
  let emailedShipment;
  const store = {
    getOrderForShipment: async () => ({
      contact: {
        id: "contact-1",
        email_normalized: "customer@example.com",
      },
      order: {
        id: "order-1",
        order_number: "CIG-ORDER1",
      },
    }),
    recordShipment: async (_orderId, shipment) => {
      storedShipment = shipment;
    },
    reserveIntegration: async () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    completeIntegration: async () => {},
    recordOrderEmail: async () => {},
  };
  const response = await createShipmentHandler({
    storeFactory: () => store,
    resendFactory: () => ({
      sendShipment: async (payload) => {
        emailedShipment = payload.order;
      },
    }),
    environment: { ADMIN_EXPORT_TOKEN: "correct-secret-token" },
    logger: { error() {} },
  })(event({
    orderNumber: "CIG-ORDER1",
    carrier: "UPS",
    trackingNumber: "1Z999",
    trackingUrl: "https://www.ups.com/track?loc=en_US&tracknum=1Z999",
    shipmentDate: "2026-07-25",
  }, {
    headers: { authorization: "Bearer correct-secret-token" },
  }));

  assert.equal(response.statusCode, 200);
  assert.equal(storedShipment.trackingNumber, "1Z999");
  assert.equal(emailedShipment.shipment_carrier, "UPS");
});

test("prize redemption history endpoint is token protected", async () => {
  let recorded;
  const handler = createRedemptionHandler({
    storeFactory: () => ({
      recordPrizeRedemption: async (...args) => {
        recorded = args;
      },
    }),
    environment: { ADMIN_EXPORT_TOKEN: "correct-secret-token" },
    logger: { error() {} },
  });

  const unauthorized = await handler(event({
    playId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    status: "redeemed",
  }));
  assert.equal(unauthorized.statusCode, 401);

  const authorized = await handler(event({
    playId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    status: "redeemed",
    notes: "Claimed in store",
  }, {
    headers: { authorization: "Bearer correct-secret-token" },
  }));
  assert.equal(authorized.statusCode, 200);
  assert.deepEqual(recorded, [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "redeemed",
    "Claimed in store",
  ]);
});

test("migration defines uniqueness and atomic processing contracts", () => {
  const sql = fs.readFileSync(path.join(
    __dirname,
    "../supabase/migrations/202607250001_unified_customer_system.sql",
  ), "utf8");

  assert.match(sql, /email_normalized text not null unique/i);
  assert.match(sql, /stripe_session_id text not null unique/i);
  assert.match(sql, /event_id text primary key/i);
  assert.match(sql, /arcade_one_first_play_per_contact/i);
  assert.match(sql, /for update;/i);
  assert.match(sql, /cigco_process_stripe_order/i);
  assert.match(sql, /insert into public\.orders[\s\S]*on conflict do nothing/i);
  assert.match(sql, /cigco_reserve_integration/i);
  assert.match(sql, /redemption_status text not null/i);
  const arcadeCodesSql = fs.readFileSync(path.join(
    __dirname,
    "../supabase/migrations/202610210002_arcade_codes_activate.sql",
  ), "utf8");
  for (const prize of PRIZES) {
    assert.match(`${sql}\n${arcadeCodesSql}`, new RegExp(`'${prize.id}'`));
  }

  const cooldownSql = fs.readFileSync(path.join(
    __dirname,
    "../supabase/migrations/202607300002_weekly_arcade_cooldown.sql",
  ), "utf8");
  assert.match(cooldownSql, /create or replace function public\.cigco_arcade_claim/i);
  assert.match(cooldownSql, /played_at_value \+ interval '7 days'/i);
  assert.match(cooldownSql, /played_at \+ interval '7 days' > now\(\)/i);
});

test("server secret names do not enter browser bundles", () => {
  const browserFiles = [
    "app.js",
    "arcade.js",
    "email-list.js",
    "index.html",
    "arcade.html",
  ];
  const secretNames = [
    "SUPABASE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "ADMIN_EXPORT_TOKEN",
    "KIT_API_KEY",
    "RESEND_API_KEY",
  ];
  for (const filename of browserFiles) {
    const source = fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
    for (const secretName of secretNames) {
      assert.doesNotMatch(source, new RegExp(secretName), `${secretName} leaked into ${filename}`);
    }
  }
});
