import test from "node:test";
import assert from "node:assert/strict";
import {
  PAH_INGREDIENTS, PAH_DISHES, PAH_BASKET,
  ingredientById, dishById, marketPrices, applyDiscount, buyStock,
  canCookBroth, cookBroth, canMakeDish, consumeRecipe, pickDish,
  patienceState, applyPatienceEvent, tickPatience,
  orderPrice, tipFor, reputationAfter, starsFor, settleDay,
  normalizeAnswer, buildVocabChallenge, checkVocabAnswer,
  buildSceneRects, drawPixelScene,
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

test("danh mục: nguyên liệu và món có id duy nhất, công thức hợp lệ", () => {
  const ids = PAH_INGREDIENTS.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(PAH_INGREDIENTS.length >= 6);
  for (const dish of PAH_DISHES) {
    assert.ok(dish.price > 0);
    for (const id of Object.keys(dish.recipe)) assert.ok(ingredientById(id), `${dish.id} dùng nguyên liệu lạ ${id}`);
  }
  assert.equal(dishById("pho_bo").name, "Phở bò");
  assert.equal(pickDish({ banh_pho: 1, ga: 1, rau: 1 })?.id, "pho_ga");
  assert.equal(pickDish({}), null);
  assert.ok(Object.keys(PAH_BASKET).every((id) => ingredientById(id)));
});

test("giá chợ dao động 75%–125% và giảm giá đúng tỉ lệ", () => {
  const base = Object.fromEntries(PAH_INGREDIENTS.map((item) => [item.id, item.cost]));
  assert.deepEqual(marketPrices(1, () => 0.5), base);
  const prices = marketPrices(3, seeded(7));
  for (const item of PAH_INGREDIENTS) {
    const low = Math.max(1, Math.round(item.cost * 0.75));
    const high = Math.ceil(item.cost * 1.25);
    assert.ok(prices[item.id] >= low && prices[item.id] <= high, `${item.id}=${prices[item.id]} ngoài [${low},${high}]`);
  }
  const discounted = applyDiscount({ banh_pho: 10, bo: 20 }, 0.2);
  assert.deepEqual(discounted, { banh_pho: 8, bo: 16 });
  assert.deepEqual(applyDiscount({ banh_pho: 10 }, 0), { banh_pho: 10 });
});

test("mua nguyên liệu: trừ ví, giữ state cũ, chặn thiếu tiền và input sai", () => {
  const inventory = { wallet: 100, stock: {} };
  const bought = buyStock(inventory, "banh_pho", 2, { banh_pho: 8 });
  assert.equal(bought.ok, true);
  assert.equal(bought.cost, 16);
  assert.equal(bought.state.wallet, 84);
  assert.equal(bought.state.stock.banh_pho, 2);
  assert.equal(inventory.wallet, 100);
  assert.equal(inventory.stock.banh_pho, undefined);

  const poor = buyStock(inventory, "bo", 20, { bo: 14 });
  assert.equal(poor.ok, false);
  assert.equal(poor.reason, "funds");
  assert.equal(poor.state, inventory);

  assert.equal(buyStock(inventory, "khong_ton_tai", 1).ok, false);
  assert.equal(buyStock(inventory, "banh_pho", 0).ok, false);
});

test("ninh nước dùng: cần xương + gia vị, đúng 100% sai 55%, không sửa stock gốc", () => {
  assert.equal(canCookBroth({ xuong: 1 }), false);
  assert.equal(cookBroth({}, true).ok, false);
  const stock = { xuong: 2, gia_vi: 1 };
  const good = cookBroth(stock, true);
  assert.equal(good.ok, true);
  assert.equal(good.quality, 1);
  assert.deepEqual(good.stock, { xuong: 1, gia_vi: 0 });
  assert.deepEqual(stock, { xuong: 2, gia_vi: 1 });
  assert.equal(cookBroth({ xuong: 1, gia_vi: 1 }, false).quality, 0.55);
});

test("công thức món: đủ/thiếu nguyên liệu và trừ kho không đột biến state", () => {
  const dish = dishById("pho_bo");
  assert.equal(canMakeDish({ banh_pho: 1, bo: 1, rau: 1 }, dish), true);
  assert.equal(canMakeDish({ banh_pho: 1, bo: 1 }, dish), false);
  const stock = { banh_pho: 2, bo: 1, rau: 2 };
  const consumed = consumeRecipe(stock, dish);
  assert.equal(consumed.ok, true);
  assert.deepEqual(consumed.stock, { banh_pho: 1, bo: 0, rau: 1 });
  assert.deepEqual(stock, { banh_pho: 2, bo: 1, rau: 2 });
  const short = consumeRecipe({ banh_pho: 1 }, dish);
  assert.equal(short.ok, false);
  assert.deepEqual(short.missing.sort(), ["bo", "rau"]);
});

test("kiên nhẫn: cộng/trừ theo sự kiện, hao theo thời gian, ngưỡng trạng thái", () => {
  assert.ok(Math.abs(applyPatienceEvent(0.5, "correct") - 0.64) < 1e-9);
  assert.ok(Math.abs(applyPatienceEvent(0.5, "wrong") - 0.22) < 1e-9);
  assert.equal(applyPatienceEvent(0.95, "correct"), 1);
  assert.equal(applyPatienceEvent(0.1, "wrong"), 0);
  assert.equal(tickPatience(1, 10, { drainPerSec: 0.05 }), 0.5);
  assert.equal(tickPatience(0.1, 100, { drainPerSec: 0.05 }), 0);
  assert.equal(patienceState(0.7), "happy");
  assert.equal(patienceState(0.4), "waiting");
  assert.equal(patienceState(0.1), "angry");
});

test("giá tô phở và tip theo chất lượng nước dùng, uy tín, kiên nhẫn, streak", () => {
  const dish = dishById("pho_bo");
  assert.equal(orderPrice(dish, { brothQuality: 1, reputation: 50 }), 56);
  assert.equal(orderPrice(dish, { brothQuality: 0.55, reputation: 50 }), 51);
  assert.equal(orderPrice(dish, { brothQuality: 1, reputation: 100 }), 61);
  assert.equal(orderPrice(dish, { brothQuality: 0, reputation: 0 }), 41);
  assert.equal(orderPrice(null), 0);

  assert.equal(tipFor({ price: 56, patience: 1, correct: true, streak: 0 }), 15);
  assert.equal(tipFor({ price: 56, patience: 1, correct: true, streak: 3 }), 21);
  assert.equal(tipFor({ price: 56, patience: 0, correct: true, streak: 0 }), 7);
  assert.equal(tipFor({ price: 56, patience: 1, correct: false }), 0);
});

test("uy tín và xếp hạng sao", () => {
  assert.equal(reputationAfter(50, "correct"), 53);
  assert.equal(reputationAfter(50, "wrong"), 45);
  assert.equal(reputationAfter(50, "lost"), 44);
  assert.equal(reputationAfter(98, "correct"), 100);
  assert.equal(reputationAfter(2, "lost"), 0);
  assert.equal(starsFor(0.95), 5);
  assert.equal(starsFor(0.75), 4);
  assert.equal(starsFor(0.5), 3);
  assert.equal(starsFor(0.3), 2);
  assert.equal(starsFor(0.1), 1);
});

test("tổng kết ngày: doanh thu, tip, chi phí, lợi nhuận, XP và sao", () => {
  const records = [
    { price: 56, tip: 15, patience: 1, correct: true, served: true },
    { price: 51, tip: 10, patience: 0.8, correct: true, served: true },
    { price: 45, tip: 0, patience: 0.4, correct: false, served: true },
    { price: 0, tip: 0, patience: 0, correct: false, served: false },
  ];
  const summary = settleDay(records, {
    spent: 60, total: 4, correct: 5, wrong: 1, reputationStart: 50, reputationEnd: 58,
  });
  assert.equal(summary.served, 3);
  assert.equal(summary.lost, 1);
  assert.equal(summary.revenue, 152);
  assert.equal(summary.tips, 25);
  assert.equal(summary.spent, 60);
  assert.equal(summary.profit, 117);
  assert.equal(summary.accuracy, 83);
  assert.equal(summary.stars, 4);
  assert.equal(summary.xp, 65);
  assert.equal(summary.coins, 177);
  assert.equal(summary.reputationStart, 50);
  assert.equal(summary.reputationEnd, 58);
  assert.ok(Math.abs(summary.satisfaction - 0.7633) < 0.001);

  const empty = settleDay([], { total: 4, spent: 20 });
  assert.equal(empty.served, 0);
  assert.equal(empty.lost, 4);
  assert.equal(empty.stars, 0);
  assert.equal(empty.xp, 0);
  assert.equal(empty.profit, -20);
});

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
});

test("scene pixel thuần: rect hợp lệ, ổn định và có khách khi phục vụ", () => {
  const first = buildSceneRects({ phase: "serve", mood: "happy" });
  const second = buildSceneRects({ phase: "serve", mood: "happy" });
  assert.deepEqual(first, second);
  assert.ok(first.length > 40);
  for (const rect of first) {
    assert.ok(Number.isInteger(rect.x) && Number.isInteger(rect.y));
    assert.ok(rect.w > 0 && rect.h > 0);
    assert.equal(typeof rect.color, "string");
  }
  assert.ok(first.some((rect) => rect.x >= 140), "phải vẽ khách bên phải");
  assert.notDeepEqual(buildSceneRects({ phase: "market" }), first);
  const calls = [];
  const ctx = {
    fillStyle: "",
    fillRect: (...args) => calls.push(args),
    clearRect: () => {},
    imageSmoothingEnabled: true,
  };
  drawPixelScene(ctx, { phase: "market" });
  assert.equal(calls.length, buildSceneRects({ phase: "market" }).length);
});

class FakeClassList {
  constructor() { this.items = new Set(); }
  add(...names) { names.forEach((name) => this.items.add(name)); }
  remove(...names) { names.forEach((name) => this.items.delete(name)); }
  contains(name) { return this.items.has(name); }
}

class FakeContainer extends EventTarget {
  constructor() {
    super();
    this.innerHTML = "";
    this.classList = new FakeClassList();
    this.action = null;
    this.actionValue = null;
  }
  querySelector() { return null; }
  closest(selector) {
    if (selector === "[data-pah]" && this.action) {
      return { dataset: { pah: this.action, value: this.actionValue } };
    }
    return null;
  }
}

test("vòng đời: mount → start → unmount gỡ listener, timer, rAF và DOM", () => {
  const container = new FakeContainer();
  const api = mountPhoAnhHai(container, { cards: CARDS });
  assert.ok(api);
  assert.equal(phoAnhHaiState.mounted, true);
  assert.equal(container.classList.contains("pah-root"), true);
  assert.ok(container.innerHTML.includes("Phở Anh Hai"));
  assert.deepEqual(
    { mounted: cleanupReport().mounted, timers: cleanupReport().timers, rafs: cleanupReport().rafs, listeners: cleanupReport().listeners, audio: cleanupReport().audio },
    { mounted: true, timers: 0, rafs: 0, listeners: 1, audio: false },
  );

  assert.equal(startPhoAnhHai(), true);
  assert.equal(api.getState().phase, "intro");

  container.action = "start-day";
  container.dispatchEvent(new Event("click"));
  assert.equal(api.getState().phase, "market");
  assert.equal(cleanupReport().timers, 0);

  assert.equal(api.unmount(), true);
  assert.equal(phoAnhHaiState.mounted, false);
  assert.equal(phoAnhHaiState.phase, "idle");
  assert.equal(container.classList.contains("pah-root"), false);
  assert.equal(container.innerHTML, "");
  const report = cleanupReport();
  assert.deepEqual(report, {
    mounted: false, phase: "idle", timers: 0, rafs: 0, listeners: 0, audio: false, domEmpty: true,
  });

  container.action = "start-day";
  container.dispatchEvent(new Event("click"));
  assert.equal(container.innerHTML, "");
  assert.equal(unmountPhoAnhHai(), false);
});

test("một ngày đầy đủ: chợ → ninh → 4 khách → tất toán → onFinish", async () => {
  const originalMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  const container = new FakeContainer();
  const finishes = [];
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const click = (action, value = null) => {
    container.action = action;
    container.actionValue = value;
    container.dispatchEvent(new Event("click"));
  };
  try {
    const api = mountPhoAnhHai(container, { cards: CARDS, onFinish: (summary) => finishes.push(summary) });
    api.start();
    click("start-day");
    assert.equal(api.getState().phase, "market");

    click("basket");
    assert.ok(api.getState().stock.xuong >= 1, "combo phải mua được xương hầm");
    click("market-answer", "chắc chắn sai");
    click("to-cook");
    assert.equal(api.getState().phase, "cook");

    click("cook-answer", "chắc chắn sai");
    click("simmer");
    await delay(500);
    assert.equal(api.getState().phase, "serve");

    for (let i = 0; i < 4; i += 1) {
      click("customer-answer", "chắc chắn sai");
      click("serve");
      await delay(420);
    }
    await delay(450);
    assert.equal(api.getState().phase, "report");
    assert.equal(finishes.length, 1);
    assert.equal(finishes[0].served, 4);
    assert.equal(finishes[0].lost, 0);
    assert.equal(finishes[0].wrong, 6);
    assert.equal(api.unmount(), true);
  } finally {
    if (originalMatchMedia === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = originalMatchMedia;
  }
});
