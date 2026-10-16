const DAY = 86_400_000;

export const uid = (prefix = "id") => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function calculateSrs(card, rating, now = new Date()) {
  const base = new Date(now);
  const previousInterval = Math.max(0, Number(card.interval) || 0);
  let repetitions = Math.max(0, Number(card.repetitions) || 0);
  let ease = Math.max(1.3, Number(card.ease) || 2.5);
  let interval;
  let dueAt;

  if (rating === "again") {
    repetitions = 0;
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
    dueAt = new Date(base.getTime() + 5 * 60_000);
  } else if (rating === "hard") {
    repetitions += 1;
    interval = Math.max(1, Math.round((previousInterval || 1) * 1.2));
    ease = Math.max(1.3, ease - 0.15);
    dueAt = new Date(base.getTime() + interval * DAY);
  } else if (rating === "easy") {
    repetitions += 1;
    interval = previousInterval === 0 ? 4 : Math.max(4, Math.round(previousInterval * ease * 1.3));
    ease = Math.min(3.2, ease + 0.15);
    dueAt = new Date(base.getTime() + interval * DAY);
  } else {
    repetitions += 1;
    interval = repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.max(4, Math.round((previousInterval || 1) * ease));
    dueAt = new Date(base.getTime() + interval * DAY);
  }

  return {
    ...card,
    repetitions,
    interval,
    ease: Number(ease.toFixed(2)),
    dueAt: dueAt.toISOString(),
    level: repetitions >= 5 ? "mastered" : repetitions > 0 ? "learning" : "new",
    updatedAt: base.toISOString(),
  };
}

function csvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const input = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell.replace(/\r$/, ""));
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

export function parseCSV(text) {
  const rows = csvRows(text);
  if (!rows.length) return [];
  const aliases = {
    word: "term", vocabulary: "term", "từ": "term", "từ vựng": "term",
    definition: "meaning", translation: "meaning", "nghĩa": "meaning",
    "ví dụ": "example", phonetic: "pronunciation", "phiên âm": "pronunciation", deckid: "deckId", deck_id: "deckId", "bộ từ": "deckId",
  };
  const headers = rows[0].map((item) => {
    const key = item.trim().toLowerCase();
    return aliases[key] || key;
  });
  const hasHeader = headers.includes("term") || headers.includes("meaning");
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const keys = hasHeader ? headers : ["term", "meaning", "example", "pronunciation"];
  return dataRows
    .map((values) => Object.fromEntries(keys.map((key, index) => [key, (values[index] || "").trim()])))
    .filter((item) => item.term && item.meaning);
}

const quoteCSV = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function toCSV(cards) {
  const columns = ["term", "meaning", "example", "pronunciation", "deckId"];
  return [columns.join(","), ...cards.map((card) => columns.map((key) => quoteCSV(card[key])).join(","))].join("\r\n");
}

const localDay = (value) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export function computeStudyStats(cards = [], activities = [], now = new Date()) {
  const time = new Date(now).getTime();
  const learned = cards.filter((card) => (card.repetitions || 0) > 0).length;
  const mastered = cards.filter((card) => card.level === "mastered" || (card.repetitions >= 5 && card.interval >= 7)).length;
  const due = cards.filter((card) => !card.dueAt || new Date(card.dueAt).getTime() <= time).length;
  const activeDays = new Set(activities.map((activity) => localDay(activity.createdAt || activity.date)).filter(Boolean));
  let streak = 0;
  const cursor = new Date(now);
  const today = localDay(cursor);
  if (!activeDays.has(today)) cursor.setDate(cursor.getDate() - 1);
  while (activeDays.has(localDay(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return {
    total: cards.length,
    learned,
    mastered,
    learning: Math.max(0, learned - mastered),
    newCards: Math.max(0, cards.length - learned),
    due,
    streak,
    xp: activities.reduce((sum, item) => sum + (Number(item.xp) || 0), 0),
    coins: activities.reduce((sum, item) => sum + (Number(item.coins) || 0), 0),
  };
}

export function escapeHTML(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

export function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const MASTERED_REPS = 5;

const cardStage = (card) => {
  const repetitions = Math.max(0, Number(card.repetitions) || 0);
  if (repetitions >= MASTERED_REPS || card.level === "mastered") return "mastered";
  if (repetitions > 0 || card.level === "learning") return "learning";
  return "new";
};

const timeOf = (value) => {
  const time = new Date(value ?? 0).getTime();
  return Number.isFinite(time) ? time : 0;
};

const byTerm = (direction) => (a, b) =>
  direction * String(a.term ?? "").localeCompare(String(b.term ?? ""), "vi", { sensitivity: "base" });

const ORDERINGS = {
  az: byTerm(1),
  za: byTerm(-1),
  newest: (a, b) => timeOf(b.createdAt) - timeOf(a.createdAt),
  oldest: (a, b) => timeOf(a.createdAt) - timeOf(b.createdAt),
  hard: (a, b) =>
    (Number(b.wrongCount) || 0) - (Number(a.wrongCount) || 0) ||
    (Number(a.ease) || 2.5) - (Number(b.ease) || 2.5),
  srs: (a, b) => timeOf(a.dueAt) - timeOf(b.dueAt),
};

const STATUS_FILTERS = {
  all: () => true,
  new: (card) => cardStage(card) === "new",
  learning: (card) => cardStage(card) === "learning",
  unmastered: (card) => cardStage(card) !== "mastered",
  mastered: (card) => cardStage(card) === "mastered",
};

// Thẻ thiếu dueAt coi như đến hạn ngay và xếp đầu danh sách SRS.
export function filterStudyCards(cards = [], filters = {}, now = new Date(), random = Math.random) {
  const source = Array.isArray(cards) ? cards.filter(Boolean) : [];
  const { deckId = "all", status = "all", order = "random", limit = "all" } = filters || {};
  const stamp = timeOf(now);
  const dice = typeof random === "function" ? random : Math.random;
  const isDue = (card) => !card.dueAt || timeOf(card.dueAt) <= stamp;
  const matches = status === "due" ? isDue : STATUS_FILTERS[status] || STATUS_FILTERS.all;
  const list = source.filter((card) => (deckId == null || deckId === "all" || card.deckId === deckId) && matches(card));

  if (order === "random" || !ORDERINGS[order]) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.min(i, Math.floor(dice() * (i + 1)));
      [list[i], list[j]] = [list[j], list[i]];
    }
  } else {
    list.sort(ORDERINGS[order]);
  }

  const wanted = Number.parseInt(limit, 10);
  return Number.isFinite(wanted) && wanted >= 0 ? list.slice(0, wanted) : list;
}
