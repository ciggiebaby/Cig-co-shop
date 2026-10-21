// ---------- Arcade: email gate + three casino-style games ----------
// Supabase is authoritative for identity, first play, prizes, and cooldowns.
// localStorage is retained only as a convenience cache for the last email and
// the most recent server-confirmed play.

const ARCADE_UNLOCK_KEY = "cig_co_arcade_unlocked_v1";
const ARCADE_PLAY_KEY = "cig_co_arcade_last_play_v2";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // Seven days

let cooldownInterval = null;
let arcadeEmail = null;
let activeClaimPromise = null;

function renderPrizeBanner(prize) {
  if (!prize) return "";
  const isWin = ["discount", "perk", "merch", "gift"].includes(prize.type);
  return `
    <div class="prize-banner ${isWin ? "prize-win" : "prize-none"}">
      <div class="prize-label">${prize.label}</div>
      <div class="prize-detail">${prize.detail}</div>
      ${prize.type === "discount" && prize.code ? `<div class="prize-code">${prize.code}</div>` : ""}
    </div>`;
}

function saveConfirmedPrize(prize) {
  if (prize.type === "discount" && typeof savePromoWin === "function") {
    savePromoWin(prize.code);
  }
}

// ---------- Shared seven-day play lock (server-confirmed cache only) ----------
function getLastPlay() {
  try {
    const raw = localStorage.getItem(ARCADE_PLAY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function cacheConfirmedPlay(claim, game) {
  const record = {
    playedAt: new Date(claim.playedAt).getTime(),
    nextEligibleAt: claim.nextEligibleAt,
    prizeId: claim.prize.id,
    prize: claim.prize,
    game,
  };
  localStorage.setItem(ARCADE_PLAY_KEY, JSON.stringify(record));
  saveConfirmedPrize(claim.prize);
  return record;
}

function msRemaining(lastPlay) {
  if (!lastPlay) return 0;
  if (lastPlay.nextEligibleAt) {
    return Math.max(0, new Date(lastPlay.nextEligibleAt).getTime() - Date.now());
  }
  return Math.max(0, COOLDOWN_MS - (Date.now() - lastPlay.playedAt));
}

function formatCountdown(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return d > 0
    ? `${d}D ${pad(h)}:${pad(m)}:${pad(s)}`
    : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function startCooldownUI(lastPlay) {
  const gate = document.getElementById("arcade-gate");
  const games = document.getElementById("arcade-games");
  const cooldown = document.getElementById("arcade-cooldown");
  if (gate) gate.hidden = true;
  if (games) games.hidden = true;
  if (cooldown) cooldown.hidden = false;

  const prizeEl = document.getElementById("cooldown-last-prize");
  const timerEl = document.getElementById("cooldown-timer");
  const prize = lastPlay.prize || prizeById(lastPlay.prizeId);
  if (prizeEl) prizeEl.innerHTML = renderPrizeBanner(prize);

  if (cooldownInterval) clearInterval(cooldownInterval);
  const tick = () => {
    const remaining = msRemaining(lastPlay);
    if (remaining <= 0) {
      clearInterval(cooldownInterval);
      refreshArcadeState();
      return;
    }
    if (timerEl) timerEl.textContent = formatCountdown(remaining);
  };
  tick();
  cooldownInterval = setInterval(tick, 1000);
}

function showGamesUI() {
  const gate = document.getElementById("arcade-gate");
  const games = document.getElementById("arcade-games");
  const cooldown = document.getElementById("arcade-cooldown");
  if (cooldownInterval) { clearInterval(cooldownInterval); cooldownInterval = null; }
  if (gate) gate.hidden = true;
  if (cooldown) cooldown.hidden = true;
  if (games) games.hidden = false;
  initWheel();
  initScratch();
  initBoxes();
  if (window.initScrollEffects) window.initScrollEffects();
}

function checkPlayState(lastPlay = getLastPlay()) {
  const remaining = msRemaining(lastPlay);
  if (lastPlay && remaining > 0) {
    startCooldownUI(lastPlay);
  } else {
    showGamesUI();
  }
}

function uuidForPlay() {
  if (!window.crypto || typeof window.crypto.randomUUID !== "function") {
    throw new Error("Secure Arcade request IDs are unavailable.");
  }
  return window.crypto.randomUUID();
}

async function arcadeRequest(path, body) {
  const response = await fetch(`/.netlify/functions/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "The Arcade is temporarily unavailable.");
  }
  return data;
}

function registrationPlayRecord(registration) {
  if (!registration.lastPlay) return null;
  const play = registration.lastPlay;
  return {
    playedAt: new Date(play.playedAt).getTime(),
    nextEligibleAt: play.nextEligibleAt,
    prizeId: play.prize && play.prize.id,
    prize: play.prize,
  };
}

async function registerArcadeIdentity(
  email,
  marketingConsent,
  consentProvided,
) {
  const registration = await arcadeRequest("arcade-register", {
    email,
    marketingConsent,
    consentProvided,
  });
  arcadeEmail = registration.email;
  localStorage.setItem(ARCADE_UNLOCK_KEY, registration.email);
  const lastPlay = registrationPlayRecord(registration);
  if (lastPlay) {
    localStorage.setItem(ARCADE_PLAY_KEY, JSON.stringify(lastPlay));
  } else {
    localStorage.removeItem(ARCADE_PLAY_KEY);
  }
  checkPlayState(lastPlay);
  return registration;
}

async function refreshArcadeState() {
  const email = arcadeEmail || localStorage.getItem(ARCADE_UNLOCK_KEY);
  if (!email) return;
  try {
    await registerArcadeIdentity(email, false, false);
  } catch (error) {
    const errorEl = document.getElementById("arcade-gate-error");
    if (errorEl) errorEl.textContent =
      "We couldn’t confirm your Arcade access. Please try again.";
  }
}

async function claimArcadePrize(game) {
  if (activeClaimPromise) return activeClaimPromise;
  if (!arcadeEmail) {
    throw new Error("Arcade identity has not been confirmed.");
  }
  activeClaimPromise = arcadeRequest("arcade-claim", {
    email: arcadeEmail,
    game,
    requestId: uuidForPlay(),
  }).finally(() => {
    activeClaimPromise = null;
  });
  return activeClaimPromise;
}

function handleConfirmedClaim(claim, game) {
  if (!claim.claimed) {
    const cooldownRecord = {
      playedAt: new Date(claim.playedAt).getTime(),
      nextEligibleAt: claim.nextEligibleAt,
      prizeId: claim.prize && claim.prize.id,
      prize: claim.prize,
      game,
    };
    localStorage.setItem(ARCADE_PLAY_KEY, JSON.stringify(cooldownRecord));
    startCooldownUI(cooldownRecord);
    return false;
  }
  const record = cacheConfirmedPlay(claim, game);
  startCooldownUI(record);
  return true;
}

// ---------- Email gate ----------
function setupGate() {
  const form = document.getElementById("arcade-gate-form");
  const input = document.getElementById("arcade-email");
  const consent = document.getElementById("arcade-marketing-consent");
  const errorEl = document.getElementById("arcade-gate-error");

  const cachedEmail = localStorage.getItem(ARCADE_UNLOCK_KEY);
  if (cachedEmail) {
    registerArcadeIdentity(cachedEmail, false, false).catch(() => {
      localStorage.removeItem(ARCADE_UNLOCK_KEY);
      if (errorEl) errorEl.textContent =
        "Enter your email again so we can confirm your Arcade access.";
    });
  }

  if (!form || !input) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = input.value;
    if (!isValidEmail(email)) {
      if (errorEl) errorEl.textContent = "Enter a valid email to play.";
      return;
    }
    if (errorEl) errorEl.textContent = "";
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
      await registerArcadeIdentity(email, !!(consent && consent.checked), true);
    } catch (error) {
      if (errorEl) errorEl.textContent =
        error.message || "The Arcade could not be unlocked. Please try again.";
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

// ---------- Game 1: Spin wheel ----------
// x/y come back as percentages of the wheel's own box rather than pixels, so the
// label ring scales with --wheel-size. A hardcoded pixel radius silently detaches
// the labels from the circle as soon as the wheel is any size but 240px.
function wheelLabelLayout(index, count, radiusPercent = 31.25) {
  const sliceAngle = 360 / count;
  const midAngle = index * sliceAngle + sliceAngle / 2;
  const radians = midAngle * Math.PI / 180;
  const rotation = midAngle > 90 && midAngle < 270
    ? midAngle + 180
    : midAngle;
  return {
    midAngle,
    x: Math.sin(radians) * radiusPercent,
    y: -Math.cos(radians) * radiusPercent,
    rotation,
  };
}

function initWheel() {
  const wheel = document.getElementById("wheel");
  const spinBtn = document.getElementById("wheel-spin-btn");
  const resultEl = document.getElementById("wheel-result");
  if (!wheel || !spinBtn || !resultEl) return;

  resultEl.innerHTML = "";
  spinBtn.disabled = false;
  spinBtn.textContent = "Spin";
  wheel.style.transition = "none";
  wheel.style.transform = "rotate(0deg)";

  // Build the wheel's slices + labels dynamically so it always matches PRIZES.
  const n = PRIZES.length;
  const sliceAngle = 360 / n;
  const colors = ["#0a0a0a", "#D4AF37"];
  const stops = PRIZES.map((_, i) => {
    const from = i * sliceAngle;
    const to = from + sliceAngle;
    return `${colors[i % 2]} ${from}deg ${to}deg`;
  }).join(", ");
  wheel.style.background = `conic-gradient(from 0deg, ${stops})`;
  wheel.innerHTML = PRIZES.map((p, i) => {
    const label = wheelLabelLayout(i, n);
    const contrastClass = i % 2 === 1 ? " wheel-label-dark" : "";
    return `<span class="wheel-label${contrastClass}" style="left:calc(50% + ${label.x.toFixed(2)}%);top:calc(50% + ${label.y.toFixed(2)}%);transform:translate(-50%,-50%) rotate(${label.rotation.toFixed(2)}deg)">${p.label.toUpperCase()}</span>`;
  }).join("");
  // Force reflow so the next transform change animates.
  void wheel.offsetWidth;
  wheel.style.transition = "";

  let currentRotation = 0;
  spinBtn.addEventListener("click", async () => {
    spinBtn.disabled = true;
    let claim;
    try {
      claim = await claimArcadePrize("wheel");
    } catch (error) {
      resultEl.textContent = error.message;
      spinBtn.disabled = false;
      return;
    }
    if (!claim.claimed) {
      handleConfirmedClaim(claim, "wheel");
      return;
    }
    const prize = claim.prize;
    const index = PRIZES.findIndex((p) => p.id === prize.id);
    const midAngle = index * sliceAngle + sliceAngle / 2;
    const extraSpins = 5 * 360;
    currentRotation += extraSpins + (360 - midAngle) - (currentRotation % 360);
    wheel.style.transform = `rotate(${currentRotation}deg)`;

    setTimeout(() => {
      resultEl.innerHTML = renderPrizeBanner(prize);
      spinBtn.textContent = "Locked for 7 days";
      handleConfirmedClaim(claim, "wheel");
    }, 4200);
  });
}

// ---------- Game 2: Scratch card ----------
function initScratch() {
  const canvas = document.getElementById("scratch-canvas");
  const prizeLayer = document.getElementById("scratch-prize");
  const resultEl = document.getElementById("scratch-result");
  if (!canvas || !prizeLayer || !resultEl) return;

  let claim = null;
  let claimPromise = null;
  prizeLayer.innerHTML = '<p class="arcade-subtext">Scratch to reveal your prize.</p>';
  resultEl.innerHTML = "";
  canvas.style.display = "";
  canvas.style.opacity = "1";

  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#D4AF37";
  ctx.font = "600 16px Jost, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("SCRATCH HERE", w / 2, h / 2 + 6);

  let scratching = false;
  let pointerDown = false;
  let revealed = false;

  function scratchAt(x, y) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * (w / rect.width), y: (clientY - rect.top) * (h / rect.height) };
  }

  function checkCleared() {
    if (revealed) return;
    const data = ctx.getImageData(0, 0, w, h).data;
    let cleared = 0;
    for (let i = 3; i < data.length; i += 4 * 20) { // sample every 20th pixel for speed
      if (data[i] === 0) cleared++;
    }
    const total = data.length / (4 * 20);
    if (cleared / total > 0.5) {
      revealed = true;
      canvas.style.transition = "opacity 0.4s ease";
      canvas.style.opacity = "0";
      setTimeout(() => { canvas.style.display = "none"; }, 400);
      handleConfirmedClaim(claim, "scratch");
    }
  }

  async function ensureClaim() {
    if (!claimPromise) {
      claimPromise = claimArcadePrize("scratch").then((result) => {
        claim = result;
        if (!claim.claimed) {
          handleConfirmedClaim(claim, "scratch");
          return null;
        }
        prizeLayer.innerHTML = renderPrizeBanner(claim.prize);
        return claim;
      });
    }
    return claimPromise;
  }

  async function start(e) {
    pointerDown = true;
    try {
      const confirmed = await ensureClaim();
      if (!confirmed || !pointerDown) return;
      scratching = true;
      const p = pointerPos(e);
      scratchAt(p.x, p.y);
    } catch (error) {
      resultEl.textContent = error.message;
    }
  }
  function move(e) {
    if (!scratching) return;
    e.preventDefault();
    const p = pointerPos(e);
    scratchAt(p.x, p.y);
    checkCleared();
  }
  function end() {
    pointerDown = false;
    scratching = false;
  }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start, { passive: true });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);
}

// ---------- Game 3: Mystery boxes ----------
function initBoxes() {
  const container = document.getElementById("mystery-boxes");
  const resultEl = document.getElementById("boxes-result");
  if (!container || !resultEl) return;

  resultEl.innerHTML = "";
  const boxes = container.querySelectorAll(".mystery-box");
  boxes.forEach((b) => {
    b.style.pointerEvents = "";
    b.classList.remove("mystery-box-win", "mystery-box-empty");
  });

  boxes.forEach((box) => {
    box.onclick = async () => {
      boxes.forEach((b) => (b.style.pointerEvents = "none"));
      try {
        const claim = await claimArcadePrize("boxes");
        if (!claim.claimed) {
          handleConfirmedClaim(claim, "boxes");
          return;
        }
        const prize = claim.prize;
        if (prize.type !== "none") {
          box.classList.add("mystery-box-win");
        } else {
          box.classList.add("mystery-box-empty");
        }
        resultEl.innerHTML = renderPrizeBanner(prize);
        handleConfirmedClaim(claim, "boxes");
      } catch (error) {
        resultEl.textContent = error.message;
        boxes.forEach((b) => (b.style.pointerEvents = ""));
      }
    };
  });
}

if (typeof document !== "undefined") {
  setupGate();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    COOLDOWN_MS,
    formatCountdown,
    msRemaining,
    registrationPlayRecord,
    renderPrizeBanner,
    wheelLabelLayout,
  };
}
