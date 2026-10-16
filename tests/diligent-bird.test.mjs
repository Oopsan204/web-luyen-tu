import test from "node:test";
import assert from "node:assert/strict";
import {
  BIRD_BASE_SCORE,
  BIRD_COMBO_BONUS,
  BIRD_COMBO_CAP,
  BIRD_HEARTS,
  birdAnswer,
  birdCurrentQuestion,
  birdProgress,
  birdSummary,
  createBirdQuestion,
  createBirdSession,
} from "../js/games/diligent-bird.js";

const cards = [
  { id: "c1", term: "apple", meaning: "quả táo" },
  { id: "c2", term: "book", meaning: "quyển sách" },
  { id: "c3", term: "cat", meaning: "con mèo" },
  { id: "c4", term: "dog", meaning: "con chó" },
  { id: "c5", term: "egg", meaning: "quả trứng" },
];
const constantRandom = (value = 0) => () => value;

test("session dung tu card that: moi cau co 4 cong, dap an trong labels", () => {
  const session = createBirdSession(cards, { random: constantRandom(0.5) });
  assert.equal(session.total, 5);
  assert.equal(session.hearts, BIRD_HEARTS);
  assert.equal(session.finished, false);
  for (const question of session.questions) {
    assert.equal(question.labels.length, 4);
    assert.equal(question.labels[question.correctIndex], question.answer);
    assert.equal(new Set(question.labels).size, 4);
  }
});

test("card trung nghia khong tao cong trung nhan", () => {
  const dupes = [
    { term: "a", meaning: "quyen sach" },
    { term: "b", meaning: "quyen sach" },
    { term: "c", meaning: "cay but" },
  ];
  const question = createBirdQuestion(dupes[0], dupes, constantRandom(0.7));
  assert.deepEqual([...new Set(question.labels)], question.labels);
  assert.equal(question.labels[question.correctIndex], "quyen sach");
  assert.equal(question.labels.length, 2);
});

test("duoi 2 card that -> session empty, khong crash", () => {
  const session = createBirdSession([{ term: "solo", meaning: "mot minh" }]);
  assert.equal(session.finished, true);
  assert.equal(session.reason, "empty");
  assert.equal(birdCurrentQuestion(session), null);
});

test("tra loi dung: cong diem + combo tang dan, combo cham tran", () => {
  const session = createBirdSession(cards, { random: constantRandom(0.1) });
  let expected = 0;
  for (let round = 0; round < session.total; round += 1) {
    const question = birdCurrentQuestion(session);
    const result = birdAnswer(session, question.correctIndex);
    const comboLevel = Math.min(round, BIRD_COMBO_CAP - 1);
    expected += BIRD_BASE_SCORE + comboLevel * BIRD_COMBO_BONUS;
    assert.equal(result.correct, true);
    assert.equal(result.gained, BIRD_BASE_SCORE + comboLevel * BIRD_COMBO_BONUS);
    assert.equal(result.score, expected);
    assert.equal(result.combo, round + 1);
  }
  assert.equal(session.finished, true);
  assert.equal(session.reason, "complete");
  const summary = birdSummary(session);
  assert.equal(summary.accuracy, 100);
  assert.equal(summary.bestCombo, session.total);
});

test("tra loi sai: tru 1 tim, combo reset, diem giu nguyen", () => {
  const session = createBirdSession(cards, { random: constantRandom(0.9) });
  const first = birdCurrentQuestion(session);
  const wrong = (first.correctIndex + 1) % 4;
  const before = session.score;
  const result = birdAnswer(session, wrong);
  assert.equal(result.correct, false);
  assert.equal(result.gained, 0);
  assert.equal(result.hearts, BIRD_HEARTS - 1);
  assert.equal(result.combo, 0);
  assert.equal(session.score, before);
  assert.equal(session.finished, false);
});

test("het 3 tim -> finished reason hearts, summary chinh xac", () => {
  const session = createBirdSession(cards, { hearts: 3, random: constantRandom(0.9) });
  for (let round = 0; round < 3; round += 1) {
    const question = birdCurrentQuestion(session);
    birdAnswer(session, (question.correctIndex + 1) % 4);
  }
  assert.equal(session.hearts, 0);
  assert.equal(session.finished, true);
  assert.equal(session.reason, "hearts");
  const summary = birdSummary(session);
  assert.equal(summary.wrong, 3);
  assert.equal(summary.accuracy, 0);
});

test("progress phan anh index/total/percent/score", () => {
  const session = createBirdSession(cards.slice(0, 4), { random: constantRandom(0.2) });
  assert.deepEqual(birdProgress(session), {
    index: 0, total: 4, percent: 0, hearts: 3, maxHearts: 3, combo: 0, score: 0,
  });
  const question = birdCurrentQuestion(session);
  birdAnswer(session, question.correctIndex);
  assert.deepEqual(birdProgress(session), {
    index: 1, total: 4, percent: 25, hearts: 3, maxHearts: 3, combo: 1, score: BIRD_BASE_SCORE,
  });
});

test("gate index ngoai pham vi tinh la sai (khong throw)", () => {
  const session = createBirdSession(cards, { random: constantRandom(0.3) });
  const result = birdAnswer(session, 99);
  assert.equal(result.correct, false);
  assert.equal(session.hearts, BIRD_HEARTS - 1);
});

test("sau finished, birdAnswer khong doi trang thai", () => {
  const session = createBirdSession(cards.slice(0, 2), { hearts: 1, random: constantRandom(0.9) });
  const question = birdCurrentQuestion(session);
  birdAnswer(session, (question.correctIndex + 1) % 4);
  assert.equal(session.finished, true);
  const snapshot = { ...session };
  const idle = birdAnswer(session, 0);
  assert.equal(idle.finished, true);
  assert.equal(session.score, snapshot.score);
  assert.equal(session.index, snapshot.index);
});

test("khong mutate mang cards truyen vao", () => {
  const input = cards.map((card) => ({ ...card }));
  createBirdSession(input, { random: constantRandom(0.4) });
  assert.deepEqual(input.map((c) => c.term), ["apple", "book", "cat", "dog", "egg"]);
});
