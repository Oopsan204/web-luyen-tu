// Phở Anh Hai — wrapper tích hợp BẢN GỐC (standalone/pho-anh-hai/index.html) vào web qua iframe.
// Bản gốc giữ nguyên 100%, không sửa file. Wrapper lồng tối đa 3 câu hỏi từ vựng/ngày
// theo đặc tả, dùng API công khai của game: PAH.on (sự kiện), PAH.UI.state() (live state),
// PAH.UI.render() (vẽ lại sau khi đổi state).
//
// Luồng câu hỏi (mỗi ngày trong game):
//   Q1 "Đi chợ"      — khi vào pha morning  → đúng: giảm 20% giá chợ (s.market.p)
//   Q2 "Ninh nước"    — khi vào pha prep    → đúng: tăng chất lượng mẻ nấu (pot.ql)
//   Q3 "Khách đầu"    — khi khách đầu tiên vào (sự kiện custIn) → đúng: +40% kiên nhẫn, +uy tín
// Khách 2+ không có câu hỏi. Không có dữ liệu từ vựng → bỏ qua hết, game chạy thuần.
//
// API: mountPhoAnhHai(container, {cards, onFinish}) → startPhoAnhHai() → unmountPhoAnhHai().
// Gỡ iframe là dọn sạch mọi timer/rAF/listener/audio của game (cleanup contract).

export const PAH_MAX_QUIZ_PER_DAY = 3;
export const PAH_QUIZ_KINDS = Object.freeze(["market", "cook", "customer"]);

const QUIZ_META = {
  market: {
    kicker: "ĐI CHỢ ĐẦU NGÀY",
    title: "Bác bán thịt đố từ vựng",
    reward: "Trả lời đúng: giảm 20% giá chợ hôm nay.",
  },
  cook: {
    kicker: "NINH NƯỚC DÙNG",
    title: "Bí quyết gia truyền",
    reward: "Trả lời đúng: mẻ nấu hôm nay ngon hơn.",
  },
  customer: {
    kicker: "KHÁCH GỌI MÓN",
    title: "Xác nhận từ vựng",
    reward: "Trả lời đúng: khách kiên nhẫn hơn, uy tín tăng.",
  },
};

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
  const rnd = typeof random === "function" ? random : Math.random;
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

// ------------------------------------------------------------ pure quiz logic
/**
 * Quyết định câu hỏi nào đến lượt hỏi.
 * game: {phase, day} — phase của game gốc ("morning" | "prep" | "sell" | ...).
 * firstCustomer: true khi khách đầu tiên của ngày vừa vào (sự kiện custIn).
 * asked: {day, market, cook, customer} — đã hỏi/skipped cái nào trong ngày game nào.
 * Trả về "market" | "cook" | "customer" | null. Tối đa 3 câu/ngày.
 */
export function pahNextQuiz(game = {}, firstCustomer = false, asked = null) {
  const g = game || {};
  const day = Math.max(1, Math.floor(Number(g.day) || 1));
  const a = asked && asked.day === day
    ? asked
    : { day, market: false, cook: false, customer: false };
  const phase = String(g.phase || "");
  if (!a.market && phase === "morning") return "market";
  if (!a.cook && phase === "prep") return "cook";
  if (!a.customer && firstCustomer) return "customer";
  return null;
}

/** Q1 đúng: giảm 20% giá chợ (s.market.p). Trả về số mặt hàng đã giảm. */
export function pahApplyMarketDiscount(pah) {
  try {
    const s = pah?.UI?.state?.();
    const prices = s?.market?.p;
    if (!s || !prices || typeof prices !== "object") return 0;
    let count = 0;
    for (const id of Object.keys(prices)) {
      const before = Number(prices[id]) || 0;
      if (before <= 0) continue;
      const after = Math.max(1, Math.round(before * 0.8));
      if (after < before) {
        prices[id] = after;
        count += 1;
      }
    }
    if (count > 0) pah.UI.render?.();
    return count;
  } catch {
    return 0;
  }
}

/** Q2 đúng: tăng chất lượng mẻ nấu vừa bắt đầu (pot.ql). Trả về true nếu áp được. */
export function pahApplyCookBonus(pah, potIndex = 0) {
  try {
    const s = pah?.UI?.state?.();
    const pot = s?.pots?.[potIndex];
    if (!pot) return false;
    const before = Number(pot.ql) || 1;
    pot.ql = Math.min(1.3, Math.round(before * 1.25 * 100) / 100);
    pah.UI.render?.();
    return pot.ql > before;
  } catch {
    return false;
  }
}

/** Q3 đúng: khách kiên nhẫn hơn (+40% thời gian chờ) và uy tín +2. */
export function pahApplyCustomerBonus(pah, customer) {
  try {
    const s = pah?.UI?.state?.();
    if (!s || !customer) return false;
    const before = Number(customer.max) || 0;
    if (before > 0) customer.max = Math.round(before * 1.4);
    s.rep = Math.min(100, Math.max(0, (Number(s.rep) || 0) + 2));
    pah.UI.render?.();
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ wrapper
const runtime = {
  mounted: false,
  container: null,
  iframe: null,
  overlay: null,
  cards: [],
  onFinish: null,
  random: Math.random,
  day: 0,
  asked: null, // {day, market, cook, customer}
  custCount: 0,
  cookBonusArmed: false, // Q2 đúng → chờ cookStart để buff pot
  cookBonusDone: false,
  questionShowing: false,
  deferCount: 0,
  vocabCorrect: 0,
  vocabWrong: 0,
  pollTimer: null,
  pah: null, // iframe.contentWindow.PAH
  onCustIn: null,
  onCookStart: null,
};

export const phoAnhHaiState = {
  get mounted() { return runtime.mounted; },
  get phase() { return "wrapper"; },
};

function standaloneURL() {
  try {
    return new URL("../../standalone/pho-anh-hai/index.html", import.meta.url).href;
  } catch {
    return "standalone/pho-anh-hai/index.html";
  }
}

function gamePAH() {
  try {
    const w = runtime.iframe?.contentWindow;
    const pah = w?.PAH;
    if (pah && pah.UI && typeof pah.UI.state === "function") return pah;
  } catch {
    // cross-origin hoặc chưa load xong: bỏ qua lượt này
  }
  return null;
}

/** Game gốc có đang mở modal không (tránh chồng câu hỏi lên modal). */
function gameModalOpen() {
  try {
    const doc = runtime.iframe?.contentDocument;
    const modal = doc?.getElementById?.("modal");
    return !!(modal && modal.offsetParent !== null);
  } catch {
    return false;
  }
}

function resetDay(day) {
  runtime.day = day;
  runtime.asked = { day, market: false, cook: false, customer: false };
  runtime.custCount = 0;
  runtime.cookBonusArmed = false;
  runtime.cookBonusDone = false;
  runtime.deferCount = 0;
}

function hideQuestion() {
  runtime.questionShowing = false;
  if (runtime.overlay) {
    runtime.overlay.classList.add("pahw-hidden");
    runtime.overlay.innerHTML = "";
  }
}

function showQuestion(kind, context = {}) {
  if (runtime.questionShowing || !runtime.overlay) return false;
  if (gameModalOpen()) {
    // Game đang mở modal → hoãn lại, tránh chồng modal (tối đa vài lượt rồi bỏ qua).
    runtime.deferCount += 1;
    if (runtime.deferCount > 12 && runtime.asked) runtime.asked[kind] = true;
    return false;
  }
  const challenge = buildVocabChallenge(runtime.cards, runtime.random);
  if (!challenge) return false; // không có dữ liệu từ vựng → bỏ qua, game chạy thuần
  runtime.deferCount = 0;
  runtime.questionShowing = true;
  if (runtime.asked) runtime.asked[kind] = true;
  const meta = QUIZ_META[kind] || QUIZ_META.market;
  const overlay = runtime.overlay;
  overlay.classList.remove("pahw-hidden");
  overlay.innerHTML = `
    <div class="pahw-quiz-card" role="dialog" aria-modal="true" aria-label="Câu hỏi từ vựng">
      <p class="pahw-kicker">${meta.kicker}</p>
      <h3 class="pahw-quiz-title">${meta.title}</h3>
      <p class="pahw-quiz-prompt">${escapeHTML(challenge.prompt)}</p>
      <div class="pahw-options">${challenge.options.map((option, index) => `
        <button type="button" class="pahw-option" data-pahw="answer" data-value="${escapeHTML(option)}">
          <b>${String.fromCharCode(65 + index)}</b><span>${escapeHTML(option)}</span>
        </button>`).join("")}
      </div>
      <p class="pahw-reward">${meta.reward}</p>
      <div class="pahw-quiz-foot">
        <span class="pahw-count">Tối đa 3 câu/ngày</span>
        <button type="button" class="pahw-skip" data-pahw="skip">Để sau →</button>
      </div>
      <div class="pahw-feedback pahw-hidden" role="status"></div>
    </div>`;

  const feedback = overlay.querySelector(".pahw-feedback");
  const done = (ok) => {
    if (ok) {
      runtime.vocabCorrect += 1;
      applyQuizEffect(kind, context);
    } else {
      runtime.vocabWrong += 1;
    }
    if (feedback) {
      feedback.classList.remove("pahw-hidden");
      feedback.innerHTML = ok
        ? `<strong>✓ Chính xác!</strong><span>${escapeHTML(meta.reward)}</span>`
        : `<strong>✕ Chưa đúng.</strong><span>Đáp án: ${escapeHTML(challenge.answer)}</span>`;
    }
    setTimeout(() => { if (runtime.mounted) hideQuestion(); }, 1100);
  };

  overlay.querySelectorAll('[data-pahw="answer"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!runtime.questionShowing) return;
      runtime.questionShowing = false; // chống double-click
      done(checkVocabAnswer(challenge, btn.dataset.value || ""));
    }, { once: true });
  });
  const skip = overlay.querySelector('[data-pahw="skip"]');
  skip?.addEventListener("click", () => hideQuestion(), { once: true });
  return true;
}

function applyQuizEffect(kind, context) {
  const pah = runtime.pah || gamePAH();
  if (!pah) return;
  if (kind === "market") {
    const n = pahApplyMarketDiscount(pah);
    if (n > 0) pah.UI.toast?.(`Voucher từ vựng: giảm 20% giá chợ (${n} mặt hàng)!`, "good");
  } else if (kind === "cook") {
    runtime.cookBonusArmed = true; // buff khi mẻ nấu bắt đầu (sự kiện cookStart)
    pah.UI.toast?.("Bí quyết gia truyền: mẻ nấu tới sẽ ngon hơn!", "good");
  } else if (kind === "customer") {
    if (pahApplyCustomerBonus(pah, context.customer)) {
      pah.UI.toast?.("Khách hài lòng: kiên nhẫn +40%, uy tín +2!", "good");
    }
  }
}

function onCustIn(customer) {
  if (!runtime.mounted) return;
  const s = runtime.pah?.UI?.state?.();
  const day = Math.max(1, Math.floor(Number(s?.day) || runtime.day || 1));
  if (day !== runtime.day) resetDay(day);
  runtime.custCount += 1;
  if (runtime.custCount === 1) {
    // Khách đầu tiên của ngày → câu hỏi Q3 (không có là bỏ qua, khách 2+ không hỏi).
    showQuestion("customer", { customer });
  }
}

function onCookStart(data) {
  if (!runtime.mounted || runtime.cookBonusDone) return;
  if (!runtime.cookBonusArmed) return;
  runtime.cookBonusDone = true;
  runtime.cookBonusArmed = false;
  const pah = runtime.pah || gamePAH();
  if (pah) pahApplyCookBonus(pah, Number(data?.pot) || 0);
}

function pollGame() {
  if (!runtime.mounted) return;
  try {
    const pah = runtime.pah || gamePAH();
    if (!pah) return;
    runtime.pah = pah;
    const s = pah.UI.state();
    if (!s) return;
    const day = Math.max(1, Math.floor(Number(s.day) || 1));
    if (day !== runtime.day) resetDay(day);
    if (runtime.questionShowing) return;
    const due = pahNextQuiz({ phase: s.phase, day }, false, runtime.asked);
    // Q3 (customer) do sự kiện custIn kích hoạt, không poll.
    if (due === "market" || due === "cook") showQuestion(due);
  } catch {
    // game chưa sẵn sàng → thử lại lượt sau
  }
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mountPhoAnhHai(containerEl, {
  cards = [], onFinish = null, random = null,
} = {}) {
  if (runtime.mounted) unmountPhoAnhHai();
  const container = containerEl;
  runtime.mounted = true;
  runtime.container = container || null;
  runtime.cards = (Array.isArray(cards) ? cards : []).filter((c) => c && c.term && c.meaning);
  runtime.onFinish = typeof onFinish === "function" ? onFinish : null;
  runtime.random = typeof random === "function" ? random : Math.random;
  runtime.vocabCorrect = 0;
  runtime.vocabWrong = 0;
  runtime.day = 0;
  runtime.asked = null;
  runtime.custCount = 0;
  runtime.questionShowing = false;
  runtime.pah = null;

  if (container && typeof document !== "undefined") {
    container.classList.add("pahw-root");
    container.innerHTML = `
      <iframe class="pahw-frame" src="${escapeHTML(standaloneURL())}" title="Phở Anh Hai (bản gốc)"
        allow="autoplay" sandbox="allow-scripts allow-same-origin allow-forms allow-modals"></iframe>
      <div class="pahw-overlay pahw-hidden" aria-hidden="true"></div>`;
    runtime.iframe = container.querySelector(".pahw-frame");
    runtime.overlay = container.querySelector(".pahw-overlay");
    runtime.iframe?.addEventListener("load", () => {
      if (!runtime.mounted) return;
      const pah = gamePAH();
      if (!pah) return;
      runtime.pah = pah;
      // Đăng ký sự kiện game (một lần cho mỗi lượt mount; gỡ iframe là sạch).
      runtime.onCustIn = (c) => onCustIn(c);
      runtime.onCookStart = (d) => onCookStart(d);
      try {
        pah.on?.("custIn", runtime.onCustIn);
        pah.on?.("cookStart", runtime.onCookStart);
      } catch { /* game chưa sẵn sàng */ }
      pollGame();
    });
    runtime.pollTimer = setInterval(pollGame, 700);
  }
  return api();
}

export function startPhoAnhHai() {
  if (!runtime.mounted) return false;
  // Game gốc tự chạy khi iframe load; start chỉ đảm bảo poll đang chạy.
  if (!runtime.pollTimer && typeof setInterval !== "undefined") {
    runtime.pollTimer = setInterval(pollGame, 700);
  }
  try { runtime.iframe?.contentWindow?.focus?.(); } catch { /* kệ */ }
  return true;
}

export function unmountPhoAnhHai() {
  if (!runtime.mounted) return false;
  const { vocabCorrect, vocabWrong, onFinish } = runtime;
  if (runtime.pollTimer) { clearInterval(runtime.pollTimer); runtime.pollTimer = null; }
  // Gỡ iframe: mọi timer/rAF/listener/audio của game gốc chết theo (cleanup contract).
  try { runtime.iframe?.remove?.(); } catch { /* kệ */ }
  try {
    if (runtime.container) {
      runtime.container.classList.remove("pahw-root");
      runtime.container.innerHTML = "";
    }
  } catch { /* kệ */ }
  runtime.mounted = false;
  runtime.container = null;
  runtime.iframe = null;
  runtime.overlay = null;
  runtime.pah = null;
  runtime.onCustIn = null;
  runtime.onCookStart = null;
  runtime.questionShowing = false;
  // Báo cáo câu hỏi từ vựng đã trả lời → cộng XP/coin hồ sơ học tập.
  try {
    onFinish?.({
      correct: vocabCorrect,
      wrong: vocabWrong,
      total: vocabCorrect + vocabWrong,
      xp: vocabCorrect * 8,
      coins: vocabCorrect * 10,
    });
  } catch (error) {
    console.error?.("Pho Anh Hai onFinish failed", error);
  }
  return true;
}

/** Báo cáo nhanh cho audit test: timer/listener/DOM còn sót không. */
export function cleanupReport() {
  return {
    mounted: runtime.mounted,
    phase: runtime.mounted ? "wrapper" : "idle",
    timers: runtime.pollTimer ? 1 : 0,
    iframe: runtime.iframe ? 1 : 0,
    overlayEmpty: !runtime.overlay || runtime.overlay.innerHTML === "",
    domEmpty: !runtime.container || runtime.container.innerHTML === "",
  };
}

function api() {
  return {
    start: startPhoAnhHai,
    unmount: unmountPhoAnhHai,
    getState: () => ({
      mounted: runtime.mounted,
      phase: runtime.mounted ? "wrapper" : "idle",
      day: runtime.day,
      vocabCorrect: runtime.vocabCorrect,
      vocabWrong: runtime.vocabWrong,
    }),
  };
}
