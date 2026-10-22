// FW26/27 drop hero: live countdown to DROP_AT (products.js) that switches the
// hero to its "live" state on its own at drop time, plus the "Get notified"
// email signup (Kit, Marketing opt-in tag, via /.netlify/functions/drop-signup).

function dropCountdownParts(dropAtMs, nowMs) {
  const remaining = Math.max(0, dropAtMs - nowMs);
  const totalSeconds = Math.floor(remaining / 1000);
  return {
    live: remaining <= 0,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Renders the hero for `nowMs`. Returns true once the drop is live.
function renderDropHero(root, dropAtMs, nowMs) {
  if (!root) return false;
  const parts = dropCountdownParts(dropAtMs, nowMs);
  root.setAttribute("data-state", parts.live ? "live" : "upcoming");
  const set = (unit, value) => {
    const el = root.querySelector(`[data-unit="${unit}"]`);
    if (el) el.textContent = value;
  };
  set("days", String(parts.days));
  set("hours", pad2(parts.hours));
  set("minutes", pad2(parts.minutes));
  set("seconds", pad2(parts.seconds));
  root.querySelectorAll("[data-when]").forEach((el) => {
    el.hidden = el.getAttribute("data-when") !== (parts.live ? "live" : "upcoming");
  });
  return parts.live;
}

function startDropHero(root, dropAt, { now = () => Date.now(), setIntervalImpl = setInterval, clearIntervalImpl = clearInterval, onLive = null } = {}) {
  const dropAtMs = Date.parse(dropAt);
  if (!root || !Number.isFinite(dropAtMs)) return null;
  if (renderDropHero(root, dropAtMs, now())) return null;
  const timer = setIntervalImpl(() => {
    if (renderDropHero(root, dropAtMs, now())) {
      clearIntervalImpl(timer);
      if (typeof onLive === "function") onLive();
    }
  }, 1000);
  return timer;
}

function wireDropSignup(form, { fetchImpl = fetch } = {}) {
  if (!form) return;
  const input = form.querySelector("input[type=email]");
  const button = form.querySelector("button");
  const message = form.querySelector(".drop-signup-message");
  const say = (text, ok) => {
    if (!message) return;
    message.textContent = text;
    message.classList.toggle("is-ok", !!ok);
  };
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = (input.value || "").trim();
    if (typeof isValidEmail === "function" && !isValidEmail(email)) {
      say("Enter a valid email address.");
      return;
    }
    button.disabled = true;
    say("");
    try {
      const response = await fetchImpl("/.netlify/functions/drop-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, marketingConsent: true }),
      });
      if (response.ok) {
        say("You're on the list.", true);
        input.value = "";
        // Backup copy in Netlify Forms, same as the other email captures.
        if (typeof submitEmail === "function") submitEmail(email, "drop-hero");
      } else {
        const body = await response.json().catch(() => ({}));
        say(body.error || "Something went wrong. Please try again.");
      }
    } catch {
      say("Something went wrong. Please try again.");
    } finally {
      button.disabled = false;
    }
  });
}

if (typeof document !== "undefined" && document.getElementById && typeof DROP_AT !== "undefined") {
  startDropHero(document.getElementById("drop-hero"), DROP_AT);
  wireDropSignup(document.getElementById("drop-signup"));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { dropCountdownParts, renderDropHero, startDropHero, wireDropSignup };
}
