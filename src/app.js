const STORAGE_KEY = "postcard-cabinet.items.v1";
const TAGS_STORAGE_KEY = "postcard-cabinet.tags.v1";
const DECOR_STORAGE_KEY = "postcard-cabinet.decor.v1";
const DEFAULT_TAGS = ["词条一", "词条二", "词条三"];
const DEFAULT_DECOR = {
  cabinetTheme: "warm",
  lineTheme: "sepia",
  backgroundTheme: "paper",
  ornaments: {
    frame: false,
    stamp: false,
    label: false,
    vase: false,
  },
  frameImage: "",
};
const SHELF_COUNT = 3;
const POSTCARDS_PER_SHELF = 4;
const POSTCARDS_PER_PAGE = SHELF_COUNT * POSTCARDS_PER_SHELF;

const starterPostcards = [];

let postcards = loadPostcards();
let tagLabels = loadTagLabels();
let decor = loadDecor();
let activePage = "cabinet";
let activeFilters = { tag: "", sort: "newest" };
let shelfPage = 0;
let isFilterOpen = false;
let isDecorOpen = false;
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
let cropState = null;
let activeCropCorner = null;
let pendingImages = {
  frontImage: "",
  backImage: "",
};

const pages = [...document.querySelectorAll(".page")];
const phone = document.querySelector(".phone");
const titleEl = document.querySelector("#page-title");
const decorToggle = document.querySelector("#decor-toggle");
const decorPanel = document.querySelector("#decor-panel");
const decorFrame = document.querySelector("#decor-frame");
const decorFrameImage = document.querySelector("#decor-frame-image");
const decorStamp = document.querySelector("#decor-stamp");
const decorLabel = document.querySelector("#decor-label");
const decorVase = document.querySelector("#decor-vase");
const frameImageInput = document.querySelector("#frame-image-input");
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
const cropper = document.querySelector("#scan-cropper");
const cropTitle = document.querySelector("#crop-title");
const cropStage = document.querySelector("#crop-stage");
const cropImage = document.querySelector("#crop-image");
const cropOverlay = document.querySelector("#crop-overlay");
const cropPolygon = document.querySelector("#crop-polygon");
const cropHandles = [...cropOverlay.querySelectorAll("circle")];
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

function loadDecor() {
  const raw = localStorage.getItem(DECOR_STORAGE_KEY);
  if (!raw) return cloneDefaultDecor();

  try {
    const parsed = JSON.parse(raw);
    return {
      ...cloneDefaultDecor(),
      ...parsed,
      ornaments: {
        ...DEFAULT_DECOR.ornaments,
        ...(parsed.ornaments || {}),
      },
    };
  } catch {
    return cloneDefaultDecor();
  }
}

function saveDecor() {
  localStorage.setItem(DECOR_STORAGE_KEY, JSON.stringify(decor));
}

function cloneDefaultDecor() {
  return JSON.parse(JSON.stringify(DEFAULT_DECOR));
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

  if (pageName !== "cabinet") {
    isDecorOpen = false;
    renderDecorPanel();
  }
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

function applyDecor() {
  phone.dataset.cabinetTheme = decor.cabinetTheme;
  phone.dataset.lineTheme = decor.lineTheme;
  phone.dataset.bgTheme = decor.backgroundTheme;
  decorFrame.hidden = !decor.ornaments.frame;
  decorStamp.hidden = !decor.ornaments.stamp;
  decorLabel.hidden = !decor.ornaments.label;
  decorVase.hidden = !decor.ornaments.vase;

  if (decor.frameImage) {
    decorFrameImage.src = decor.frameImage;
  } else {
    decorFrameImage.removeAttribute("src");
  }

  decorPanel.querySelectorAll("[data-cabinet-theme]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.cabinetTheme === decor.cabinetTheme);
  });
  decorPanel.querySelectorAll("[data-line-theme]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.lineTheme === decor.lineTheme);
  });
  decorPanel.querySelectorAll("[data-bg-theme]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.bgTheme === decor.backgroundTheme);
  });
  decorPanel.querySelectorAll("[data-ornament]").forEach((button) => {
    button.classList.toggle("is-active", Boolean(decor.ornaments[button.dataset.ornament]));
  });
}

function renderDecorPanel() {
  decorToggle.setAttribute("aria-expanded", String(isDecorOpen));
  decorToggle.classList.toggle("is-active", isDecorOpen);
  decorPanel.setAttribute("aria-hidden", String(!isDecorOpen));
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
  if (!dataUrl) return;
  openCropper({ dataUrl, input, preview, imageKey });
}

function openCropper({ dataUrl, input, preview, imageKey }) {
  cropState = {
    dataUrl,
    input,
    preview,
    imageKey,
    corners: [],
  };
  cropTitle.textContent = imageKey === "frontImage" ? "裁切正面" : "裁切背面";
  cropImage.addEventListener("load", initializeCropCorners, { once: true });
  cropImage.src = dataUrl;
  cropper.setAttribute("aria-hidden", "false");
  phone.classList.add("is-cropping");
}

function closeCropper({ resetInput = false } = {}) {
  if (resetInput && cropState?.input) cropState.input.value = "";
  cropper.setAttribute("aria-hidden", "true");
  phone.classList.remove("is-cropping");
  activeCropCorner = null;
  cropState = null;
  cropImage.removeAttribute("src");
}

function initializeCropCorners() {
  if (!cropState) return;
  const rect = getCropImageRect();
  const insetX = rect.width * 0.08;
  const insetY = rect.height * 0.12;
  cropState.corners = [
    { x: rect.left + insetX, y: rect.top + insetY },
    { x: rect.right - insetX, y: rect.top + insetY },
    { x: rect.right - insetX, y: rect.bottom - insetY },
    { x: rect.left + insetX, y: rect.bottom - insetY },
  ];
  renderCropOverlay();
}

function getCropImageRect() {
  const stageRect = cropStage.getBoundingClientRect();
  const imageRect = cropImage.getBoundingClientRect();
  return {
    left: imageRect.left - stageRect.left,
    top: imageRect.top - stageRect.top,
    right: imageRect.right - stageRect.left,
    bottom: imageRect.bottom - stageRect.top,
    width: imageRect.width,
    height: imageRect.height,
  };
}

function renderCropOverlay() {
  if (!cropState) return;
  cropPolygon.setAttribute("points", cropState.corners.map((point) => `${point.x},${point.y}`).join(" "));
  cropHandles.forEach((handle, index) => {
    const point = cropState.corners[index];
    handle.setAttribute("cx", point.x);
    handle.setAttribute("cy", point.y);
  });
}

function handleCropPointerDown(event) {
  const handle = event.target.closest("circle");
  if (!handle || !cropState) return;
  activeCropCorner = Number(handle.dataset.corner);
  cropOverlay.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function handleCropPointerMove(event) {
  if (activeCropCorner === null || !cropState) return;
  const stageRect = cropStage.getBoundingClientRect();
  const imageRect = getCropImageRect();
  cropState.corners[activeCropCorner] = {
    x: clamp(event.clientX - stageRect.left, imageRect.left, imageRect.right),
    y: clamp(event.clientY - stageRect.top, imageRect.top, imageRect.bottom),
  };
  renderCropOverlay();
  event.preventDefault();
}

function handleCropPointerUp() {
  activeCropCorner = null;
}

async function applyCropper() {
  if (!cropState) return;
  const croppedDataUrl = await createScannedImage(cropState);
  pendingImages[cropState.imageKey] = croppedDataUrl;
  cropState.preview.src = croppedDataUrl;
  cropState.preview.parentElement.classList.add("has-image");
  closeCropper();
}

async function createScannedImage(state) {
  const sourceImage = await loadImage(state.dataUrl);
  const imageRect = getCropImageRect();
  const scaleX = sourceImage.naturalWidth / imageRect.width;
  const scaleY = sourceImage.naturalHeight / imageRect.height;
  const sourceCorners = state.corners.map((point) => ({
    x: (point.x - imageRect.left) * scaleX,
    y: (point.y - imageRect.top) * scaleY,
  }));

  const outputWidth = 1184;
  const outputHeight = 800;
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = sourceImage.naturalWidth;
  sourceCanvas.height = sourceImage.naturalHeight;
  const sourceContext = sourceCanvas.getContext("2d");
  sourceContext.drawImage(sourceImage, 0, 0);
  const sourceData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const outputContext = outputCanvas.getContext("2d");
  const outputData = outputContext.createImageData(outputWidth, outputHeight);
  const transform = solveHomography(
    [
      { x: 0, y: 0 },
      { x: outputWidth - 1, y: 0 },
      { x: outputWidth - 1, y: outputHeight - 1 },
      { x: 0, y: outputHeight - 1 },
    ],
    sourceCorners,
  );

  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      const sourcePoint = applyHomography(transform, x, y);
      const color = sampleImage(sourceData, sourcePoint.x, sourcePoint.y);
      const targetIndex = (y * outputWidth + x) * 4;
      outputData.data[targetIndex] = enhanceChannel(color[0]);
      outputData.data[targetIndex + 1] = enhanceChannel(color[1]);
      outputData.data[targetIndex + 2] = enhanceChannel(color[2]);
      outputData.data[targetIndex + 3] = color[3];
    }
  }

  outputContext.putImageData(outputData, 0, 0);
  return outputCanvas.toDataURL("image/jpeg", 0.9);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = src;
  });
}

function solveHomography(fromPoints, toPoints) {
  const matrix = [];
  const values = [];

  fromPoints.forEach((from, index) => {
    const to = toPoints[index];
    matrix.push([from.x, from.y, 1, 0, 0, 0, -to.x * from.x, -to.x * from.y]);
    values.push(to.x);
    matrix.push([0, 0, 0, from.x, from.y, 1, -to.y * from.x, -to.y * from.y]);
    values.push(to.y);
  });

  return gaussianSolve(matrix, values);
}

function gaussianSolve(matrix, values) {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];

    const divisor = augmented[column][column] || 1;
    for (let item = column; item <= size; item += 1) augmented[column][item] /= divisor;

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let item = column; item <= size; item += 1) {
        augmented[row][item] -= factor * augmented[column][item];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function applyHomography(transform, x, y) {
  const denominator = transform[6] * x + transform[7] * y + 1;
  return {
    x: (transform[0] * x + transform[1] * y + transform[2]) / denominator,
    y: (transform[3] * x + transform[4] * y + transform[5]) / denominator,
  };
}

function sampleImage(imageData, x, y) {
  const clampedX = clamp(x, 0, imageData.width - 1);
  const clampedY = clamp(y, 0, imageData.height - 1);
  const left = Math.floor(clampedX);
  const top = Math.floor(clampedY);
  const right = Math.min(left + 1, imageData.width - 1);
  const bottom = Math.min(top + 1, imageData.height - 1);
  const tx = clampedX - left;
  const ty = clampedY - top;
  const topLeft = getPixel(imageData, left, top);
  const topRight = getPixel(imageData, right, top);
  const bottomLeft = getPixel(imageData, left, bottom);
  const bottomRight = getPixel(imageData, right, bottom);

  return topLeft.map((channel, index) => {
    const topValue = channel * (1 - tx) + topRight[index] * tx;
    const bottomValue = bottomLeft[index] * (1 - tx) + bottomRight[index] * tx;
    return topValue * (1 - ty) + bottomValue * ty;
  });
}

function getPixel(imageData, x, y) {
  const index = (y * imageData.width + x) * 4;
  return [
    imageData.data[index],
    imageData.data[index + 1],
    imageData.data[index + 2],
    imageData.data[index + 3],
  ];
}

function enhanceChannel(value) {
  return clamp((value - 128) * 1.08 + 138, 0, 255);
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
decorToggle.addEventListener("click", () => {
  isDecorOpen = !isDecorOpen;
  if (isDecorOpen) {
    isFilterOpen = false;
    renderFilterState();
  }
  renderDecorPanel();
});
decorPanel.addEventListener("click", (event) => {
  const cabinetButton = event.target.closest("[data-cabinet-theme]");
  const lineButton = event.target.closest("[data-line-theme]");
  const backgroundButton = event.target.closest("[data-bg-theme]");
  const ornamentButton = event.target.closest("[data-ornament]");

  if (cabinetButton) {
    decor.cabinetTheme = cabinetButton.dataset.cabinetTheme;
  }
  if (lineButton) {
    decor.lineTheme = lineButton.dataset.lineTheme;
  }
  if (backgroundButton) {
    decor.backgroundTheme = backgroundButton.dataset.bgTheme;
  }
  if (ornamentButton) {
    const ornament = ornamentButton.dataset.ornament;
    decor.ornaments[ornament] = !decor.ornaments[ornament];
  }

  if (cabinetButton || lineButton || backgroundButton || ornamentButton) {
    saveDecor();
    applyDecor();
  }
});
frameImageInput.addEventListener("change", async () => {
  const image = await readImage(frameImageInput.files?.[0]);
  if (!image) return;
  decor.frameImage = image;
  decor.ornaments.frame = true;
  saveDecor();
  applyDecor();
});
filterToggle.addEventListener("click", () => {
  isFilterOpen = !isFilterOpen;
  if (isFilterOpen) {
    isDecorOpen = false;
    renderDecorPanel();
  }
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
  if (event.key === "Escape" && cropState) {
    closeCropper({ resetInput: true });
    return;
  }
  if (event.key === "Escape" && viewerPostcard) {
    returnToCabinet();
  }
});
cropOverlay.addEventListener("pointerdown", handleCropPointerDown);
cropOverlay.addEventListener("pointermove", handleCropPointerMove);
cropOverlay.addEventListener("pointerup", handleCropPointerUp);
cropOverlay.addEventListener("pointercancel", handleCropPointerUp);
document.querySelector("#crop-cancel").addEventListener("click", () => closeCropper({ resetInput: true }));
document.querySelector("#crop-apply").addEventListener("click", applyCropper);
window.addEventListener("resize", () => {
  if (cropState) initializeCropCorners();
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
applyDecor();
renderDecorPanel();
renderTagOptions();
renderFilterOptions();
renderFilterState();
renderCabinet();
