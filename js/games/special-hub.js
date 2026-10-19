// Special Game Hub — modal chọn 6 game đặc biệt (không chứa game logic).
// Parent mount bằng openSpecialHub({ onSelect, onClose }) và load styles/games/special-hub.css.
// Thumbnails tách riêng + badges trong assets/games/special-hub/.
import { escapeHTML } from "../core.js";

export const SHB_BASE = "assets/games/special-hub";

export const SPECIAL_GAMES = [
  {
    id: "rescue_monkey",
    title: "Giải Cứu Khỉ",
    desc: "Trả lời đúng để Milo ném bom đẩy lùi Yeti.",
    thumb: `${SHB_BASE}/thumbnails/rescue_monkey.png`,
    badge: `${SHB_BASE}/ui/badge_arcade.png`,
    badgeLabel: "Arcade",
  },
  {
    id: "bird",
    title: "Chim Chăm Chỉ",
    desc: "Điều khiển chim bay qua cổng đáp án đúng.",
    thumb: `${SHB_BASE}/thumbnails/bird.png`,
    badge: `${SHB_BASE}/ui/badge_new.png`,
    badgeLabel: "Mới",
  },
  {
    id: "rice_shop",
    title: "Quán Cơm Tấm",
    desc: "Phục vụ khách, giữ thanh kiên nhẫn.",
    thumb: `${SHB_BASE}/thumbnails/rice_shop.png`,
    badge: `${SHB_BASE}/ui/badge_new.png`,
    badgeLabel: "Mới",
  },
  {
    id: "pho_anh_hai",
    title: "Phở Anh Hai",
    desc: "Quản lý xe phở pixel, nấu nước dùng và luyện từ vựng.",
    thumb: `${SHB_BASE}/thumbnails/pho_anh_hai.png`,
    badge: `${SHB_BASE}/ui/badge_new.png`,
    badgeLabel: "Mới",
  },
  {
    id: "translate",
    title: "Dịch Câu",
    desc: "Dịch nhanh Anh ↔ Việt ăn điểm combo.",
    thumb: `${SHB_BASE}/thumbnails/translate.png`,
    badge: `${SHB_BASE}/ui/badge_arcade.png`,
    badgeLabel: "Arcade",
  },
  {
    id: "sentence",
    title: "Đặt Câu",
    desc: "Sắp xếp từ thành câu đúng ngữ pháp.",
    thumb: `${SHB_BASE}/thumbnails/sentence.png`,
    badge: `${SHB_BASE}/ui/badge_prototype.png`,
    badgeLabel: "Thử nghiệm",
  },
  {
    id: "mixed",
    title: "Luyện Tổng Hợp",
    desc: "Trộn mọi dạng bài trong một phiên.",
    thumb: `${SHB_BASE}/thumbnails/mixed.png`,
    badge: `${SHB_BASE}/ui/badge_default.png`,
    badgeLabel: "Mặc định",
  },
];

export function getSpecialGame(id) {
  return SPECIAL_GAMES.find((game) => game.id === id) || null;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const state = {
  overlay: null,
  dialog: null,
  grid: null,
  closeBtn: null,
  prevFocus: null,
  onSelect: null,
  onClose: null,
  opened: false,
};

function cardHTML(game) {
  return `<button type="button" class="shb-card" data-game-id="${escapeHTML(game.id)}">`
    + `<span class="shb-thumb"><img src="${escapeHTML(game.thumb)}" alt="${escapeHTML(game.title)}" loading="lazy" decoding="async">`
    + `<span class="shb-badge"><img src="${escapeHTML(game.badge)}" alt="${escapeHTML(game.badgeLabel)}" loading="lazy" decoding="async"></span></span>`
    + `<span class="shb-body"><strong>${escapeHTML(game.title)}</strong><small>${escapeHTML(game.desc)}</small>`
    + `<span class="shb-cta">Chơi ngay <img src="${escapeHTML(SHB_BASE)}/ui/chevron.png" alt="" aria-hidden="true" loading="lazy" decoding="async"></span></span>`
    + `</button>`;
}

function buildOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "shb-overlay";
  overlay.hidden = true;
  overlay.innerHTML =
    `<div class="shb-backdrop" data-shb-close></div>`
    + `<div class="shb-dialog" role="dialog" aria-modal="true" aria-labelledby="shb-title">`
    + `<div class="shb-head">`
    + `<h2 id="shb-title"><img class="shb-head-icon" src="${escapeHTML(SHB_BASE)}/ui/gamepad_icon.png" alt="" aria-hidden="true" loading="lazy" decoding="async">Trò chơi đặc biệt</h2>`
    + `<button type="button" class="shb-close" data-shb-close aria-label="Đóng">✕</button>`
    + `</div>`
    + `<p class="shb-sub">7 mini game luyện từ — chọn một thẻ để bắt đầu.</p>`
    + `<div class="shb-grid">${SPECIAL_GAMES.map(cardHTML).join("")}</div>`
    + `</div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function focusableList() {
  if (!state.dialog) return [];
  return [...state.dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter((el) => !el.hidden && el.offsetParent !== null);
}

function handleKeyDown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeSpecialHub();
    return;
  }
  if (event.key !== "Tab" || !state.dialog) return;
  const items = focusableList();
  if (!items.length) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleClick(event) {
  const closer = event.target.closest("[data-shb-close]");
  if (closer) {
    closeSpecialHub();
    return;
  }
  const card = event.target.closest("[data-game-id]");
  if (!card || !state.overlay || !state.overlay.contains(card)) return;
  const gameId = card.dataset.gameId;
  const callback = state.onSelect;
  closeSpecialHub();
  if (typeof callback === "function") callback(gameId);
}

// Mở hub. onSelect(gameId) để parent route sang game tương ứng.
export function openSpecialHub({ onSelect, onClose } = {}) {
  if (typeof document === "undefined") return null;
  if (!state.overlay) {
    state.overlay = buildOverlay();
    state.dialog = state.overlay.querySelector(".shb-dialog");
    state.grid = state.overlay.querySelector(".shb-grid");
    state.closeBtn = state.overlay.querySelector(".shb-close");
    state.overlay.addEventListener("click", handleClick);
  }
  state.onSelect = typeof onSelect === "function" ? onSelect : null;
  state.onClose = typeof onClose === "function" ? onClose : null;
  if (!state.opened) {
    state.prevFocus = document.activeElement || null;
    state.opened = true;
  }
  state.overlay.hidden = false;
  document.addEventListener("keydown", handleKeyDown, true);
  const first = state.closeBtn || focusableList()[0];
  if (first && typeof first.focus === "function") first.focus();
  return state.overlay;
}

export function closeSpecialHub() {
  if (typeof document === "undefined") return;
  const callback = state.onClose;
  state.onSelect = null;
  state.onClose = null;
  if (state.overlay) state.overlay.hidden = true;
  document.removeEventListener("keydown", handleKeyDown, true);
  if (state.prevFocus && typeof state.prevFocus.focus === "function") {
    try {
      state.prevFocus.focus();
    } catch {
      // Bỏ qua: phần tử cũ có thể đã bị gỡ khỏi DOM.
    }
  }
  state.prevFocus = null;
  const wasOpened = state.opened;
  state.opened = false;
  if (wasOpened && typeof callback === "function") callback();
}

export function isSpecialHubOpen() {
  return state.opened;
}
