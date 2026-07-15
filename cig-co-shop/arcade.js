// ---------- Arcade: email gate + three casino-style games ----------
// Playing ANY one of the three games (wheel, scratch, boxes) counts as your
// play and locks the whole Arcade for 48 hours — pure luck, one shot per
// visitor per window. A live countdown shows until the next play unlocks.
// Winning a "discount" prize saves the code via savePromoWin() (ready to use
// at checkout) and also emails the code to the visitor right away via the
// send-prize-email Netlify function.

const ARCADE_UNLOCK_KEY = "cig_co_arcade_unlocked_v1";
const ARCADE_PLAY_KEY = "cig_co_arcade_last_play_v2";
const COOLDOWN_MS = 48 * 60 * 60 * 1000; // 48 hours

let cooldownInterval = null;

function pickRandomPrize() {
  return PRIZES[Math.floor(Math.random() * PRIZES.length)];
}

// A visitor's very first play is a guaranteed 10% or 20% off — every other
// play afterward is pure chance across the full PRIZES pool.
const GUARANTEED_FIRST_PLAY_IDS = ["p10", "p20"];

function isFirstPlay() {
  return !getLastPlay();
}

function pickPrizeForPlay() {
  if (isFirstPlay()) {
    const id = GUARANTEED_FIRST_PLAY_IDS[Math.floor(Math.random() * GUARANTEED_FIRST_PLAY_IDS.length)];
    return prizeById(id) || pickRandomPrize();
  }
  return pickRandomPrize();
}

function renderPrizeBanner(prize) {
  if (!prize) return "";
  const isWin = prize.type === "discount" || prize.type === "merch" || prize.type === "gift";
  return `
    <div class="prize-banner ${isWin ? "prize-win" : "prize-none"}">
      <div class="prize-label">${prize.label}</div>
      <div class="prize-detail">${prize.detail}</div>
      ${prize.type === "discount" ? `<div class="prize-code">${prize.code}</div>` : ""}
    </div>`;
}

function handlePrizeWon(prize) {
  if (prize.type === "discount" && typeof savePromoWin === "function") {
    savePromoWin(prize.code);
  }
  // Only email on an actual win — no "sorry, try again" emails.
  if (prize.type === "none") return;
  const email = localStorage.getItem(ARCADE_UNLOCK_KEY);
  if (email && typeof sendPrizeEmail === "function") {
    sendPrizeEmail(email, prize);
  }
}

// ---------- Shared 48h play lock ----------
function getLastPlay() {
  try {
    const raw = localStorage.getItem(ARCADE_PLAY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function recordPlay(prize, game) {
  localStorage.setItem(ARCADE_PLAY_KEY, JSON.stringify({
    playedAt: Date.now(),
    prizeId: prize.id,
    game,
  }));
  handlePrizeWon(prize);
  checkPlayState();
}

function msRemaining(lastPlay) {
  if (!lastPlay) return 0;
  return Math.max(0, COOLDOWN_MS - (Date.now() - lastPlay.playedAt));
}

function formatCountdown(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
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
  if (prizeEl) prizeEl.innerHTML = renderPrizeBanner(prizeById(lastPlay.prizeId));

  if (cooldownInterval) clearInterval(cooldownInterval);
  const tick = () => {
    const remaining = msRemaining(lastPlay);
    if (remaining <= 0) {
      clearInterval(cooldownInterval);
      checkPlayState();
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

function checkPlayState() {
  const lastPlay = getLastPlay();
  const remaining = msRemaining(lastPlay);
  if (lastPlay && remaining > 0) {
    startCooldownUI(lastPlay);
  } else {
    showGamesUI();
  }
}

// ---------- Email gate ----------
function isArcadeUnlocked() {
  return !!localStorage.getItem(ARCADE_UNLOCK_KEY);
}

function setupGate() {
  const form = document.getElementById("arcade-gate-form");
  const input = document.getElementById("arcade-email");
  const errorEl = document.getElementById("arcade-gate-error");

  if (isArcadeUnlocked()) {
    checkPlayState();
    return;
  }

  if (!form || !input) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = input.value;
    if (!isValidEmail(email)) {
      if (errorEl) errorEl.textContent = "Enter a valid email to play.";
      return;
    }
    if (errorEl) errorEl.textContent = "";
    if (typeof submitEmail === "function") submitEmail(email, "arcade");
    localStorage.setItem(ARCADE_UNLOCK_KEY, email.trim());
    checkPlayState();
  });
}

// ---------- Game 1: Spin wheel ----------
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
    const mid = i * sliceAngle + sliceAngle / 2;
    return `<span class="wheel-label" style="transform: rotate(${mid}deg) translateY(-108px)">${p.label.toUpperCase()}</span>`;
  }).join("");
  // Force reflow so the next transform change animates.
  void wheel.offsetWidth;
  wheel.style.transition = "";

  let currentRotation = 0;
  spinBtn.addEventListener("click", () => {
    spinBtn.disabled = true;
    const prize = pickPrizeForPlay();
    const index = PRIZES.findIndex((p) => p.id === prize.id);
    const midAngle = index * sliceAngle + sliceAngle / 2;
    const extraSpins = 5 * 360;
    currentRotation += extraSpins + (360 - midAngle) - (currentRotation % 360);
    wheel.style.transform = `rotate(${currentRotation}deg)`;

    setTimeout(() => {
      resultEl.innerHTML = renderPrizeBanner(prize);
      spinBtn.textContent = "Locked for 48h";
      recordPlay(prize, "wheel");
    }, 4200);
  });
}

// ---------- Game 2: Scratch card ----------
function initScratch() {
  const canvas = document.getElementById("scratch-canvas");
  const prizeLayer = document.getElementById("scratch-prize");
  const resultEl = document.getElementById("scratch-result");
  if (!canvas || !prizeLayer || !resultEl) return;

  const prize = pickPrizeForPlay();
  prizeLayer.innerHTML = renderPrizeBanner(prize);
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
      recordPlay(prize, "scratch");
    }
  }

  function start(e) { scratching = true; const p = pointerPos(e); scratchAt(p.x, p.y); }
  function move(e) {
    if (!scratching) return;
    e.preventDefault();
    const p = pointerPos(e);
    scratchAt(p.x, p.y);
    checkCleared();
  }
  function end() { scratching = false; }

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
  // On a guaranteed first play, every box wins — otherwise only one of three does.
  const guaranteed = isFirstPlay();
  const prizeIndex = guaranteed ? -1 : Math.floor(Math.random() * 3);
  const prize = pickPrizeForPlay();
  const boxes = container.querySelectorAll(".mystery-box");
  boxes.forEach((b) => {
    b.style.pointerEvents = "";
    b.classList.remove("mystery-box-win", "mystery-box-empty");
  });

  boxes.forEach((box, i) => {
    box.addEventListener("click", () => {
      boxes.forEach((b) => (b.style.pointerEvents = "none"));
      if (guaranteed || i === prizeIndex) {
        box.classList.add("mystery-box-win");
        resultEl.innerHTML = renderPrizeBanner(prize);
        recordPlay(prize, "boxes");
      } else {
        box.classList.add("mystery-box-empty");
        const noneprize = { id: "again1", type: "none", label: "Empty Box", detail: "No luck this time — come back soon." };
        resultEl.innerHTML = renderPrizeBanner(noneprize);
        recordPlay(noneprize, "boxes");
      }
    }, { once: true });
  });
}

setupGate();
