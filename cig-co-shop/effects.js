// ---------- Scroll reveal + parallax ----------
// Adds subtle "as you scroll" motion: sections fade/rise into view, the hero
// video drifts slightly slower than the page, and each product photo shifts
// within its frame as it passes through the viewport. Respects
// prefers-reduced-motion by disabling all of this and showing content instantly.

(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- Fade/rise reveal for sections + product cards ----
  function setupReveal() {
    const targets = document.querySelectorAll(".reveal:not(.reveal-bound)");
    if (!targets.length) return;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      targets.forEach((el) => {
        el.classList.add("is-visible", "reveal-bound");
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    targets.forEach((el, i) => {
      el.classList.add("reveal-bound");
      el.style.setProperty("--reveal-delay", Math.min(i % 8, 6) * 0.06 + "s");
      observer.observe(el);
    });
  }

  // ---- Parallax: hero video + product image drift ----
  let ticking = false;
  const heroVideo = document.querySelector(".hero-video");

  function updateParallax() {
    ticking = false;
    if (reduceMotion) return;
    const vh = window.innerHeight;

    if (heroVideo) {
      const rect = heroVideo.parentElement.getBoundingClientRect();
      const progress = 1 - Math.max(0, Math.min(1, (rect.top + rect.height) / (vh + rect.height)));
      const offset = (progress - 0.5) * 40; // drift range ~ -20px to 20px
      heroVideo.style.transform = `scale(1.1) translateY(${offset}px)`;
    }

    document.querySelectorAll(".product-card-parallax").forEach((el) => {
      const rect = el.getBoundingClientRect();
      const centerDelta = rect.top + rect.height / 2 - vh / 2;
      // only animate elements reasonably near the viewport for perf
      if (Math.abs(centerDelta) > vh) return;
      const offset = Math.max(-18, Math.min(18, centerDelta * -0.06));
      el.style.transform = `translateY(${offset}px)`;
    });
  }

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(updateParallax);
      ticking = true;
    }
  }

  function setupParallax() {
    if (reduceMotion) return;
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    updateParallax();
  }

  window.initScrollEffects = function () {
    setupReveal();
  };

  document.addEventListener("DOMContentLoaded", () => {
    setupReveal();
    setupParallax();
  });

  // In case this script runs after DOMContentLoaded already fired (deferred load order).
  if (document.readyState !== "loading") {
    setupReveal();
    setupParallax();
  }
})();
