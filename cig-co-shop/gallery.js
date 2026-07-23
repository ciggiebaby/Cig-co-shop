// ---------- Gallery grid + lightbox ----------
function renderGalleryGrid() {
  const grid = document.getElementById("gallery-grid");
  if (!grid) return;
  grid.innerHTML = ART.map((a) => `
    <div class="product-card reveal" data-id="${a.id}">
      <div class="product-card-image-wrap">
        <div class="product-card-parallax">
          <img src="${a.image}" alt="${a.title}" />
        </div>
      </div>
    </div>`).join("");

  grid.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", () => openGalleryModal(card.dataset.id));
  });

  if (window.initScrollEffects) window.initScrollEffects();
}

function openGalleryModal(id) {
  const a = ART.find((x) => x.id === id);
  if (!a) return;
  const content = document.getElementById("gallery-modal-content");
  if (!content) return;
  content.innerHTML = `
    <img class="pd-image" src="${a.image}" alt="${a.title}" />
  `;
  const modal = document.getElementById("gallery-modal");
  if (modal) modal.setAttribute("aria-hidden", "false");
}

const galleryModalClose = document.getElementById("gallery-modal-close");
if (galleryModalClose) {
  galleryModalClose.addEventListener("click", () => {
    const modal = document.getElementById("gallery-modal");
    if (modal) modal.setAttribute("aria-hidden", "true");
  });
}

renderGalleryGrid();
