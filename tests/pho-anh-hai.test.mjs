import test from "node:test";
import assert from "node:assert/strict";
import {
  PAH_MAX_QUIZ_PER_DAY, PAH_QUIZ_KINDS,
  normalizeAnswer, buildVocabChallenge, checkVocabAnswer,
  pahNextQuiz, pahApplyMarketDiscount, pahApplyCookBonus, pahApplyCustomerBonus,
  mountPhoAnhHai, startPhoAnhHai, unmountPhoAnhHai,
  cleanupReport, phoAnhHaiState,
} from "../js/games/pho-anh-hai.js";

const seeded = (seed = 42) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const CARDS = [
  { id: "c1", term: "apple", meaning: "quả táo" },
  { id: "c2", term: "broth", meaning: "nước dùng" },
  { id: "c3", term: "noodle", meaning: "sợi phở" },
  { id: "c4", term: "market", meaning: "chợ" },
  { id: "c5", term: "customer", meaning: "khách hàng" },
];

test("câu hỏi từ vựng: 2 chiều, 4 lựa chọn duy nhất, chấm điểm chuẩn hoá", () => {
  const challenge = buildVocabChallenge(CARDS, seeded(11));
  assert.ok(challenge);
  assert.ok(["en_vi", "vi_en"].includes(challenge.direction));
  assert.ok(challenge.options.includes(challenge.answer));
  assert.ok(challenge.options.length >= 2 && challenge.options.length <= 4);
  const normalized = challenge.options.map(normalizeAnswer);
  assert.equal(new Set(normalized).size, normalized.length);
  if (challenge.direction === "en_vi") {
    assert.equal(challenge.prompt, challenge.term);
    assert.equal(challenge.answer, challenge.meaning);
  } else {
    assert.equal(challenge.prompt, challenge.meaning);
    assert.equal(challenge.answer, challenge.term);
  }
  assert.equal(checkVocabAnswer(challenge, `  ${challenge.answer.toUpperCase()} `), true);
  assert.equal(checkVocabAnswer(challenge, "chắc chắn sai"), false);
  assert.equal(checkVocabAnswer(null, "apple"), false);
  assert.equal(buildVocabChallenge([CARDS[0]]), null);
  assert.equal(buildVocabChallenge([]), null);
  assert.equal(PAH_MAX_QUIZ_PER_DAY, 3);
  assert.deepEqual([...PAH_QUIZ_KINDS], ["market", "cook", "customer"]);
});

test("lịch câu hỏi: tối đa 3 câu/ngày, đúng pha, đúng khách đầu", () => {
  // Chợ: pha morning, 1 lần/ngày
  assert.equal(pahNextQuiz({ phase: "morning", day: 1 }, false, null), "market");
  assert.equal(pahNextQuiz({ phase: "morning", day: 1 }, false, { day: 1, market: true, cook: false, customer: false }), null);
  // Sang ngày mới → được hỏi lại
  assert.equal(pahNextQuiz({ phase: "morning", day: 2 }, false, { day: 1, market: true, cook: true, customer: true }), "market");
  // Ninh: pha prep, 1 lần/ngày
  assert.equal(pahNextQuiz({ phase: "prep", day: 1 }, false, { day: 1, market: true, cook: false, customer: false }), "cook");
  assert.equal(pahNextQuiz({ phase: "prep", day: 1 }, false, { day: 1, market: true, cook: true, customer: false }), null);
  // Khách: chỉ khi khách đầu tiên vào, 1 lần/ngày
  assert.equal(pahNextQuiz({ phase: "sell", day: 1 }, true, { day: 1, market: true, cook: true, customer: false }), "customer");
  assert.equal(pahNextQuiz({ phase: "sell", day: 1 }, false, { day: 1, market: true, cook: true, customer: false }), null);
  assert.equal(pahNextQuiz({ phase: "sell", day: 1 }, true, { day: 1, market: true, cook: true, customer: true }), null);
  // Pha khác không hỏi
  assert.equal(pahNextQuiz({ phase: "close", day: 1 }, false, null), null);
  assert.equal(pahNextQuiz({ phase: "sell", day: 1 }, false, null), null);
  // Chống crash với input null/undefined
  assert.equal(pahNextQuiz(null, false, null), null);
  assert.equal(pahNextQuiz(undefined, false, null), null);
  // Thứ tự ưu tiên: market trước cook
  assert.equal(pahNextQuiz({ phase: "morning", day: 1 }, true, { day: 1, market: false, cook: false, customer: false }), "market");
});

test("hiệu ứng Q1: giảm 20% giá chợ trên state thật của game", () => {
  const state = { market: { p: { bo: 140, xuong: 120, giavi: 60 } } };
  let rendered = 0;
  const pah = { UI: { state: () => state, render: () => { rendered += 1; } } };
  assert.equal(pahApplyMarketDiscount(pah), 3);
  assert.deepEqual(state.market.p, { bo: 112, xuong: 96, giavi: 48 });
  assert.equal(rendered, 1);
  // Không có market → không làm gì, không crash
  assert.equal(pahApplyMarketDiscount({ UI: { state: () => ({}), render: () => {} } }), 0);
  assert.equal(pahApplyMarketDiscount(null), 0);
  assert.equal(pahApplyMarketDiscount({}), 0);
});

test("hiệu ứng Q2: tăng chất lượng mẻ nấu (pot.ql)", () => {
  const state = { pots: [{ ql: 1 }, { ql: 0.8 }] };
  let rendered = 0;
  const pah = { UI: { state: () => state, render: () => { rendered += 1; } } };
  assert.equal(pahApplyCookBonus(pah, 0), true);
  assert.ok(state.pots[0].ql > 1 && state.pots[0].ql <= 1.3);
  assert.equal(pahApplyCookBonus(pah, 1), true);
  assert.ok(state.pots[1].ql > 0.8);
  assert.equal(rendered, 2);
  assert.equal(pahApplyCookBonus(pah, 5), false);
  assert.equal(pahApplyCookBonus(null, 0), false);
});

test("hiệu ứng Q3: khách kiên nhẫn hơn (+40%), uy tín +2", () => {
  const customer = { max: 100, t: 10 };
  const state = { rep: 50 };
  let rendered = 0;
  const pah = { UI: { state: () => state, render: () => { rendered += 1; } } };
  assert.equal(pahApplyCustomerBonus(pah, customer), true);
  assert.equal(customer.max, 140);
  assert.equal(state.rep, 52);
  assert.equal(rendered, 1);
  // Uy tín chặn trần 100
  const state2 = { rep: 99 };
  const pah2 = { UI: { state: () => state2, render: () => {} } };
  pahApplyCustomerBonus(pah2, { max: 50 });
  assert.equal(state2.rep, 100);
  assert.equal(pahApplyCustomerBonus(pah, null), false);
  assert.equal(pahApplyCustomerBonus(null, customer), false);
});

test("vòng đời wrapper: mount → start → unmount dọn sạch, báo cáo vocab", () => {
  // Node không có document: mount chạy ở chế độ suy biến (không iframe) nhưng không crash.
  const finishes = [];
  const api = mountPhoAnhHai(null, { cards: CARDS, onFinish: (s) => finishes.push(s) });
  assert.ok(api);
  assert.equal(phoAnhHaiState.mounted, true);
  assert.equal(api.getState().mounted, true);
  assert.equal(startPhoAnhHai(), true);

  const report = cleanupReport();
  assert.equal(report.mounted, true);
  assert.equal(report.phase, "wrapper");

  assert.equal(api.unmount(), true);
  assert.equal(phoAnhHaiState.mounted, false);
  assert.equal(cleanupReport().mounted, false);
  assert.equal(cleanupReport().phase, "idle");
  // Chưa trả lời câu nào → báo cáo 0/0, không crash
  assert.equal(finishes.length, 1);
  assert.equal(finishes[0].correct, 0);
  assert.equal(finishes[0].wrong, 0);

  assert.equal(unmountPhoAnhHai(), false);
  assert.equal(startPhoAnhHai(), false);
});
