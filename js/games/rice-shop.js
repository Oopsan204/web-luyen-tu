// Quán Cơm Tấm — game từ vựng (module tự chứa, mount/unmount/start)
import { escapeHTML } from "../core.js";

const A = "assets/games/rice-shop";

export const RS_ASSETS = {
  customers: {
    thinking: `${A}/characters/customer_thinking_glasses.png`,
    sad: `${A}/characters/customer_sad_boy.png`,
    happyGirl: `${A}/characters/customer_happy_girl.png`,
    happyHat: `${A}/characters/customer_happy_hat.png`,
    excited: `${A}/characters/customer_excited_boy.png`,
  },
  chef: `${A}/characters/chef_thumbsup.png`,
  bacTu: `${A}/characters/bac_tu.png`,
  reaction: {
    happy: `${A}/characters/reaction_happy.png`,
    neutral: `${A}/characters/reaction_neutral.png`,
    sad: `${A}/characters/reaction_sad.png`,
  },
  bubble: { blank: `${A}/characters/order_bubble_blank.png`, food: `${A}/characters/order_bubble_food.png` },
  station: {
    grill: `${A}/station/grill.png`,
    plate: `${A}/station/plate_single.png`,
    tray: `${A}/station/serving_tray.png`,
    done: `${A}/station/completed_plate.png`,
    drink: `${A}/station/drink_card.png`,
  },
  ui: {
    hud: `${A}/ui/hud.png`,
    quiz: `${A}/ui/quiz_modal.png`,
    patience: `${A}/ui/patience_bar.png`,
    rating: `${A}/ui/rating_panel.png`,
    revenue: `${A}/ui/revenue_panel.png`,
    inventory: `${A}/ui/inventory_card.png`,
    budget: `${A}/ui/budget_panel.png`,
    startSelling: `${A}/ui/start_selling_button.png`,
    openDay: `${A}/ui/open_day_button.png`,
  },
  food: { coin: `${A}/food/coin.png`, sparkle: `${A}/food/sparkle.png`, stars: `${A}/food/stars_5.png` },
};

// ---------------------------------------------------------------- catalog
export const INGREDIENTS = [
  { id: "com", name: "Cơm", img: `${A}/station/rice_pot.png`, cost: 2 },
  { id: "ga", name: "Thịt gà", img: `${A}/station/chicken.png`, cost: 6 },
  { id: "suon", name: "Sườn heo", img: `${A}/station/pork.png`, cost: 6 },
  { id: "ba_chi", name: "Ba chỉ", img: `${A}/station/pork_belly.png`, cost: 5 },
  { id: "tom", name: "Tôm", img: `${A}/station/shrimp.png`, cost: 5 },
  { id: "ca", name: "Cá", img: `${A}/station/fish.png`, cost: 5 },
  { id: "cha_trung", name: "Chả trứng", img: `${A}/food/cha_trung.png`, cost: 4 },
  { id: "bi_heo", name: "Bì heo", img: `${A}/food/bi_heo.png`, cost: 3 },
  { id: "fried_egg", name: "Trứng ốp la", img: `${A}/food/fried_egg.png`, cost: 3 },
  { id: "cucumber", name: "Dưa leo", img: `${A}/food/cucumber.png`, cost: 1 },
  { id: "tomato", name: "Cà chua", img: `${A}/food/tomato.png`, cost: 1 },
  { id: "do_chua", name: "Đồ chua", img: `${A}/food/do_chua.png`, cost: 1 },
  { id: "mo_hanh", name: "Mỡ hành", img: `${A}/food/mo_hanh.png`, cost: 1 },
  { id: "nuoc_mam", name: "Nước mắm", img: `${A}/food/nuoc_mam.png`, cost: 1 },
  { id: "peanuts", name: "Đậu phộng", img: `${A}/food/peanuts.png`, cost: 1 },
  { id: "garnish", name: "Rau sợi", img: `${A}/food/shredded_garnish.png`, cost: 1 },
  { id: "drink", name: "Nước uống", img: `${A}/station/drink_card.png`, cost: 3 },
];

export const DISHES = [
  { id: "com_ga", name: "Cơm gà", price: 45, plate: `${A}/food/plate_chicken.png`, recipe: ["com", "ga", "cucumber", "nuoc_mam"] },
  { id: "com_suon", name: "Cơm sườn bì chả", price: 52, plate: `${A}/food/plate_pork.png`, recipe: ["com", "suon", "bi_heo", "cha_trung", "nuoc_mam"] },
  { id: "com_chien", name: "Cơm chiên trứng", price: 38, plate: `${A}/station/completed_plate.png`, recipe: ["com", "fried_egg", "mo_hanh", "tomato"] },
  { id: "com_tom", name: "Cơm tôm", price: 48, plate: `${A}/station/completed_plate.png`, recipe: ["com", "tom", "do_chua", "peanuts"] },
];

const ingredientById = (id) => INGREDIENTS.find((item) => item.id === id) || null;
export const dishById = (id) => DISHES.find((d) => d.id === id) || null;

// ------------------------------------------------------------ pure logic
export const clamp01 = (n) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

export const DEFAULT_PATIENCE = { correct: 0.12, wrong: -0.3, served: 0.05, drainPerSec: 0.1 };

export function patienceState(p) {
  const value = clamp01(p);
  if (value >= 0.5) return "calm";
  if (value >= 0.2) return "uneasy";
  return "angry";
}

/** Sự kiện rút/cộng kiên nhẫn thuần tuý: correct | wrong | served | timeout. */
export function applyPatience(patience, event, rules = DEFAULT_PATIENCE) {
  if (event === "timeout") return 0;
  const delta = rules[event];
  return clamp01(patience + (delta ?? 0));
}

export function tickPatience(patience, elapsedSec, rules = DEFAULT_PATIENCE) {
  return clamp01(patience - rules.drainPerSec * elapsedSec);
}

/** Độ chính xác đĩa cơm: khớp / thiếu / thừa so với công thức. */
export function plateAccuracy(recipe, picked) {
  const need = new Set(recipe);
  const got = new Set(picked);
  const matched = [...got].filter((id) => need.has(id)).length;
  const missing = recipe.filter((id) => !got.has(id));
  const extra = picked.filter((id) => !need.has(id));
  const accuracy = recipe.length ? clamp01((matched - extra.length) / recipe.length) : 1;
  return { accuracy, matched, missing, extra, perfect: missing.length === 0 && extra.length === 0 };
}

export const orderPrice = (dish, withDrink = false) => dish.price + (withDrink ? 12 : 0);

export function tipFor({ price, accuracy, patience, streak = 0 }) {
  const base = price * 0.15 * clamp01(accuracy) * clamp01(patience);
  return Math.round(base + (streak >= 3 ? 5 : 0));
}

/** Mua nguyên liệu: trả về state mới, không sửa state cũ. */
export function buyIngredient(state, id, qty = 1, catalog = INGREDIENTS) {
  const item = catalog.find((entry) => entry.id === id);
  if (!item || qty <= 0) return { state, ok: false, reason: "invalid" };
  const cost = item.cost * qty;
  if (cost > state.budget) return { state, ok: false, reason: "budget" };
  return {
    state: { budget: state.budget - cost, stock: { ...state.stock, [id]: (state.stock[id] || 0) + qty } },
    ok: true,
    cost,
  };
}

/** Trừ nguyên liệu khi xếp đĩa; thiếu thì trả short + giữ nguyên state. */
export function consumeStock(state, picked) {
  const short = [];
  const stock = { ...state.stock };
  for (const id of picked) {
    if ((stock[id] || 0) <= 0) short.push(id);
    else stock[id] -= 1;
  }
  return { state: { ...state, stock }, short, ok: short.length === 0 };
}

export const inventoryValue = (state, catalog = INGREDIENTS) => Object.entries(state.stock).reduce((sum, [id, qty]) => {
  const item = catalog.find((entry) => entry.id === id);
  return sum + (item ? item.cost * qty : 0);
}, 0);

export function starsFor(satisfaction) {
  const s = clamp01(satisfaction);
  if (s >= 0.9) return 5;
  if (s >= 0.75) return 4;
  if (s >= 0.5) return 3;
  if (s >= 0.3) return 2;
  return 1;
}

/** Tổng kết một ngày: records = [{ price, accuracy, patience, tip, served }]. */
export function settleDay(records = [], { spent = 0 } = {}) {
  const served = records.filter((row) => row.served);
  const revenue = served.reduce((sum, row) => sum + row.price, 0);
  const tips = served.reduce((sum, row) => sum + (row.tip || 0), 0);
  const satisfaction = served.length
    ? served.reduce((sum, row) => sum + clamp01(row.accuracy) * clamp01(row.patience), 0) / served.length
    : 0;
  return {
    served: served.length,
    lost: records.length - served.length,
    revenue,
    tips,
    spent,
    profit: revenue + tips - spent,
    satisfaction,
    stars: served.length ? starsFor(satisfaction) : 0,
    coins: revenue + tips,
  };
}

export const normalizeAnswer = (value = "") => String(value).trim().toLowerCase().replace(/\s+/g, " ");

/** Sinh câu hỏi từ thẻ thật (quiz 4 lựa chọn) — random tiêm vào để test được. */
export function buildChallenge(cards = [], random = Math.random) {
  const pool = cards.filter((card) => card && card.term && card.meaning);
  if (pool.length < 2) return null;
  const draw = (arr) => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const [card] = draw(pool).slice(0, 1);
  const distractors = draw(pool.filter((item) => item.id !== card.id)).slice(0, 3).map((item) => item.term);
  const options = draw([card.term, ...distractors, ...(distractors.length < 3 ? draw([card.term, "com", "phở", "bún"]).filter((t) => t !== card.term).slice(0, 3 - distractors.length) : [])]);
  return { cardId: card.id, term: card.term, meaning: card.meaning, options: [...new Set(options)] };
}

export function checkAnswer(challenge, answer) {
  if (!challenge) return false;
  return normalizeAnswer(answer) === normalizeAnswer(challenge.term);
}

// ------------------------------------------------------------------ state
const DAY_CUSTOMERS = 5;
const START_BUDGET = 70;

export const riceShopState = {
  mounted: false,
  running: false,
  container: null,
  phase: "idle",
};

let runtime = null;

function freshDay() {
  return { patience: 1, streak: 0, records: [], spent: 0, index: 0, total: DAY_CUSTOMERS, dishId: null, picked: [], accuracy: null, served: false, answered: false, mode: "quiz", challenge: null, customer: null };
}

// ---------------------------------------------------------------- helpers
function prefersReduced() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function trackTimer(id) {
  if (runtime) runtime.timers.add(id);
  return id;
}

function timeout(fn, ms) {
  const id = setTimeout(() => {
    runtime?.timers.delete(id);
    if (runtime?.container) fn();
  }, ms);
  return trackTimer(id);
}

function interval(fn, ms) {
  return trackTimer(setInterval(() => {
    if (runtime?.container) fn();
  }, ms));
}

function flySprite(fromEl, toEl, img, { size = 44, duration = 420, fade = false } = {}) {
  if (!runtime || prefersReduced() || !fromEl || !toEl) return null;
  const from = fromEl.getBoundingClientRect();
  const to = toEl.getBoundingClientRect();
  const node = document.createElement("img");
  node.src = img;
  node.alt = "";
  node.className = "rs-fly";
  node.style.cssText = `left:${from.left + from.width / 2 - size / 2}px;top:${from.top + from.height / 2 - size / 2}px;width:${size}px;height:${size}px`;
  document.body.appendChild(node);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const anim = node.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx}px,${dy}px) scale(.55)`, opacity: fade ? 0 : 1 },
    ],
    { duration, easing: "cubic-bezier(.3,.7,.3,1)" },
  );
  anim.onfinish = () => node.remove();
  anim.oncancel = () => node.remove();
  return node;
}

function burst(host, img, className = "rs-sparkle") {
  if (!runtime || prefersReduced() || !host) return;
  const node = document.createElement("img");
  node.src = img;
  node.alt = "";
  node.className = className;
  host.appendChild(node);
  timeout(() => node.remove(), 700);
}

// ------------------------------------------------------------------- view
const customerSprite = (day) => {
  if (!day.customer) return RS_ASSETS.customers.thinking;
  if (day.served) return RS_ASSETS.customers.happyGirl;
  if (day.accuracy !== null && !day.served) return RS_ASSETS.customers.sad;
  return day.customer.sprite;
};

function renderTutorial() {
  const step = runtime.tutorialStep;
  const slides = [
    { title: "Chào mừng tới Quán Cơm Tấm", text: "Bác Tư dạy bạn cách mở quán: mua nguyên liệu, bán cơm và kiếm coin.", img: RS_ASSETS.bacTu },
    { title: "Khách gọi món", text: "Khách đọc món. Trả lời đúng từ vựng để bắt đầu xếp đĩa.", img: RS_ASSETS.customers.thinking },
    { title: "Xếp đĩa thật chuẩn", text: "Chọn đúng nguyên liệu theo công thức, giữ khách vui và nhận tip.", img: RS_ASSETS.chef },
  ];
  const slide = slides[step];
  return `
  <section class="rs-panel rs-tutorial">
    <h2>${escapeHTML(slide.title)}</h2>
    <img class="rs-art" src="${slide.img}" alt="">
    <p>${escapeHTML(slide.text)}</p>
    <div class="rs-dots">${slides.map((_, i) => `<i class="${i === step ? "on" : ""}"></i>`).join("")}</div>
    <button type="button" class="rs-btn rs-btn-primary" data-rs="tutorial-next">${step === slides.length - 1 ? "Vào bếp" : "Tiếp"}</button>
  </section>`;
}

function renderPrep() {
  const { budget, stock } = runtime.inventory;
  const stockable = INGREDIENTS.map((item) => `
    <button type="button" class="rs-item" data-rs="buy" data-id="${item.id}">
      <img src="${item.img}" alt="">
      <span class="rs-item-name">${escapeHTML(item.name)}</span>
      <span class="rs-item-cost">${item.cost} coin</span>
      <span class="rs-item-qty">x${stock[item.id] || 0}</span>
    </button>`).join("");
  return `
  <section class="rs-panel rs-prep">
    <header class="rs-budget"><img class="rs-card-art" src="${RS_ASSETS.ui.inventory}" alt=""><h2>Đi chợ</h2><b class="rs-coins" data-rs="budget">${budget} coin</b></header>
    <p class="rs-hint">Chọn nguyên liệu cho thực đơn hôm nay (có ${START_BUDGET} coin vốn).</p>
    <div class="rs-grid rs-market">${stockable}</div>
    <footer class="rs-actions"><button type="button" class="rs-btn rs-btn-primary" data-rs="open-day">Mở quán</button></footer>
  </section>`;
}

function renderChallenge(day) {
  if (!day.challenge) return "";
  if (day.mode === "typing") {
    return `<div class="rs-challenge"><img class="rs-card-art" src="${RS_ASSETS.ui.quiz}" alt="">
      <p class="rs-prompt">Nghe khách gọi: <b>${escapeHTML(day.challenge.meaning)}</b> là từ nào?</p>
      <form class="rs-typing" data-rs="typing-form"><input name="answer" autocomplete="off" aria-label="Gõ từ tiếng Anh" placeholder="Gõ từ..."><button type="submit" class="rs-btn">Trả lời</button></form>
    </div>`;
  }
  return `<div class="rs-challenge"><img class="rs-card-art" src="${RS_ASSETS.ui.quiz}" alt="">
    <p class="rs-prompt">Khách gọi món <b>${escapeHTML(day.challenge.meaning)}</b> — chọn từ đúng:</p>
    <div class="rs-options">${day.challenge.options.map((opt) => `<button type="button" class="rs-btn" data-rs="answer" data-value="${escapeHTML(opt)}">${escapeHTML(opt)}</button>`).join("")}</div>
  </div>`;
}

function renderPlate(day) {
  const dish = day.dishId ? dishById(day.dishId) : null;
  const picked = day.picked.map((id) => {
    const item = ingredientById(id);
    return item ? `<li data-rs="picked" data-id="${item.id}"><img src="${item.img}" alt=""><span>${escapeHTML(item.name)}</span></li>` : "";
  }).join("");
  const leftovers = INGREDIENTS.filter((item) => (runtime.inventory.stock[item.id] || 0) > 0 && !day.picked.includes(item.id))
    .map((item) => `<button type="button" class="rs-item" data-rs="pick" data-id="${item.id}"><img src="${item.img}" alt=""><span>${escapeHTML(item.name)}</span><span class="rs-item-qty">x${runtime.inventory.stock[item.id]}</span></button>`).join("");
  return `
  <div class="rs-station">
    <div class="rs-grill"><img src="${RS_ASSETS.station.grill}" alt=""></div>
    <div class="rs-plate" data-rs="plate">
      <img class="rs-plate-base" src="${RS_ASSETS.station.plate}" alt="Đĩa cơm đang xếp">
      <ul class="rs-picked">${picked}</ul>
      ${dish && day.accuracy !== null ? `<img class="rs-dish-done ${day.accuracy === 1 ? "perfect" : ""}" src="${dish.plate}" alt="${escapeHTML(dish.name)}">` : ""}
    </div>
    <img class="rs-tray-bg" src="${RS_ASSETS.station.tray}" alt="">
    <div class="rs-grid rs-tray">${leftovers}</div>
    <button type="button" class="rs-btn rs-btn-primary" data-rs="serve" ${day.picked.length ? "" : "disabled"}>Phục vụ</button>
  </div>`;
}

function renderDay() {
  const day = runtime.day;
  const dish = day.dishId ? dishById(day.dishId) : null;
  const reaction = day.accuracy === null ? null : (day.served && day.accuracy === 1 ? RS_ASSETS.reaction.happy : day.accuracy === 0 ? RS_ASSETS.reaction.sad : RS_ASSETS.reaction.neutral);
  const pct = Math.round(clamp01(day.patience) * 100);
  return `
  <section class="rs-panel rs-day rs-phase-${patienceState(day.patience)}">
    <header class="rs-hud">
      <img class="rs-hud-bg" src="${RS_ASSETS.ui.hud}" alt="">
      <span class="rs-hud-coins" data-rs="hud-coins"><img src="${RS_ASSETS.food.coin}" alt="">${runtime.earned}</span>
      <span class="rs-hud-budget">${runtime.inventory.budget} coin</span>
      <span class="rs-hud-customer">Khách ${Math.min(day.index + 1, day.total)}/${day.total}</span>
    </header>
    <div class="rs-customer">
      <img class="rs-sprite" id="rs-customer-sprite" src="${customerSprite(day)}" alt="Khách hàng">
      <div class="rs-bubble">
        <img class="rs-bubble-bg" src="${RS_ASSETS.bubble.food}" alt="">
        ${dish ? `<img class="rs-bubble-dish" src="${dish.plate}" alt="${escapeHTML(dish.name)}"><span>${escapeHTML(dish.name)}</span>` : ""}
      </div>
      ${reaction ? `<img class="rs-reaction rs-pop" src="${reaction}" alt="">` : ""}
    </div>
    <div class="rs-patience" role="progressbar" aria-label="Kiên nhẫn của khách" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
      <img src="${RS_ASSETS.ui.patience}" alt="">
      <i class="rs-patience-fill" style="width:${pct}%"></i>
    </div>
    ${day.served ? "" : renderChallenge(day)}
    ${renderPlate(day)}
  </section>`;
}

function renderReport() {
  const summary = runtime.summary;
  return `
  <section class="rs-panel rs-report">
    <h2>Hết ngày</h2>
    <img class="rs-art" src="${RS_ASSETS.ui.revenue}" alt="">
    <ul class="rs-report-list">
      <li>Phục vụ: <b>${summary.served}</b>/${summary.served + summary.lost}</li>
      <li>Doanh thu: <b>${summary.revenue} coin</b></li>
      <li>Tip: <b>${summary.tips} coin</b></li>
      <li>Chi phí: <b>${summary.spent} coin</b></li>
      <li>Lợi nhuận: <b class="rs-profit">${summary.profit} coin</b></li>
    </ul>
    <div class="rs-stars" aria-label="${summary.stars} sao">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= summary.stars ? "on" : ""}"></i>`).join("")}</div>
    <img class="rs-art rs-rating" src="${RS_ASSETS.ui.rating}" alt="Bảng đánh giá">
    <button type="button" class="rs-btn rs-btn-primary" data-rs="finish">Xong</button>
  </section>`;
}

function paint() {
  if (!runtime || !runtime.container) return;
  const phase = runtime.phase;
  riceShopState.phase = phase;
  runtime.container.innerHTML = phase === "tutorial" ? renderTutorial()
    : phase === "prep" ? renderPrep()
      : phase === "day" ? renderDay()
        : phase === "report" ? renderReport()
          : "";
}

// -------------------------------------------------------------- day logic
function nextCustomer() {
  const day = runtime.day;
  if (day.index >= day.total) return endDay();
  const cards = runtime.cards;
  const dish = runtime.dishPool[Math.floor(runtime.random() * runtime.dishPool.length)];
  const challenge = buildChallenge(cards, runtime.random);
  day.dishId = dish.id;
  day.picked = [];
  day.accuracy = null;
  day.served = false;
  day.patience = 1;
  day.challenge = challenge;
  day.answered = false;
  day.mode = day.index % 2 === 0 ? "quiz" : "typing";
  day.customer = { sprite: runtime.customers[Math.floor(runtime.random() * runtime.customers.length)] };
  day.index += 1;
  paint();
  startPatience();
}

function startPatience() {
  clearInterval(runtime.patienceTimer);
  let last = Date.now();
  runtime.patienceTimer = interval(() => {
    const now = Date.now();
    const elapsed = (now - last) / 1000;
    last = now;
    const day = runtime.day;
    if (day.served) return;
    day.patience = tickPatience(day.patience, elapsed, runtime.rules);
    const fill = runtime.container?.querySelector(".rs-patience-fill");
    if (fill) fill.style.width = `${Math.round(day.patience * 100)}%`;
    runtime.container?.querySelector(".rs-day")?.classList.toggle("rs-phase-angry", patienceState(day.patience) === "angry");
    if (day.patience <= 0) customerLeft();
  }, 200);
}

function stopPatience() {
  clearInterval(runtime.patienceTimer);
  if (runtime) runtime.patienceTimer = null;
}

function customerLeft() {
  const day = runtime.day;
  stopPatience();
  day.served = false;
  day.accuracy = 0;
  day.picked = [];
  day.customer = { sprite: RS_ASSETS.customers.sad };
  runtime.day.streak = 0;
  day.records.push({ price: 0, accuracy: 0, patience: 0, tip: 0, served: false });
  paint();
  timeout(nextCustomer, 900);
}

function resolveAnswer(ok) {
  const day = runtime.day;
  if (day.served || day.answered) return false;
  if (!ok) {
    day.patience = applyPatience(day.patience, "wrong", runtime.rules);
    day.streak = 0;

    paint();
    if (day.patience <= 0) customerLeft();
    return false;
  }
  day.answered = true;
  day.patience = applyPatience(day.patience, "correct", runtime.rules);
  day.streak += 1;
  const sprite = runtime.container?.querySelector("#rs-customer-sprite");
  burst(sprite?.parentElement || runtime.container, RS_ASSETS.food.sparkle);
  paint();
  return true;
}

function pickIngredient(id, sourceEl) {
  const day = runtime.day;
  const dish = dishById(day.dishId);
  if (!dish || day.served || day.accuracy !== null) return;
  if (day.picked.includes(id)) return;
  const store = consumeStock(runtime.inventory, [id]);
  if (!store.ok) return;
  runtime.inventory = store.state;
  day.picked.push(id);
  const plate = runtime.container?.querySelector("[data-rs='plate']");
  flySprite(sourceEl, plate, ingredientById(id).img, { size: 40, duration: 380 });
  paint();
}

function servePlate() {
  const day = runtime.day;
  const dish = dishById(day.dishId);
  if (!dish || day.accuracy !== null) return;
  const result = plateAccuracy(dish.recipe, day.picked);
  day.accuracy = Number(result.accuracy.toFixed(2));
  day.served = day.picked.length > 0;
  stopPatience();
  if (day.accuracy === 1) day.patience = applyPatience(day.patience, "served", runtime.rules);
  const price = day.served ? orderPrice(dish, day.picked.includes("drink")) : 0;
  const tip = day.served ? tipFor({ price, accuracy: day.accuracy, patience: day.patience, streak: day.streak }) : 0;
  if (day.served) {
    runtime.earned += price + tip;

    const hud = runtime.container?.querySelector("[data-rs='hud-coins']");
    const plate = runtime.container?.querySelector("[data-rs='plate']");
    if (plate && hud) {
      flySprite(plate, hud, RS_ASSETS.food.coin, { size: 30, duration: 620, fade: true });
      burst(plate, RS_ASSETS.food.sparkle);
    }
    if (hud) hud.innerHTML = `<img src="${RS_ASSETS.food.coin}" alt="">${runtime.earned}`;
    runtime.onScore?.({ coins: price + tip, stars: 3, accuracy: day.accuracy });
  } else {
    day.streak = 0;
  }
  day.records.push({ price, accuracy: day.accuracy, patience: day.patience, tip, served: day.served });
  paint();
  timeout(nextCustomer, day.served ? 1100 : 900);
}

function endDay() {
  stopPatience();
  const summary = settleDay(runtime.day.records, { spent: runtime.day.spent });
  runtime.summary = summary;
  runtime.phase = "report";
  paint();
  runtime.onFinish?.(summary);
}

// --------------------------------------------------------------- lifecycle
function onEvent(event) {
  const target = event.target.closest?.("[data-rs]");
  if (!target || !runtime) return;
  const action = target.dataset.rs;
  if (action === "tutorial-next") {
    runtime.tutorialStep += 1;
    if (runtime.tutorialStep > 2) {
      runtime.tutorialStep = 2;
      runtime.phase = "prep";
    }
    paint();
  } else if (action === "buy") {
    const result = buyIngredient(runtime.inventory, target.dataset.id, 1);
    if (result.ok) {
      runtime.inventory = result.state;
      runtime.day.spent += result.cost;
      paint();
    }
  } else if (action === "open-day") {
    if (inventoryValue(runtime.inventory) <= 0) return;
    runtime.phase = "day";
    runtime.day = freshDay();
    nextCustomer();
  } else if (action === "answer") {
    event.preventDefault();
    const challenge = runtime.day.challenge;
    if (!challenge || runtime.day.served) return;
    resolveAnswer(checkAnswer(challenge, target.dataset.value));
  } else if (action === "pick") {
    event.preventDefault();
    pickIngredient(target.dataset.id, target.querySelector("img") || target);
  } else if (action === "serve") {
    event.preventDefault();
    servePlate();
  } else if (action === "finish") {
    runtime.phase = "done";
    paint();
  }
}

function onSubmit(event) {
  if (!event.target.matches("[data-rs='typing-form']") || !runtime) return;
  event.preventDefault();
  const answer = new FormData(event.target).get("answer");
  const challenge = runtime.day.challenge;
  if (!challenge || runtime.day.served) return;
  resolveAnswer(checkAnswer(challenge, answer));
}

// -------------------------------------------------------------------- API
export function mountRiceShop(containerEl, { cards = [], onFinish, onScore, random = Math.random, rules = DEFAULT_PATIENCE } = {}) {
  unmountRiceShop();
  runtime = {
    container: containerEl,
    cards: cards.filter((card) => card && card.term && card.meaning),
    onFinish,
    onScore,
    random,
    rules,
    timers: new Set(),
    patienceTimer: null,
    tutorialStep: 0,
    earned: 0,
    inventory: { budget: START_BUDGET, stock: {} },
    day: freshDay(),
    dishPool: DISHES,
    customers: Object.values(RS_ASSETS.customers),
    phase: "tutorial",
    summary: null,
  };
  riceShopState.mounted = true;
  riceShopState.container = containerEl;
  containerEl.classList.add("rs-root");
  containerEl.addEventListener("click", onEvent);
  containerEl.addEventListener("submit", onSubmit);
  paint();
  return api();
}

export function startRiceShop() {
  if (!runtime || !runtime.container) return false;
  runtime.tutorialStep = 0;
  runtime.earned = 0;
  runtime.inventory = { budget: START_BUDGET, stock: {} };
  runtime.day = freshDay();
  runtime.summary = null;
  runtime.phase = "tutorial";
  riceShopState.running = true;
  paint();
  return true;
}

export function unmountRiceShop() {
  if (!runtime) return;
  stopPatience();
  runtime.timers.forEach((id) => {
    clearTimeout(id);
    clearInterval(id);
  });
  runtime.timers.clear();
  document.querySelectorAll(".rs-fly").forEach((node) => node.remove());
  runtime.container?.removeEventListener("click", onEvent);
  runtime.container?.removeEventListener("submit", onSubmit);
  runtime.container?.classList.remove("rs-root");
  if (runtime.container) runtime.container.innerHTML = "";
  runtime = null;
  riceShopState.mounted = false;
  riceShopState.running = false;
  riceShopState.container = null;
  riceShopState.phase = "idle";
}

function api() {
  return {
    start: startRiceShop,
    unmount: unmountRiceShop,
    getState: () => runtime && { phase: runtime.phase, earned: runtime.earned, inventory: runtime.inventory, day: runtime.day },
  };
}

export default { mountRiceShop, unmountRiceShop, startRiceShop };
