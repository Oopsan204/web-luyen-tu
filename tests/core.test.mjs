import test from "node:test";
import assert from "node:assert/strict";
import { buildMixedPlan, calculateSrs, parseCSV, pickMixedVariant, toCSV, computeStudyStats, filterStudyCards } from "../js/core.js";

const now = new Date("2026-10-16T08:00:00.000Z");
const base = { interval: 0, repetitions: 0, ease: 2.5, level: "new" };

test("SRS đưa thẻ quên về hàng chờ 5 phút", () => {
  const result = calculateSrs({ ...base, interval: 8, repetitions: 4 }, "again", now);
  assert.equal(result.repetitions, 0);
  assert.equal(result.interval, 0);
  assert.equal(result.dueAt, "2026-10-16T08:05:00.000Z");
});

test("SRS tăng khoảng cách theo good/easy và giới hạn ease", () => {
  const first = calculateSrs(base, "good", now);
  assert.equal(first.interval, 1);
  const second = calculateSrs(first, "good", now);
  assert.equal(second.interval, 3);
  const easy = calculateSrs({ ...second, interval: 3 }, "easy", now);
  assert.ok(easy.interval >= 9);
  assert.ok(easy.ease > 2.5);
  let hard = base;
  for (let i = 0; i < 20; i += 1) hard = calculateSrs(hard, "hard", now);
  assert.equal(hard.ease, 1.3);
});

test("CSV round-trip giữ Unicode, dấu phẩy, nháy kép và xuống dòng", () => {
  const cards = [{ term: "xin, chào", meaning: "lời \"chào\"", example: "Dòng một\nDòng hai", pronunciation: "chào", deckId: "d1" }];
  const parsed = parseCSV(toCSV(cards));
  assert.deepEqual(parsed[0], cards[0]);
});

test("parseCSV hiểu header tiếng Việt", () => {
  assert.deepEqual(parseCSV("Từ vựng,Nghĩa,Ví dụ\nhello,xin chào,Hello!"), [{ term: "hello", meaning: "xin chào", example: "Hello!" }]);
});

test("thống kê tính đến hạn, đã học, đã thuộc và streak liên tục", () => {
  const cards = [
    { repetitions: 0, dueAt: "2026-10-15T00:00:00Z" },
    { repetitions: 2, interval: 3, dueAt: "2026-10-18T00:00:00Z" },
    { repetitions: 5, interval: 12, level: "mastered", dueAt: "2026-10-16T07:00:00Z" },
  ];
  const activities = [
    { createdAt: "2026-10-14T10:00:00Z", xp: 5, coins: 1 },
    { createdAt: "2026-10-15T10:00:00Z", xp: 10, coins: 2 },
    { createdAt: "2026-10-16T07:00:00Z", xp: 15, coins: 3 },
  ];
  const stats = computeStudyStats(cards, activities, now);
  assert.equal(stats.total, 3);
  assert.equal(stats.due, 2);
  assert.equal(stats.learned, 2);
  assert.equal(stats.mastered, 1);
  assert.equal(stats.streak, 3);
  assert.equal(stats.xp, 30);
  assert.equal(stats.coins, 6);
});

const studyCards = [
  { id: "c1", term: "banana", deckId: "d1", repetitions: 0, level: "new", wrongCount: 1, ease: 2.5, createdAt: "2026-10-10T00:00:00Z", dueAt: null },
  { id: "c2", term: "apple", deckId: "d1", repetitions: 2, level: "learning", wrongCount: 5, ease: 2.1, createdAt: "2026-10-12T00:00:00Z", dueAt: "2026-10-16T07:00:00Z" },
  { id: "c3", term: "cherry", deckId: "d2", repetitions: 5, level: "mastered", wrongCount: 0, ease: 2.8, createdAt: "2026-10-14T00:00:00Z", dueAt: "2026-10-20T00:00:00Z" },
  { id: "c4", term: "date", deckId: "d2", repetitions: 1, level: "learning", wrongCount: 3, ease: 1.6, createdAt: "2026-10-11T00:00:00Z", dueAt: null },
  { id: "c5", term: "elder", deckId: "d2", repetitions: 0, level: "new", wrongCount: 0, ease: 2.5, createdAt: "2026-10-13T00:00:00Z", dueAt: "2026-10-18T00:00:00Z" },
];

const ids = (cards) => cards.map((card) => card.id);
const constantRandom = (value = 0) => () => value;

test("lọc deckId theo bộ đã chọn", () => {
  assert.deepEqual(ids(filterStudyCards(studyCards, { deckId: "d1", status: "all", order: "oldest", limit: "all" }, now, constantRandom())), ["c1", "c2"]);
});

test("lọc đủ trạng thái new/learning/unmastered/mastered/due", () => {
  const by = { deckId: "all", order: "oldest", limit: "all" };
  assert.deepEqual(ids(filterStudyCards(studyCards, { ...by, status: "new" }, now, constantRandom())), ["c1", "c5"]);
  assert.deepEqual(ids(filterStudyCards(studyCards, { ...by, status: "learning" }, now, constantRandom())), ["c4", "c2"]);
  assert.deepEqual(ids(filterStudyCards(studyCards, { ...by, status: "unmastered" }, now, constantRandom())), ["c1", "c4", "c2", "c5"]);
  assert.deepEqual(ids(filterStudyCards(studyCards, { ...by, status: "mastered" }, now, constantRandom())), ["c3"]);
  assert.deepEqual(ids(filterStudyCards(studyCards, { ...by, status: "due" }, now, constantRandom())), ["c1", "c4", "c2"]);
});

test("sắp xếp az/za/newest/oldest", () => {
  const base = { deckId: "all", status: "all", limit: "all" };
  assert.deepEqual(ids(filterStudyCards(studyCards, { ...base, order: "az" }, now, constantRandom())), ["c2", "c1", "c3", "c4", "c5"]);
  assert.deepEqual(ids(filterStudyCards(studyCards, { ...base, order: "za" }, now, constantRandom())), ["c5", "c4", "c3", "c1", "c2"]);
  assert.deepEqual(ids(filterStudyCards(studyCards, { ...base, order: "newest" }, now, constantRandom())), ["c3", "c5", "c2", "c4", "c1"]);
  assert.deepEqual(ids(filterStudyCards(studyCards, { ...base, order: "oldest" }, now, constantRandom())), ["c1", "c4", "c2", "c5", "c3"]);
});

test("ưu tiên từ khó theo wrongCount rồi ease", () => {
  const result = filterStudyCards(studyCards, { deckId: "all", status: "all", order: "hard", limit: "all" }, now, constantRandom());
  assert.deepEqual(ids(result), ["c2", "c4", "c1", "c5", "c3"]);
});

test("ưu tiên SRS đưa thiếu dueAt lên trước rồi dueAt sớm", () => {
  const result = filterStudyCards(studyCards, { deckId: "all", status: "all", order: "srs", limit: "all" }, now, constantRandom());
  assert.deepEqual(ids(result).slice(0, 3), ["c1", "c4", "c2"]);
});

test("giới hạn số lượng và mặc định an toàn", () => {
  assert.equal(filterStudyCards(studyCards, { deckId: "all", status: "all", order: "oldest", limit: 2 }, now, constantRandom()).length, 2);
  assert.equal(filterStudyCards(studyCards, { limit: "all" }, now, constantRandom()).length, studyCards.length);
  assert.equal(filterStudyCards(studyCards, { status: "nope", order: "nope", limit: "all" }, now, constantRandom()).length, studyCards.length);
});

test("random deterministic với random inject và không mutate input", () => {
  const before = JSON.stringify(studyCards);
  const first = filterStudyCards(studyCards, { order: "random", limit: "all" }, now, constantRandom(0.42));
  const second = filterStudyCards(studyCards, { order: "random", limit: "all" }, now, constantRandom(0.42));
  assert.deepEqual(ids(first), ids(second));
  assert.equal(JSON.stringify(studyCards), before);
  assert.notEqual(first, studyCards);
});

test("Mixed plan 20 câu giữ tỷ lệ 30/30/20/10/10 và không lặp mode liền nhau", () => {
  let seed = 17;
  const random = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  const plan = buildMixedPlan(20, random);
  assert.equal(plan.length, 20);
  const counts = plan.reduce((acc, mode) => ({ ...acc, [mode]: (acc[mode] || 0) + 1 }), {});
  assert.deepEqual(counts, { quiz: 6, typing: 6, listening: 4, flashcard: 2, match: 2 });
  for (let i = 1; i < plan.length; i += 1) assert.notEqual(plan[i], plan[i - 1]);
});

test("Mixed retry chọn mode hợp lệ và tránh lặp mode cuối", () => {
  const mode = pickMixedVariant("quiz", () => 0);
  assert.notEqual(mode, "quiz");
  assert.ok(["typing", "listening", "flashcard", "match"].includes(mode));
});
