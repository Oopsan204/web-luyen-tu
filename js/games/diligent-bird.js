/*
  Chim Chăm Chỉ (Diligent Bird) — mini game Study Hub.
  Asset tách riêng: assets/games/diligent-bird/{bird,obstacles,ui} (không dùng sheets/bird-sheet.png).
  API: mountDiligentBird(containerEl, { cards, onFinish, onScore }) · startDiligentBird() · unmountDiligentBird()
  Logic thuần (createBirdSession/birdAnswer/birdSummary...) không đụng DOM → test bằng node --test.
*/
import { escapeHTML } from "../core.js";

export const BIRD_ASSET_BASE = "assets/games/diligent-bird/";
export const BIRD_HEARTS = 3;
export const BIRD_BASE_SCORE = 10;
export const BIRD_COMBO_BONUS = 2;
export const BIRD_COMBO_CAP = 5;
export const BIRD_GATE_COUNT = 4;
const BIRD_MIN_CARDS = 2;
const BIRD_ART = {
  wings: ["flap_1.png", "flap_2.png", "flap_3.png"],
  poses: { glide: "glide.png", hit: "hit.png", victory: "victory.png" },
  gates: ["gate_a.png", "gate_b.png", "gate_c.png", "gate_d.png"],
};
const asset = (...parts) => BIRD_ASSET_BASE + parts.join("/");

const clampInt = (value, fallback, min, max) => {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const shuffled = (items, random) => {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

const text = (card, key) => String(card?.[key] ?? "").trim();
const cardLabel = (card) => text(card, "meaning") || text(card, "term");

/* ---------- Logic thuần ---------- */

export function createBirdQuestion(card, pool, random = Math.random) {
  const prompt = text(card, "term") || text(card, "meaning");
  const answer = cardLabel(card);
  const seen = new Set([answer]);
  const distractors = [];
  for (const other of shuffled(pool, random)) {
    if (other === card) continue;
    const label = cardLabel(other);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    distractors.push(label);
    if (distractors.length >= BIRD_GATE_COUNT - 1) break;
  }
  const labels = shuffled([answer, ...distractors], random);
  return { card, prompt, answer, labels, correctIndex: labels.indexOf(answer) };
}

export function createBirdSession(cards = [], options = {}) {
  const random = typeof options.random === "function" ? options.random : Math.random;
  const pool = (Array.isArray(cards) ? cards : []).filter((card) => card && (text(card, "term") || text(card, "meaning")));
  const settings = { hearts: clampInt(options.hearts, BIRD_HEARTS, 1, 9), limit: clampInt(options.limit, pool.length, 0, pool.length || 0), random };
  const session = {
    pool,
    settings,
    total: 0,
    index: 0,
    hearts: settings.hearts,
    maxHearts: settings.hearts,
    combo: 0,
    bestCombo: 0,
    score: 0,
    correct: 0,
    wrong: 0,
    questions: [],
    status: "empty",
    finished: true,
    reason: "empty",
  };
  if (pool.length < BIRD_MIN_CARDS) return session;
  const picked = shuffled(pool, random).slice(0, settings.limit || pool.length);
  session.questions = picked.map((card) => createBirdQuestion(card, pool, random));
  session.total = session.questions.length;
  session.status = "playing";
  session.finished = false;
  session.reason = "";
  return session;
}

export function birdCurrentQuestion(session) {
  if (!session || session.finished) return null;
  return session.questions?.[session.index] || null;
}

export function birdAnswer(session, gateIndex) {
  if (!session) throw new Error("birdAnswer cần session");
  const question = birdCurrentQuestion(session);
  const idle = {
    correct: false,
    correctIndex: -1,
    answer: "",
    gained: 0,
    hearts: session.hearts,
    combo: session.combo,
    score: session.score,
    finished: true,
    reason: session.reason || "empty",
    index: session.index,
    total: session.total,
  };
  if (!question) return idle;
  const correct = Number(gateIndex) === question.correctIndex;
  let gained = 0;
  if (correct) {
    session.correct += 1;
    session.combo += 1;
    session.bestCombo = Math.max(session.bestCombo, session.combo);
    gained = BIRD_BASE_SCORE + Math.min(session.combo - 1, BIRD_COMBO_CAP - 1) * BIRD_COMBO_BONUS;
    session.score += gained;
  } else {
    session.wrong += 1;
    session.combo = 0;
    session.hearts = Math.max(0, session.hearts - 1);
  }
  session.index += 1;
  if (session.hearts <= 0) session.reason = "hearts";
  else if (session.index >= session.total) session.reason = "complete";
  session.finished = Boolean(session.reason);
  session.status = session.finished ? "finished" : "playing";
  return {
    correct,
    correctIndex: question.correctIndex,
    answer: question.answer,
    gained,
    hearts: session.hearts,
    combo: session.combo,
    score: session.score,
    finished: session.finished,
    reason: session.reason,
    index: session.index,
    total: session.total,
  };
}

export function birdProgress(session) {
  const total = session?.total || 0;
  const index = session?.index || 0;
  return {
    index,
    total,
    percent: total ? Math.round((index / total) * 100) : 0,
    hearts: session?.hearts || 0,
    maxHearts: session?.maxHearts || 0,
    combo: session?.combo || 0,
    score: session?.score || 0,
  };
}

export function birdSummary(session) {
  const answered = (session?.correct || 0) + (session?.wrong || 0);
  return {
    score: session?.score || 0,
    correct: session?.correct || 0,
    wrong: session?.wrong || 0,
    total: session?.total || 0,
    answered,
    bestCombo: session?.bestCombo || 0,
    hearts: session?.hearts || 0,
    maxHearts: session?.maxHearts || 0,
    reason: session?.reason || "empty",
    accuracy: answered ? Math.round(((session.correct || 0) / answered) * 100) : 0,
  };
}

/* ---------- DOM: mount / start / unmount ---------- */

let birdGame = null;

const reducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches === true;

const birdMarkup = (session) => `
  <div class="dbird-sky" aria-hidden="true">
    <div class="dbird-clouds"></div>
    <div class="dbird-pipes"></div>
  </div>
  <div class="dbird-hud">
    <p class="dbird-badge"><span class="dbird-score">0</span></p>
    <p class="dbird-stat"><img src="${asset("ui", "coin.png")}" alt=""><span class="dbird-coins">0</span></p>
    <p class="dbird-stat"><img src="${asset("ui", "star.png")}" alt=""><span class="dbird-stars">×1</span></p>
    <p class="dbird-lives" role="img" aria-label="${session.maxHearts} mạng">${Array.from({ length: session.maxHearts }, () => `<img class="dbird-heart" src="${asset("ui", "heart.png")}" alt="">`).join("")}</p>
    <div class="dbird-progress" role="progressbar" aria-label="Tiến độ" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="dbird-progress-fill"></span></div>
  </div>
  <div class="dbird-question"><p class="dbird-prompt"></p><p class="dbird-hint">Bấm phím 1–4 hoặc chọn cổng</p></div>
  <div class="dbird-bird" aria-hidden="true">
    ${BIRD_ART.wings.map((file, i) => `<img class="dbird-pose dbird-wing w${i + 1}" src="${asset("bird", file)}" alt="" decoding="async">`).join("")}
    <img class="dbird-pose dbird-glide" src="${asset("bird", BIRD_ART.poses.glide)}" alt="" decoding="async">
    <img class="dbird-pose dbird-hit" src="${asset("bird", BIRD_ART.poses.hit)}" alt="" decoding="async">
    <img class="dbird-pose dbird-victory" src="${asset("bird", BIRD_ART.poses.victory)}" alt="" decoding="async">
  </div>
  <div class="dbird-gates" role="group" aria-label="Chọn cổng nghĩa đúng"></div>
  <p class="dbird-float" aria-hidden="true"></p>
  <p class="dbird-status" role="status" aria-live="polite"></p>
`;

const birdEls = (root) => ({
  bird: root.querySelector(".dbird-bird"),
  gates: root.querySelector(".dbird-gates"),
  prompt: root.querySelector(".dbird-prompt"),
  float: root.querySelector(".dbird-float"),
  status: root.querySelector(".dbird-status"),
  score: root.querySelector(".dbird-score"),
  coins: root.querySelector(".dbird-coins"),
  stars: root.querySelector(".dbird-stars"),
  lives: root.querySelector(".dbird-lives"),
  hearts: [...root.querySelectorAll(".dbird-heart")],
  progress: root.querySelector(".dbird-progress"),
  progressFill: root.querySelector(".dbird-progress-fill"),
});

export function mountDiligentBird(containerEl, options = {}) {
  unmountDiligentBird();
  const container = typeof containerEl === "string" ? document.querySelector(containerEl) : containerEl;
  if (!container || typeof container.replaceChildren !== "function") throw new Error("mountDiligentBird cần containerEl hợp lệ");
  const session = createBirdSession(options.cards || [], { hearts: options.hearts, limit: options.limit, random: options.random });
  const root = document.createElement("section");
  root.className = "dbird";
  root.dataset.bird = "glide";
  root.setAttribute("aria-label", "Chim Chăm Chỉ");
  root.innerHTML = birdMarkup(session);
  const els = birdEls(root);
  if (!session.total) {
    const notice = document.createElement("p");
    notice.className = "dbird-empty";
    notice.textContent = "Cần ít nhất 2 thẻ từ vựng để chơi Chim Chăm Chỉ.";
    root.append(notice);
  }
  const state = {
    container,
    root,
    els,
    session,
    pool: session.pool,
    sessionOptions: { hearts: session.settings.hearts, limit: session.settings.limit, random: session.settings.random },
    onFinish: typeof options.onFinish === "function" ? options.onFinish : null,
    onScore: typeof options.onScore === "function" ? options.onScore : null,
    reduced: reducedMotion(),
    lock: true,
    raf: 0,
    timers: [],
  };
  state.onKey = (event) => birdKey(state, event);
  state.onClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const restart = target?.closest("[data-dbird-restart]");
    if (restart) {
      const container = state.container;
      const cards = state.pool;
      const options = state.sessionOptions;
      const onFinish = state.onFinish;
      const onScore = state.onScore;
      mountDiligentBird(container, { cards, hearts: options.hearts, limit: options.limit, random: options.random, onFinish, onScore });
      startDiligentBird();
      return;
    }
    const gate = target?.closest(".dbird-gate");
    if (gate) birdChoose(state, Number(gate.dataset.index));
  };
  root.addEventListener("click", state.onClick);
  document.addEventListener("keydown", state.onKey);
  container.replaceChildren(root);
  birdSyncHud(state);
  birdSetPose(state, "glide");
  birdGame = state;
  return state;
}

export function startDiligentBird() {
  const state = birdGame;
  if (!state || !state.session.total || state.session.finished) return false;
  state.lock = false;
  birdRenderQuestion(state);
  birdSyncHud(state);
  return true;
}

export function unmountDiligentBird() {
  const state = birdGame;
  if (!state) return false;
  if (state.raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(state.raf);
  state.raf = 0;
  state.timers.forEach((id) => clearTimeout(id));
  state.timers.length = 0;
  document.removeEventListener("keydown", state.onKey);
  state.root.removeEventListener("click", state.onClick);
  state.container.replaceChildren();
  birdGame = null;
  return true;
}

/* ---------- DOM: vòng chơi ---------- */

function birdSetPose(state, pose) {
  state.root.dataset.bird = pose;
}


function birdLater(state, fn, ms) {
  state.timers.push(setTimeout(fn, state.reduced ? 0 : ms));
}

function birdSyncHud(state) {
  const p = birdProgress(state.session);
  const els = state.els;
  els.score.textContent = String(p.score);
  els.coins.textContent = String(state.session.correct);
  els.stars.textContent = `×${1 + Math.min(Math.max(p.combo - 1, 0), BIRD_COMBO_CAP - 1)}`;
  els.hearts.forEach((img, i) => img.classList.toggle("is-lost", i >= p.hearts));
  els.lives.setAttribute("aria-label", `${p.hearts}/${p.maxHearts} mạng`);
  els.progress.setAttribute("aria-valuenow", String(p.percent));
  els.progressFill.style.transform = `scaleX(${p.percent / 100})`;
}

function birdRenderQuestion(state) {
  const question = birdCurrentQuestion(state.session);
  if (!question) return;
  state.lock = false;
  state.els.prompt.textContent = question.prompt;
  state.els.gates.innerHTML = question.labels
    .map((label, i) => `
      <button type="button" class="dbird-gate" data-index="${i}" style="--i:${i}">
        <img class="dbird-gate-art" src="${asset("obstacles", BIRD_ART.gates[i % BIRD_ART.gates.length])}" alt="" decoding="async">
        <span class="dbird-gate-key" aria-hidden="true">${i + 1}</span>
        <span class="dbird-gate-label">${escapeHTML(label)}</span>
      </button>`)
    .join("");
  state.els.status.textContent = `Từ: ${question.prompt}. Còn ${state.session.hearts} mạng.`;
  birdSetPose(state, "glide");
}

function birdFloat(state, value) {
  const el = state.els.float;
  el.textContent = value;
  el.classList.remove("is-on");
  void el.offsetWidth;
  el.classList.add("is-on");
}

function birdFlyToGate(state, gate, done) {
  const bird = state.els.bird;
  bird.style.transform = "";
  const from = bird.getBoundingClientRect();
  const to = gate.getBoundingClientRect();
  const dx = Math.round(to.left + to.width / 2 - (from.left + from.width / 2));
  const dy = Math.round(to.top + to.height / 2 - (from.top + from.height / 2));
  if (state.reduced || typeof requestAnimationFrame !== "function") {
    bird.style.transform = `translate(${dx}px, ${dy}px)`;
    done();
    return;
  }
  const start = performance.now();
  const duration = 460;
  const step = (now) => {
    state.raf = 0;
    const t = Math.min(1, (now - start) / duration);
    const ease = 1 - (1 - t) ** 3;
    const lift = Math.sin(Math.PI * t) * 26;
    bird.style.transform = `translate(${(dx * ease).toFixed(2)}px, ${(dy * ease - lift).toFixed(2)}px)`;
    if (t < 1) {
      state.raf = requestAnimationFrame(step);
      return;
    }
    done();
  };
  state.raf = requestAnimationFrame(step);
}

function birdChoose(state, index) {
  if (state.lock || state.session.finished) return;
  const buttons = [...state.els.gates.querySelectorAll(".dbird-gate")];
  const gate = buttons[index];
  if (!gate) return;
  state.lock = true;
  const result = birdAnswer(state.session, index);
  buttons.forEach((button, i) => {
    button.disabled = true;
    if (i === result.correctIndex) button.classList.add("is-pass");
    else if (i === index) button.classList.add("is-miss");
    else button.classList.add("is-dim");
  });
  birdSyncHud(state);
  state.els.status.textContent = result.correct
    ? `Đúng! ${result.answer}. +${result.gained} điểm.`
    : `Sai. Đáp án đúng: ${result.answer}. Còn ${result.hearts} mạng.`;
  state.onScore?.({ ...birdSummary(state.session), gained: result.gained, correctAnswer: result.correct, answer: result.answer, session: state.session });
  if (result.correct) {
    birdSetPose(state, "fly");
    birdFloat(state, `+${result.gained}`);
    birdFlyToGate(state, gate, () => birdAdvance(state, result));
  } else {
    birdSetPose(state, "hit");
    birdLater(state, () => birdAdvance(state, result), 520);
  }
}

function birdAdvance(state, result) {
  if (state.session.finished) {
    birdFinish(state, result);
    return;
  }
  birdLater(state, () => {
    state.els.bird.style.transform = "";
    birdRenderQuestion(state);
  }, 240);
}

function birdFinish(state, result) {
  birdSetPose(state, state.session.reason === "hearts" ? "hit" : "victory");
  birdSyncHud(state);
  const summary = birdSummary(state.session);
  state.els.status.textContent = summary.reason === "hearts"
    ? `Hết mạng. Điểm ${summary.score}, đúng ${summary.correct}/${summary.answered}.`
    : `Hoàn thành! Điểm ${summary.score}, đúng ${summary.correct}/${summary.total}.`;
  const finish = document.createElement("div");
  finish.className = "dbird-finish";
  finish.innerHTML = `<div><strong>${summary.reason === "hearts" ? "Hết mạng" : "Hoàn thành!"}</strong><span>Điểm ${summary.score} · Đúng ${summary.correct}/${summary.answered || summary.total}</span><button type="button" data-dbird-restart>↻ Chơi lại</button></div>`;
  state.root.append(finish);
  birdFloat(state, `★ ${summary.score}`);
  birdLater(state, () => state.onFinish?.(summary, result), 700);
}

function birdKey(state, event) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
  const index = Number(event.key) - 1;
  if (!Number.isInteger(index) || index < 0) return;
  if (!state.els.gates.querySelector(`.dbird-gate[data-index="${index}"]`)) return;
  event.preventDefault();
  birdChoose(state, index);
}
