// Dịch câu + Đặt câu — module tự chứa, mount/unmount/start.
// Asset dùng PNG tách riêng (không dùng sheet nguyên tấm).
import { escapeHTML } from "../core.js";

export const LG_ASSETS = {
  robot: {
    reading: "assets/games/learning-games/robot/robot_reading.png",
    pointing: "assets/games/learning-games/robot/robot_pointing.png",
    tablet: "assets/games/learning-games/robot/robot_tablet.png",
    happy: "assets/games/learning-games/robot/robot_happy.png",
  },
  stationery: {
    notebookOpen: "assets/games/learning-games/stationery/notebook_open.png",
    notebookClosed: "assets/games/learning-games/stationery/notebook_closed.png",
    pencil: "assets/games/learning-games/stationery/pencil.png",
    eraser: "assets/games/learning-games/stationery/eraser.png",
    sparkles: "assets/games/learning-games/stationery/sparkles_leaves.png",
  },
  ui: {
    sentencePanel: "assets/games/learning-games/ui/sentence_panel.png",
    translationPanel: "assets/games/learning-games/ui/translation_panel.png",
    wordTiles: "assets/games/learning-games/ui/word_tiles.png",
    successBadge: "assets/games/learning-games/ui/success_badge.png",
    wrongBadge: "assets/games/learning-games/ui/wrong_badge.png",
    hello: "assets/games/learning-games/ui/speech_hello_vi.png",
  },
};

// ---------------------------------------------------------- pure logic
const stripMarks = (s = "") =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");

export function normalizeAnswer(value = "") {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
}

export function splitWords(sentence = "") {
  return String(sentence ?? "")
    .replace(/[.,!?;:()"'“”«»…—–-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

export function normalizeSentence(sentence = "") {
  return splitWords(sentence).join(" ").toLocaleLowerCase("vi");
}

export function acceptedAnswers(card = {}) {
  const raw = [card.meaning, card.translation, card.answer];
  for (const key of ["acceptedTranslations", "acceptedMeanings", "answers", "alt"]) {
    const v = card[key];
    if (Array.isArray(v)) raw.push(...v);
    else if (typeof v === "string" && v) raw.push(v);
  }
  const out = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    for (const part of item.split(/[/;|\n]+/)) {
      const t = part.trim();
      if (t && !out.includes(t)) out.push(t);
    }
  }
  return out;
}

export function checkTranslation(answer, card = {}) {
  const na = normalizeAnswer(answer);
  if (!na) return false;
  const flat = stripMarks(na);
  return acceptedAnswers(card).some((cand) => {
    const nc = normalizeAnswer(cand);
    return nc === na || stripMarks(nc) === flat;
  });
}

export function checkSentenceOrder(pickedWords = [], target = "") {
  return normalizeSentence(pickedWords.join(" ")) === normalizeSentence(target);
}

function shuffleCopy(arr, random = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildSentenceChallenge(card = {}, random = Math.random) {
  const target = splitWords(card.example || card.term || "").join(" ");
  if (!target) return null;
  const words = splitWords(target);
  if (words.length < 2) return { target, bank: [...words], needsOrder: false };
  const bank = shuffleCopy(words, random);
  if (bank.join(" ") === words.join(" ")) [bank[0], bank[bank.length - 1]] = [bank[bank.length - 1], bank[0]];
  return { target, bank, needsOrder: true };
}

export function firstLetterHint(target = "") {
  return splitWords(target)
    .map((w) => (w.charAt(0) || "") + "…")
    .join(" ");
}

export function progressiveHint(target = "", level = 1) {
  const words = splitWords(target);
  const lvl = Math.max(0, Math.min(words.length, Math.floor(level) || 0));
  return {
    text: words.map((w, i) => (i < lvl ? w : "___")).join(" "),
    next: words[lvl] || "",
    done: lvl >= words.length,
    total: words.length,
    revealed: lvl,
  };
}

export function scoreForResult({ ok, hintsUsed = 0, attempts = 1 } = {}) {
  if (!ok) return 0;
  const penalty = Math.max(0, hintsUsed) + Math.max(0, attempts - 1);
  return Math.max(1, 3 - penalty);
}

export function createLearningGames(options = {}) {
  return {
    options,
    mount: mountLearningGames,
    unmount: unmountLearningGames,
    start: startLearningGames,
  };
}

// ---------------------------------------------------------- runtime
let session = null;
const timers = new Set();

function later(fn, ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

function clearTimers() {
  for (const id of timers) clearTimeout(id);
  timers.clear();
}

function prefersReduced() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const okDelay = () => (prefersReduced() ? 500 : 950);
const badDelay = () => (prefersReduced() ? 600 : 1400);

function usableCards(cards = [], mode = "mixed") {
  const list = (cards || []).filter((c) => c && c.term && c.meaning);
  if (mode === "translate") return list;
  if (mode === "sentence") return list.filter((c) => splitWords(c.example || c.term).length >= 2);
  return list;
}

function kindFor(card, index) {
  const canSentence = splitWords(card.example || card.term || "").length >= 2;
  if (session.mode === "translate") return "translate";
  if (session.mode === "sentence") return canSentence ? "sentence" : "translate";
  if (!canSentence) return "translate";
  return index % 2 === 0 ? "translate" : "sentence";
}

function setRobot(pose) {
  const box = session?.container?.querySelector?.("[data-lg-robot]");
  const img = session?.container?.querySelector?.("[data-lg-robot-img]");
  if (!box || !img) return;
  const R = LG_ASSETS.robot;
  const src = pose === "success" ? R.happy : pose === "idle" ? R.reading : pose === "tablet" ? R.tablet : R.pointing;
  img.setAttribute("src", src);
  box.classList.remove("is-idle", "is-explain", "is-success");
  box.classList.add(pose === "success" ? "is-success" : pose === "idle" ? "is-idle" : "is-explain");
}

function showBadge(ok) {
  const badge = session?.container?.querySelector?.("[data-lg-badge]");
  if (!badge) return;
  badge.setAttribute("src", ok ? LG_ASSETS.ui.successBadge : LG_ASSETS.ui.wrongBadge);
  badge.classList.remove("is-ok", "is-bad");
  void badge.offsetWidth;
  badge.classList.add("is-on", ok ? "is-ok" : "is-bad");
  const sparkle = session?.container?.querySelector?.("[data-lg-sparkle]");
  if (sparkle) sparkle.classList.toggle("is-on", ok);
  const panel = session?.container?.querySelector?.("[data-lg-panel]");
  if (panel) panel.classList.toggle("is-bad", !ok);
}

function speak(text) {
  try {
    if (typeof speechSynthesis === "undefined" || typeof SpeechSynthesisUtterance === "undefined") return;
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(String(text || "")));
  } catch {
    /* thiếu TTS: bỏ qua, không crash */
  }
}

function topBar(title, sub, robotSrc, robotPose) {
  return `<div class="lg-top"><span class="lg-robot ${robotPose}" data-lg-robot><img data-lg-robot-img src="${robotSrc}" alt="Robot hướng dẫn"></span><div class="lg-speech"><img src="${LG_ASSETS.ui.hello}" alt=""><div><strong>${title}</strong><span class="hint">${sub}</span></div></div></div>`;
}

function panelOpen(panelPng, extra = "") {
  return `<div class="lg-panel" data-lg-panel style="background-image:url('${panelPng}')"><img class="lg-badge" data-lg-badge alt=""><img class="lg-sparkle" data-lg-sparkle src="${LG_ASSETS.stationery.sparkles}" alt="">${extra}`;
}

const hintLine = `<p class="lg-hintline" data-lg-hint></p><div data-lg-feedback></div></div>`;

function renderTranslate(q) {
  session.container.querySelector("[data-lg-root]").innerHTML = `<div class="lg-stage">${topBar("Dịch sang tiếng Việt", "Gõ nghĩa rồi Enter.", LG_ASSETS.robot.pointing, "is-explain")}${panelOpen(
    LG_ASSETS.ui.translationPanel,
    `<div class="lg-q"><h2>${escapeHTML(q.card.term)}</h2><p class="hint">${escapeHTML(q.card.pronunciation || "")}</p>${q.card.example ? `<p class="hint">VD: ${escapeHTML(q.card.example)}</p>` : ""}<img src="${LG_ASSETS.stationery.notebookOpen}" alt="" width="40" height="40"></div><form class="lg-form" data-lg-form><input name="answer" autocomplete="off" placeholder="Nghĩa tiếng Việt…" aria-label="Nghĩa tiếng Việt"><button class="btn btn-primary" type="submit">Kiểm tra</button></form><div class="lg-tools"><button class="btn btn-small lg-iconbtn" type="button" data-lg="hint"><img src="${LG_ASSETS.stationery.pencil}" alt="">Gợi ý</button><button class="btn btn-small lg-iconbtn" type="button" data-lg="speak"><img src="${LG_ASSETS.ui.hello}" alt="">Nghe</button><button class="btn btn-small" type="button" data-lg="skip">Bỏ qua</button></div>${hintLine}`,
  )}</div>`;
  session.container.querySelector('[name="answer"]')?.focus?.();
}

function renderSentence(q) {
  session.container.querySelector("[data-lg-root]").innerHTML = `<div class="lg-stage">${topBar("Ghép từ thành câu", "Bấm từng từ theo đúng thứ tự.", LG_ASSETS.robot.tablet, "is-explain")}${panelOpen(
    LG_ASSETS.ui.sentencePanel,
    `<p class="hint">Nghĩa gợi ý: ${escapeHTML(q.card.meaning)} <img src="${LG_ASSETS.stationery.notebookClosed}" alt="" width="28" height="28"></p><div class="lg-answer" data-lg-answer></div><div class="lg-bank" data-lg-bank style="background-image:url('${LG_ASSETS.ui.wordTiles}')"></div><div class="lg-tools"><button class="btn btn-small lg-iconbtn" type="button" data-lg="undo"><img src="${LG_ASSETS.stationery.eraser}" alt="">Xóa từ cuối</button><button class="btn btn-small" type="button" data-lg="reset">Làm lại</button><button class="btn btn-small lg-iconbtn" type="button" data-lg="hint"><img src="${LG_ASSETS.stationery.pencil}" alt="">Gợi ý</button><button class="btn btn-small lg-iconbtn" type="button" data-lg="speak"><img src="${LG_ASSETS.ui.hello}" alt="">Nghe câu</button><button class="btn btn-small" type="button" data-lg="skip">Bỏ qua</button></div>${hintLine}`,
  )}</div>`;
  paintSentence();
}

function paintSentence() {
  const q = session?.qstate;
  if (!q || q.kind !== "sentence") return;
  const ans = session.container.querySelector("[data-lg-answer]");
  const bank = session.container.querySelector("[data-lg-bank]");
  if (!ans || !bank) return;
  ans.innerHTML =
    q.picked.map((w) => `<span class="lg-tile">${escapeHTML(w)}</span>`).join("") ||
    `<span class="hint">Câu của bạn hiện ở đây…</span>`;
  bank.innerHTML = q.bank
    .map((w, i) =>
      w == null
        ? `<button type="button" class="lg-tile" disabled>·</button>`
        : `<button type="button" class="lg-tile" style="animation-delay:${Math.min(i * 45, 400)}ms" data-lg="pick" data-idx="${i}">${escapeHTML(w)}</button>`,
    )
    .join("");
  const hint = session.container.querySelector("[data-lg-hint]");
  if (hint && !q.locked) hint.textContent = q.hints > 0 ? progressiveHint(q.target, q.hints).text : `Chữ đầu: ${firstLetterHint(q.target)}`;
}

function feedback(html, ok) {
  const box = session.container.querySelector("[data-lg-feedback]");
  if (box) box.innerHTML = `<div class="feedback ${ok ? "ok" : "bad"}" role="status">${html}</div>`;
}

function resolveQuestion(ok, revealHTML) {
  const s = session;
  const q = s.qstate;
  q.locked = true;
  q.ok = ok;
  s.container.querySelectorAll("[data-lg], [data-lg-form] input, [data-lg-form] button").forEach((control) => {
    if ("disabled" in control) control.disabled = true;
  });
  const points = scoreForResult({ ok, hintsUsed: q.hints, attempts: q.attempts });
  if (ok) {
    s.correct += 1;
    s.points += points;
  } else {
    s.wrong += 1;
  }
  showBadge(ok);
  setRobot(ok ? "success" : "tablet");
  feedback(revealHTML, ok);
  try {
    s.onScore?.({ index: s.index, kind: q.kind, cardId: q.card.id, ok, points, total: s.points, correct: s.correct, wrong: s.wrong });
  } catch {
    /* callback lỗi: vẫn chuyển câu */
  }
  later(() => {
    s.index += 1;
    renderCurrent();
  }, ok ? okDelay() : badDelay());
}

function answerTranslate(value) {
  const q = session.qstate;
  if (!q || q.locked) return;
  q.attempts += 1;
  const ok = checkTranslation(value, q.card);
  resolveQuestion(
    ok,
    ok ? "Đúng. Cộng điểm." : `Chưa đúng. Đáp án: <strong>${escapeHTML(acceptedAnswers(q.card)[0] || q.card.meaning)}</strong>`,
  );
}

function answerSentenceComplete() {
  const q = session.qstate;
  if (!q || q.locked) return;
  q.attempts += 1;
  const ok = checkSentenceOrder(q.picked, q.target);
  resolveQuestion(ok, ok ? "Chính xác. Câu hoàn chỉnh." : `Chưa đúng. Câu đúng: <strong>${escapeHTML(q.target)}</strong>`);
}

function renderCurrent() {
  const s = session;
  if (!s) return;
  if (s.index >= s.queue.length) {
    finish();
    return;
  }
  const card = s.queue[s.index];
  const kind = kindFor(card, s.index);
  if (kind === "sentence") {
    const ch = buildSentenceChallenge(card, s.random);
    s.qstate = { kind, card, target: ch.target, bank: ch.bank, picked: [], locked: false, ok: null, hints: 0, attempts: 0 };
    renderSentence(s.qstate);
  } else {
    s.qstate = { kind: "translate", card, locked: false, ok: null, hints: 0, attempts: 0 };
    renderTranslate(s.qstate);
  }
}

function finish() {
  const s = session;
  if (!s) return;
  clearTimers();
  const total = s.queue.length;
  const acc = total ? Math.round((s.correct / total) * 100) : 0;
  const good = acc >= 60;
  s.qstate = null;
  s.container.querySelector("[data-lg-root]").innerHTML =
    `<div class="lg-stage">${topBar(
      `Kết thúc: ${s.correct}/${total} đúng`,
      `${s.points} điểm · ${acc}% chính xác`,
      good ? LG_ASSETS.robot.happy : LG_ASSETS.robot.reading,
      good ? "is-success" : "is-idle",
    )}${panelOpen(
      LG_ASSETS.ui.sentencePanel,
      `<div class="lg-q"><img class="lg-badge is-on ${good ? "is-ok" : ""}" src="${good ? LG_ASSETS.ui.successBadge : LG_ASSETS.ui.wrongBadge}" alt=""><div class="lg-tools"><button class="btn btn-primary" type="button" data-lg="restart">Chơi lại</button></div></div></div>`,
    )}</div>`;
  try {
    s.onFinish?.({ mode: s.mode, total, correct: s.correct, wrong: s.wrong, points: s.points, accuracy: acc });
  } catch {
    /* bỏ qua lỗi callback */
  }
}

function resetCounters() {
  const s = session;
  s.index = 0;
  s.correct = 0;
  s.wrong = 0;
  s.points = 0;
  s.qstate = null;
  renderCurrent();
}

function onClick(event) {
  const s = session;
  if (!s) return;
  const btn = event.target?.closest?.("[data-lg]");
  if (!btn || !s.container.contains(btn)) return;
  const act = btn.getAttribute("data-lg");
  if (act === "restart") {
    resetCounters();
    return;
  }
  const q = s.qstate;
  if (!q) return;
  if (act === "skip" && !q.locked) {
    resolveQuestion(
      false,
      q.kind === "sentence"
        ? `Bỏ qua. Câu đúng: <strong>${escapeHTML(q.target)}</strong>`
        : `Bỏ qua. Đáp án: <strong>${escapeHTML(acceptedAnswers(q.card)[0] || q.card.meaning)}</strong>`,
    );
    return;
  }
  if (act === "speak") {
    speak(q.kind === "sentence" ? q.target : q.card.term);
    return;
  }
  if (act === "hint" && !q.locked) {
    q.hints += 1;
    const hintEl = s.container.querySelector("[data-lg-hint]");
    const target = q.kind === "sentence" ? q.target : acceptedAnswers(q.card)[0] || q.card.meaning;
    if (hintEl) {
      const h = progressiveHint(target, q.hints);
      hintEl.textContent = `Gợi ý ${q.hints}: ${h.text}${h.next ? ` (từ tiếp theo: ${h.next})` : ""}`;
    }
    return;
  }
  if (q.kind !== "sentence" || q.locked) return;
  if (act === "pick") {
    const i = Number(btn.getAttribute("data-idx"));
    const word = q.bank[i];
    if (word == null) return;
    q.bank[i] = null;
    q.picked.push(word);
    paintSentence();
    if (q.picked.length >= splitWords(q.target).length) answerSentenceComplete();
  } else if (act === "undo") {
    const last = q.picked.pop();
    const free = q.bank.findIndex((w) => w == null);
    if (last != null && free >= 0) q.bank[free] = last;
    paintSentence();
  } else if (act === "reset") {
    const ch = buildSentenceChallenge(q.card, s.random);
    q.bank = ch.bank;
    q.picked = [];
    paintSentence();
  }
}

function onSubmit(event) {
  const form = event.target?.closest?.("[data-lg-form]");
  if (!form || !session?.container.contains(form)) return;
  event.preventDefault();
  const input = form.querySelector('input[name="answer"]');
  answerTranslate(input ? input.value : "");
}

export function mountLearningGames(containerEl, { mode = "mixed", cards = [], onFinish, onScore, random = Math.random } = {}) {
  if (typeof document === "undefined" || !containerEl) return null;
  unmountLearningGames();
  const cleanMode = mode === "translate" || mode === "sentence" ? mode : "mixed";
  const queue = usableCards(cards, cleanMode);
  session = {
    container: containerEl,
    mode: cleanMode,
    queue,
    index: 0,
    correct: 0,
    wrong: 0,
    points: 0,
    onFinish,
    onScore,
    random,
    qstate: null,
    abort: typeof AbortController !== "undefined" ? new AbortController() : null,
  };
  const signal = session.abort?.signal;
  containerEl.innerHTML = `<div data-lg-root></div><p class="hint">Dịch câu / Đặt câu · ${queue.length} câu</p>`;
  try {
    containerEl.addEventListener("click", onClick, signal ? { signal } : undefined);
    containerEl.addEventListener("submit", onSubmit, signal ? { signal } : undefined);
  } catch {
    containerEl.addEventListener("click", onClick);
    containerEl.addEventListener("submit", onSubmit);
  }
  if (!queue.length) {
    containerEl.querySelector("[data-lg-root]").innerHTML = `<div class="lg-stage">${topBar("Chưa có dữ liệu", "Thêm thẻ có term + meaning (câu cần example nhiều từ).", LG_ASSETS.robot.reading, "is-idle")}</div>`;
    return api();
  }
  renderCurrent();
  return api();
}

export function startLearningGames() {
  if (!session) return null;
  clearTimers();
  resetCounters();
  return api();
}

export function unmountLearningGames() {
  clearTimers();
  try {
    session?.abort?.abort();
  } catch {
    /* bỏ qua */
  }
  if (session?.container) {
    try {
      session.container.removeEventListener("click", onClick);
      session.container.removeEventListener("submit", onSubmit);
      session.container.innerHTML = "";
    } catch {
      /* bỏ qua */
    }
  }
  session = null;
}

function api() {
  return {
    mount: mountLearningGames,
    unmount: unmountLearningGames,
    start: startLearningGames,
    get state() {
      return session
        ? { mode: session.mode, index: session.index, total: session.queue.length, correct: session.correct, wrong: session.wrong, points: session.points }
        : null;
    },
  };
}

export default { mountLearningGames, unmountLearningGames, startLearningGames, createLearningGames };
