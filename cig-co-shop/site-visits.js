// First-party site-visit tracking (CIG 10/30). No cookies, no third parties.
// On page load it sends one small "pageview" beacon to /.netlify/functions/track-visit
// with the path, the referring site, utm_* tags, the ?src= tag (qr, fani, street,
// shop...), mobile/desktop and a random per-tab id (sessionStorage) for counting
// unique visits. Product views, Add to Bag and checkout start send their own event.
// Do Not Track / Global Privacy Control = nothing is sent. Fire-and-forget: any
// error is swallowed so tracking can never break the page or checkout.
(function (root) {
  var ENDPOINT = "/.netlify/functions/track-visit";
  var EVENTS = ["pageview", "product_view", "add_to_bag", "checkout_start"];

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

  function buildPayload(event, productId, env) {
    var loc = env.location || {};
    var c = campaign(loc.href || "", env.storage);
    return {
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

  function send(payload) {
    var body = JSON.stringify(payload);
    var nav = root.navigator;
    if (nav && typeof nav.sendBeacon === "function") {
      var blob = typeof Blob === "function" ? new Blob([body], { type: "application/json" }) : body;
      if (nav.sendBeacon(ENDPOINT, blob)) return;
    }
    if (typeof root.fetch === "function") {
      root.fetch(ENDPOINT, { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(function () {});
    }
  }

  function cigTrack(event, productId) {
    try {
      if (EVENTS.indexOf(event) === -1) return false;
      if (!root.location || !/^https?:$/.test(root.location.protocol)) return false;
      if (privacyOptOut(root.navigator, root)) return false;
      send(buildPayload(event, productId, browserEnv()));
      return true;
    } catch (e) {
      return false;
    }
  }

  var api = { cigTrack: cigTrack, privacyOptOut: privacyOptOut, deviceClass: deviceClass, referrerHost: referrerHost, buildPayload: buildPayload, ENDPOINT: ENDPOINT };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.cigTrack = cigTrack;
    try { cigTrack("pageview"); } catch (e) {}
  }
})(typeof window !== "undefined" ? window : globalThis);
