// Google Ads tag for Cig & Co. (CIG-approved conversion tracking).
// Loads gtag.js for AW-18545350125 on each page, next to site-visits.js.
// Add to bag fires on the existing add_to_bag event (cart.js). Purchase fires
// only from purchase() after a caller already knows the payment is paid.
//
// /?checkout=success is not that moment. app.js handleCheckoutResult treats
// it as "Payment confirmation is still pending" for Stripe, PayPal, and
// crypto, strips session_id, and keeps the bag. The paid check lives on the
// server (stripe-webhook.js payment_status === "paid"; paypal-capture.js /
// paypal-webhook.js after a COMPLETED capture). The browser never sees that
// result, and there is no confirmed-order page. Do not call purchase() from
// the pending return.
//
// When a confirmed-order view exists, call:
//   CIGGoogleAds.purchase({ confirmed: true, value: 44, transactionId: "pi_..." })
// value is dollars, currency is always USD, and the same transactionId fires
// once per tab. Stripe: payment_intent id and amount_total / 100. PayPal:
// the capture id already stored as paymentId (paypal:<capture id>) and the
// captured amount in dollars. Do Not Track / Global Privacy Control: the tag
// is not loaded and neither conversion is sent.
(function (root) {
  var AW_ID = "AW-18545350125";
  var ADD_TO_CART_SEND_TO = "AW-18545350125/a3w3CNuOir8dEO2rjotF";
  var PURCHASE_SEND_TO = "AW-18545350125/XPrBCMrq-cAdEO2rjotF";
  var SCRIPT_ID = "cig-google-ads";
  var SCRIPT_SRC = "https://www.googletagmanager.com/gtag/js?id=AW-18545350125";
  var DEDUPE_PREFIX = "cig_gads_purchase_";

  function privacyOptOut(nav, win) {
    try {
      if (nav && nav.globalPrivacyControl === true) return true;
      var dnt = (nav && (nav.doNotTrack || nav.msDoNotTrack)) || (win && win.doNotTrack);
      return dnt === "1" || dnt === "yes" || dnt === 1;
    } catch (e) {
      return true;
    }
  }

  function cleanTransactionId(value) {
    if (typeof value !== "string") return null;
    var v = value.trim();
    if (!v || v.length > 120 || !/^[A-Za-z0-9_.:-]+$/.test(v)) return null;
    return v;
  }

  function dollarValue(value) {
    var n = typeof value === "number" ? value : (typeof value === "string" && value.trim() ? Number(value) : NaN);
    if (!isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
  }

  function resolve(options) {
    var win = (options && options.window) || root;
    return {
      win: win,
      nav: (options && options.navigator) || (win && win.navigator) || null,
      gtag: (options && options.gtag) || (win && win.gtag) || null,
    };
  }

  function addToCart(options) {
    try {
      var env = resolve(options);
      if (privacyOptOut(env.nav, env.win)) return false;
      if (typeof env.gtag !== "function") return false;
      env.gtag("event", "conversion", { send_to: ADD_TO_CART_SEND_TO });
      return true;
    } catch (e) {
      return false;
    }
  }

  // confirmed must be true. value is the amount paid, in dollars. currency
  // sent to Google is USD. transactionId dedupes for this tab.
  function purchase(order, options) {
    try {
      var env = resolve(options);
      if (privacyOptOut(env.nav, env.win)) return false;
      if (!order || order.confirmed !== true) return false;
      var transactionId = cleanTransactionId(order.transactionId);
      var value = dollarValue(order.value);
      if (!transactionId || value == null) return false;
      if (typeof env.gtag !== "function") return false;
      var storage = (options && options.storage) || null;
      if (!storage && env.win) {
        try { storage = env.win.sessionStorage; } catch (e) { storage = null; }
      }
      var key = DEDUPE_PREFIX + transactionId;
      try {
        if (storage && typeof storage.getItem === "function" && storage.getItem(key)) return false;
      } catch (e) {}
      env.gtag("event", "conversion", {
        send_to: PURCHASE_SEND_TO,
        value: value,
        currency: "USD",
        transaction_id: transactionId,
      });
      try {
        if (storage && typeof storage.setItem === "function") storage.setItem(key, "1");
      } catch (e) {}
      return true;
    } catch (e) {
      return false;
    }
  }

  function install(doc, win) {
    var target = win || root;
    var documentRef = doc || (target && target.document);
    if (!documentRef || !documentRef.head || typeof documentRef.createElement !== "function") return false;
    if (typeof documentRef.getElementById === "function" && documentRef.getElementById(SCRIPT_ID)) return true;
    var script = documentRef.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = SCRIPT_SRC;
    documentRef.head.appendChild(script);
    target.dataLayer = target.dataLayer || [];
    if (typeof target.gtag !== "function") {
      target.gtag = function () { target.dataLayer.push(arguments); };
    }
    target.gtag("js", new Date());
    target.gtag("config", AW_ID);
    return true;
  }

  var api = {
    AW_ID: AW_ID,
    ADD_TO_CART_SEND_TO: ADD_TO_CART_SEND_TO,
    PURCHASE_SEND_TO: PURCHASE_SEND_TO,
    SCRIPT_SRC: SCRIPT_SRC,
    privacyOptOut: privacyOptOut,
    addToCart: addToCart,
    purchase: purchase,
    install: install,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (root) {
    root.CIGGoogleAds = api;
    try {
      if (root.location && /^https?:$/.test(root.location.protocol) && !privacyOptOut(root.navigator, root)) {
        install(root.document, root);
      }
    } catch (e) {}
  }
})(typeof window !== "undefined" ? window : globalThis);
