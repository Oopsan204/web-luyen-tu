import { buildMixedPlan, calculateSrs, computeStudyStats, escapeHTML, parseCSV, pickMixedVariant, shuffle, toCSV, uid } from "./core.js";
import * as coreModule from "./core.js";
import { deleteDeckCascade, getSnapshot, put, remove, replaceAll, resetDatabase, saveActivity, seedDatabase } from "./db.js";
import {
  openSpecialHub, closeSpecialHub,
  rmArenaHTML as moduleRmArenaHTML, rmPlay as moduleRmPlay, rmClearTimers as moduleRmClearTimers,
  mountDiligentBird, startDiligentBird, unmountDiligentBird,
  mountLearningGames, unmountLearningGames,
  mountRiceShop, startRiceShop, unmountRiceShop,
} from "./games/index.js";

const view = document.querySelector("#view");
const modal = document.querySelector("#modal");
const modalContent = document.querySelector("#modal-content");
const fileInput = document.querySelector("#import-file");
const titles = {
  dashboard: ["Tổng quan", "Chào mừng trở lại"], decks: ["Bộ từ vựng", "Thư viện của bạn"],
  deck: ["Chi tiết bộ từ", "Quản lý từ vựng"], vocabulary: ["Từ vựng", "Tất cả từ của bạn"],
  study: ["Học từ vựng", "Trung tâm luyện tập"], store: ["Cửa hàng", "Đổi coin lấy vật phẩm"],
  games: ["Trò chơi", "Học mà chơi"], game: ["Thử thách", "Giữ vững phong độ"],
  stats: ["Thống kê", "Tiến độ của bạn"], roadmap: ["Lộ trình", "Chinh phục từng cột mốc"],
};

let data = { decks: [], cards: [], activities: [], profile: {} };
let studySession = null;
let study = null;
let hubFilters = { deckId: "all", status: "all", order: "random", limit: "20" };
let importTargetDeck = null;
let searchTerm = "";
let vocabSearch = "";
let listenRate = 1;
let activeSpecialGame = null;
let activeSpecialStartedAt = 0;
let activeSpecialLayer = null;
let activeSpecialReturnHash = "#study";
try {
  const storedRate = Number(localStorage.getItem("luyen-tu-listen-rate"));
  if (storedRate === 0.7 || storedRate === 1) listenRate = storedRate;
} catch { /* private mode: giữ mặc định 1x */ }
const persistListenRate = (rate) => {
  try { localStorage.setItem("luyen-tu-listen-rate", String(rate)); } catch { /* bỏ qua */ }
};

const nowISO = () => new Date().toISOString();
const todayKey = (date = new Date()) => date.toLocaleDateString("en-CA");
const normKey = (v) => String(v || "").trim().toLocaleLowerCase("vi");
const normalize = (v) => normKey(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
const normAnswer = (v) => String(v || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
const currentRoute = () => {
  const raw = location.hash.slice(1) || "dashboard";
  const [name, query = ""] = raw.split("?");
  return { name: titles[name] ? name : "dashboard", params: new URLSearchParams(query) };
};
const deckById = (id) => data.decks.find((d) => d.id === id);
const deckLabel = (id) => (id === "all" || !id ? "Tất cả bộ" : deckById(id)?.name || "Bộ đã xóa");
const cardsForDeck = (id) => (!id || id === "all" ? [...data.cards] : data.cards.filter((c) => c.deckId === id));
const dueCards = (cards = data.cards, now = new Date()) => cards.filter((c) => !c.dueAt || new Date(c.dueAt) <= now);
const levelLabel = (l) => ({ new: "Mới", learning: "Đang học", mastered: "Đã thuộc" })[l] || "Mới";
const modeName = (m) => ({
  flashcard: "Flashcard", quiz: "Trắc nghiệm", match: "Nối từ", typing: "Gõ từ", listening: "Nghe viết", mixed: "Luyện tổng hợp",
  rescue_monkey: "Giải cứu khỉ", bird: "Chim Chăm Chỉ", rice_shop: "Quán cơm tấm", translate: "Dịch câu", sentence: "Luyện đặt câu",
})[m] || m;
const formatDate = (v) => { try { return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(v)); } catch { return ""; } };
const relativeTime = (v) => {
  const m = Math.floor((Date.now() - new Date(v).getTime()) / 60_000);
  if (!Number.isFinite(m) || m < 1) return "Vừa xong";
  if (m < 60) return `${m} phút trước`;
  if (m < 1440) return `${Math.floor(m / 60)} giờ trước`;
  if (m < 10080) return `${Math.floor(m / 1440)} ngày trước`;
  return formatDate(v);
};
const fmtDuration = (s) => { s = Math.max(0, Math.round(s || 0)); return s < 60 ? `${s} giây` : `${Math.floor(s / 60)} phút ${s % 60} giây`; };
function setSession(s) { studySession = s; study = s; }

// Lọc dùng chung: ưu tiên core.filterStudyCards khi worker đã merge, fallback local cùng chữ ký.
function localFilterStudyCards(cards, filters = {}, now = new Date(), random = Math.random) {
  const f = { deckId: "all", status: "all", order: "random", limit: "20", ...filters };
  let pool = (cards || []).filter((c) => f.deckId === "all" || !f.deckId || c.deckId === f.deckId);
  const t = new Date(now).getTime();
  if (f.status === "new") pool = pool.filter((c) => (c.repetitions || 0) === 0 && c.level !== "mastered");
  else if (f.status === "learning") pool = pool.filter((c) => (c.repetitions || 0) > 0 && c.level !== "mastered");
  else if (f.status === "unmastered") pool = pool.filter((c) => c.level !== "mastered");
  else if (f.status === "mastered") pool = pool.filter((c) => c.level === "mastered");
  else if (f.status === "due") pool = pool.filter((c) => !c.dueAt || new Date(c.dueAt).getTime() <= t);
  const byTerm = (a, b) => normKey(a.term).localeCompare(normKey(b.term), "vi");
  if (f.order === "az") pool = [...pool].sort(byTerm);
  else if (f.order === "za") pool = [...pool].sort((a, b) => byTerm(b, a));
  else if (f.order === "newest") pool = [...pool].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  else if (f.order === "oldest") pool = [...pool].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  else if (f.order === "hard") pool = [...pool].sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0) || (a.ease || 2.5) - (b.ease || 2.5));
  else if (f.order === "srs") pool = [...pool].sort((a, b) => new Date(a.dueAt || 0) - new Date(b.dueAt || 0));
  else { pool = [...pool]; for (let i = pool.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1));[pool[i], pool[j]] = [pool[j], pool[i]]; } }
  if (f.limit !== "all") { const n = Math.max(1, Number(f.limit) || 20); pool = pool.slice(0, n); }
  return pool;
}
const filterFn = (...a) => (typeof coreModule.filterStudyCards === "function" ? coreModule.filterStudyCards(...a) : localFilterStudyCards(...a));
const hubCards = (over = {}) => filterFn(data.cards, { ...hubFilters, ...over }, new Date(), Math.random);

async function reload(render = true) {
  data = await getSnapshot();
  if (!data.profile.inventory) data.profile.inventory = [];
  updateChrome();
  if (render) renderRoute();
}
function updateChrome() {
  document.querySelector("#top-streak").textContent = data.profile.streak || 0;
  document.querySelector("#top-xp").textContent = data.profile.xp || 0;
  document.querySelector("#top-coins").textContent = data.profile.coins || 0;
  document.querySelector("#sidebar-streak").textContent = `${data.profile.streak || 0} ngày liên tiếp`;
}
function setPage(name) {
  const [title, eyebrow] = titles[name] || titles.dashboard;
  document.querySelector("#page-title").textContent = title;
  document.querySelector("#page-eyebrow").textContent = eyebrow;
  document.querySelectorAll("[data-nav]").forEach((l) => l.classList.toggle("active",
    l.dataset.nav === name || (name === "deck" && l.dataset.nav === "decks") || (name === "game" && l.dataset.nav === "games")));
}
function renderRoute() {
  stopSpecialGame();
  closeSpecialHub();
  rmClear();
  const route = currentRoute();
  setPage(route.name);
  document.querySelector(".sidebar").classList.remove("open");
  if (route.name === "dashboard") renderDashboard();
  else if (route.name === "decks") renderDecks();
  else if (route.name === "deck") renderDeckDetail(route.params.get("id"));
  else if (route.name === "vocabulary") renderVocabulary();
  else if (route.name === "study") renderStudyEntry(route.params);
  else if (route.name === "store") renderStore();
  else if (route.name === "games") renderGames();
  else if (route.name === "game") renderGameAlias(route.params);
  else if (route.name === "stats") renderStats();
  else if (route.name === "roadmap") renderRoadmap();
  window.scrollTo({ top: 0 });
}
function metric(icon, value, label) {
  return `<article class="card metric"><span class="metric-icon" aria-hidden="true">${icon}</span><strong>${escapeHTML(String(value))}</strong><small>${escapeHTML(label)}</small></article>`;
}
function deckCard(deck) {
  const cards = cardsForDeck(deck.id);
  const learned = cards.filter((c) => (c.repetitions || 0) > 0).length;
  const progress = cards.length ? Math.round((learned / cards.length) * 100) : 0;
  return `<a class="card deck-card" href="#deck?id=${encodeURIComponent(deck.id)}"><div class="deck-top"><span class="deck-icon" aria-hidden="true">${escapeHTML(deck.icon || "📚")}</span><span class="badge">${progress}%</span></div><h3>${escapeHTML(deck.name)}</h3><p>${escapeHTML(deck.description || "Bộ từ vựng của bạn")}</p><div class="progress" aria-hidden="true"><span style="width:${progress}%"></span></div><div class="deck-meta"><span>${cards.length} từ</span><span>${dueCards(cards).length} đến hạn</span></div></a>`;
}
function empty(title, text) {
  return `<div class="card empty"><div class="empty-icon" aria-hidden="true">📚</div><strong>${escapeHTML(title)}</strong><p>${escapeHTML(text)}</p></div>`;
}

function renderDashboard() {
  const stats = computeStudyStats(data.cards, data.activities);
  const todayActivities = data.activities.filter((a) => todayKey(new Date(a.createdAt)) === todayKey());
  const learnedToday = todayActivities.filter((a) => a.type === "study" || a.type === "review").length;
  const goal = Math.min(100, Math.round((learnedToday / Math.max(1, data.profile.dailyGoal || 10)) * 100));
  const recentDecks = data.decks.slice(0, 3);
  view.innerHTML = `
  <section class="hero"><div class="hero-content"><p class="eyebrow">Mỗi ngày tiến một bước</p>
  <h2>${stats.due ? `${stats.due} từ đang chờ bạn ôn tập` : "Bạn đã hoàn thành lượt ôn hôm nay!"}</h2>
  <p>SRS tự động sắp xếp đúng từ, đúng lúc để bạn ghi nhớ lâu hơn mà không học quá tải.</p>
  <div class="actions"><a class="btn btn-primary" href="#study">Vào trung tâm học từ vựng</a><a class="btn" href="#study?srs=1">Ôn từ đến hạn</a></div></div></section>
  <section class="section grid grid-4">
  ${metric("🔥", data.profile.streak || 0, "Ngày liên tiếp")}${metric("⚡", data.profile.xp || 0, "Tổng XP")}
  ${metric("◫", stats.learned, "Từ đã học")}${metric("✓", stats.mastered, "Từ đã thuộc")}</section>
  <section class="section grid grid-2">
  <article class="card goal-row"><div><p class="eyebrow">Mục tiêu hôm nay</p><h2>${learnedToday}/${data.profile.dailyGoal || 10} lượt ôn</h2><p>Duy trì nhịp học đều đặn để tăng streak.</p><button class="btn btn-soft btn-small" data-action="edit-goal">Đổi mục tiêu</button></div><div class="goal-ring" style="--value:${goal}%" role="img" aria-label="Hoàn thành ${goal} phần trăm"><strong>${goal}%</strong></div></article>
  <article class="card"><div class="section-title"><h2>Gợi ý tiếp theo</h2><a href="#games">Xem tất cả</a></div>
  <div class="activity"><span class="activity-icon" aria-hidden="true">◆</span><div><strong>Luyện tổng hợp</strong><small>Trắc nghiệm, gõ từ, nghe viết và flashcard</small></div><button class="btn btn-small btn-primary" data-action="start-game" data-mode="mixed">Bắt đầu</button></div>
  <div class="activity"><span class="activity-icon" aria-hidden="true">◫</span><div><strong>Ôn từ đến hạn</strong><small>${stats.due} từ cần củng cố</small></div><a class="btn btn-small" href="#study?srs=1">Ôn ngay</a></div></article></section>
  <section class="section"><div class="section-title"><h2>Bộ từ gần đây</h2><a href="#decks">Xem tất cả →</a></div><div class="grid grid-3">${recentDecks.length ? recentDecks.map(deckCard).join("") : empty("Chưa có bộ từ", "Tạo bộ đầu tiên để bắt đầu.")}</div></section>`;
}

function renderDecks() {
  const totalDue = dueCards().length;
  view.innerHTML = `<div class="page-head"><div><h2>Thư viện của bạn</h2><p>${data.decks.length} bộ · ${data.cards.length} từ · ${totalDue} từ đến hạn</p></div><div class="actions"><button class="btn" data-action="import" data-target="">⇧ Import</button><button class="btn" data-action="export-json">⇩ Backup JSON</button><button class="btn btn-primary" data-action="new-deck">＋ Tạo bộ mới</button></div></div>
  <div class="grid deck-grid">${data.decks.map(deckCard).join("")}${data.decks.length ? "" : empty("Chưa có bộ từ", "Hãy tạo bộ từ đầu tiên hoặc import dữ liệu.")}</div>`;
}

function renderDeckDetail(id) {
  const deck = deckById(id);
  if (!deck) { location.hash = "#decks"; return; }
  const allCards = cardsForDeck(id);
  const cards = allCards.filter((c) => normalize(`${c.term} ${c.meaning}`).includes(normalize(searchTerm)));
  view.innerHTML = `<div class="page-head"><div><a href="#decks">← Bộ từ</a><h2>${escapeHTML(deck.icon || "📚")} ${escapeHTML(deck.name)}</h2><p>${escapeHTML(deck.description || "Không có mô tả")} · ${allCards.length} từ</p></div>
  <div class="actions"><button class="btn" data-action="edit-deck" data-id="${escapeHTML(id)}">Sửa bộ</button><button class="btn" data-action="import" data-target="${escapeHTML(id)}">Import</button><button class="btn" data-action="export-csv" data-id="${escapeHTML(id)}">Export CSV</button><a class="btn btn-soft" href="#study?deck=${encodeURIComponent(id)}">Học bộ này</a><button class="btn btn-primary" data-action="new-card" data-deck="${escapeHTML(id)}">＋ Thêm từ</button></div></div>
  <section class="card"><div class="section-title"><div class="search"><input id="card-search" value="${escapeHTML(searchTerm)}" placeholder="Tìm từ hoặc nghĩa…" aria-label="Tìm trong bộ từ"></div><span class="badge">${cards.length} kết quả</span></div>
  ${cards.length ? `<div class="table-wrap"><table><thead><tr><th>Từ vựng</th><th>Nghĩa</th><th>Trạng thái</th><th>Ôn tiếp</th><th></th></tr></thead><tbody>${cards.map((c) => `<tr><td><strong>${escapeHTML(c.term)}</strong><small>${escapeHTML(c.pronunciation || "")}</small></td><td>${escapeHTML(c.meaning)}<small>${escapeHTML(c.example || "")}</small></td><td><span class="badge ${escapeHTML(c.level || "new")}">${levelLabel(c.level)}</span></td><td>${(!c.dueAt || new Date(c.dueAt) <= new Date()) ? "Bây giờ" : formatDate(c.dueAt)}</td><td><div class="table-actions"><button class="btn btn-small btn-icon" data-action="speak" data-text="${escapeHTML(c.term)}" aria-label="Phát âm ${escapeHTML(c.term)}">♬</button><button class="btn btn-small" data-action="edit-card" data-id="${escapeHTML(c.id)}">Sửa</button><button class="btn btn-small btn-danger" data-action="delete-card" data-id="${escapeHTML(c.id)}">Xóa</button></div></td></tr>`).join("")}</tbody></table></div>` : empty("Không có từ phù hợp", "Thử từ khóa khác hoặc thêm từ mới.")}</section>
  <div class="section"><button class="btn btn-danger" data-action="delete-deck" data-id="${escapeHTML(id)}">Xóa bộ từ này</button></div>`;
}

function renderVocabulary() {
  const deckId = new URLSearchParams(location.hash.split("?")[1] || "").get("deck") || "all";
  const pool = cardsForDeck(deckId).filter((c) => normalize(`${c.term} ${c.meaning} ${c.example || ""}`).includes(normalize(vocabSearch)));
  const shown = pool.slice(0, 80);
  view.innerHTML = `<div class="page-head"><div><h2>Tất cả từ vựng</h2><p>${pool.length} từ${deckId === "all" ? "" : ` trong ${escapeHTML(deckLabel(deckId))}`}</p></div></div>
  <section class="card"><div class="grid grid-2">
  <label>Tìm kiếm<input id="vocab-search" value="${escapeHTML(vocabSearch)}" placeholder="Tìm từ, nghĩa hoặc ví dụ…"></label>
  <label>Bộ từ<select id="vocab-deck" aria-label="Lọc theo bộ từ"><option value="all">Tất cả bộ từ</option>${data.decks.map((d) => `<option value="${escapeHTML(d.id)}" ${d.id === deckId ? "selected" : ""}>${escapeHTML(d.name)}</option>`).join("")}</select></label></div></section>
  <section class="section vocab-list">${shown.length ? shown.map((c) => `<article class="card vocab-item"><div><strong>${escapeHTML(c.term)}</strong> <small>${escapeHTML(c.pronunciation || "")}</small><p>${escapeHTML(c.meaning)}</p>${c.example ? `<small>${escapeHTML(c.example)}</small>` : ""}</div><span class="badge ${escapeHTML(c.level || "new")}">${levelLabel(c.level)}</span><button class="btn btn-small btn-icon" data-action="speak" data-text="${escapeHTML(c.term)}" aria-label="Phát âm ${escapeHTML(c.term)}">♬</button></article>`).join("") : empty("Chưa có từ", "Thêm từ vào bộ từ vựng để bắt đầu.")}</section>
  ${pool.length > shown.length ? `<p class="hub-count">Đang hiển thị ${shown.length}/${pool.length} từ.</p>` : ""}`;
}

const storeItems = [
  { id: "title_scholar", name: "Danh hiệu Học giả", price: 80, icon: "🎓" },
  { id: "title_master", name: "Danh hiệu Bậc thầy từ vựng", price: 160, icon: "🏆" },
  { id: "title_streak", name: "Danh hiệu Bền bỉ", price: 120, icon: "🔥" },
  { id: "title_explorer", name: "Danh hiệu Nhà thám hiểm", price: 100, icon: "🧭" },
];

function renderStore() {
  const owned = new Set(data.profile.inventory || []);
  const equipped = data.profile.equipped || "";
  view.innerHTML = `<div class="page-head"><div><h2>Cửa hàng local</h2><p>Đổi coin kiếm được khi học lấy danh hiệu hiển thị trên hồ sơ. Không có thanh toán thật.</p></div><span class="badge coin">● ${data.profile.coins || 0} coin</span></div>
  <div class="grid store-grid">${storeItems.map((item) => {
    const has = owned.has(item.id);
    const canBuy = (data.profile.coins || 0) >= item.price;
    return `<article class="card store-card"><span class="mode-icon" aria-hidden="true" style="font-size:34px">${item.icon}</span><h3>${escapeHTML(item.name)}</h3><p class="price">${item.price} coin</p>
    ${has ? `<button class="btn ${equipped === item.id ? "btn-soft" : "btn-primary"}" data-action="equip-item" data-id="${escapeHTML(item.id)}" ${equipped === item.id ? "disabled" : ""}>${equipped === item.id ? "Đang dùng" : "Trang bị"}</button>` : `<button class="btn btn-primary" data-action="buy-item" data-id="${escapeHTML(item.id)}" ${canBuy ? "" : "disabled"}>Mua ngay</button>`}</article>`;
  }).join("")}</div>`;
}

function applyEquip(itemId) {
  const avatar = document.querySelector(".avatar");
  const item = storeItems.find((i) => i.id === itemId);
  avatar.title = item ? item.name : "";
}

/* ---------- Toast, modal, giọng nói ---------- */
function toast(message, tone = "") {
  const region = document.querySelector("#toast-region");
  if (!region) return;
  const el = document.createElement("div");
  el.className = `toast ${tone}`.trim();
  el.textContent = message;
  region.append(el);
  setTimeout(() => el.remove(), 3200);
}

function openModal(html) {
  modalContent.innerHTML = html;
  modal.hidden = false;
  const focusable = modalContent.querySelector("input, select, textarea, button");
  if (focusable) focusable.focus();
}

function closeModal() {
  modal.hidden = true;
  modalContent.innerHTML = "";
}

const speechSupported = () =>
  typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";

function speak(text, rate = 1) {
  const term = String(text || "").trim();
  if (!term || !speechSupported()) return false;
  try {
    window.speechSynthesis.cancel();
    const utter = new window.SpeechSynthesisUtterance(term);
    utter.lang = "en-US";
    utter.rate = rate;
    window.speechSynthesis.speak(utter);
    return true;
  } catch {
    return false;
  }
}

/* ---------- Metadata chế độ học ---------- */
const MODES = [
  { id: "flashcard", label: "Flashcard", icon: "🃏", desc: "Lật thẻ để xem nghĩa, tự chấm theo 4 mức SRS." },
  { id: "quiz", label: "Trắc nghiệm", icon: "◎", desc: "Chọn nghĩa đúng trong 4 đáp án." },
  { id: "match", label: "Nối từ với nghĩa", icon: "⇄", desc: "Ghép từ với nghĩa, cặp đúng được khóa." },
  { id: "typing", label: "Gõ từ vựng", icon: "⌨", desc: "Nhìn nghĩa và gõ lại từ, có gợi ý chữ cái đầu." },
  { id: "listening", label: "Nghe viết", icon: "♬", desc: "Nghe phát âm rồi gõ lại từ, tốc độ 0.7x hoặc 1x." },
  { id: "mixed", label: "Luyện tổng hợp", icon: "◆", desc: "Trộn trắc nghiệm, gõ từ, nghe viết, nối từ và flashcard.", badge: "Đề xuất" },
];
const modeMeta = (id) => MODES.find((m) => m.id === id) || MODES[0];
const XP_PER_CORRECT = 5;
const COIN_PER_CORRECT = 1;
const AGAIN_XP = 1;
const RATINGS = [["again", "Quên"], ["hard", "Khó"], ["good", "Tốt"], ["easy", "Dễ"]];
const STATUS_OPTIONS = [["all", "Tất cả"], ["new", "Chưa học"], ["learning", "Đang học"], ["unmastered", "Chưa thuộc"], ["mastered", "Đã thuộc"], ["due", "Đến hạn ôn"]];
const ORDER_OPTIONS = [["random", "Ngẫu nhiên"], ["az", "A → Z"], ["za", "Z → A"], ["newest", "Mới nhất"], ["oldest", "Cũ nhất"], ["hard", "Ưu tiên từ khó"], ["srs", "Ưu tiên SRS"]];
const LIMIT_OPTIONS = [["10", "10 từ"], ["20", "20 từ"], ["30", "30 từ"], ["50", "50 từ"], ["all", "Tất cả"]];

const selectOptions = (options, value) =>
  options.map(([val, label]) => `<option value="${escapeHTML(val)}" ${String(value) === val ? "selected" : ""}>${escapeHTML(label)}</option>`).join("");

/* ---------- Lịch sử học ---------- */
function historyPanel(limit = 8) {
  const items = [...data.activities]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, limit);
  if (!items.length) {
    return `<div class="card empty"><div class="empty-icon" aria-hidden="true">🕘</div><strong>Chưa có lượt học nào</strong><p>Hoàn thành một chế độ học để lịch sử xuất hiện tại đây.</p></div>`;
  }
  return `<div class="card history-panel"><ul class="history-list">${items.map((item) => {
    const total = Number(item.total) || (Number(item.correct) || 0) + (Number(item.wrong) || 0);
    const answered = (Number(item.correct) || 0) + (Number(item.wrong) || 0);
    const accuracy = item.accuracy != null ? item.accuracy : answered ? Math.round(((Number(item.correct) || 0) / answered) * 100) : 0;
    return `<li class="history-item"><span class="history-icon" aria-hidden="true">◆</span>
    <div><strong>${escapeHTML(modeName(item.mode || item.type))} · ${escapeHTML(item.deckName || deckLabel(item.deckId))}</strong>
    <small>${escapeHTML(String(total))} từ · đúng ${escapeHTML(String(accuracy))}% · ${escapeHTML(fmtDuration(item.duration))} · ${escapeHTML(relativeTime(item.createdAt))}</small></div>
    <span class="history-reward">+${Number(item.xp) || 0} XP · +${Number(item.coins) || 0} ●</span></li>`;
  }).join("")}</ul></div>`;
}

/* ---------- Study hub ---------- */
function modeCard(meta) {
  return `<article class="card mode-card mode-${meta.id}">
  <span class="mode-icon" aria-hidden="true">${escapeHTML(meta.icon)}</span>
  ${meta.badge ? `<span class="mode-badge">${escapeHTML(meta.badge)}</span>` : ""}
  <h3>${escapeHTML(meta.label)}</h3><p>${escapeHTML(meta.desc)}</p>
  <button class="btn btn-primary btn-small" data-action="start-mode" data-mode="${escapeHTML(meta.id)}">Bắt đầu</button></article>`;
}

function specialHubLauncher() {
  const base = "assets/games/special-hub/thumbnails/";
  return `<article class="card special-hub-launcher">
    <div class="special-hub-copy"><p class="eyebrow">Arcade học từ</p><h2>Đặc Biệt</h2>
    <p>Vào các mini-game dùng chính bộ từ đang lọc: Giải cứu khỉ, Chim Chăm Chỉ, Quán cơm tấm, Dịch câu và Đặt câu.</p>
    <button class="btn btn-primary" type="button" data-action="open-special-hub">Mở danh sách trò chơi</button></div>
    <div class="special-hub-thumbs" aria-hidden="true">
      <img src="${base}rescue_monkey.png" alt=""><img src="${base}bird.png" alt="">
      <img src="${base}rice_shop.png" alt=""><img src="${base}translate.png" alt="">
    </div></article>`;
}

function renderStudyEntry(params = new URLSearchParams()) {
  const deckParam = params.get("deck");
  if (deckParam && (deckParam === "all" || deckById(deckParam))) hubFilters.deckId = deckParam;
  const ready = hubCards();
  const due = hubCards({ status: "due", limit: "all" });
  view.innerHTML = `
  <div class="page-head"><div><h2>Trung tâm học từ vựng</h2><p>Chọn bộ lọc rồi vào một trong sáu chế độ. Mọi chế độ dùng chung đúng tập từ đang hiển thị.</p></div><span class="badge" id="hub-ready">${ready.length} từ sẵn sàng</span></div>
  <div class="hub">
  <section class="section hub-filters" aria-label="Bộ lọc phiên học">
  <label class="filter-card"><span>Bộ từ vựng</span><select id="hub-deck">${selectOptions([["all", "Tất cả bộ từ"], ...data.decks.map((deck) => [deck.id, deck.name])], hubFilters.deckId)}</select></label>
  <label class="filter-card"><span>Trạng thái</span><select id="hub-status">${selectOptions(STATUS_OPTIONS, hubFilters.status)}</select></label>
  <label class="filter-card"><span>Thứ tự</span><select id="hub-order">${selectOptions(ORDER_OPTIONS, hubFilters.order)}</select></label>
  <label class="filter-card"><span>Số lượng</span><select id="hub-limit">${selectOptions(LIMIT_OPTIONS, hubFilters.limit)}</select></label>
  </section>
  <section class="section"><div class="section-title"><h2>Sáu chế độ học</h2><small id="hub-mode-count">${ready.length} từ theo bộ lọc hiện tại</small></div><div class="mode-grid">${MODES.map(modeCard).join("")}</div></section>
  <section class="section">${specialHubLauncher()}</section>
  <section class="section srs-banner">
  <div class="srs-copy"><p class="eyebrow">Ôn tập ngắt quãng (SRS)</p><h2>${due.length} từ đến hạn</h2><p>Hệ thống tự nhắc lại các từ sắp quên để bạn nhớ lâu hơn mà không học quá tải.</p></div>
  <div class="srs-actions"><strong class="srs-count" aria-hidden="true">${due.length}</strong><button class="btn btn-primary" data-action="start-srs" ${due.length ? "" : "disabled"}>Bắt đầu ôn tập</button></div></section>
  <section class="section"><div class="section-title"><h2>Lịch sử học</h2><a href="#stats">Thống kê chi tiết →</a></div>${historyPanel(6)}</section>
  <section class="section" id="study-stage" aria-live="polite"></section></div>`;
  if (params.get("srs")) startMode("flashcard", { srs: true, quiet: true });
  else if (params.get("mode")) startMode(params.get("mode"), { quiet: true });
  else if (params.get("special")) launchSpecialGame(params.get("special")).catch(console.error);
}

function onHubFilterChange(target) {
  rmClear();
  const key = { "hub-deck": "deckId", "hub-status": "status", "hub-order": "order", "hub-limit": "limit" }[target.id];
  if (!key) return;
  hubFilters = { ...hubFilters, [key]: target.value };
  const ready = hubCards();
  const readyBadge = document.querySelector("#hub-ready");
  const modeCount = document.querySelector("#hub-mode-count");
  if (readyBadge) readyBadge.textContent = `${ready.length} từ sẵn sàng`;
  if (modeCount) modeCount.textContent = `${ready.length} từ theo bộ lọc hiện tại`;
  const due = hubCards({ status: "due", limit: "all" });
  const srsHeading = document.querySelector(".srs-banner h2");
  const srsCount = document.querySelector(".srs-count");
  const srsButton = document.querySelector('[data-action="start-srs"]');
  if (srsHeading) srsHeading.textContent = `${due.length} từ đến hạn`;
  if (srsCount) srsCount.textContent = String(due.length);
  if (srsButton) srsButton.toggleAttribute("disabled", !due.length);
  if (studySession?.playing) {
    studySession = null;
    study = null;
    const stage = document.querySelector("#study-stage");
    if (stage) stage.innerHTML = "";
  }
}

/* ---------- Phiên học dùng chung ---------- */
const stageEl = () => document.querySelector("#immersive-study-stage") || document.querySelector("#study-stage");
let studyTimerId = null;
function startStudyTimer() {
  if (studyTimerId) clearInterval(studyTimerId);
  studyTimerId = setInterval(() => {
    const s = studySession;
    if (!s || !s.playing) {
      clearInterval(studyTimerId);
      studyTimerId = null;
      return;
    }
    if (s.timerSec > 0) {
      s.timerSec -= 1;
      const secEl = document.querySelector(".study-hud-timer-sec");
      if (secEl) secEl.textContent = `${s.timerSec}s`;
      const badgeEl = document.querySelector(".study-timer-badge");
      if (badgeEl && !badgeEl.textContent.includes("SRS")) badgeEl.textContent = `⏱ ${s.timerSec}S`;
    }
  }, 1000);
}

function setSiteShellInert(inert) {
  for (const selector of ["#app-shell", ".bottom-nav"]) {
    const el = document.querySelector(selector);
    if (!el) continue;
    el.inert = Boolean(inert);
    if (inert) el.setAttribute("aria-hidden", "true");
    else el.removeAttribute("aria-hidden");
  }
}

function stopSpecialGame() {
  if (studyTimerId) { clearInterval(studyTimerId); studyTimerId = null; }
  if (activeSpecialGame === "bird") unmountDiligentBird();
  else if (activeSpecialGame === "rice_shop") unmountRiceShop();
  else if (activeSpecialGame === "translate" || activeSpecialGame === "sentence") unmountLearningGames();
  activeSpecialLayer?.remove();
  document.querySelector("#immersive-game-layer")?.remove();
  activeSpecialLayer = null;
  document.body.classList.remove("rice-shop-immersive", "special-game-immersive");
  setSiteShellInert(false);
  activeSpecialGame = null;
  activeSpecialStartedAt = 0;
}

function immersiveGameShell(title, gameId, { studyStage = false } = {}) {
  document.querySelector("#immersive-game-layer")?.remove();
  const layer = document.createElement("section");
  layer.id = "immersive-game-layer";
  layer.className = `immersive-game-layer game-${gameId}`;
  layer.dataset.game = gameId;
  layer.setAttribute("role", "application");
  layer.setAttribute("aria-label", title);
  const rootId = studyStage ? "immersive-study-stage" : "immersive-game-root";
  const rootClass = studyStage ? "immersive-game-root immersive-study-stage" : "immersive-game-root";
  layer.innerHTML = `<button class="immersive-game-exit" type="button" data-action="exit-special-game" aria-label="Thoát trò chơi">✕ <span>Thoát</span></button>
    <div id="${rootId}" class="${rootClass}"></div>`;
  document.body.appendChild(layer);
  activeSpecialLayer = layer;
  document.body.classList.add("special-game-immersive");
  document.body.classList.toggle("rice-shop-immersive", gameId === "rice_shop");
  setSiteShellInert(true);
  layer.focus?.();
  return layer.querySelector(`#${rootId}`);
}

function rescueModeSelectHTML() {
  return `<section class="immersive-mode-select rescue-mode-select">
    <div class="immersive-mode-card">
      <p class="eyebrow">Giải cứu khỉ</p>
      <h2>Chọn cách chơi</h2>
      <p>Trả lời đúng để Milo ném bom đẩy Yeti lùi lại.</p>
      <div class="immersive-mode-grid">
        <button class="immersive-mode-option rescue-choice quiz" type="button" data-action="start-rescue-special" data-mode="quiz">
          <strong>Trắc nghiệm</strong><small>Chọn nghĩa đúng · Yeti gây áp lực nhanh hơn.</small>
        </button>
        <button class="immersive-mode-option rescue-choice typing" type="button" data-action="start-rescue-special" data-mode="typing">
          <strong>Gõ từ</strong><small>Nhìn nghĩa và gõ từ tiếng Anh.</small>
        </button>
      </div>
    </div>
  </section>`;
}

async function recordSpecialResult(gameId, summary = {}) {
  const correct = Math.max(0, Number(summary.correct ?? summary.served) || 0);
  const wrong = Math.max(0, Number(summary.wrong ?? summary.lost) || 0);
  const total = Math.max(correct + wrong, Number(summary.total) || 0);
  const accuracy = summary.accuracy != null
    ? Math.round(Number(summary.accuracy) || 0)
    : summary.satisfaction != null
      ? Math.round((Number(summary.satisfaction) || 0) * 100)
      : total ? Math.round((correct / total) * 100) : 0;
  const xp = Math.max(0, correct * XP_PER_CORRECT);
  const coins = gameId === "rice_shop"
    ? Math.max(0, Math.min(50, Math.round((Number(summary.coins) || 0) / 10)))
    : Math.max(0, correct);
  const startedAt = activeSpecialStartedAt ? new Date(activeSpecialStartedAt).toISOString() : nowISO();
  const duration = activeSpecialStartedAt ? Math.max(1, Math.round((Date.now() - activeSpecialStartedAt) / 1000)) : 0;
  await saveActivity({
    type: "study", mode: gameId, deckId: hubFilters.deckId, deckName: deckLabel(hubFilters.deckId),
    total, correct, wrong, accuracy, duration, startedAt, xp, coins, sessionXp: xp, sessionCoins: coins,
    detail: `${modeName(gameId)} ${correct}/${total || correct + wrong}`,
  });
  activeSpecialStartedAt = Date.now();
  await reload(false);
  toast(`${modeName(gameId)}: +${xp} XP · +${coins} coin.`);
}

function specialStageShell(title) {
  const stage = stageEl();
  if (!stage) return null;
  stage.innerHTML = `<div class="special-stage-shell">
    <div class="special-stage-toolbar"><div><p class="eyebrow">Trò chơi đặc biệt</p><h2>${escapeHTML(title)}</h2></div>
    <button class="btn" type="button" data-action="exit-special-game">← Về trung tâm học</button></div>
    <div id="special-game-root"></div></div>`;
  return stage.querySelector("#special-game-root");
}

async function launchSpecialGame(gameId) {
  closeSpecialHub();
  stopSpecialGame();
  const cards = hubCards();

  if (gameId === "rescue_monkey" && cards.length < 4) return toast("Cần ít nhất 4 từ theo bộ lọc để chơi Giải cứu khỉ.", "warn");
  if (gameId === "bird" && cards.length < 4) return toast("Cần ít nhất 4 từ theo bộ lọc để chơi Chim Chăm Chỉ.", "warn");
  if (gameId === "rice_shop" && cards.length < 2) return toast("Cần ít nhất 2 từ theo bộ lọc để mở Quán cơm tấm.", "warn");
  if (!cards.length) return toast("Không có từ nào khớp bộ lọc hiện tại.", "warn");

  activeSpecialReturnHash = location.hash && !location.hash.includes("special=") ? location.hash : "#study";
  const usesStudyEngine = gameId === "rescue_monkey" || gameId === "mixed";
  const root = immersiveGameShell(modeName(gameId), gameId, { studyStage: usesStudyEngine });
  if (!root) return;

  activeSpecialGame = gameId;
  activeSpecialStartedAt = Date.now();
  const finish = (summary) => { recordSpecialResult(gameId, summary).catch(console.error); };

  if (gameId === "rescue_monkey") {
    root.innerHTML = rescueModeSelectHTML();
    return;
  }
  if (gameId === "mixed") {
    startMode("mixed", { specialMode: "mixed" });
    return;
  }
  if (gameId === "bird") {
    mountDiligentBird(root, { cards, limit: Math.min(cards.length, 20), onFinish: finish });
    startDiligentBird();
  } else if (gameId === "rice_shop") {
    mountRiceShop(root, { cards, onFinish: finish });
    startRiceShop();
  } else if (gameId === "translate" || gameId === "sentence") {
    mountLearningGames(root, { mode: gameId, cards, onFinish: finish });
  }
}

function openSpecialGames() {
  openSpecialHub({
    onSelect: (gameId) => { launchSpecialGame(gameId).catch((error) => { console.error(error); toast("Không mở được trò chơi.", "warn"); }); },
  });
}

function sessionChrome() {
  const s = studySession;
  if (!s) return "";
  const totalRounds = s.mode === "match" ? Math.max(1, Math.ceil(s.total / 8)) : s.total;
  const currentRound = s.mode === "match" ? Math.min(Math.floor(s.index / 8) + 1, totalRounds) : Math.min(s.index + 1, s.total);
  const roundPillText = s.mode === "match" ? `VÒNG ${currentRound}/${totalRounds}` : `CÂU ${Math.min(s.index + 1, s.total)}/${s.total}`;
  const roundMatched = s.matched ? s.matched.length : 0;
  const roundSize = s.matchCards ? s.matchCards.length : Math.min(8, s.total);
  const totalMatched = s.totalMatchedCards || (s.mode === "match" ? roundMatched : s.correct);
  const statusText = s.mode === "match"
    ? `Đã ghép ${roundMatched} / ${roundSize} · tổng ${totalMatched}/${s.total}`
    : `Đúng ${s.correct}/${s.total} · ${escapeHTML(s.deckName)}`;
  const progressPct = Math.min(100, Math.round(((s.mode === "match" ? totalMatched : s.index) / Math.max(1, s.total)) * 100));
  const timerSec = s.timerSec ?? 28;

  return `<header class="study-game-hud">
    <div class="study-hud-top">
      <div class="study-hud-meta">
        <span class="study-hud-round-pill">${roundPillText}</span>
        <span class="study-hud-status">${statusText}</span>
      </div>
      <div class="study-hud-actions">
        <button class="study-hud-btn" type="button" data-action="restart-current-mode">↻ Chơi lại</button>
        <button class="study-hud-btn" type="button" data-action="exit-special-game">Thoát</button>
      </div>
    </div>
    <div class="study-hud-bottom">
      <span class="study-hud-coin">🪙 ~${s.coins} GAME</span>
      <span class="study-hud-timer-sec">${timerSec}s</span>
      <div class="study-hud-bar"><span class="study-hud-fill" style="width:${progressPct}%"></span></div>
    </div>
    <div class="session-bar" style="display:none;" aria-hidden="true">
      <span class="session-chip">${escapeHTML(modeName(s.mode))}${s.srs ? " · SRS" : ""}</span>
      <span class="session-chip">${escapeHTML(s.deckName)}</span>
      <span class="session-chip" id="session-progress">${Math.min(s.index + 1, s.total)}/${s.total}</span>
      <span class="session-chip" id="session-combo">Combo ${s.combo}</span>
      <span class="session-chip coin" id="session-coins">● ${s.coins}</span>
      <span class="session-chip" id="session-xp">⚡ ${s.xp}</span>
      <button class="btn btn-small" data-action="end-session">Kết thúc</button>
    </div>
  </header>`;
}

function refreshChrome() {
  const s = studySession;
  if (!s) return;
  const setText = (id, text) => {
    const el = document.querySelector(`#${id}`);
    if (el) el.textContent = text;
  };
  setText("session-progress", `${Math.min(s.index + 1, s.total)}/${s.total}`);
  setText("session-combo", `Combo ${s.combo}`);
  setText("session-coins", `● ${s.coins}`);
  setText("session-xp", `⚡ ${s.xp}`);

  const totalRounds = s.mode === "match" ? Math.max(1, Math.ceil(s.total / 8)) : s.total;
  const currentRound = s.mode === "match" ? Math.min(Math.floor(s.index / 8) + 1, totalRounds) : Math.min(s.index + 1, s.total);
  const roundPill = document.querySelector(".study-hud-round-pill");
  if (roundPill) roundPill.textContent = s.mode === "match" ? `VÒNG ${currentRound}/${totalRounds}` : `CÂU ${Math.min(s.index + 1, s.total)}/${s.total}`;

  const statusEl = document.querySelector(".study-hud-status");
  if (statusEl) {
    const roundMatched = s.matched ? s.matched.length : 0;
    const roundSize = s.matchCards ? s.matchCards.length : Math.min(8, s.total);
    const totalMatched = s.totalMatchedCards || (s.mode === "match" ? roundMatched : s.correct);
    statusEl.textContent = s.mode === "match"
      ? `Đã ghép ${roundMatched} / ${roundSize} · tổng ${totalMatched}/${s.total}`
      : `Đúng ${s.correct}/${s.total} · ${s.deckName}`;
  }
  const coinEl = document.querySelector(".study-hud-coin");
  if (coinEl) coinEl.textContent = `🪙 ~${s.coins} GAME`;

  const fillEl = document.querySelector(".study-hud-fill");
  if (fillEl) {
    const totalMatched = s.totalMatchedCards || (s.mode === "match" ? (s.matched ? s.matched.length : 0) : s.index);
    const progressPct = Math.min(100, Math.round((totalMatched / Math.max(1, s.total)) * 100));
    fillEl.style.width = `${progressPct}%`;
  }
}

function award(correct) {
  const s = studySession;
  if (!s) return;
  if (correct) {
    s.correct += 1;
    s.combo += 1;
    s.xp += XP_PER_CORRECT + (s.combo >= 3 ? 2 : 0);
    s.coins += COIN_PER_CORRECT;
  } else {
    s.wrong += 1;
    s.combo = 0;
  }
}

async function markWrong(card) {
  card.wrongCount = (Number(card.wrongCount) || 0) + 1;
  await put("cards", card);
}

function queueMixedRetry(card) {
  const s = studySession;
  if (!s || s.mode !== "mixed" || s.retryQueued || !card) return false;
  const previous = s.plan?.[s.plan.length - 1] || null;
  const variant = pickMixedVariant(previous);
  s.cards.push(card);
  s.plan.push(variant);
  s.total = s.cards.length;
  s.retryQueued = true;
  refreshChrome();
  return true;
}

/* ---------- Rescue Monkey arena ---------- */
const RM_START = 15;
const rmVariant = () => (studySession?.mode === "mixed" ? studySession.plan?.[studySession.index] : studySession?.mode);
const rmActive = () => studySession?.specialMode === "rescue_monkey" && ["quiz", "typing"].includes(rmVariant());

function rmClear() {
  moduleRmClearTimers();
}

function rmArenaHTML() {
  if (!rmActive()) return "";
  return moduleRmArenaHTML(studySession?.distance ?? RM_START);
}

function rmPlay(correct, done) {
  const s = studySession;
  const root = stageEl();
  if (!s || !root || !rmActive()) { done?.(); return; }
  s.animating = true;
  moduleRmPlay(root, correct, {
    distance: s.distance ?? RM_START,
    onHud: (distance) => { s.distance = distance; },
    onLock: (locked) => { s.animating = Boolean(locked); },
    onDone: (distance) => {
      s.distance = distance;
      s.animating = false;
      done?.();
    },
  });
}
function startMode(mode, { srs = false, quiet = false, specialMode = null } = {}) {
  const meta = modeMeta(mode);
  const cards = srs ? hubCards({ status: "due", limit: "all" }) : hubCards();
  if (!cards.length) {
    toast(srs ? "Không có từ nào đến hạn với bộ lọc hiện tại." : "Không có từ nào khớp bộ lọc. Đổi bộ lọc hoặc thêm từ mới.", "warn");
    return;
  }
  if (!document.querySelector("#immersive-study-stage")) {
    activeSpecialReturnHash = location.hash && !location.hash.includes("mode=") && !location.hash.includes("srs=") && !location.hash.includes("special=") ? location.hash : "#study";
    immersiveGameShell(modeName(meta.id), meta.id, { studyStage: true });
  } else {
    const layer = document.querySelector("#immersive-game-layer");
    if (layer) {
      layer.className = `immersive-game-layer game-${meta.id}`;
      layer.dataset.game = meta.id;
      layer.setAttribute("aria-label", modeName(meta.id));
    }
  }
  const pool = mode === "mixed" ? shuffle(cards) : cards;
  const session = {
    mode: meta.id, srs, quiet, specialMode,
    deckId: hubFilters.deckId, deckName: deckLabel(hubFilters.deckId),
    cards: pool, index: 0, total: pool.length, correct: 0, wrong: 0, combo: 0, xp: 0, coins: 0,
    hearts: 5, timerSec: 28, totalMatchedCards: 0,
    startedAt: nowISO(), playing: true, revealed: false, picked: null, feedback: "",
    options: null, matched: [], matchTerms: null, matchMeanings: null, matchCards: null, selectedTerm: null, plan: null,
    retryQueued: false, distance: RM_START, animating: false,
  };
  if (meta.id === "mixed") {
    session.plan = buildMixedPlan(pool.length);
  }
  setSession(session);
  startStudyTimer();
  renderCurrentCard();
}

function nextCard() {
  const s = studySession;
  if (!s) return;
  s.revealed = false;
  s.picked = null;
  s.feedback = "";
  s.options = null;
  s.matched = [];
  s.matchTerms = null;
  s.matchMeanings = null;
  s.matchCards = null;
  s.selectedTerm = null;
  s.retryQueued = false;
  s.timerSec = 28;
  rmClear();
  s.animating = false;
  s.index += 1;
  if (s.index >= s.total) finishSession();
  else renderCurrentCard();
}

function renderCurrentCard() {
  const s = studySession;
  if (!s || !stageEl()) return;
  const variant = s.mode === "mixed" ? (s.plan?.[s.index] || "quiz") : s.mode;
  if (variant === "flashcard") renderFlashcard();
  else if (variant === "quiz") renderQuiz();
  else if (variant === "match") renderMatch();
  else if (variant === "typing") renderTyping();
  else if (variant === "listening") renderListening();
}

function renderFlashcard() {
  const s = studySession;
  const card = s.cards[s.index];
  const heartsCount = s.hearts ?? 5;
  const heartsHTML = [1,2,3,4,5].map((i) => `<span class="study-heart ${i <= heartsCount ? '' : 'is-lost'}">❤️</span>`).join('');
  const timerBadge = s.srs ? "SRS" : `⏱ ${(s.timerSec ?? 28)}S`;

  stageEl().innerHTML = sessionChrome() + `<article class="study-game-board mode-flashcard study-card flashcard-card">
  <div class="study-board-header">
    <div class="study-hearts" aria-label="${heartsCount} lượt còn lại">${heartsHTML}</div>
    <div class="study-timer-badge">${timerBadge}</div>
  </div>
  <div class="study-fc-body">
    <p class="eyebrow" style="margin:0;">${escapeHTML(deckLabel(card.deckId))}</p>
    <h2 class="study-fc-term">${escapeHTML(card.term)}</h2>
    ${card.pronunciation ? `<p class="study-fc-pron">${escapeHTML(card.pronunciation)}</p>` : ""}
    ${card.example ? `<p class="example" style="font-style:italic;color:#64748b;margin:4px 0;">${escapeHTML(card.example)}</p>` : ""}
    <button class="btn btn-small btn-icon" data-action="speak" data-text="${escapeHTML(card.term)}" aria-label="Phát âm ${escapeHTML(card.term)}">♬</button>
    ${s.revealed ? `<div class="study-fc-meaning answer"><strong>Nghĩa:</strong> ${escapeHTML(card.meaning)}</div>` : ""}
  </div>
  <div class="study-fc-actions rating-row">
    ${s.revealed
      ? RATINGS.map(([rating, label]) => `<button class="study-pill-btn btn" data-action="rate" data-rating="${rating}">${escapeHTML(label)}</button>`).join("")
      : `<button class="btn btn-primary" style="min-width:180px;border-radius:999px;" data-action="reveal">Lật thẻ (Xem nghĩa)</button>`}
  </div>
  </article>`;
  refreshChrome();
}

async function rateCard(rating) {
  const s = studySession;
  if (!s) return;
  const card = s.cards[s.index];
  Object.assign(card, calculateSrs(card, rating, new Date()));
  card.lastRating = rating;
  if (rating === "again") {
    card.wrongCount = (Number(card.wrongCount) || 0) + 1;
    s.wrong += 1;
    s.combo = 0;
    s.xp += AGAIN_XP;
    queueMixedRetry(card);
  } else {
    s.correct += 1;
    s.combo += 1;
    s.xp += XP_PER_CORRECT + (s.combo >= 3 ? 2 : 0);
    s.coins += COIN_PER_CORRECT;
  }
  await put("cards", card);
  nextCard();
}

function quizOptions(card) {
  const distractors = [...new Set(data.cards.filter((c) => c.id !== card.id && c.meaning).map((c) => c.meaning))];
  return shuffle([card.meaning, ...shuffle(distractors).slice(0, 3)]);
}

function renderQuiz() {
  const s = studySession;
  const card = s.cards[s.index];
  if (!s.options) s.options = quizOptions(card);
  const heartsCount = s.hearts ?? 5;
  const heartsHTML = [1,2,3,4,5].map((i) => `<span class="study-heart ${i <= heartsCount ? '' : 'is-lost'}">❤️</span>`).join('');
  const timerBadge = `⏱ ${(s.timerSec ?? 28)}S`;

  stageEl().innerHTML = sessionChrome() + rmArenaHTML() + `<article class="study-game-board mode-quiz study-card quiz-card rm-host">
  <div class="study-board-header">
    <div class="study-hearts" aria-label="${heartsCount} lượt còn lại">${heartsHTML}</div>
    <div class="study-timer-badge">${timerBadge}</div>
  </div>
  <div class="study-quiz-body">
    <p class="eyebrow" style="margin:0;">Chọn nghĩa đúng</p>
    <h2 class="study-quiz-term">${escapeHTML(card.term)}</h2>
    ${card.pronunciation ? `<small class="study-fc-pron">${escapeHTML(card.pronunciation)}</small>` : ""}
    <div class="study-quiz-options option-grid">${s.options.map((option, index) => {
      const answered = s.picked != null;
      const cls = !answered ? "" : option === card.meaning ? " is-correct" : option === s.picked ? " is-wrong" : " is-muted";
      return `<button class="study-pill-btn option${cls}" data-action="pick-option" data-index="${index}" ${answered || s.animating ? "disabled" : ""}>${escapeHTML(option)}</button>`;
    }).join("")}</div>
    ${s.picked != null ? `<p class="answer" style="margin:8px 0 0;">${s.picked === card.meaning ? "🎉 Chính xác!" : `Đáp án đúng: <strong>${escapeHTML(card.meaning)}</strong>`}</p>
    <div style="margin-top:8px;"><button class="btn btn-primary" data-action="next-card" ${s.animating ? "disabled" : ""}>Tiếp tục →</button></div>` : ""}
  </div>
  </article>`;
  refreshChrome();
}

async function pickOption(index) {
  const s = studySession;
  if (!s || s.picked != null || s.animating) return;
  const card = s.cards[s.index];
  const chosen = (s.options || [])[index];
  if (chosen == null) return;
  const isCorrect = chosen === card.meaning;
  s.picked = chosen;
  s.animating = true;
  if (isCorrect) award(true);
  else {
    if (s.hearts > 1) s.hearts -= 1;
    award(false);
    await markWrong(card);
    queueMixedRetry(card);
  }
  renderCurrentCard();
  rmPlay(isCorrect, () => { if (studySession) renderCurrentCard(); });
}

function renderMatch() {
  const s = studySession;
  if (!s.matchTerms) {
    const size = s.mode === "mixed" ? 2 : Math.min(8, s.total - s.index);
    s.matchCards = s.cards.slice(s.index, s.index + size);
    s.matchTerms = shuffle(s.matchCards.map((card) => ({ id: card.id, text: card.term })));
    s.matchMeanings = shuffle(s.matchCards.map((card) => ({ id: card.id, text: card.meaning })));
    s.selectedTerm = null;
  }
  const done = (id) => s.matched.includes(id);
  const heartsCount = s.hearts ?? 5;
  const heartsHTML = [1,2,3,4,5].map((i) => `<span class="study-heart ${i <= heartsCount ? '' : 'is-lost'}">❤️</span>`).join('');
  const timerBadge = `⏱ ${(s.timerSec ?? 28)}S`;

  stageEl().innerHTML = sessionChrome() + `<article class="study-game-board mode-match study-card match-card">
  <div class="study-board-header">
    <div class="study-hearts" aria-label="${heartsCount} lượt còn lại">${heartsHTML}</div>
    <div class="study-timer-badge">${timerBadge}</div>
  </div>
  <div class="study-match-columns">
    <div class="study-match-col" role="group" aria-label="Cột từ vựng">
      <h3 class="study-col-title">Tiếng Anh</h3>
      <div class="study-pill-list">
        ${s.matchTerms.map((item) =>
          `<button class="study-pill-btn match-item${done(item.id) ? " is-done" : s.selectedTerm === item.id ? " is-selected" : ""}" data-action="match-term" data-id="${escapeHTML(item.id)}" ${done(item.id) ? "disabled" : ""}>${escapeHTML(item.text)}</button>`
        ).join("")}
      </div>
    </div>
    <div class="study-match-col" role="group" aria-label="Cột nghĩa">
      <h3 class="study-col-title">Tiếng Việt</h3>
      <div class="study-pill-list">
        ${s.matchMeanings.map((item) =>
          `<button class="study-pill-btn match-item${done(item.id) ? " is-done" : ""}" data-action="match-meaning" data-id="${escapeHTML(item.id)}" ${done(item.id) ? "disabled" : ""}>${escapeHTML(item.text)}</button>`
        ).join("")}
      </div>
    </div>
  </div>
  <footer class="study-board-footer">
    <span class="study-match-count">Đã ghép: ${s.matched.length} / ${s.matchCards.length}</span>
  </footer>
  ${s.matched.length === s.matchCards.length ? `<div style="text-align:center;margin-top:6px;"><button class="btn btn-primary" data-action="advance-match">Tiếp tục →</button></div>` : ""}
  </article>`;
  refreshChrome();
}

async function pickMatch(column, id) {
  const s = studySession;
  if (!s || !s.matchTerms) return;
  if (column === "term") {
    s.selectedTerm = id;
    s.feedback = "";
    renderMatch();
    return;
  }
  if (!s.selectedTerm) {
    s.feedback = "Hãy chọn một từ ở cột bên trái trước.";
    renderMatch();
    return;
  }
  const card = s.matchCards.find((c) => c.id === s.selectedTerm);
  if (!card) return;
  if (card.id === id) {
    s.matched.push(card.id);
    s.totalMatchedCards = (s.totalMatchedCards || 0) + 1;
    s.feedback = `Đúng: ${card.term} = ${card.meaning}`;
    s.selectedTerm = null;
    award(true);
    if (s.matched.length === s.matchCards.length) {
      setTimeout(() => {
        if (studySession && studySession.matched.length === studySession.matchCards?.length) {
          advanceMatch();
        }
      }, 700);
    }
  } else {
    s.feedback = "Chưa đúng, thử lại cặp khác nhé.";
    s.selectedTerm = null;
    if (s.hearts > 1) s.hearts -= 1;
    award(false);
    await markWrong(card);
    queueMixedRetry(card);
  }
  renderMatch();
}

function advanceMatch() {
  const s = studySession;
  if (!s) return;
  if (s.mode !== "mixed") {
    s.index += (s.matchCards || []).length;
  }
  if (s.index >= s.total) {
    finishSession();
  } else {
    s.matched = [];
    s.matchTerms = null;
    s.matchMeanings = null;
    s.matchCards = null;
    s.selectedTerm = null;
    s.timerSec = 28;
    renderMatch();
  }
}

function firstLetterHint(card) {
  const term = String(card.term || "").trim().replace(/\s+/g, " ");
  return term ? term[0] : "";
}

function renderTyping() {
  const s = studySession;
  const card = s.cards[s.index];
  const term = String(card.term || "");
  const heartsCount = s.hearts ?? 5;
  const heartsHTML = [1,2,3,4,5].map((i) => `<span class="study-heart ${i <= heartsCount ? '' : 'is-lost'}">❤️</span>`).join('');
  const timerBadge = `⏱ ${(s.timerSec ?? 28)}S`;

  stageEl().innerHTML = sessionChrome() + rmArenaHTML() + `<article class="study-game-board mode-typing study-card typing-card rm-host">
  <div class="study-board-header">
    <div class="study-hearts" aria-label="${heartsCount} lượt còn lại">${heartsHTML}</div>
    <div class="study-timer-badge">${timerBadge}</div>
  </div>
  <div class="study-quiz-body">
    <p class="eyebrow" style="margin:0;">Gõ từ vựng</p>
    <h2 class="study-input-hero">${escapeHTML(card.meaning)}</h2>
    <p class="typing-hint">Chữ cái đầu: <strong>${escapeHTML(firstLetterHint(card))}</strong> · ${term.replace(/\s+/g, "").length} ký tự · không phân biệt hoa thường</p>
    <form data-form="typing" class="typing-form"><label><span class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;">Gõ từ đúng</span><input class="study-input-pill" name="answer" autocomplete="off" placeholder="Nhập từ tiếng Anh…" aria-label="Gõ từ đúng" ${s.animating ? "disabled" : ""} autofocus></label>
    <div class="actions" style="justify-content:center;margin-top:10px;"><button class="btn btn-primary" type="submit" ${s.animating ? "disabled" : ""}>Chấm</button><button class="btn" type="button" data-action="skip-typing" ${s.animating ? "disabled" : ""}>Bỏ qua</button></div></form>
    ${s.feedback ? `<p class="answer" style="margin-top:8px;">${escapeHTML(s.feedback)}</p>` : ""}
  </div>
  </article>`;
  refreshChrome();
}

async function checkTyping(answer) {
  const s = studySession;
  if (!s || s.animating) return;
  const card = s.cards[s.index];
  if (normAnswer(answer) === normAnswer(card.term)) {
    award(true);
    s.animating = true;
    renderTyping();
    rmPlay(true, () => { if (studySession) nextCard(); });
  } else {
    if (s.hearts > 1) s.hearts -= 1;
    award(false);
    await markWrong(card);
    queueMixedRetry(card);
    s.feedback = `Chưa đúng. Gợi ý: bắt đầu bằng "${firstLetterHint(card)}", đáp án là "${card.term}".`;
    s.animating = true;
    renderTyping();
    rmPlay(false, () => {
      if (!studySession) return;
      if (studySession.mode === "mixed") nextCard();
      else renderTyping();
    });
  }
}

function playPrompt(card) {
  return speak(card?.term || "", listenRate);
}

function renderListening() {
  const s = studySession;
  const card = s.cards[s.index];
  const supported = speechSupported();
  const heartsCount = s.hearts ?? 5;
  const heartsHTML = [1,2,3,4,5].map((i) => `<span class="study-heart ${i <= heartsCount ? '' : 'is-lost'}">❤️</span>`).join('');
  const timerBadge = `⏱ ${(s.timerSec ?? 28)}S`;

  stageEl().innerHTML = sessionChrome() + `<article class="study-game-board mode-listening study-card listening-card">
  <div class="study-board-header">
    <div class="study-hearts" aria-label="${heartsCount} lượt còn lại">${heartsHTML}</div>
    <div class="study-timer-badge">${timerBadge}</div>
  </div>
  <div class="study-quiz-body">
    <p class="eyebrow" style="margin:0;">Nghe viết</p>
    <h2 class="study-input-hero">Nghe và gõ lại từ</h2>
    <p class="typing-hint">Số ký tự: ${String(card.term || "").replace(/\s+/g, "").length} · chữ cái đầu: <strong>${escapeHTML(firstLetterHint(card))}</strong></p>
    ${supported ? `<div class="actions listen-actions" style="justify-content:center;margin:6px 0 12px;">
    <button class="btn" data-action="listen-play" data-rate="1">🔊 Nghe</button>
    <button class="btn btn-small" data-action="listen-play" data-rate="0.7">0.7x Chậm</button>
    <button class="btn btn-small" data-action="listen-play" data-rate="1">1x Chuẩn</button></div>`
    : `<p class="answer warn">Trình duyệt chưa hỗ trợ giọng nói (SpeechSynthesis). Bạn vẫn thấy nghĩa và có thể gõ từ để học tiếp.</p>
    <p class="typing-hint">Nghĩa: <strong>${escapeHTML(card.meaning)}</strong></p>`}
    <form data-form="listening" class="typing-form"><label><span class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;">Gõ từ bạn nghe</span><input class="study-input-pill" name="answer" autocomplete="off" placeholder="Gõ từ bạn nghe…" aria-label="Gõ từ đã nghe" autofocus></label>
    <div class="actions" style="justify-content:center;margin-top:10px;"><button class="btn btn-primary" type="submit">Chấm</button><button class="btn" type="button" data-action="skip-typing">Bỏ qua</button></div></form>
    ${s.feedback ? `<p class="answer" style="margin-top:8px;">${escapeHTML(s.feedback)}</p>` : ""}
  </div>
  </article>`;
  refreshChrome();
  if (supported && !s.feedback) playPrompt(card);
}

async function checkListening(answer) {
  const s = studySession;
  if (!s) return;
  const card = s.cards[s.index];
  if (normAnswer(answer) === normAnswer(card.term)) {
    award(true);
    nextCard();
  } else {
    if (s.hearts > 1) s.hearts -= 1;
    award(false);
    await markWrong(card);
    queueMixedRetry(card);
    s.feedback = `Chưa đúng. Đáp án: "${card.term}".`;
    if (s.mode === "mixed") {
      toast(s.feedback, "warn");
      nextCard();
    } else renderListening();
  }
}

async function finishSession() {
  clearInterval(studyTimerId);
  studyTimerId = null;
  rmClear();
  const s = studySession;
  if (!s) return;
  const total = s.total;
  const correct = s.mode === "match" ? (s.totalMatchedCards || s.correct) : s.correct;
  const wrong = s.wrong;
  const attempts = correct + wrong;
  const accuracy = attempts ? Math.round((correct / attempts) * 100) : total ? Math.round((correct / total) * 100) : 100;
  const duration = Math.max(1, Math.round((Date.now() - new Date(s.startedAt).getTime()) / 1000));
  const activityMode = s.specialMode || s.mode;
  const record = await saveActivity({
    type: "study", mode: activityMode, deckId: s.deckId, deckName: s.deckName,
    total, correct, wrong, accuracy, duration, startedAt: s.startedAt,
    xp: s.xp, coins: s.coins, sessionXp: s.xp, sessionCoins: s.coins,
    detail: `${modeName(activityMode)}${s.specialMode && s.mode !== activityMode ? ` · ${modeName(s.mode)}` : ""}${s.srs ? " · SRS" : ""} ${correct}/${total}`,
  });
  await reload(false);
  setSession({ ...s, playing: false });
  if (stageEl()) {
    stageEl().innerHTML = `<article class="study-game-board mode-result study-card result-card">
    <div class="study-result-badge">🏆</div>
    <p class="eyebrow" style="margin:0;">Hoàn thành phiên học</p>
    <h2 style="margin:4px 0 8px;font-size:clamp(1.8rem,4vw,2.4rem);color:#1e1b4b;">${escapeHTML(modeName(activityMode))}${s.specialMode && s.mode !== activityMode ? ` · ${escapeHTML(modeName(s.mode))}` : ""}</h2>
    <p style="font-size:18px;font-weight:750;color:#0f172a;margin:4px 0 8px;">${correct}/${total} đúng (${accuracy}%)</p>
    <p style="color:#64748b;margin:0 0 16px;">Bộ ${escapeHTML(s.deckName)} · ${escapeHTML(fmtDuration(duration))} · +${s.xp} XP · +${s.coins} coin.</p>
    <div class="study-result-actions actions">
      ${s.specialMode
        ? `<button class="btn btn-primary" type="button" data-action="restart-special-session" data-game="${escapeHTML(activityMode)}" data-mode="${escapeHTML(s.mode)}" style="border-radius:999px;padding:10px 22px;">↻ Chơi lại</button><button class="btn" type="button" data-action="exit-special-game" style="border-radius:999px;padding:10px 22px;">Thoát về trung tâm</button>`
        : `<button class="btn btn-primary" type="button" data-action="restart-current-mode" style="border-radius:999px;padding:10px 22px;">↻ Chơi lại</button><button class="btn" type="button" data-action="exit-special-game" style="border-radius:999px;padding:10px 22px;">Thoát về trung tâm</button><button class="btn" type="button" data-action="goto-stats" style="border-radius:999px;padding:10px 22px;">Xem thống kê</button>`
      }
    </div></article>`;
  }
  activeSpecialGame = null;
  activeSpecialStartedAt = 0;
  toast(`Lưu lịch sử học: ${modeName(activityMode)} ${correct}/${total} · +${s.xp} XP · +${s.coins} coin.`);
}

/* ---------- Route phụ: trò chơi / thống kê / lộ trình ---------- */
function renderGames() {
  view.innerHTML = `<div class="page-head"><div><h2>Trò chơi học từ</h2><p>Mọi trò chơi đều vào trung tâm Học từ vựng và dùng chung bộ lọc hiện tại.</p></div></div>
  <div class="mode-grid">${MODES.map(modeCard).join("")}</div>
  <section class="section">${specialHubLauncher()}</section>
  <section class="section"><div class="section-title"><h2>Lịch sử học</h2><a href="#stats">Thống kê →</a></div>${historyPanel(6)}</section>`;
}

function renderGameAlias(params = new URLSearchParams()) {
  const mode = modeMeta(params.get("mode")).id;
  location.hash = `#study?mode=${mode}`;
}

function renderStats() {
  const stats = computeStudyStats(data.cards, data.activities);
  const items = [...data.activities].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  view.innerHTML = `<div class="page-head"><div><h2>Thống kê tiến độ</h2><p>${data.cards.length} từ · ${stats.due} đến hạn · streak ${data.profile.streak || 0} ngày</p></div>
  <div class="actions"><button class="btn" data-action="export-json">⇩ Backup JSON</button></div></div>
  <section class="section grid grid-4">${metric("◫", stats.total, "Tổng từ")}${metric("◫", stats.learned, "Từ đã học")}${metric("✓", stats.mastered, "Từ đã thuộc")}${metric("🕘", stats.due, "Đến hạn")}</section>
  <section class="section"><div class="section-title"><h2>Hoạt động gần đây</h2><small>${data.activities.length} lượt</small></div>${historyPanel(12)}</section>
  <section class="section"><button class="btn btn-danger" data-action="reset-data">Khôi phục dữ liệu mẫu</button><p class="hub-count">Xóa toàn bộ dữ liệu local và tạo lại dữ liệu mẫu. Hành động không thể hoàn tác.</p></section>
  ${items.length ? "" : empty("Chưa có hoạt động", "Học một phiên để xem thống kê tại đây.")}`;
}

function renderRoadmap() {
  const stats = computeStudyStats(data.cards, data.activities);
  const steps = [
    { id: "first", label: "Học 10 từ đầu tiên", done: stats.learned >= 10 },
    { id: "fifty", label: "Thuộc 20 từ", done: stats.mastered >= 20 },
    { id: "streak", label: "Giữ streak 7 ngày", done: (data.profile.streak || 0) >= 7 },
    { id: "hundred", label: "Tích lũy 200 XP", done: (data.profile.xp || 0) >= 200 },
  ];
  view.innerHTML = `<div class="page-head"><div><h2>Lộ trình của bạn</h2><p>Chinh phục từng cột mốc bằng các phiên học đều đặn.</p></div></div>
  <div class="roadmap-list">${steps.map((step) => `<article class="card roadmap-step${step.done ? " is-done" : ""}"><span aria-hidden="true">${step.done ? "✓" : "○"}</span><div><strong>${escapeHTML(step.label)}</strong><small>${step.done ? "Đã hoàn thành" : "Đang tiến hành"}</small></div></article>`).join("")}</div>
  <section class="section"><div class="section-title"><h2>Gợi ý tiếp theo</h2></div>
  <div class="activity"><span class="activity-icon" aria-hidden="true">◆</span><div><strong>Luyện tổng hợp</strong><small>Nhiều dạng bài trong một phiên</small></div><button class="btn btn-small btn-primary" data-action="start-game" data-mode="mixed">Bắt đầu</button></div></section>`;
}

/* ---------- Modal CRUD ---------- */
function deckForm(deck = {}) {
  return `<h2 id="modal-title">${deck.id ? "Sửa bộ từ" : "Tạo bộ từ mới"}</h2>
  <form data-form="deck" data-id="${escapeHTML(deck.id || "")}">
  <label>Tên bộ từ<input name="name" required value="${escapeHTML(deck.name || "")}" placeholder="Ví dụ: TOEIC 600" aria-label="Tên bộ từ"></label>
  <label>Biểu tượng<input name="icon" maxlength="4" value="${escapeHTML(deck.icon || "📚")}" aria-label="Biểu tượng bộ từ"></label>
  <label>Mô tả<textarea name="description" rows="3" aria-label="Mô tả bộ từ">${escapeHTML(deck.description || "")}</textarea></label>
  <div class="actions"><button class="btn btn-primary" type="submit">Lưu</button><button class="btn" type="button" data-action="close-modal">Hủy</button></div></form>`;
}

function cardForm(card = {}, deckId = "") {
  return `<h2 id="modal-title">${card.id ? "Sửa từ vựng" : "Thêm từ vựng"}</h2>
  <form data-form="card" data-id="${escapeHTML(card.id || "")}" data-deck="${escapeHTML(card.deckId || deckId)}">
  <label>Từ vựng<input name="term" required value="${escapeHTML(card.term || "")}" aria-label="Từ vựng"></label>
  <label>Nghĩa<input name="meaning" required value="${escapeHTML(card.meaning || "")}" aria-label="Nghĩa"></label>
  <label>Phiên âm<input name="pronunciation" value="${escapeHTML(card.pronunciation || "")}" aria-label="Phiên âm"></label>
  <label>Ví dụ<textarea name="example" rows="2" aria-label="Ví dụ">${escapeHTML(card.example || "")}</textarea></label>
  <div class="actions"><button class="btn btn-primary" type="submit">Lưu</button><button class="btn" type="button" data-action="close-modal">Hủy</button></div></form>`;
}

function goalForm() {
  return `<h2 id="modal-title">Mục tiêu mỗi ngày</h2>
  <form data-form="goal"><label>Số lượt ôn mỗi ngày<input name="dailyGoal" type="number" min="1" max="200" value="${Number(data.profile.dailyGoal) || 10}" aria-label="Mục tiêu mỗi ngày"></label>
  <div class="actions"><button class="btn btn-primary" type="submit">Lưu</button><button class="btn" type="button" data-action="close-modal">Hủy</button></div></form>`;
}

/* ---------- Import / Export ---------- */
function download(filename, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const freshCard = (data_, deckId) => ({
  id: uid("card"), deckId, term: data_.term, meaning: data_.meaning,
  example: data_.example || "", pronunciation: data_.pronunciation || "",
  repetitions: 0, interval: 0, ease: 2.5, dueAt: null, level: "new", wrongCount: 0,
  createdAt: nowISO(),
});

async function importText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      let deckId = importTargetDeck;
      if (!deckId) {
        deckId = uid("deck");
        await put("decks", { id: deckId, name: "Bộ import", description: `Import ${new Date().toLocaleDateString("vi-VN")}`, icon: "📚", createdAt: nowISO() });
      }
      const cards = parsed.filter((item) => item && item.term && item.meaning).map((item) => ({ ...freshCard(item, item.deckId || deckId), ...item, id: uid("card"), deckId: item.deckId || deckId }));
      for (const card of cards) await put("cards", card);
      await reload();
      toast(`Đã import ${cards.length} từ.`);
      return;
    }
    const snapshot = {
      decks: parsed.decks || [],
      cards: parsed.cards || [],
      activities: parsed.activities || [],
      profile: parsed.profile || data.profile,
    };
    if (!confirm("Import backup sẽ thay toàn bộ dữ liệu hiện tại. Tiếp tục?")) return;
    await replaceAll(snapshot);
    await reload();
    toast("Đã import backup JSON.");
    return;
  }
  const rows = parseCSV(trimmed);
  const cards = [];
  for (const row of rows) {
    const deckId = row.deckId || importTargetDeck;
    if (!deckId) {
      const id = uid("deck");
      await put("decks", { id, name: "Bộ import", description: "Từ CSV", icon: "📚", createdAt: nowISO() });
      cards.push(freshCard(row, id));
    } else {
      cards.push(freshCard(row, deckId));
    }
  }
  for (const card of cards) await put("cards", card);
  await reload();
  toast(`Đã import ${cards.length} từ từ CSV.`);
}

/* ---------- Hành động ---------- */
async function handleAction(action, target) {
  const id = target.dataset.id || "";
  if (action === "close-modal") return closeModal();
  if (action === "speak") return void speak(target.dataset.text || "");
  if (action === "new-deck") return openModal(deckForm());
  if (action === "edit-deck") return openModal(deckForm(deckById(id) || {}));
  if (action === "new-card") return openModal(cardForm({}, target.dataset.deck || ""));
  if (action === "edit-card") {
    const card = data.cards.find((item) => item.id === id);
    return openModal(cardForm(card || {}, card?.deckId || ""));
  }
  if (action === "edit-goal") return openModal(goalForm());
  if (action === "import") {
    importTargetDeck = target.dataset.target || null;
    fileInput.click();
    return;
  }
  if (action === "export-json") {
    download(`luyen-tu-backup-${todayKey()}.json`, JSON.stringify({ ...data, exportedAt: nowISO() }, null, 2), "application/json");
    return toast("Đã tạo file backup JSON.");
  }
  if (action === "export-csv") {
    const cards = cardsForDeck(id || "all");
    download(`luyen-tu-${id || "all"}-${todayKey()}.csv`, `\uFEFF${toCSV(cards)}`, "text/csv;charset=utf-8");
    return toast(`Đã export ${cards.length} từ ra CSV.`);
  }
  if (action === "delete-deck") {
    if (!confirm("Xóa bộ từ này cùng toàn bộ từ bên trong?")) return;
    await deleteDeckCascade(id);
    await reload();
    toast("Đã xóa bộ từ.");
    return;
  }
  if (action === "delete-card") {
    if (!confirm("Xóa từ này?")) return;
    await remove("cards", id);
    await reload();
    toast("Đã xóa từ.");
    return;
  }
  if (action === "buy-item") return buyItem(id);
  if (action === "equip-item") return equipItem(id);
  if (action === "reset-data") {
    if (!confirm("Xóa toàn bộ dữ liệu local và tạo lại dữ liệu mẫu?")) return;
    await resetDatabase();
    await seedDatabase();
    await reload();
    toast("Đã khôi phục dữ liệu mẫu.");
    return;
  }
  if (action === "open-special-hub") return openSpecialGames();
  if (action === "restart-special-session") {
    if (!activeSpecialLayer || !document.querySelector("#immersive-study-stage")) return;
    const game = target.dataset.game;
    const mode = target.dataset.mode;
    activeSpecialGame = game;
    activeSpecialStartedAt = Date.now();
    if (game === "rescue_monkey") {
      startMode(mode === "typing" ? "typing" : "quiz", { specialMode: "rescue_monkey" });
    } else if (game === "mixed") {
      startMode("mixed", { specialMode: "mixed" });
    }
    return;
  }
  if (action === "start-rescue-special") {
    closeModal();
    const mode = target.dataset.mode === "typing" ? "typing" : "quiz";
    const immersiveStage = document.querySelector("#immersive-study-stage");
    if (!immersiveStage) return;
    immersiveStage.innerHTML = "";
    activeSpecialGame = "rescue_monkey";
    activeSpecialStartedAt = Date.now();
    startMode(mode, { specialMode: "rescue_monkey" });
    return;
  }
  if (action === "restart-current-mode") {
    const s = studySession;
    const mode = s?.mode || "match";
    const srs = Boolean(s?.srs);
    return startMode(mode, { srs });
  }
  if (action === "goto-stats") {
    stopSpecialGame();
    rmClear();
    setSession(null);
    history.replaceState(null, "", "#stats");
    renderRoute();
    return;
  }
  if (action === "exit-special-game") {
    const wasImmersive = Boolean(activeSpecialLayer);
    const returnHash = activeSpecialReturnHash || "#study";
    const specialIds = ["bird", "rice_shop", "translate", "sentence", "rescue_monkey", "mixed"];
    const wasSpecial = activeSpecialGame && specialIds.includes(activeSpecialGame);
    stopSpecialGame();
    rmClear();
    setSession(null);
    if (wasImmersive) {
      history.replaceState(null, "", returnHash);
      renderRoute();
      if (wasSpecial) openSpecialGames();
    } else {
      renderStudyEntry(new URLSearchParams());
    }
    return;
  }
  if (action === "start-game") return startMode(target.dataset.mode || "flashcard");
  if (action === "start-mode") return startMode(target.dataset.mode || "flashcard");
  if (action === "start-srs") return startMode("flashcard", { srs: true });
  if (action === "reveal") {
    studySession.revealed = true;
    return renderFlashcard();
  }
  if (action === "rate") return rateCard(target.dataset.rating || "good");
  if (action === "pick-option") return pickOption(Number(target.dataset.index));
  if (action === "match-term") return pickMatch("term", id);
  if (action === "match-meaning") return pickMatch("meaning", id);
  if (action === "advance-match") return advanceMatch();
  if (action === "next-card") return nextCard();
  if (action === "listen-play") { listenRate = Number(target.dataset.rate) || 1; persistListenRate(listenRate); return void speak(studySession?.cards?.[studySession.index]?.term || "", listenRate); }
  if (action === "skip-typing") {
    const s = studySession;
    if (!s || s.animating) return;
    const card = s.cards[s.index];
    award(false);
    await markWrong(card);
    queueMixedRetry(card);
    toast(`Đã bỏ qua. Đáp án: "${card.term}".`, "warn");
    return nextCard();
  }
  if (action === "end-session") return finishSession();
}

async function buyItem(itemId) {
  const item = storeItems.find((entry) => entry.id === itemId);
  if (!item) return;
  if ((data.profile.coins || 0) < item.price) return toast("Không đủ coin để mua vật phẩm này.", "warn");
  const inventory = [...new Set([...(data.profile.inventory || []), itemId])];
  await put("profile", { ...data.profile, coins: (data.profile.coins || 0) - item.price, inventory });
  await reload();
  toast(`Đã mua ${item.name}.`);
}

async function equipItem(itemId) {
  await put("profile", { ...data.profile, equipped: itemId });
  applyEquip(itemId);
  await reload();
  toast("Đã trang bị danh hiệu.");
}

async function handleForm(target) {
  const form = target.dataset.form;
  const values = Object.fromEntries(new FormData(target).entries());
  if (form === "deck") {
    const existing = target.dataset.id ? deckById(target.dataset.id) : null;
    const deck = {
      ...(existing || { id: uid("deck"), createdAt: nowISO() }),
      name: String(values.name || "").trim(),
      icon: String(values.icon || "📚").trim() || "📚",
      description: String(values.description || "").trim(),
    };
    if (!deck.name) return toast("Tên bộ từ không được để trống.", "warn");
    await put("decks", deck);
    await reload();
    closeModal();
    return toast(existing ? "Đã cập nhật bộ từ." : "Đã tạo bộ từ mới.");
  }
  if (form === "card") {
    const existing = target.dataset.id ? data.cards.find((item) => item.id === target.dataset.id) : null;
    const card = {
      ...(existing || freshCard({}, target.dataset.deck || "")),
      term: String(values.term || "").trim(),
      meaning: String(values.meaning || "").trim(),
      pronunciation: String(values.pronunciation || "").trim(),
      example: String(values.example || "").trim(),
      deckId: existing?.deckId || target.dataset.deck || "",
    };
    if (!card.term || !card.meaning) return toast("Cần nhập cả từ vựng và nghĩa.", "warn");
    await put("cards", card);
    await reload();
    closeModal();
    return toast(existing ? "Đã cập nhật từ vựng." : "Đã thêm từ vựng.");
  }
  if (form === "goal") {
    const goal = Math.min(200, Math.max(1, Number(values.dailyGoal) || 10));
    await put("profile", { ...data.profile, dailyGoal: goal });
    await reload();
    closeModal();
    return toast(`Mục tiêu mới: ${goal} lượt ôn mỗi ngày.`);
  }
  if (form === "typing") return checkTyping(values.answer || "");
  if (form === "listening") return checkListening(values.answer || "");
}

/* ---------- Sự kiện ---------- */
document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;
  event.preventDefault();
  handleAction(trigger.dataset.action, trigger).catch((error) => {
    console.error(error);
    toast("Có lỗi khi xử lý thao tác. Thử lại giúp mình nhé.", "warn");
  });
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  handleForm(form).catch((error) => {
    console.error(error);
    toast("Không lưu được dữ liệu. Kiểm tra lại nội dung.", "warn");
  });
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.id === "vocab-deck") {
    location.hash = `#vocabulary?deck=${encodeURIComponent(target.value)}`;
    return;
  }
  onHubFilterChange(target);
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target.id === "card-search") {
    searchTerm = target.value;
    const caret = target.selectionStart;
    renderRoute();
    const next = document.querySelector("#card-search");
    if (next) {
      next.focus();
      next.setSelectionRange(caret, caret);
    }
    return;
  }
  if (target.id === "vocab-search") {
    vocabSearch = target.value;
    const caret = target.selectionStart;
    renderRoute();
    const next = document.querySelector("#vocab-search");
    if (next) {
      next.focus();
      next.setSelectionRange(caret, caret);
    }
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeSpecialLayer) {
    event.preventDefault();
    const exitButton = document.querySelector(".immersive-game-exit");
    handleAction("exit-special-game", exitButton).catch(console.error);
    return;
  }
  if (event.key === "Escape" && !modal.hidden) closeModal();
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (!file) return;
  try {
    await importText(await file.text());
  } catch (error) {
    console.error(error);
    toast("File không hợp lệ. Cần JSON backup hoặc CSV đúng cột.", "warn");
  }
});

document.querySelector("#sidebar-toggle")?.addEventListener("click", (event) => {
  const shell = document.querySelector("#app-shell");
  shell.classList.toggle("collapsed");
  event.currentTarget.setAttribute("aria-expanded", String(!shell.classList.contains("collapsed")));
});

document.querySelector("#mobile-menu")?.addEventListener("click", () => {
  document.querySelector(".sidebar").classList.toggle("open");
});

window.addEventListener("hashchange", renderRoute);

(async function init() {
  try {
    await seedDatabase();
    await reload();
    renderRoute();
  } catch (error) {
    console.error(error);
    view.innerHTML = empty("Không mở được IndexedDB", "Kiểm tra quyền lưu dữ liệu của trình duyệt rồi tải lại trang.");
  }
})();
