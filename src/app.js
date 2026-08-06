const STORAGE_KEY = "postcard-cabinet.items.v1";
const TAGS_STORAGE_KEY = "postcard-cabinet.tags.v1";
const DEFAULT_TAGS = ["词条一", "词条二", "词条三"];
const SHELF_COUNT = 3;
const POSTCARDS_PER_SHELF = 4;
const POSTCARDS_PER_PAGE = SHELF_COUNT * POSTCARDS_PER_SHELF;

const starterPostcards = [];

let postcards = loadPostcards();
let tagLabels = loadTagLabels();
let activePage = "cabinet";
let activeFilters = { tag: "", sort: "newest" };
let shelfPage = 0;
let isFilterOpen = false;
let selectedTags = [];
let viewerPostcard = null;
let viewerSide = "front";
let viewerZoom = 1;
let viewerPanX = 0;
let viewerPanY = 0;
let didViewerMove = false;
let viewerDragStart = null;
let viewerPinchStart = null;
const viewerPointers = new Map();
let pendingImages = {
  frontImage: "",
  backImage: "",
};

const pages = [...document.querySelectorAll(".page")];
const phone = document.querySelector(".phone");
const titleEl = document.querySelector("#page-title");
const cabinetList = document.querySelector("#cabinet-list");
const shelfTemplate = document.querySelector("#shelf-template");
const shelfPager = document.querySelector("#shelf-pager");
const pageStatus = document.querySelector("#page-status");
const filterToggle = document.querySelector("#filter-toggle");
const filterBar = document.querySelector("#filter-bar");
const timeFilterList = document.querySelector("#time-filter-list");
const tagFilterList = document.querySelector("#tag-filter-list");
const postcardForm = document.querySelector("#postcard-form");
const frontInput = document.querySelector("#front-input");
const backInput = document.querySelector("#back-input");
const frontPreview = document.querySelector("#front-preview");
const backPreview = document.querySelector("#back-preview");
const totalCount = document.querySelector("#total-count");
const dateInput = document.querySelector("#date-input");
const tagInput = document.querySelector("#tag-input");
const tagOptions = document.querySelector("#tag-options");
const selectedTagsEl = document.querySelector("#selected-tags");
const viewer = document.querySelector("#postcard-viewer");
const viewerCard = document.querySelector("#viewer-card");
const viewerNote = document.querySelector("#viewer-note");
const viewerTitle = document.querySelector("#viewer-title");
const viewerZoomInput = document.querySelector("#viewer-zoom");
const viewerStage = document.querySelector("#viewer-stage");

const pageTitles = {
  cabinet: "明信片柜",
  scan: "扫描入柜",
};

function loadPostcards() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return starterPostcards;

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizePostcard).filter((postcard) => !isDemoPostcard(postcard)) : starterPostcards;
  } catch {
    return starterPostcards;
  }
}

function savePostcards() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(postcards));
}

function loadTagLabels() {
  const raw = localStorage.getItem(TAGS_STORAGE_KEY);
  if (!raw) return DEFAULT_TAGS;

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length === 3 ? parsed.map(String) : DEFAULT_TAGS;
  } catch {
    return DEFAULT_TAGS;
  }
}

function saveTagLabels() {
  localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(tagLabels));
}

function normalizePostcard(postcard) {
  const { place, source, ...rest } = postcard;
  return {
    ...rest,
    tags: Array.isArray(postcard.tags) ? postcard.tags : [],
    date: postcard.date || "",
    note: postcard.note || "",
  };
}

function isDemoPostcard(postcard) {
  return (
    /^明信片 0[1-3]$/.test(postcard.title || "") &&
    !postcard.frontImage &&
    !postcard.backImage &&
    ["邮戳", "旅行", "展览"].includes(postcard.tags?.[0] || "")
  );
}

function showPage(pageName) {
  activePage = pageName;
  phone.classList.toggle("is-scanning", pageName === "scan");
  pages.forEach((page) => page.classList.toggle("is-active", page.id === `page-${pageName}`));
  titleEl.textContent = pageTitles[pageName];

  if (pageName === "cabinet") renderCabinet();
}

function returnToCabinet() {
  if (viewerPostcard) closeViewer();
  showPage("cabinet");
  phone.scrollTop = 0;
}

function getFilteredPostcards() {
  return postcards
    .filter((postcard) => !activeFilters.tag || (postcard.tags || []).includes(activeFilters.tag))
    .sort((a, b) => {
      const aTime = Date.parse(a.date || "") || 0;
      const bTime = Date.parse(b.date || "") || 0;
      return activeFilters.sort === "oldest" ? aTime - bTime : bTime - aTime;
    });
}

function renderSummary() {
  totalCount.textContent = postcards.length.toString();
}

function renderCabinet() {
  renderSummary();
  cabinetList.innerHTML = "";

  const items = getFilteredPostcards();
  const totalPages = Math.max(1, Math.ceil(items.length / POSTCARDS_PER_PAGE));
  shelfPage = Math.min(shelfPage, totalPages - 1);
  const pageItems = items.slice(shelfPage * POSTCARDS_PER_PAGE, (shelfPage + 1) * POSTCARDS_PER_PAGE);

  for (let shelfIndex = 0; shelfIndex < SHELF_COUNT; shelfIndex += 1) {
    const shelfItems = pageItems.slice(shelfIndex * POSTCARDS_PER_SHELF, (shelfIndex + 1) * POSTCARDS_PER_SHELF);

    const fragment = shelfTemplate.content.cloneNode(true);
    const track = fragment.querySelector(".shelf-track");

    shelfItems.forEach((postcard) => track.appendChild(createPostcardButton(postcard)));

    cabinetList.appendChild(fragment);
  }

  renderShelfPager(totalPages);
}

function createPostcardButton(postcard) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "postcard-thumb";
  button.style.setProperty("--tone", postcard.tone || "#dae5e1");
  button.innerHTML = `
    <span class="mini-flip">
      <span class="mini-face mini-front">${renderMiniFace(postcard, "front")}</span>
      <span class="mini-face mini-back">${renderMiniFace(postcard, "back")}</span>
    </span>
  `;
  button.addEventListener("click", () => {
    openViewer(postcard);
  });
  return button;
}

function renderShelfPager(totalPages) {
  const hasPages = totalPages > 1;
  shelfPager.setAttribute("aria-hidden", String(!hasPages));
  pageStatus.textContent = `${shelfPage + 1} / ${totalPages}`;
  document.querySelector("#page-prev").disabled = shelfPage === 0;
  document.querySelector("#page-next").disabled = shelfPage >= totalPages - 1;
}

function renderMiniFace(postcard, side) {
  const image = side === "front" ? postcard.frontImage : postcard.backImage;
  if (image) return `<img src="${image}" alt="${escapeHtml(postcard.title)}${side === "front" ? "正面" : "背面"}" />`;

  if (side === "front") {
    return `<span class="mini-generated-front"><strong>${escapeHtml(postcard.title)}</strong></span>`;
  }

  return `
    <span class="mini-generated-back">
      <span class="mini-lines" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="mini-stamp">邮票</span>
    </span>
  `;
}

function openViewer(postcard) {
  viewerPostcard = postcard;
  viewerSide = "front";
  viewerZoom = 1;
  viewerPanX = 0;
  viewerPanY = 0;
  viewerZoomInput.value = "1";
  viewer.setAttribute("aria-hidden", "false");
  phone.classList.add("is-viewing");
  renderViewer();
}

function closeViewer() {
  viewer.setAttribute("aria-hidden", "true");
  phone.classList.remove("is-viewing");
  viewerPostcard = null;
  viewerPointers.clear();
}

function deleteViewerPostcard() {
  if (!viewerPostcard) return;
  const shouldDelete = window.confirm("删除这张明信片吗？");
  if (!shouldDelete) return;

  postcards = postcards.filter((postcard) => postcard.id !== viewerPostcard.id);
  savePostcards();
  renderTagOptions();
  renderFilterOptions();
  returnToCabinet();
}

function flipViewer() {
  viewerSide = viewerSide === "front" ? "back" : "front";
  renderViewer();
}

function renderViewer() {
  if (!viewerPostcard) return;

  viewerTitle.textContent = viewerPostcard.title;
  viewerNote.textContent = viewerPostcard.note || "";
  viewerNote.hidden = !viewerPostcard.note;
  viewerCard.classList.toggle("is-back", viewerSide === "back");
  viewerCard.style.setProperty("--tone", viewerPostcard.tone || "#dae5e1");
  viewerCard.innerHTML = `
    <span class="viewer-face viewer-front">${renderViewerFace(viewerPostcard, "front")}</span>
    <span class="viewer-face viewer-back">${renderViewerFace(viewerPostcard, "back")}</span>
    <span class="viewer-edge viewer-edge-top" aria-hidden="true"></span>
    <span class="viewer-edge viewer-edge-bottom" aria-hidden="true"></span>
    <span class="viewer-edge viewer-edge-left" aria-hidden="true"></span>
    <span class="viewer-edge viewer-edge-right" aria-hidden="true"></span>
  `;
  updateViewerTransform();
}

function renderViewerFace(postcard, side) {
  const image = side === "front" ? postcard.frontImage : postcard.backImage;
  if (image) return `<img src="${image}" alt="${escapeHtml(postcard.title)}${side === "front" ? "正面" : "背面"}" />`;

  if (side === "front") {
    return `<span class="viewer-generated-front"><strong>${escapeHtml(postcard.title)}</strong></span>`;
  }

  return `
    <span class="viewer-generated-back">
      <span class="viewer-lines" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
      <span class="viewer-stamp">邮票</span>
      <span class="viewer-postmark">邮戳</span>
    </span>
  `;
}

function updateViewerTransform() {
  viewerCard.style.setProperty("--viewer-scale", viewerZoom.toString());
  viewerCard.style.setProperty("--viewer-pan-x", `${viewerPanX}px`);
  viewerCard.style.setProperty("--viewer-pan-y", `${viewerPanY}px`);
}

function setViewerZoom(nextZoom) {
  viewerZoom = clamp(nextZoom, 1, 3.2);
  if (viewerZoom === 1) {
    viewerPanX = 0;
    viewerPanY = 0;
  } else {
    clampViewerPan();
  }
  viewerZoomInput.value = viewerZoom.toString();
  updateViewerTransform();
}

function clampViewerPan() {
  const maxX = 130 * (viewerZoom - 1);
  const maxY = 190 * (viewerZoom - 1);
  viewerPanX = clamp(viewerPanX, -maxX, maxX);
  viewerPanY = clamp(viewerPanY, -maxY, maxY);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getPointerDistance() {
  const points = [...viewerPointers.values()];
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function handleViewerPointerDown(event) {
  if (!viewerPostcard) return;
  viewerStage.setPointerCapture(event.pointerId);
  viewerPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  didViewerMove = false;

  if (viewerPointers.size === 1) {
    viewerDragStart = {
      x: event.clientX,
      y: event.clientY,
      panX: viewerPanX,
      panY: viewerPanY,
    };
  }

  if (viewerPointers.size === 2) {
    viewerPinchStart = {
      distance: getPointerDistance(),
      zoom: viewerZoom,
    };
  }
}

function handleViewerPointerMove(event) {
  if (!viewerPointers.has(event.pointerId)) return;
  viewerPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (viewerPointers.size >= 2 && viewerPinchStart?.distance) {
    const nextZoom = viewerPinchStart.zoom * (getPointerDistance() / viewerPinchStart.distance);
    setViewerZoom(nextZoom);
    didViewerMove = true;
    event.preventDefault();
    return;
  }

  if (!viewerDragStart || viewerZoom <= 1) return;

  const dx = event.clientX - viewerDragStart.x;
  const dy = event.clientY - viewerDragStart.y;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didViewerMove = true;
  viewerPanX = viewerDragStart.panX + dx;
  viewerPanY = viewerDragStart.panY + dy;
  clampViewerPan();
  updateViewerTransform();
  event.preventDefault();
}

function handleViewerPointerUp(event) {
  viewerPointers.delete(event.pointerId);
  if (viewerPointers.size < 2) viewerPinchStart = null;

  if (!didViewerMove && viewerPointers.size === 0) {
    flipViewer();
  }
}

async function readImage(file) {
  if (!file) return "";

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

async function handleImageInput(input, preview, imageKey) {
  const dataUrl = await readImage(input.files?.[0]);
  pendingImages[imageKey] = dataUrl;
  preview.src = dataUrl;
  preview.parentElement.classList.toggle("has-image", Boolean(dataUrl));
}

function resetForm() {
  postcardForm.reset();
  dateInput.value = new Date().toISOString().slice(0, 10);
  selectedTags = [];
  pendingImages = { frontImage: "", backImage: "" };
  [frontPreview, backPreview].forEach((preview) => {
    preview.removeAttribute("src");
    preview.parentElement.classList.remove("has-image");
  });
  renderSelectedTags();
}

function createPostcardFromForm() {
  const formData = new FormData(postcardForm);
  const nextNumber = postcards.length + 1;
  const title = `明信片 ${String(nextNumber).padStart(2, "0")}`;
  const date = String(formData.get("date") || "").trim() || new Date().toISOString().slice(0, 10);
  const note = String(formData.get("note") || "").trim();
  const typedTag = tagInput.value.trim().replaceAll(/\s+/g, " ");
  const tags = typedTag && !selectedTags.includes(typedTag) ? [...selectedTags, typedTag] : selectedTags;
  const finalTags = tags.length ? tags : [tagLabels[0]];

  return {
    id: crypto.randomUUID(),
    title,
    date,
    note,
    tags: finalTags,
    frontImage: pendingImages.frontImage,
    backImage: pendingImages.backImage,
    tone: pickTone(title + finalTags.join("")),
  };
}

function getAllTags() {
  return [...new Set([...tagLabels, ...postcards.flatMap((postcard) => postcard.tags || [])])].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
}

function renderTagOptions() {
  tagOptions.innerHTML = getAllTags().map((tag) => `<option value="${escapeHtml(tag)}"></option>`).join("");
}

function renderFilterOptions() {
  const tags = getAllTags();
  if (!tags.includes(activeFilters.tag)) activeFilters.tag = "";

  timeFilterList.querySelectorAll(".filter-chip").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.sort === activeFilters.sort);
  });

  tagFilterList.innerHTML = `
    <button class="filter-chip ${activeFilters.tag ? "" : "is-active"}" type="button" data-tag="">全部</button>
    ${tags
      .map(
        (tag) => `
          <button class="filter-chip ${tag === activeFilters.tag ? "is-active" : ""}" type="button" data-tag="${escapeHtml(tag)}">
            ${escapeHtml(tag)}
          </button>
        `,
      )
      .join("")}
  `;

}

function renderFilterState() {
  filterToggle.setAttribute("aria-expanded", String(isFilterOpen));
  filterToggle.classList.toggle("is-active", isFilterOpen || Boolean(activeFilters.tag) || activeFilters.sort !== "newest");
  filterBar.setAttribute("aria-hidden", String(!isFilterOpen));
}

function addSelectedTag(rawTag) {
  const tag = rawTag.trim().replaceAll(/\s+/g, " ");
  if (!tag || selectedTags.includes(tag)) return;
  selectedTags = [...selectedTags, tag];
  tagInput.value = "";
  renderSelectedTags();
}

function removeSelectedTag(tag) {
  selectedTags = selectedTags.filter((item) => item !== tag);
  renderSelectedTags();
}

function renderSelectedTags() {
  selectedTagsEl.innerHTML = selectedTags
    .map(
      (tag) => `
        <button class="tag-chip" type="button" data-tag="${escapeHtml(tag)}">
          ${escapeHtml(tag)} <span aria-hidden="true">×</span>
        </button>
      `,
    )
    .join("");

  selectedTagsEl.querySelectorAll(".tag-chip").forEach((button) => {
    button.addEventListener("click", () => removeSelectedTag(button.dataset.tag));
  });
}

function pickTone(seed) {
  const tones = ["#d9e8df", "#f0d28d", "#bfd8e8", "#e8c7c2", "#d8d4ed", "#c9ded3"];
  const index = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % tones.length;
  return tones[index];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.querySelector("#quick-scan").addEventListener("click", () => showPage("scan"));
filterToggle.addEventListener("click", () => {
  isFilterOpen = !isFilterOpen;
  renderFilterState();
});
timeFilterList.addEventListener("click", (event) => {
  const button = event.target.closest(".filter-chip");
  if (!button) return;
  activeFilters.sort = button.dataset.sort || "newest";
  shelfPage = 0;
  renderFilterOptions();
  renderFilterState();
  renderCabinet();
});
tagFilterList.addEventListener("click", (event) => {
  const button = event.target.closest(".filter-chip");
  if (!button) return;
  activeFilters.tag = button.dataset.tag || "";
  shelfPage = 0;
  renderFilterOptions();
  renderFilterState();
  renderCabinet();
});
document.querySelector("#clear-filters").addEventListener("click", () => {
  activeFilters = { tag: "", sort: "newest" };
  shelfPage = 0;
  renderFilterOptions();
  renderFilterState();
  renderCabinet();
});
document.querySelector("#page-prev").addEventListener("click", () => {
  shelfPage = Math.max(0, shelfPage - 1);
  renderCabinet();
});
document.querySelector("#page-next").addEventListener("click", () => {
  shelfPage += 1;
  renderCabinet();
});
document.querySelector("#viewer-close").addEventListener("click", (event) => {
  event.stopPropagation();
  returnToCabinet();
});
document.querySelector("#viewer-flip").addEventListener("click", (event) => {
  event.stopPropagation();
  flipViewer();
});
document.querySelector("#viewer-delete").addEventListener("click", (event) => {
  event.stopPropagation();
  deleteViewerPostcard();
});
viewerStage.addEventListener("pointerdown", handleViewerPointerDown);
viewerStage.addEventListener("pointermove", handleViewerPointerMove);
viewerStage.addEventListener("pointerup", handleViewerPointerUp);
viewerStage.addEventListener("pointercancel", handleViewerPointerUp);
viewerStage.addEventListener("wheel", (event) => {
  event.preventDefault();
  setViewerZoom(viewerZoom - event.deltaY * 0.0025);
});
viewerStage.addEventListener("dblclick", (event) => {
  event.preventDefault();
  setViewerZoom(viewerZoom > 1 ? 1 : 2);
});
viewerZoomInput.addEventListener("input", (event) => {
  setViewerZoom(Number(event.target.value));
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && viewerPostcard) {
    returnToCabinet();
  }
});

frontInput.addEventListener("change", () => handleImageInput(frontInput, frontPreview, "frontImage"));
backInput.addEventListener("change", () => handleImageInput(backInput, backPreview, "backImage"));
document.querySelector("#add-tag").addEventListener("click", () => addSelectedTag(tagInput.value));
tagInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addSelectedTag(tagInput.value);
  }
});
document.querySelector("#cancel-scan").addEventListener("click", () => {
  resetForm();
  returnToCabinet();
});

postcardForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const postcard = createPostcardFromForm();
  postcards = [postcard, ...postcards];
  savePostcards();
  renderTagOptions();
  renderFilterOptions();
  resetForm();
  returnToCabinet();
});

dateInput.value = new Date().toISOString().slice(0, 10);
renderTagOptions();
renderFilterOptions();
renderFilterState();
renderCabinet();
