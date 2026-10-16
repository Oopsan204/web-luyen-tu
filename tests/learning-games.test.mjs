import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAnswer,
  normalizeSentence,
  splitWords,
  acceptedAnswers,
  checkTranslation,
  checkSentenceOrder,
  buildSentenceChallenge,
  firstLetterHint,
  progressiveHint,
  scoreForResult,
} from "../js/games/learning-games.js";

const constantRandom = (value = 0) => () => value;

test("normalizeAnswer gộp khoảng trắng, hạ chữ", () => {
  assert.equal(normalizeAnswer("  Xin   CHÀO "), "xin chào");
  assert.equal(normalizeAnswer(null), "");
});

test("splitWords/normalizeSentence bỏ dấu câu", () => {
  assert.deepEqual(splitWords("Hello, world!"), ["Hello", "world"]);
  assert.equal(normalizeSentence("I  Love   YOU."), "i love you");
});

test("checkTranslation đúng/sai + acceptedTranslations", () => {
  const card = { term: "hello", meaning: "xin chào", acceptedTranslations: ["chào", "xin chao"] };
  assert.equal(checkTranslation("Xin chào", card), true);
  assert.equal(checkTranslation("  chào  ", card), true);
  assert.equal(checkTranslation("xin chao", card), true); // không dấu vẫn pass
  assert.equal(checkTranslation("tạm biệt", card), false);
  assert.equal(checkTranslation("", card), false);
});

test("acceptedAnswers tách dấu / và loại trùng", () => {
  const card = { meaning: "xin chào / chào", acceptedTranslations: ["chào", "xin chào"] };
  assert.deepEqual(acceptedAnswers(card), ["xin chào", "chào"]);
});

test("checkSentenceOrder đúng thứ tự, bỏ dấu câu/case", () => {
  assert.equal(checkSentenceOrder(["I", "love", "you"], "I love you"), true);
  assert.equal(checkSentenceOrder(["i", "love", "you."], "I Love You"), true);
  assert.equal(checkSentenceOrder(["you", "love", "I"], "I love you"), false);
  assert.equal(checkSentenceOrder(["I", "love"], "I love you"), false);
});

test("buildSentenceChallenge: bank là hoán vị, đảo khi shuffle trùng", () => {
  const card = { term: "go", meaning: "đi", example: "I want to go home" };
  const ch = buildSentenceChallenge(card, constantRandom(0.99));
  assert.ok(ch);
  assert.equal(ch.target, "I want to go home");
  assert.deepEqual([...ch.bank].sort(), ["I", "go", "home", "to", "want"].sort());
  assert.notEqual(ch.bank.join(" "), ch.target);
});

test("buildSentenceChallenge: câu 1 từ không cần sắp xếp, thiếu chữ trả null", () => {
  assert.deepEqual(buildSentenceChallenge({ term: "hi", meaning: "chào" }).bank, ["hi"]);
  assert.equal(buildSentenceChallenge({ term: "hi", meaning: "chào" }).needsOrder, false);
  assert.equal(buildSentenceChallenge({ term: "", meaning: "" }), null);
});

test("gợi ý chữ đầu + progressive hint", () => {
  assert.equal(firstLetterHint("I love you"), "I… l… y…");
  const h1 = progressiveHint("I love you", 1);
  assert.equal(h1.text, "I ___ ___");
  assert.equal(h1.next, "love");
  assert.equal(h1.done, false);
  const h3 = progressiveHint("I love you", 3);
  assert.equal(h3.text, "I love you");
  assert.equal(h3.done, true);
  const h0 = progressiveHint("I love you", 0);
  assert.equal(h0.next, "I");
});

test("tính điểm: sai 0, đúng trừ dần theo gợi ý/lượt, sàn 1", () => {
  assert.equal(scoreForResult({ ok: false }), 0);
  assert.equal(scoreForResult({ ok: true }), 3);
  assert.equal(scoreForResult({ ok: true, hintsUsed: 1 }), 2);
  assert.equal(scoreForResult({ ok: true, hintsUsed: 2, attempts: 2 }), 1);
  assert.equal(scoreForResult({ ok: true, hintsUsed: 9 }), 1);
});
