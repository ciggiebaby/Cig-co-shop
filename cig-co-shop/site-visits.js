// First-party site-visit tracking (CIG 10/30). No cookies, no third parties.
// On page load it sends one small "pageview" to /.netlify/functions/track-visit
// with the path, the referring site, utm_* tags, the ?src= tag (qr, fani, street,
// shop...), mobile/desktop and a random per-tab id (sessionStorage) for counting
// unique visits. A ?product= landing includes that product id on the pageview
// so the referrer and src/utm tags are stored with the landing (a second beacon
// in the same tick used to drop this pageview). Product views, Add to Bag,
// checkout steps and the bag upsell send their own events. `detail` is a short
// token (card, paypal, email) and never an email or address.
// Do Not Track / Global Privacy Control = nothing is sent. Fire-and-forget: any
// error is swallowed so tracking can never break the page or checkout.
(function (root) {
  var ENDPOINT = "/.netlify/functions/track-visit";
  var EVENTS = [
    "pageview", "product_view", "add_to_bag", "checkout_start",
    "checkout_form_view", "checkout_pay_click", "checkout_validation_error",
    "checkout_session_error", "checkout_redirect",
    "bag_upsell_shown", "bag_upsell_accepted",
  ];

  function privacyOptOut(nav, win) {
    try {
      if (nav && nav.globalPrivacyControl === true) return true;
      var dnt = (nav && (nav.doNotTrack || nav.msDoNotTrack)) || (win && win.doNotTrack);
      return dnt === "1" || dnt === "yes" || dnt === 1;
    } catch (e) {
      return true;
    }
  }

  function deviceClass(width) {
    return typeof width === "number" && width > 0 && width < 768 ? "mobile" : "desktop";
  }

  function clip(value, max) {
    if (typeof value !== "string") return null;
    var v = value.trim().slice(0, max);
    return v || null;
  }

  function referrerHost(referrer, ownHost) {
    try {
      if (!referrer) return null;
      var host = new URL(referrer).hostname.toLowerCase();
      if (!host || host === String(ownHost || "").toLowerCase()) return null;
      return host.slice(0, 120);
    } catch (e) {
      return null;
    }
  }

  function sessionId(storage) {
    try {
      var id = storage.getItem("cig_visit_sid");
      if (id && /^[a-z0-9]{8,40}$/.test(id)) return id;
      id = "";
      for (var i = 0; i < 4; i++) id += Math.random().toString(36).slice(2, 8);
      storage.setItem("cig_visit_sid", id);
      return id;
    } catch (e) {
      return null;
    }
  }

  // Campaign tags are kept for the whole tab, so a product view after landing
  // from a QR card still counts toward that QR card.
  function campaign(href, storage) {
    var keys = ["utm_source", "utm_medium", "utm_campaign", "src"];
    var out = {};
    var fromUrl = false;
    try {
      var params = new URL(href).searchParams;
      keys.forEach(function (k) {
        out[k] = clip(params.get(k), 80);
        if (out[k]) fromUrl = true;
      });
    } catch (e) {}
    try {
      if (fromUrl) storage.setItem("cig_visit_campaign", JSON.stringify(out));
      else {
        var saved = JSON.parse(storage.getItem("cig_visit_campaign") || "null");
        if (saved) keys.forEach(function (k) { out[k] = clip(saved[k], 80); });
      }
    } catch (e) {}
    return out;
  }

  // Product id from a shared link (?product=FW26-BUNDLE). Anything that isn't
  // a plain id is dropped so a bad link can't make the pageview fail validation.
  function landingProductId(href) {
    try {
      var id = new URL(href).searchParams.get("product");
      if (typeof id !== "string") return null;
      id = id.trim();
      return /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : null;
    } catch (e) {
      return null;
    }
  }

  function detailToken(value) {
    var v = clip(value, 40);
    return v && /^[A-Za-z0-9_-]+$/.test(v) ? v : null;
  }

  function buildPayload(event, productId, env, detail) {
    var loc = env.location || {};
    var c = campaign(loc.href || "", env.storage);
    var row = {
      event: event,
      path: clip(loc.pathname || "/", 200) || "/",
      product_id: productId ? clip(String(productId), 40) : null,
      referrer_host: event === "pageview" ? referrerHost(env.referrer, loc.hostname) : null,
      utm_source: c.utm_source || null,
      utm_medium: c.utm_medium || null,
      utm_campaign: c.utm_campaign || null,
      src: c.src || null,
      device: deviceClass(env.width),
      session_id: sessionId(env.storage),
    };
    var token = detailToken(detail);
    if (token) row.detail = token;
    return row;
  }

  function browserEnv() {
    var storage;
    try { storage = root.sessionStorage; } catch (e) { storage = null; }
    if (!storage) storage = { getItem: function () { return null; }, setItem: function () {} };
    return {
      location: root.location,
      referrer: root.document ? root.document.referrer : "",
      width: (root.screen && root.screen.width) || root.innerWidth || 0,
      storage: storage,
    };
  }

  // fetch (keepalive) rather than sendBeacon. A ?product= landing fires
  // product_view while the page is still loading; a second sendBeacon in that
  // same tick was dropping the pageview, and with it the referrer and src/utm.
  function send(payload) {
    var body = JSON.stringify(payload);
    if (typeof root.fetch === "function") {
      try {
        root.fetch(ENDPOINT, { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(function () {});
        return;
      } catch (e) {}
    }
    var nav = root.navigator;
    if (nav && typeof nav.sendBeacon === "function") {
      try {
        var blob = typeof Blob === "function" ? new Blob([body], { type: "application/json" }) : body;
        if (nav.sendBeacon(ENDPOINT, blob)) return;
      } catch (e) {}
    }
  }

  function cigTrack(event, productId, detail) {
    try {
      if (EVENTS.indexOf(event) === -1) return false;
      if (!root.location || !/^https?:$/.test(root.location.protocol)) return false;
      if (privacyOptOut(root.navigator, root)) return false;
      send(buildPayload(event, productId, browserEnv(), detail));
      return true;
    } catch (e) {
      return false;
    }
  }

  var api = {
    cigTrack: cigTrack, privacyOptOut: privacyOptOut, deviceClass: deviceClass,
    referrerHost: referrerHost, buildPayload: buildPayload, landingProductId: landingProductId,
    ENDPOINT: ENDPOINT, EVENTS: EVENTS,
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.cigTrack = cigTrack;
    try { cigTrack("pageview", landingProductId(root.location && root.location.href)); } catch (e) {}
  }
})(typeof window !== "undefined" ? window : globalThis);
