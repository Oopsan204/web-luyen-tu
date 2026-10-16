import test from "node:test";
import assert from "node:assert/strict";
import {
  DISHES, INGREDIENTS, applyPatience, tickPatience, patienceState, plateAccuracy,
  orderPrice, tipFor, buyIngredient, consumeStock, inventoryValue, starsFor, settleDay,
  normalizeAnswer, buildChallenge, checkAnswer, dishById,
} from "../js/games/rice-shop.js";

const reseed = (() => {
  let seed = 42;
  return () => { seed = 42; return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; };
})();

test("công thức đĩa cơm: khớp hoàn hảo, thiếu và thừa đều sai", () => {
  const dish = dishById("com_ga");
  assert.deepEqual(plateAccuracy(dish.recipe, [...dish.recipe]), { accuracy: 1, matched: 4, missing: [], extra: [], perfect: true });

  const missing = plateAccuracy(dish.recipe, ["com", "ga"]);
  assert.equal(missing.perfect, false);
  assert.deepEqual(missing.missing, ["cucumber", "nuoc_mam"]);
  assert.equal(missing.accuracy, 0.5);

  const extra = plateAccuracy(dish.recipe, [...dish.recipe, "drink"]);
  assert.deepEqual(extra.extra, ["drink"]);
  assert.equal(extra.accuracy, 0.75);
  assert.equal(extra.perfect, false);

  assert.equal(plateAccuracy(dish.recipe, []).accuracy, 0);
  assert.deepEqual(plateAccuracy(DISHES[1].recipe, DISHES[1].recipe).missing, []);
});

test("tính tiền: giá món, nước uống và tip theo kiên nhẫn + độ chính xác", () => {
  const dish = dishById("com_suon");
  assert.equal(orderPrice(dish), 52);
  assert.equal(orderPrice(dish, true), 64);

  const perfect = tipFor({ price: 52, accuracy: 1, patience: 1, streak: 0 });
  assert.equal(perfect, Math.round(52 * 0.15));
  assert.ok(tipFor({ price: 52, accuracy: 0.5, patience: 1 }) < perfect);
  assert.ok(tipFor({ price: 52, accuracy: 1, patience: 0.2 }) < perfect);
  assert.equal(tipFor({ price: 52, accuracy: 1, patience: 1, streak: 3 }), perfect + 5);
  assert.equal(tipFor({ price: 100, accuracy: 5, patience: 9 }), 15);
});

test("trừ kiên nhẫn khi sai, khi hết giờ và khi khách chờ lâu", () => {
  assert.equal(applyPatience(1, "wrong"), 0.7);
  assert.equal(applyPatience(0.2, "wrong"), 0);
  assert.equal(applyPatience(0.6, "timeout"), 0);
  assert.equal(applyPatience(0.6, "correct"), 0.72);
  assert.equal(applyPatience(0.98, "correct"), 1);
  assert.equal(applyPatience(0.5, "served"), 0.55);
  assert.equal(tickPatience(1, 4), Math.round((1 - 0.4) * 100) / 100);
  assert.equal(tickPatience(0.1, 99), 0);
  assert.equal(patienceState(0.9), "calm");
  assert.equal(patienceState(0.3), "uneasy");
  assert.equal(patienceState(0.1), "angry");
});

test("mua nguyên liệu: trừ budget, chặn khi hết tiền, không sửa state cũ", () => {
  const start = { budget: 10, stock: {} };
  const bought = buyIngredient(start, "ga", 1);
  assert.equal(bought.ok, true);
  assert.equal(bought.cost, 6);
  assert.deepEqual(bought.state, { budget: 4, stock: { ga: 1 } });
  assert.deepEqual(start, { budget: 10, stock: {} });

  const broke = buyIngredient({ budget: 4, stock: {} }, "ga");
  assert.equal(broke.ok, false);
  assert.equal(broke.reason, "budget");
  assert.equal(buyIngredient(start, "khong_co").ok, false);
  assert.equal(buyIngredient(start, "ga", 0).ok, false);

  const bulk = buyIngredient({ budget: 20, stock: { ga: 1 } }, "com", 3);
  assert.deepEqual(bulk.state.stock, { ga: 1, com: 3 });
  assert.equal(bulk.state.budget, 14);
});

test("tồn kho: trừ nguyên liệu khi xếp đĩa, báo thiếu, tính giá trị kho", () => {
  const state = { budget: 5, stock: { com: 2, cucumber: 1 } };
  const ok = consumeStock(state, ["com", "cucumber"]);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.state.stock, { com: 1, cucumber: 0 });
  assert.deepEqual(state.stock, { com: 2, cucumber: 1 });

  const short = consumeStock(state, ["com", "ga"]);
  assert.equal(short.ok, false);
  assert.deepEqual(short.short, ["ga"]);
  assert.equal(short.state.stock.com, 1);

  assert.equal(inventoryValue({ stock: { com: 2, ga: 1 } }), 2 * 2 + 6);
  assert.equal(inventoryValue({ stock: {} }), 0);
  const costs = INGREDIENTS.reduce((sum, item) => sum + item.cost, 0);
  assert.ok(costs > 0);
});

test("đánh giá sao theo độ hài lòng trung bình", () => {
  assert.equal(starsFor(1), 5);
  assert.equal(starsFor(0.9), 5);
  assert.equal(starsFor(0.8), 4);
  assert.equal(starsFor(0.6), 3);
  assert.equal(starsFor(0.31), 2);
  assert.equal(starsFor(0.1), 1);
  assert.equal(starsFor(-1), 1);
});

test("tổng kết ngày: doanh thu, tip, lợi nhuận và sao", () => {
  const records = [
    { price: 45, accuracy: 1, patience: 1, tip: 7, served: true },
    { price: 52, accuracy: 0.75, patience: 0.6, tip: 4, served: true },
    { price: 0, accuracy: 0, patience: 0, tip: 0, served: false },
  ];
  const summary = settleDay(records, { spent: 30 });
  assert.equal(summary.served, 2);
  assert.equal(summary.lost, 1);
  assert.equal(summary.revenue, 97);
  assert.equal(summary.tips, 11);
  assert.equal(summary.spent, 30);
  assert.equal(summary.profit, 78);
  assert.equal(summary.coins, 108);
  assert.equal(summary.satisfaction, (1 + 0.75 * 0.6) / 2);
  assert.equal(summary.stars, 3);

  const empty = settleDay([], { spent: 12 });
  assert.equal(empty.stars, 0);
  assert.equal(empty.profit, -12);
});

test("câu hỏi từ thẻ thật: 4 lựa chọn, đáp án đúng và chấm điểm chuẩn hoá", () => {
  const cards = [
    { id: "c1", term: "rice", meaning: "cơm" },
    { id: "c2", term: "chicken", meaning: "thịt gà" },
    { id: "c3", term: "egg", meaning: "trứng" },
    { id: "c4", term: "cucumber", meaning: "dưa leo" },
  ];
  const challenge = buildChallenge(cards, reseed());
  assert.ok(challenge);
  assert.equal(challenge.options.length, 4);
  assert.ok(challenge.options.includes(challenge.term));
  assert.ok(cards.some((card) => card.id === challenge.cardId && card.term === challenge.term && card.meaning === challenge.meaning));

  assert.equal(checkAnswer(challenge, `  ${challenge.term.toUpperCase()} `), true);
  assert.equal(checkAnswer(challenge, "sai-tu"), false);
  assert.equal(checkAnswer(null, "rice"), false);
  assert.equal(normalizeAnswer("  RICE   Chicken "), "rice chicken");
  assert.equal(buildChallenge([{ id: "c1", term: "rice", meaning: "cơm" }]), null);
});
