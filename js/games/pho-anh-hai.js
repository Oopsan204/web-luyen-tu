// Phở Anh Hai — quản lý xe phở pixel + luyện từ vựng (module tự chứa).
// mountPhoAnhHai(container, { cards, onFinish }) → startPhoAnhHai() → unmountPhoAnhHai().
// Art vẽ bằng canvas pixel, âm thanh tổng hợp WebAudio (không cần asset ngoài).
import { escapeHTML } from "../core.js";

export const PAH_DAY_CUSTOMERS = 4;
export const PAH_DAY_WALLET = 160;
export const PAH_START_REPUTATION = 50;
export const PAH_DEFAULT_PATIENCE = Object.freeze({
  correct: 0.14,
  wrong: -0.28,
  served: 0.05,
  drainPerSec: 0.02,
});
const GAME_PATIENCE = Object.freeze({ ...PAH_DEFAULT_PATIENCE, drainPerSec: 0.028 });

export const PAH_CUSTOMERS = ["Chị Hoa", "Anh Tú", "Bé Na", "Bác Lâm", "Cô Mai", "Chú Dũng"];

export const PAH_INGREDIENTS = [
  { id: "banh_pho", name: "Bánh phở", icon: "🍜", cost: 8 },
  { id: "bo", name: "Thịt bò", icon: "🥩", cost: 14 },
  { id: "ga", name: "Thịt gà", icon: "🍗", cost: 10 },
  { id: "rau", name: "Rau thơm", icon: "🌿", cost: 5 },
  { id: "xuong", name: "Xương hầm", icon: "🦴", cost: 12 },
  { id: "gia_vi", name: "Gia vị", icon: "🌶️", cost: 6 },
];

export const PAH_DISHES = [
  { id: "pho_bo", name: "Phở bò", icon: "🍜", price: 45, recipe: { banh_pho: 1, bo: 1, rau: 1 } },
  { id: "pho_ga", name: "Phở gà", icon: "🍲", price: 38, recipe: { banh_pho: 1, ga: 1, rau: 1 } },
];

export const PAH_BASKET = { banh_pho: 4, bo: 2, ga: 2, rau: 4, xuong: 1, gia_vi: 1 };

export const ingredientById = (id) => PAH_INGREDIENTS.find((item) => item.id === id) || null;
export const dishById = (id) => PAH_DISHES.find((dish) => dish.id === id) || null;

// ------------------------------------------------------------ pure logic
export const pahClamp01 = (n) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

const pickRandom = (random) => (typeof random === "function" ? random : Math.random);

/** Giá chợ dao động 75%–125% quanh giá gốc; random tiêm vào để test được. */
export function marketPrices(day = 1, random = Math.random) {
  const rnd = pickRandom(random);
  return Object.fromEntries(PAH_INGREDIENTS.map((item) => {
    const swing = 0.75 + rnd() * 0.5;
    return [item.id, Math.max(1, Math.round(item.cost * swing))];
  }));
}

/** Giảm giá chợ (0..1) — trả về bảng giá mới, không sửa bảng cũ. */
export function applyDiscount(prices = {}, discount = 0) {
  const factor = 1 - pahClamp01(discount);
  return Object.fromEntries(Object.entries(prices).map(([id, price]) => [
    id,
    Math.max(1, Math.round((Number(price) || 0) * factor)),
  ]));
}

/** Mua nguyên liệu: trả state mới; thiếu tiền/sai món thì giữ nguyên state cũ. */
export function buyStock(inventory = {}, id, qty = 1, prices = {}) {
  const item = ingredientById(id);
  const amount = Math.floor(Number(qty) || 0);
  const stock = { ...(inventory.stock || {}) };
  const wallet = Number(inventory.wallet) || 0;
  if (!item || amount <= 0) return { ok: false, reason: "invalid", state: inventory, cost: 0 };
  const unit = Number(prices[id] ?? item.cost);
  if (!Number.isFinite(unit) || unit <= 0) return { ok: false, reason: "invalid", state: inventory, cost: 0 };
  const cost = Math.max(0, Math.round(unit * amount));
  if (cost > wallet) return { ok: false, reason: "funds", state: inventory, cost };
  return {
    ok: true,
    reason: "",
    cost,
    state: { ...inventory, wallet: wallet - cost, stock: { ...stock, [id]: (stock[id] || 0) + amount } },
  };
}

export function canCookBroth(stock = {}) {
  return (Number(stock.xuong) || 0) > 0 && (Number(stock.gia_vi) || 0) > 0;
}

/** Ninh nước dùng: trả lời đúng → chất lượng 100%, sai → 55%. */
export function cookBroth(stock = {}, correct = false) {
  if (!canCookBroth(stock)) {
    return { ok: false, stock, quality: 0, missing: PAH_INGREDIENTS.filter((item) => ["xuong", "gia_vi"].includes(item.id) && !(Number(stock[item.id]) > 0)).map((item) => item.id) };
  }
  const next = { ...stock, xuong: stock.xuong - 1, gia_vi: stock.gia_vi - 1 };
  return { ok: true, stock: next, quality: correct ? 1 : 0.55, missing: [] };
}

export function canMakeDish(stock = {}, dish) {
  if (!dish || !dish.recipe) return false;
  return Object.entries(dish.recipe).every(([id, need]) => (Number(stock[id]) || 0) >= need);
}

/** Trừ nguyên liệu theo công thức; thiếu thì giữ nguyên state cũ. */
export function consumeRecipe(stock = {}, dish) {
  if (!dish || !dish.recipe) return { ok: false, stock, missing: [] };
  const missing = Object.entries(dish.recipe)
    .filter(([id, need]) => (Number(stock[id]) || 0) < need)
    .map(([id]) => id);
  if (missing.length) return { ok: false, stock, missing };
  const next = { ...stock };
  for (const [id, need] of Object.entries(dish.recipe)) next[id] = (Number(next[id]) || 0) - need;
  return { ok: true, stock: next, missing: [] };
}

export function pickDish(stock = {}, random = Math.random) {
  const pool = PAH_DISHES.filter((dish) => canMakeDish(stock, dish));
  if (!pool.length) return null;
  const rnd = pickRandom(random);
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(rnd() * pool.length)));
  return pool[index];
}

export function patienceState(patience) {
  const p = pahClamp01(patience);
  if (p >= 0.6) return "happy";
  if (p >= 0.25) return "waiting";
  return "angry";
}

export function applyPatienceEvent(patience, event, rules = PAH_DEFAULT_PATIENCE) {
  const delta = Number(rules?.[event]) || 0;
  return pahClamp01((Number(patience) || 0) + delta);
}

export function tickPatience(patience, elapsedSec, rules = PAH_DEFAULT_PATIENCE) {
  const drain = Number(rules?.drainPerSec) || 0;
  return pahClamp01((Number(patience) || 0) - drain * Math.max(0, Number(elapsedSec) || 0));
}

/** Giá tô phở: nền + thưởng nước dùng ngon + thưởng uy tín. */
export function orderPrice(dish, { brothQuality = 1, reputation = PAH_START_REPUTATION } = {}) {
  if (!dish || !Number.isFinite(Number(dish.price))) return 0;
  const quality = pahClamp01(brothQuality);
  const rep = pahClamp01((Number(reputation) || 0) / 100);
  const qualityBonus = Math.round(dish.price * 0.25 * quality);
  const reputationBonus = Math.round(dish.price * 0.2 * (rep - 0.5));
  return Math.max(1, dish.price + qualityBonus + reputationBonus);
}

export function tipFor({ price = 0, patience = 1, correct = false, streak = 0 } = {}) {
  const safePrice = Math.max(0, Number(price) || 0);
  if (!correct || !safePrice) return 0;
  const base = Math.round(safePrice * 0.12);
  const patienceBonus = Math.round(safePrice * 0.15 * pahClamp01(patience));
  const streakBonus = Math.min(3, Math.max(0, Math.floor(Number(streak) || 0))) * 2;
  return base + patienceBonus + streakBonus;
}

export function reputationAfter(reputation, event) {
  const delta = { correct: 3, wrong: -5, served: 1, perfect: 3, lost: -6 }[event] || 0;
  return Math.round(Math.min(100, Math.max(0, (Number(reputation) || 0) + delta)));
}

export function starsFor(satisfaction) {
  const s = pahClamp01(satisfaction);
  if (s >= 0.9) return 5;
  if (s >= 0.75) return 4;
  if (s >= 0.5) return 3;
  if (s >= 0.3) return 2;
  return 1;
}

/**
 * Tổng kết ngày. records = [{ price, tip, patience, correct, served }].
 * correct/wrong là số câu từ vựng đúng/sai trong cả ngày (chợ + nấu + phục vụ).
 */
export function settleDay(records = [], {
  spent = 0,
  total = records.length,
  correct = 0,
  wrong = 0,
  reputationStart = PAH_START_REPUTATION,
  reputationEnd = reputationStart,
} = {}) {
  const rows = Array.isArray(records) ? records.filter(Boolean) : [];
  const servedRows = rows.filter((row) => row.served);
  const served = servedRows.length;
  const totalCustomers = Number.isFinite(Number(total)) ? Math.max(0, Math.round(Number(total))) : rows.length;
  const lost = Math.max(0, totalCustomers - served);
  const revenue = servedRows.reduce((sum, row) => sum + (Number(row.price) || 0), 0);
  const tips = servedRows.reduce((sum, row) => sum + (Number(row.tip) || 0), 0);
  const expense = Math.max(0, Number(spent) || 0);
  const patienceAvg = served
    ? servedRows.reduce((sum, row) => sum + pahClamp01(row.patience), 0) / served
    : 0;
  const good = Math.max(0, Number(correct) || 0);
  const bad = Math.max(0, Number(wrong) || 0);
  const answerAccuracy = good + bad ? good / (good + bad) : 0;
  const satisfaction = served ? pahClamp01(patienceAvg * 0.7 + answerAccuracy * 0.3) : 0;
  const stars = served ? starsFor(satisfaction) : 0;
  return {
    served,
    lost,
    correct: good,
    wrong: bad,
    accuracy: good + bad ? Math.round(answerAccuracy * 100) : 0,
    satisfaction,
    revenue,
    tips,
    spent: expense,
    profit: revenue + tips - expense,
    stars,
    xp: Math.max(0, good * 8 + served * 3 + stars * 4),
    coins: revenue + tips,
    reputationStart: Math.round(Number(reputationStart) || 0),
    reputationEnd: Math.round(Number(reputationEnd) || 0),
  };
}

export const normalizeAnswer = (value = "") => String(value)
  .normalize("NFC")
  .trim()
  .toLowerCase()
  .replace(/\s+/g, " ");

/**
 * Sinh câu hỏi 2 chiều Anh ↔ Việt từ thẻ thật, tối đa 4 lựa chọn.
 * random tiêm vào để test được; cần tối thiểu 2 thẻ.
 */
export function buildVocabChallenge(cards = [], random = Math.random) {
  const pool = (Array.isArray(cards) ? cards : []).filter((card) => card && card.term && card.meaning);
  if (pool.length < 2) return null;
  const rnd = pickRandom(random);
  const draw = (items) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.max(0, Math.min(i, Math.floor(rnd() * (i + 1))));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const [card] = draw(pool);
  const direction = rnd() < 0.5 ? "en_vi" : "vi_en";
  const prompt = direction === "en_vi" ? card.term : card.meaning;
  const answer = direction === "en_vi" ? card.meaning : card.term;
  const distractorKey = direction === "en_vi" ? "meaning" : "term";
  const seen = new Set([normalizeAnswer(answer)]);
  const distractors = [];
  for (const item of draw(pool)) {
    if (item === card) continue;
    const value = String(item[distractorKey] || "");
    const key = normalizeAnswer(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    distractors.push(value);
    if (distractors.length >= 3) break;
  }
  return {
    cardId: card.id ?? card.term,
    term: card.term,
    meaning: card.meaning,
    direction,
    prompt,
    answer,
    correct: answer,
    options: draw([answer, ...distractors]),
  };
}

export function checkVocabAnswer(challenge, answer) {
  if (!challenge) return false;
  const expected = challenge.answer ?? challenge.correct ?? challenge.term;
  return normalizeAnswer(answer) === normalizeAnswer(expected);
}

// --------------------------------------------------------- pixel art scene
const PALETTE = {
  skyTop: "#f7cf7d", skyMid: "#f3b967", skyLow: "#eb9d57",
  sun: "#fff0ae", cloud: "#fff7e3",
  wallA: "#b06a50", wallB: "#8f5140", wallC: "#cf8a63",
  window: "#f6d482", windowDark: "#a56b3a",
  street: "#5b3b34", sidewalk: "#8a5a48",
  cartRed: "#c03a2b", cartDark: "#8b281f", cartCream: "#ffefcf",
  pot: "#43434c", broth: "#e9a23b", steam: "#fff4dd",
  skin: "#f2c49b", skinShade: "#d99b70", hair: "#37251f",
  apron: "#f8ecd4", shirt: "#2f6d5a", shirtAlt: "#7c3f5d",
  pants: "#334155", stool: "#7a4a2d", gold: "#f2c14e",
  bone: "#f3e3c3", veg: "#3f8f4f", tomato: "#d94b3f",
  star: "#ffe066", ink: "#352019",
};

/** Dựng danh sách pixel rect thuần (test được, không cần DOM). */
export function buildSceneRects(scene = {}) {
  const phase = scene.phase || "market";
  const mood = scene.mood || "happy";
  const rects = [];
  const put = (x, y, w, h, color) => rects.push({ x, y, w, h, color });

  // trời + nắng + mây
  put(0, 0, 192, 18, PALETTE.skyTop);
  put(0, 18, 192, 18, PALETTE.skyMid);
  put(0, 36, 192, 18, PALETTE.skyLow);
  put(148, 6, 18, 18, PALETTE.sun);
  put(152, 10, 10, 10, "#fff8d8");
  put(16, 10, 20, 5, PALETTE.cloud);
  put(22, 7, 12, 4, PALETTE.cloud);
  put(118, 18, 16, 4, PALETTE.cloud);
  put(122, 15, 9, 4, PALETTE.cloud);

  // dãy nhà hai bên
  put(0, 30, 30, 50, PALETTE.wallA);
  put(30, 22, 24, 58, PALETTE.wallB);
  put(54, 34, 10, 46, PALETTE.wallC);
  put(140, 26, 52, 54, PALETTE.wallA);
  put(176, 34, 16, 46, PALETTE.wallB);
  for (const [x, y] of [[5, 36], [16, 36], [35, 30], [44, 30], [35, 44], [44, 44], [146, 34], [160, 34], [146, 48], [160, 48], [182, 40]]) {
    put(x, y, 7, 7, PALETTE.window);
    put(x + 1, y + 1, 5, 2, PALETTE.windowDark);
  }
  put(0, 74, 192, 6, PALETTE.sidewalk);
  put(0, 80, 192, 28, PALETTE.street);
  put(0, 88, 192, 2, "#4a2f2b");
  put(0, 96, 192, 2, "#4a2f2b");

  // sạp chợ bên trái (phase market/intro)
  if (phase === "market" || phase === "intro") {
    put(2, 48, 42, 4, PALETTE.cartRed);
    put(2, 52, 6, 3, PALETTE.cartCream);
    put(10, 52, 6, 3, PALETTE.cartCream);
    put(18, 52, 6, 3, PALETTE.cartCream);
    put(26, 52, 6, 3, PALETTE.cartCream);
    put(34, 52, 10, 3, PALETTE.cartCream);
    put(4, 55, 38, 20, "#9b5c3f");
    put(8, 62, 8, 6, PALETTE.veg);
    put(18, 62, 7, 6, PALETTE.tomato);
    put(27, 62, 9, 6, PALETTE.gold);
    put(6, 70, 34, 3, "#6f3f2b");
  }

  // xe phở
  put(58, 40, 4, 12, PALETTE.cartDark);
  put(132, 40, 4, 12, PALETTE.cartDark);
  for (let i = 0; i < 10; i += 1) {
    put(56 + i * 8, 46, 4, 10, i % 2 ? PALETTE.cartCream : PALETTE.cartRed);
    put(60 + i * 8, 46, 4, 10, i % 2 ? PALETTE.cartRed : PALETTE.cartCream);
  }
  put(54, 44, 84, 3, PALETTE.cartDark);
  put(54, 56, 84, 26, PALETTE.cartRed);
  put(58, 60, 76, 4, PALETTE.cartDark);
  put(64, 66, 64, 10, PALETTE.cartCream);
  put(68, 68, 56, 6, "#f7d9a8");
  put(56, 80, 12, 10, PALETTE.cartDark);
  put(58, 82, 8, 6, "#2f2a2b");
  put(124, 80, 12, 10, PALETTE.cartDark);
  put(126, 82, 8, 6, "#2f2a2b");

  // nồi nước dùng
  put(66, 52, 28, 3, PALETTE.pot);
  put(64, 55, 32, 8, PALETTE.pot);
  put(68, 55, 24, 4, PALETTE.broth);
  put(70, 56, 20, 2, "#f6bf55");
  put(62, 54, 2, 3, PALETTE.pot);
  put(96, 54, 2, 3, PALETTE.pot);
  if (phase === "cook" || phase === "intro" || phase === "report") {
    put(70, 48, 3, 4, PALETTE.steam);
    put(78, 44, 3, 6, PALETTE.steam);
    put(86, 47, 3, 5, PALETTE.steam);
    put(74, 40, 2, 4, PALETTE.steam);
    put(82, 36, 2, 5, PALETTE.steam);
  }

  // bát phở trên quầy
  put(104, 52, 8, 3, PALETTE.cartCream);
  put(106, 50, 4, 2, PALETTE.broth);
  put(116, 53, 7, 2, PALETTE.cartCream);
  put(118, 51, 3, 2, PALETTE.veg);

  // anh Hai chibi sau xe
  put(90, 26, 18, 5, PALETTE.hair);
  put(88, 30, 22, 2, PALETTE.hair);
  put(92, 31, 14, 11, PALETTE.skin);
  put(92, 34, 2, 2, PALETTE.ink);
  put(104, 34, 2, 2, PALETTE.ink);
  put(97, 38, 4, 1, PALETTE.skinShade);
  put(89, 42, 20, 12, PALETTE.shirt);
  put(94, 43, 10, 12, PALETTE.apron);
  put(90, 54, 6, 4, PALETTE.shirt);
  put(104, 54, 6, 4, PALETTE.shirt);
  put(94, 38, 10, 2, PALETTE.hair);

  // khách chibi khi bán phở
  if (phase === "serve") {
    put(150, 42, 18, 5, mood === "sad" ? "#5a4638" : PALETTE.hair);
    put(148, 46, 22, 2, mood === "sad" ? "#5a4638" : PALETTE.hair);
    put(152, 47, 14, 12, mood === "sad" ? "#e8b58d" : PALETTE.skin);
    put(155, 50, 2, 2, PALETTE.ink);
    put(162, 50, 2, 2, PALETTE.ink);
    put(157, 55, 4, 1, mood === "sad" ? PALETTE.skinShade : PALETTE.tomato);
    put(149, 59, 20, 15, mood === "sad" ? "#71616b" : PALETTE.shirtAlt);
    put(150, 61, 18, 3, "#f1d9b0");
    put(153, 74, 5, 8, PALETTE.pants);
    put(161, 74, 5, 8, PALETTE.pants);
    put(148, 82, 24, 3, PALETTE.stool);
    put(150, 85, 3, 5, PALETTE.stool);
    put(167, 85, 3, 5, PALETTE.stool);
  }

  // tất toán: sao bay
  if (phase === "report") {
    for (const [x, y, s] of [[132, 8, 3], [140, 14, 2], [126, 16, 2], [160, 26, 2]]) {
      put(x, y, s, s, PALETTE.star);
      put(x + s, y + s, s, s, PALETTE.star);
      put(x, y + s, s, s, PALETTE.star);
      put(x + s, y, s, s, PALETTE.star);
    }
  }

  return rects;
}

export function drawPixelScene(ctx, scene = {}) {
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 192, 108);
  for (const rect of buildSceneRects(scene)) {
    ctx.fillStyle = rect.color;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
}

// ------------------------------------------------------------------ state
export const phoAnhHaiState = {
  mounted: false,
  running: false,
  phase: "idle",
  container: null,
};

let runtime = null;

const PHASE_TITLE = {
  intro: "Mở xe",
  market: "Đi chợ",
  cook: "Ninh nước dùng",
  serve: "Bán phở",
  report: "Tất toán",
};

function prefersReduced() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function trackTimer(id) {
  if (runtime) runtime.timers.add(id);
  return id;
}

function scheduleTimeout(fn, ms) {
  if (!runtime) return null;
  const id = setTimeout(() => {
    runtime?.timers.delete(id);
    if (runtime) fn();
  }, ms);
  return trackTimer(id);
}

function scheduleInterval(fn, ms) {
  if (!runtime) return null;
  const id = setInterval(() => {
    if (runtime) fn();
  }, ms);
  return trackTimer(id);
}

function clearTimers() {
  if (!runtime) return;
  runtime.timers.forEach((id) => {
    clearTimeout(id);
    clearInterval(id);
  });
  runtime.timers.clear();
  runtime.patienceTimer = null;
  runtime.simmerTimer = null;
  runtime.simmering = false;
}

function effectivePrices() {
  return applyDiscount(runtime?.prices || {}, runtime?.discount || 0);
}

function dayWallet() {
  return Math.max(160, PAH_DAY_WALLET + Math.floor((Number(runtime?.reputation) || 0) / 10));
}

const money = (value) => `${Math.round(Number(value) || 0)} coin`;
const pct = (value) => `${Math.round(pahClamp01(value) * 100)}%`;

function renderScene(caption, phase, mood = "happy") {
  return `<div class="pah-scene">
    <canvas class="pah-canvas" data-pah-canvas width="192" height="108" aria-hidden="true"></canvas>
    <span class="pah-scene-sign">PHỞ ANH HAI</span>
    <span class="pah-scene-caption">${escapeHTML(caption)}</span>
    <span class="pah-steam" aria-hidden="true"><i></i><i></i><i></i></span>
  </div>`;
}

function renderChallenge(challenge, { action, answered = false, ok = false, promptLabel = "", feedback = "" }) {
  if (!challenge) {
    return `<p class="pah-note">Cần ít nhất 2 thẻ từ vựng để mở thử thách. Bé hãy chọn bộ từ khác.</p>`;
  }
  if (answered) {
    return `<div class="pah-quiz-result ${ok ? "is-ok" : "is-bad"}" role="status">
      <strong>${ok ? "✓ Chính xác" : "✕ Chưa đúng"}</strong>
      <span>${escapeHTML(feedback || (ok ? "Khách hài lòng." : `Đáp án đúng: ${challenge.answer}`))}</span>
    </div>`;
  }
  return `<div class="pah-quiz">
    <p class="pah-kicker">${escapeHTML(promptLabel)}</p>
    <h3 class="pah-quiz-prompt">${escapeHTML(challenge.prompt)}</h3>
    <div class="pah-options">${challenge.options.map((option, index) => `<button type="button" class="pah-option" data-pah="${action}" data-value="${escapeHTML(option)}">
      <b>${String.fromCharCode(65 + index)}</b><span>${escapeHTML(option)}</span>
    </button>`).join("")}</div>
  </div>`;
}

function renderHud() {
  const current = runtime.current;
  return `<header class="pah-hud">
    <div class="pah-brand"><span class="pah-logo" aria-hidden="true">🍜</span><div><strong>PHỞ ANH HAI</strong><small>Ngày ${runtime.day} · ${escapeHTML(PHASE_TITLE[runtime.phase] || "")}</small></div></div>
    <div class="pah-hud-stats">
      <span><small>Ví</small><b>${money(runtime.inventory.wallet)}</b></span>
      <span><small>Uy tín</small><b>${runtime.reputation}/100</b></span>
      <span><small>Từ vựng</small><b>${runtime.vocabCorrect}✓ · ${runtime.vocabWrong}✕</b></span>
      ${runtime.phase === "serve" && current ? `<span class="pah-hud-patience"><small>Kiên nhẫn</small><b data-pah="patience-label">${pct(current.patience)}</b></span>` : ""}
    </div>
    <button type="button" class="pah-icon-btn" data-pah="restart" aria-label="Chơi lại">↻</button>
  </header>`;
}

function renderIntro() {
  return `<section class="pah-shell pah-intro">
    <div class="pah-intro-art">
      ${renderScene("Xe phở buổi sớm", "intro")}
      <div class="pah-shop-sign"><span>PHỞ</span><strong>ANH HAI</strong><small>một tô đậm vị, một từ nhớ lâu</small></div>
    </div>
    <div class="pah-intro-card">
      <p class="pah-kicker">MINI GAME ĐẶC BIỆT</p>
      <h1>Phở Anh Hai</h1>
      <p>Đi chợ lúc sớm, ninh nồi nước dùng và bán phở cho khách. Mỗi câu từ vựng đúng giúp nước dùng đậm hơn, khách kiên nhẫn hơn và tip nhiều hơn.</p>
      <ul class="pah-bullets">
        <li><b>1</b> Trả lời câu đố của bác bán thịt để lấy giá chợ tốt.</li>
        <li><b>2</b> Ninh nước dùng đúng từ vựng để giữ trọn vị ngọt.</li>
        <li><b>3</b> Xác nhận order của khách, dọn phở nhanh để nhận tip.</li>
      </ul>
      <button type="button" class="pah-btn pah-btn-primary pah-btn-lg" data-pah="start-day">MỞ XE PHỞ →</button>
    </div>
  </section>`;
}

function renderMarket() {
  const prices = effectivePrices();
  const stock = runtime.inventory.stock;
  const canToCook = runtime.marketAnswered && canCookBroth(stock) && PAH_DISHES.some((dish) => canMakeDish(stock, dish));
  const items = PAH_INGREDIENTS.map((item) => {
    const price = prices[item.id] ?? item.cost;
    return `<button type="button" class="pah-ing" data-pah="buy" data-id="${item.id}" ${runtime.inventory.wallet < price ? "disabled" : ""}>
      <span class="pah-ing-icon" aria-hidden="true">${item.icon}</span>
      <span class="pah-ing-name">${escapeHTML(item.name)}</span>
      <span class="pah-ing-price">${money(price)}</span>
      <span class="pah-ing-qty">trong kho: ${stock[item.id] || 0}</span>
    </button>`;
  }).join("");
  return `<section class="pah-phase pah-market">
    ${renderScene(`Chợ sớm · Ngày ${runtime.day}`, "market")}
    <div class="pah-panel">
      <div class="pah-panel-head">
        <div><p class="pah-kicker">NGÀY ${runtime.day}</p><h2>Đi chợ đầu ngày</h2></div>
        <span class="pah-wallet">${money(runtime.inventory.wallet)}</span>
      </div>
      ${renderChallenge(runtime.marketChallenge, {
        action: "market-answer",
        answered: runtime.marketAnswered,
        ok: runtime.marketCorrect,
        promptLabel: "BÁC BÁN THỊT ĐỐ TỪ VỰNG",
        feedback: runtime.marketFeedback,
      })}
      <div class="pah-market-grid">${items}</div>
      <p class="pah-note">${runtime.discount > 0 ? `Bác bán thịt giảm ${Math.round(runtime.discount * 100)}% cho cả ngày. ` : ""}Cần 1 xương hầm + 1 gia vị để ninh nước dùng, và đủ nguyên liệu cho ít nhất một tô phở.</p>
      <div class="pah-actions">
        <button type="button" class="pah-btn" data-pah="basket">🛒 Combo gợi ý</button>
        <button type="button" class="pah-btn pah-btn-primary" data-pah="to-cook" ${canToCook ? "" : "disabled"}>Ninh nước dùng →</button>
      </div>
    </div>
  </section>`;
}

function renderCook() {
  const stock = runtime.inventory.stock;
  const ready = canCookBroth(stock);
  const quality = runtime.cookAnswered ? (runtime.cookCorrect ? 100 : 55) : 0;
  return `<section class="pah-phase pah-cook">
    ${renderScene("Bếp lửa · nồi nước dùng", "cook", runtime.cookCorrect ? "happy" : "neutral")}
    <div class="pah-panel">
      <div class="pah-panel-head">
        <div><p class="pah-kicker">BẾP PHỞ</p><h2>Ninh nước dùng</h2></div>
        <span class="pah-wallet">Uy tín ${runtime.reputation}/100</span>
      </div>
      ${renderChallenge(runtime.cookChallenge, {
        action: "cook-answer",
        answered: runtime.cookAnswered,
        ok: runtime.cookCorrect,
        promptLabel: "CANH LỬA — CHỌN TỪ ĐÚNG",
        feedback: runtime.cookFeedback,
      })}
      <div class="pah-broth">
        <div class="pah-broth-head"><span>Chất lượng nước dùng</span><b>${quality}%</b></div>
        <div class="pah-meter"><i style="width:${quality}%"></i></div>
        <small>${ready ? "Đã có xương hầm và gia vị. Trả lời đúng để giữ trọn vị ngọt." : "Thiếu xương hầm hoặc gia vị — quay lại chợ nhé."}</small>
      </div>
      <div class="pah-actions">
        <button type="button" class="pah-btn" data-pah="back-market">← Quay lại chợ</button>
        <button type="button" class="pah-btn pah-btn-primary" data-pah="simmer" ${runtime.cookAnswered && ready && !runtime.simmering ? "" : "disabled"}>${runtime.simmering ? "Đang ninh..." : "Bắt đầu ninh"}</button>
      </div>
      ${runtime.simmering ? `<div class="pah-simmer"><div class="pah-meter"><i data-pah="simmer-fill" style="width:0%"></i></div><p>Nồi nước dùng đang sôi…</p></div>` : ""}
    </div>
  </section>`;
}

function renderServe() {
  const current = runtime.current;
  if (!current) {
    return `<section class="pah-phase pah-serve">${renderScene("Xe phở đang mở", "serve")}<div class="pah-panel"><p class="pah-note">Đang gọi khách…</p></div></section>`;
  }
  const dish = dishById(current.dishId);
  const price = orderPrice(dish, { brothQuality: runtime.brothQuality, reputation: runtime.reputation });
  const recipe = dish ? Object.entries(dish.recipe).map(([id, qty]) => {
    const item = ingredientById(id);
    return item ? `<span class="pah-recipe-chip">${item.icon} ${escapeHTML(item.name)} ×${qty}</span>` : "";
  }).join("") : "";
  return `<section class="pah-phase pah-serve pah-patience-${patienceState(current.patience)}">
    ${renderScene(`${current.name} · đang chờ món`, "serve", current.answered ? (current.answerOk ? "happy" : "sad") : "waiting")}
    <div class="pah-serve-layout">
      <div class="pah-customer">
        <div class="pah-customer-head">
          <div><p class="pah-kicker">KHÁCH ${current.number}/${PAH_DAY_CUSTOMERS}</p><h2>${escapeHTML(current.name)}</h2></div>
          <span class="pah-order-price">${money(price)}</span>
        </div>
        <div class="pah-order-bubble">
          <strong>${dish ? escapeHTML(dish.name) : "Món đã hết"}</strong>
          <span class="pah-recipe">${recipe}</span>
        </div>
        <div class="pah-patience-row"><span>Kiên nhẫn</span><b data-pah="patience-label">${pct(current.patience)}</b></div>
        <div class="pah-patience"><i data-pah="patience-fill" style="width:${pct(current.patience)}"></i></div>
      </div>
      <div class="pah-panel">
        ${renderChallenge(current.challenge, {
          action: "customer-answer",
          answered: current.answered,
          ok: current.answerOk,
          promptLabel: "KHÁCH GỌI MÓN — XÁC NHẬN TỪ VỰNG",
          feedback: current.feedback,
        })}
        <p class="pah-serve-note">${current.answered
          ? (current.answerOk ? "Trả lời đúng rồi! Dọn phở khi khách còn kiên nhẫn để nhận tip cao." : "Trả lời sai: vẫn dọn món được nhưng không có tip.")
          : "Trả lời đúng để xác nhận order và tăng tip."}</p>
        <div class="pah-actions">
          <button type="button" class="pah-btn pah-btn-primary" data-pah="serve" ${current.answered && !current.served ? "" : "disabled"}>DỌN PHỞ →</button>
        </div>
      </div>
    </div>
  </section>`;
}

function renderReport() {
  const summary = runtime.summary;
  if (!summary) return "";
  const studyCoins = Math.max(0, Math.min(50, Math.round(summary.coins / 10)));
  return `<section class="pah-phase pah-report">
    ${renderScene(`Tất toán ngày ${runtime.day}`, "report", summary.stars >= 4 ? "happy" : "neutral")}
    <div class="pah-panel pah-report-card">
      <p class="pah-kicker">HẾT NGÀY ${runtime.day}</p>
      <h2>${summary.stars >= 4 ? "Một ngày đông khách!" : "Tất toán cuối ngày"}</h2>
      <div class="pah-stars" aria-label="${summary.stars} sao">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= summary.stars ? "on" : ""}"></i>`).join("")}</div>
      <ul class="pah-report-list">
        <li><span>Phục vụ</span><b>${summary.served}/${PAH_DAY_CUSTOMERS}</b></li>
        <li><span>Từ vựng</span><b>${summary.correct}✓ · ${summary.wrong}✕ (${summary.accuracy}%)</b></li>
        <li><span>Doanh thu</span><b>${money(summary.revenue)}</b></li>
        <li><span>Tip</span><b>${money(summary.tips)}</b></li>
        <li><span>Chi phí chợ</span><b>-${money(summary.spent)}</b></li>
        <li><span>Lợi nhuận</span><b class="${summary.profit >= 0 ? "is-ok" : "is-bad"}">${money(summary.profit)}</b></li>
        <li><span>Uy tín</span><b>${summary.reputationStart} → ${summary.reputationEnd}/100</b></li>
        <li><span>Thưởng học</span><b>+${summary.xp} XP · +${studyCoins} coin</b></li>
      </ul>
      <div class="pah-actions">
        <button type="button" class="pah-btn pah-btn-primary" data-pah="next-day">Ngày mai →</button>
        <button type="button" class="pah-btn" data-pah="restart">↻ Chơi lại</button>
        <button type="button" class="pah-btn pah-btn-ghost" data-action="exit-special-game">Thoát</button>
      </div>
    </div>
  </section>`;
}

function sceneForPhase() {
  if (runtime.phase === "serve" && runtime.current) {
    return {
      phase: "serve",
      mood: runtime.current.answered ? (runtime.current.answerOk ? "happy" : "sad") : "waiting",
    };
  }
  return {
    phase: runtime.phase,
    mood: runtime.phase === "report" ? (runtime.summary?.stars >= 4 ? "happy" : "neutral") : "happy",
  };
}

function drawScene() {
  const canvas = runtime?.container?.querySelector?.("canvas[data-pah-canvas]");
  if (!canvas || typeof canvas.getContext !== "function") return;
  try {
    drawPixelScene(canvas.getContext("2d"), runtime.scene);
  } catch {
    // Canvas bị chặn/không hỗ trợ: giao diện DOM vẫn chạy bình thường.
  }
}

function scheduleDraw() {
  if (!runtime) return;
  if (typeof requestAnimationFrame !== "function") {
    drawScene();
    return;
  }
  const id = requestAnimationFrame(() => {
    runtime?.rafs.delete(id);
    drawScene();
  });
  runtime.rafs.add(id);
}

function paint() {
  if (!runtime || !runtime.container) return;
  runtime.scene = sceneForPhase();
  runtime.container.innerHTML = runtime.phase === "intro"
    ? renderIntro()
    : `${renderHud()}<div class="pah-stage">${runtime.phase === "market" ? renderMarket()
      : runtime.phase === "cook" ? renderCook()
        : runtime.phase === "serve" ? renderServe()
          : runtime.phase === "report" ? renderReport() : ""}</div>`;
  phoAnhHaiState.phase = runtime.phase;
  phoAnhHaiState.running = runtime.running;
  scheduleDraw();
}

// ------------------------------------------------------------------ audio
function ensureAudio() {
  if (!runtime) return null;
  if (runtime.audio) return runtime.audio;
  if (runtime.audioBlocked) return null;
  const scope = typeof window !== "undefined" ? window : globalThis;
  const Ctor = scope?.AudioContext || scope?.webkitAudioContext;
  if (typeof Ctor !== "function") {
    runtime.audioBlocked = true;
    return null;
  }
  try {
    runtime.audio = new Ctor();
    return runtime.audio;
  } catch {
    runtime.audioBlocked = true;
    return null;
  }
}

const SFX_NOTES = {
  click: [330],
  correct: [523, 784],
  wrong: [196, 147],
  coin: [880, 1175],
  serve: [440, 660],
  report: [523, 659, 784],
};

function sfx(kind) {
  if (!runtime) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") {
      const resumed = ctx.resume?.();
      resumed?.catch?.(() => {});
    }
    const notes = SFX_NOTES[kind] || SFX_NOTES.click;
    const start = ctx.currentTime;
    notes.forEach((frequency, index) => {
      const at = start + index * 0.07;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.055, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.12);
      runtime.audioNodes.add(oscillator);
      oscillator.onended = () => {
        runtime?.audioNodes.delete(oscillator);
        try { gain.disconnect(); } catch { /* already gone */ }
        try { oscillator.disconnect(); } catch { /* already gone */ }
      };
    });
  } catch {
    // WebAudio không khả dụng: chơi tiếp bằng im lặng.
  }
}

function stopAudio() {
  if (!runtime) return;
  runtime.audioNodes.forEach((node) => {
    try { node.stop(0); } catch { /* đã dừng */ }
    try { node.disconnect(); } catch { /* đã ngắt */ }
  });
  runtime.audioNodes.clear();
  const ctx = runtime.audio;
  runtime.audio = null;
  if (ctx) {
    try {
      const closing = ctx.close();
      closing?.catch?.(() => {});
    } catch {
      // context đã đóng
    }
  }
}

// -------------------------------------------------------------- day logic
function expectRandom() {
  return runtime?.random || Math.random;
}

function beginDay(day = 1) {
  if (!runtime) return;
  clearTimers();
  runtime.day = Math.max(1, Math.floor(Number(day) || 1));
  runtime.phase = "market";
  runtime.running = true;
  runtime.reputationStart = runtime.reputation;
  runtime.inventory = { wallet: dayWallet(), stock: {} };
  runtime.prices = marketPrices(runtime.day, expectRandom());
  runtime.discount = 0;
  runtime.marketChallenge = buildVocabChallenge(runtime.cards, expectRandom());
  runtime.marketAnswered = !runtime.marketChallenge;
  runtime.marketCorrect = false;
  runtime.marketFeedback = "";
  runtime.cookChallenge = null;
  runtime.cookAnswered = false;
  runtime.cookCorrect = false;
  runtime.cookFeedback = "";
  runtime.brothQuality = 0;
  runtime.records = [];
  runtime.vocabCorrect = 0;
  runtime.vocabWrong = 0;
  runtime.spent = 0;
  runtime.revenue = 0;
  runtime.tips = 0;
  runtime.streak = 0;
  runtime.current = null;
  runtime.customerIndex = 0;
  runtime.summary = null;
  runtime.finishedNotified = false;
  paint();
}

function buyFromMarket(id) {
  if (!runtime) return;
  const result = buyStock(runtime.inventory, id, 1, effectivePrices());
  if (!result.ok) {
    sfx("wrong");
    return;
  }
  runtime.inventory = result.state;
  runtime.spent += result.cost;
  sfx("coin");
  paint();
}

function buyBasket() {
  if (!runtime) return;
  let bought = 0;
  for (const [id, target] of Object.entries(PAH_BASKET)) {
    const current = runtime.inventory.stock[id] || 0;
    for (let i = current; i < target; i += 1) {
      const result = buyStock(runtime.inventory, id, 1, effectivePrices());
      if (!result.ok) break;
      runtime.inventory = result.state;
      runtime.spent += result.cost;
      bought += 1;
    }
  }
  sfx(bought ? "coin" : "wrong");
  paint();
}

function answerMarket(value) {
  if (!runtime || !runtime.marketChallenge || runtime.marketAnswered) return;
  runtime.marketAnswered = true;
  runtime.marketCorrect = checkVocabAnswer(runtime.marketChallenge, value);
  if (runtime.marketCorrect) {
    runtime.vocabCorrect += 1;
    runtime.discount = 0.2;
    runtime.reputation = reputationAfter(runtime.reputation, "correct");
    runtime.marketFeedback = `Đúng! Bác bán thịt giảm 20% cho cả ngày. Đáp án: ${runtime.marketChallenge.answer}.`;
    sfx("correct");
  } else {
    runtime.vocabWrong += 1;
    runtime.reputation = reputationAfter(runtime.reputation, "wrong");
    runtime.marketFeedback = `Chưa đúng. Đáp án là "${runtime.marketChallenge.answer}". Giá chợ giữ nguyên.`;
    sfx("wrong");
  }
  paint();
}

function toCook() {
  if (!runtime || !runtime.marketAnswered) return;
  if (!canCookBroth(runtime.inventory.stock)) return;
  if (!PAH_DISHES.some((dish) => canMakeDish(runtime.inventory.stock, dish))) return;
  runtime.phase = "cook";
  runtime.cookChallenge = buildVocabChallenge(runtime.cards, expectRandom());
  runtime.cookAnswered = !runtime.cookChallenge;
  runtime.cookCorrect = false;
  runtime.cookFeedback = "";
  sfx("click");
  paint();
}

function answerCook(value) {
  if (!runtime || !runtime.cookChallenge || runtime.cookAnswered) return;
  runtime.cookAnswered = true;
  runtime.cookCorrect = checkVocabAnswer(runtime.cookChallenge, value);
  runtime.brothQuality = runtime.cookCorrect ? 1 : 0.55;
  if (runtime.cookCorrect) {
    runtime.vocabCorrect += 1;
    runtime.reputation = reputationAfter(runtime.reputation, "correct");
    runtime.cookFeedback = `Đúng! Nồi nước dùng giữ trọn vị ngọt. Đáp án: ${runtime.cookChallenge.answer}.`;
    sfx("correct");
  } else {
    runtime.vocabWrong += 1;
    runtime.reputation = reputationAfter(runtime.reputation, "wrong");
    runtime.cookFeedback = `Chưa đúng. Đáp án là "${runtime.cookChallenge.answer}". Nước dùng chỉ đạt 55%.`;
    sfx("wrong");
  }
  paint();
}

function startSimmer() {
  if (!runtime || runtime.simmering || !runtime.cookAnswered) return;
  const result = cookBroth(runtime.inventory.stock, runtime.cookCorrect);
  if (!result.ok) return;
  runtime.inventory = { ...runtime.inventory, stock: result.stock };
  runtime.brothQuality = result.quality;
  runtime.simmering = true;
  paint();
  const duration = prefersReduced() ? 250 : 1600;
  const startedAt = Date.now();
  const timerId = scheduleInterval(() => {
    if (!runtime) return;
    const progress = Math.min(1, (Date.now() - startedAt) / duration);
    const fill = runtime.container?.querySelector?.("[data-pah='simmer-fill']");
    if (fill) fill.style.width = `${Math.round(progress * 100)}%`;
    if (progress >= 1) {
      clearInterval(timerId);
      runtime.timers.delete(timerId);
      runtime.simmerTimer = null;
      runtime.simmering = false;
      beginServe();
    }
  }, 80);
  runtime.simmerTimer = timerId;
}

function beginServe() {
  if (!runtime) return;
  stopPatience();
  runtime.phase = "serve";
  runtime.current = null;
  runtime.customerIndex = 0;
  sfx("click");
  nextCustomer();
}

function nextCustomer() {
  if (!runtime || runtime.phase !== "serve") return;
  runtime.current = null;
  if (runtime.customerIndex >= PAH_DAY_CUSTOMERS) {
    endDay();
    return;
  }
  const dish = pickDish(runtime.inventory.stock, expectRandom());
  if (!dish) {
    endDay();
    return;
  }
  const challenge = buildVocabChallenge(runtime.cards, expectRandom());
  const number = runtime.customerIndex + 1;
  runtime.customerIndex = number;
  runtime.current = {
    number,
    name: PAH_CUSTOMERS[(number + runtime.day - 2) % PAH_CUSTOMERS.length],
    dishId: dish.id,
    challenge,
    patience: 1,
    answered: !challenge,
    answerOk: false,
    feedback: "",
    served: false,
  };
  paint();
  startPatience();
}

function stopPatience() {
  if (!runtime || !runtime.patienceTimer) return;
  clearInterval(runtime.patienceTimer);
  runtime.timers.delete(runtime.patienceTimer);
  runtime.patienceTimer = null;
}

function startPatience() {
  if (!runtime) return;
  stopPatience();
  let last = Date.now();
  runtime.patienceTimer = scheduleInterval(() => {
    if (!runtime || runtime.phase !== "serve" || !runtime.current || runtime.current.served) return;
    const now = Date.now();
    const elapsed = Math.max(0, (now - last) / 1000);
    last = now;
    const current = runtime.current;
    current.patience = tickPatience(current.patience, elapsed, runtime.rules);
    const fill = runtime.container?.querySelector?.("[data-pah='patience-fill']");
    if (fill) fill.style.width = pct(current.patience);
    const label = runtime.container?.querySelector?.("[data-pah='patience-label']");
    if (label) label.textContent = pct(current.patience);
    const phase = runtime.container?.querySelector?.(".pah-serve");
    if (phase) phase.className = `pah-phase pah-serve pah-patience-${patienceState(current.patience)}`;
    if (current.patience <= 0) customerLeaves();
  }, 200);
}

function answerCustomer(value) {
  if (!runtime || !runtime.current) return;
  const current = runtime.current;
  if (current.answered || current.served) return;
  current.answered = true;
  current.answerOk = checkVocabAnswer(current.challenge, value);
  if (current.answerOk) {
    runtime.vocabCorrect += 1;
    runtime.streak += 1;
    current.patience = applyPatienceEvent(current.patience, "correct", runtime.rules);
    runtime.reputation = reputationAfter(runtime.reputation, "correct");
    current.feedback = `Đúng! Đáp án: ${current.challenge?.answer || ""}. Dọn phở ngay nhé.`;
    sfx("correct");
  } else {
    runtime.vocabWrong += 1;
    runtime.streak = 0;
    current.patience = applyPatienceEvent(current.patience, "wrong", runtime.rules);
    runtime.reputation = reputationAfter(runtime.reputation, "wrong");
    current.feedback = `Chưa đúng. Đáp án là "${current.challenge?.answer || ""}". Khách vẫn chờ nhưng sẽ không có tip.`;
    sfx("wrong");
  }
  paint();
  if (current.patience <= 0) customerLeaves();
}

function serveCurrent() {
  if (!runtime || !runtime.current) return;
  const current = runtime.current;
  if (!current.answered || current.served) return;
  const dish = dishById(current.dishId);
  const consumed = consumeRecipe(runtime.inventory.stock, dish);
  if (!consumed.ok) {
    current.feedback = "Thiếu nguyên liệu để dọn tô này. Hãy quay lại chợ ở ngày tiếp theo.";
    paint();
    return;
  }
  const price = orderPrice(dish, { brothQuality: runtime.brothQuality, reputation: runtime.reputation });
  const tip = tipFor({ price, patience: current.patience, correct: current.answerOk, streak: runtime.streak });
  runtime.inventory = { ...runtime.inventory, stock: consumed.stock };
  runtime.revenue += price;
  runtime.tips += tip;
  runtime.reputation = reputationAfter(runtime.reputation, current.answerOk && current.patience >= 0.85 ? "perfect" : "served");
  runtime.records.push({
    dishId: current.dishId,
    price,
    tip,
    patience: current.patience,
    correct: Boolean(current.answerOk),
    served: true,
  });
  current.served = true;
  current.patience = applyPatienceEvent(current.patience, "served", runtime.rules);
  stopPatience();
  sfx("serve");
  paint();
  runtime.onScore?.({ coins: price + tip, price, tip, correct: Boolean(current.answerOk) });
  scheduleTimeout(nextCustomer, prefersReduced() ? 250 : 900);
}

function customerLeaves() {
  if (!runtime || !runtime.current) return;
  const current = runtime.current;
  if (current.served) return;
  stopPatience();
  runtime.reputation = reputationAfter(runtime.reputation, "lost");
  runtime.records.push({
    dishId: current.dishId,
    price: 0,
    tip: 0,
    patience: 0,
    correct: Boolean(current.answerOk),
    served: false,
  });
  current.served = true;
  current.feedback = "Khách đã bỏ đi vì chờ quá lâu.";
  sfx("wrong");
  paint();
  scheduleTimeout(nextCustomer, prefersReduced() ? 300 : 900);
}

function endDay() {
  if (!runtime || runtime.phase === "report") return;
  stopPatience();
  clearTimers();
  const summary = settleDay(runtime.records, {
    spent: runtime.spent,
    total: PAH_DAY_CUSTOMERS,
    correct: runtime.vocabCorrect,
    wrong: runtime.vocabWrong,
    reputationStart: runtime.reputationStart,
    reputationEnd: runtime.reputation,
  });
  runtime.summary = summary;
  runtime.phase = "report";
  runtime.running = true;
  paint();
  sfx("report");
  if (!runtime.finishedNotified) {
    runtime.finishedNotified = true;
    try {
      runtime.onFinish?.(summary);
    } catch (error) {
      console.error?.("Pho Anh Hai onFinish failed", error);
    }
  }
}

// ------------------------------------------------------------- event wiring
function onEvent(event) {
  const target = event.target?.closest?.("[data-pah]");
  if (!target || !runtime) return;
  const action = target.dataset?.pah;
  const value = target.dataset?.value;
  if (!action) return;
  event.preventDefault?.();
  if (action === "start-day") {
    beginDay(1);
  } else if (action === "buy") {
    buyFromMarket(target.dataset.id);
  } else if (action === "basket") {
    buyBasket();
  } else if (action === "market-answer") {
    answerMarket(value);
  } else if (action === "to-cook") {
    toCook();
  } else if (action === "back-market") {
    if (runtime.phase === "cook" && !runtime.simmering) {
      runtime.phase = "market";
      paint();
    }
  } else if (action === "cook-answer") {
    answerCook(value);
  } else if (action === "simmer") {
    startSimmer();
  } else if (action === "customer-answer") {
    answerCustomer(value);
  } else if (action === "serve") {
    serveCurrent();
  } else if (action === "next-day") {
    beginDay(runtime.day + 1);
  } else if (action === "restart") {
    startPhoAnhHai();
  }
}

// ---------------------------------------------------------------- lifecycle
function resetSession() {
  if (!runtime) return;
  runtime.day = 1;
  runtime.reputation = PAH_START_REPUTATION;
  runtime.reputationStart = PAH_START_REPUTATION;
  runtime.inventory = { wallet: PAH_DAY_WALLET, stock: {} };
  runtime.prices = {};
  runtime.discount = 0;
  runtime.marketChallenge = null;
  runtime.marketAnswered = false;
  runtime.marketCorrect = false;
  runtime.marketFeedback = "";
  runtime.cookChallenge = null;
  runtime.cookAnswered = false;
  runtime.cookCorrect = false;
  runtime.cookFeedback = "";
  runtime.brothQuality = 0;
  runtime.records = [];
  runtime.vocabCorrect = 0;
  runtime.vocabWrong = 0;
  runtime.spent = 0;
  runtime.revenue = 0;
  runtime.tips = 0;
  runtime.streak = 0;
  runtime.current = null;
  runtime.customerIndex = 0;
  runtime.summary = null;
  runtime.finishedNotified = false;
  runtime.phase = "intro";
  runtime.running = true;
}

export function mountPhoAnhHai(containerEl, {
  cards = [],
  onFinish,
  onScore,
  random = Math.random,
  rules = GAME_PATIENCE,
} = {}) {
  unmountPhoAnhHai();
  if (!containerEl) return null;
  const abort = typeof AbortController === "function" ? new AbortController() : null;
  runtime = {
    container: containerEl,
    cards: (Array.isArray(cards) ? cards : []).filter((card) => card && card.term && card.meaning),
    onFinish,
    onScore,
    random: typeof random === "function" ? random : Math.random,
    rules: rules || GAME_PATIENCE,
    timers: new Set(),
    rafs: new Set(),
    patienceTimer: null,
    simmerTimer: null,
    simmering: false,
    audio: null,
    audioNodes: new Set(),
    audioBlocked: false,
    listeners: 0,
    abort: null,
    manualListener: false,
    day: 1,
    reputation: PAH_START_REPUTATION,
    reputationStart: PAH_START_REPUTATION,
    inventory: { wallet: PAH_DAY_WALLET, stock: {} },
    prices: {},
    discount: 0,
    marketChallenge: null,
    marketAnswered: false,
    marketCorrect: false,
    marketFeedback: "",
    cookChallenge: null,
    cookAnswered: false,
    cookCorrect: false,
    cookFeedback: "",
    brothQuality: 0,
    records: [],
    vocabCorrect: 0,
    vocabWrong: 0,
    spent: 0,
    revenue: 0,
    tips: 0,
    streak: 0,
    current: null,
    customerIndex: 0,
    summary: null,
    finishedNotified: false,
    phase: "intro",
    running: false,
    scene: { phase: "intro", mood: "happy" },
  };
  if (abort) {
    runtime.abort = abort;
    containerEl.addEventListener("click", onEvent, { signal: abort.signal });
  } else {
    containerEl.addEventListener("click", onEvent);
    runtime.manualListener = true;
  }
  runtime.listeners = 1;
  containerEl.classList?.add("pah-root");
  phoAnhHaiState.mounted = true;
  phoAnhHaiState.running = false;
  phoAnhHaiState.phase = "intro";
  phoAnhHaiState.container = containerEl;
  paint();
  return api();
}

export function startPhoAnhHai() {
  if (!runtime || !runtime.container) return false;
  clearTimers();
  resetSession();
  paint();
  return true;
}

export function unmountPhoAnhHai() {
  if (!runtime) {
    phoAnhHaiState.mounted = false;
    phoAnhHaiState.running = false;
    phoAnhHaiState.phase = "idle";
    phoAnhHaiState.container = null;
    return false;
  }
  const container = runtime.container;
  clearTimers();
  runtime.rafs.forEach((id) => {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
  });
  runtime.rafs.clear();
  stopAudio();
  try {
    runtime.abort?.abort();
  } catch {
    // listener đã gỡ
  }
  if (!runtime.abort && runtime.manualListener) container?.removeEventListener?.("click", onEvent);
  runtime.listeners = 0;
  runtime.container = null;
  container?.classList?.remove("pah-root");
  if (container) container.innerHTML = "";
  runtime = null;
  phoAnhHaiState.mounted = false;
  phoAnhHaiState.running = false;
  phoAnhHaiState.phase = "idle";
  phoAnhHaiState.container = null;
  return true;
}

/** Snapshot kiểm tra cleanup: mọi con số phải về 0 sau unmount. */
export function cleanupReport() {
  const state = runtime;
  return {
    mounted: Boolean(state),
    phase: state?.phase || "idle",
    timers: state ? state.timers.size : 0,
    rafs: state ? state.rafs.size : 0,
    listeners: state ? state.listeners : 0,
    audio: Boolean(state?.audio),
    domEmpty: !state?.container || !state.container.innerHTML,
  };
}

function api() {
  return {
    start: startPhoAnhHai,
    unmount: unmountPhoAnhHai,
    cleanup: cleanupReport,
    getState: () => (runtime ? {
      phase: runtime.phase,
      day: runtime.day,
      wallet: runtime.inventory.wallet,
      stock: { ...runtime.inventory.stock },
      reputation: runtime.reputation,
      correct: runtime.vocabCorrect,
      wrong: runtime.vocabWrong,
      summary: runtime.summary,
    } : null),
  };
}

export default { mountPhoAnhHai, startPhoAnhHai, unmountPhoAnhHai };
