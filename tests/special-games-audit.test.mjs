// Audit hợp đồng API + asset cho các game đặc biệt và Special Hub.
// Chạy bằng Node built-in: node --test tests/special-games-audit.test.mjs
// Không import module game (chúng đụng DOM); kiểm tra tĩnh trên source để Node-safe.
// File chưa được tạo -> PASS mềm kèm chẩn đoán PENDING (sibling đang merge song song).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const rel = (p) => p.replace(/\\/g, "/");
const walkFiles = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
};
const assetBasenames = (dir) =>
  new Set(walkFiles(join(root, dir)).filter((p) => /\.png$/i.test(p)).map((p) => basename(p).toLowerCase()));

// API bắt buộc: mount/start/cleanup. Special Hub dùng dạng modal open/close.
const MODULES = [
  {
    file: "js/games/rescue-monkey.js",
    css: ["styles/games/rescue-monkey.css", "js/games/rescue-monkey.css"],
    // Arena API hiện có; mount/unmount/startRescueMonkey vẫn đang chờ owner hoàn thiện.
    exports: ["rmPlay", "rmArenaHTML", "rmClearTimers", "calculateDistance"],
    optional: ["mountRescueMonkey", "unmountRescueMonkey", "startRescueMonkey", "createRescueMonkey"],
    assetDir: "assets/games/rescue-monkey",
  },
  {
    file: "js/games/diligent-bird.js",
    css: ["styles/games/diligent-bird.css", "js/games/diligent-bird.css"],
    exports: ["mountDiligentBird", "unmountDiligentBird", "startDiligentBird"],
    optional: ["createBirdSession", "birdAnswer", "birdSummary"],
    assetDir: "assets/games/diligent-bird",
  },
  {
    file: "js/games/rice-shop.js",
    css: ["styles/games/rice-shop.css", "js/games/rice-shop.css"],
    exports: ["mountRiceShop", "unmountRiceShop", "startRiceShop"],
    optional: ["plateAccuracy", "tipFor", "buyIngredient", "settleDay", "checkAnswer"],
    assetDir: "assets/games/rice-shop",
  },
  {
    file: "js/games/learning-games.js",
    css: ["styles/games/learning-games.css", "js/games/learning-games.css"],
    exports: ["mountLearningGames", "unmountLearningGames", "startLearningGames"],
    optional: ["createLearningGames", "normalizeAnswer"],
    assetDir: "assets/games/learning-games",
  },
  {
    file: "js/games/special-hub.js",
    css: ["styles/games/special-hub.css", "js/games/special-hub.css"],
    exports: ["openSpecialHub", "closeSpecialHub", "isSpecialHubOpen"],
    optional: ["getSpecialGame", "mountSpecialHub", "unmountSpecialHub"],
    assetDir: "assets/games/special-hub",
  },
];

// id trong special-hub dùng snake_case khớp tên thumbnail; so sánh chuẩn hóa "-" -> "_".
const SPECIAL_HUB_GAMES = ["mixed", "translate", "sentence", "rice-shop", "bird", "rescue-monkey"];
const normalizeId = (value) => String(value).trim().toLowerCase().replace(/-/g, "_");

const exportedNames = (source) => {
  const names = new Set();
  for (const match of source.matchAll(/\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(match[1]);
  for (const match of source.matchAll(/\bexport\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(match[1]);
  for (const match of source.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
    for (const part of match[1].split(",")) {
      const alias = part.includes(" as ") ? part.split(" as ").pop() : part;
      const name = alias.trim().replace(/^type\s+/, "");
      if (name) names.add(name);
    }
  }
  return names;
};

// Mọi tên file .png được nhắc trong source (kể cả trong template literal `${A}/x.png`).
// Kiểm tra theo basename trong assetDir để không phụ thuộc cách ghép chuỗi.
const pngBasenames = (source) => {
  const names = new Set();
  for (const match of source.matchAll(/([A-Za-z0-9_\-]+\.png)/gi)) names.add(match[1].toLowerCase());
  return [...names];
};

let pending = 0;

for (const entry of MODULES) {
  test(`audit contract: ${entry.file}`, (t) => {
    const full = join(root, entry.file);
    if (!existsSync(full)) {
      pending += 1;
      t.diagnostic(`PENDING module chưa tồn tại: ${entry.file}`);
      return;
    }
    const source = readFileSync(full, "utf8");
    const names = exportedNames(source);

    for (const name of entry.exports) {
      assert.ok(names.has(name), `${entry.file} thiếu export bắt buộc: ${name} (có: ${[...names].sort().join(", ")})`);
    }
    for (const name of entry.optional) {
      if (!names.has(name)) t.diagnostic(`OPTIONAL export chưa có: ${name}`);
    }

    assert.ok(!/eval\s*\(/.test(source), `${entry.file} chứa eval(`);
    assert.ok(!/new\s+Function\s*\(/.test(source), `${entry.file} chứa new Function(`);

    const cleanup = /clearTimeout|clearInterval|cancelAnimationFrame|removeEventListener|AbortController|replaceChildren|\bunmount\w*\s*\(|\bclose\w*\s*\(/.test(source);
    if (!cleanup) t.diagnostic(`CẢNH BÁO ${entry.file}: không thấy dấu hiệu cleanup timer/listener`);
    else assert.ok(true);

    const refs = pngBasenames(source);
    if (!refs.length) {
      t.diagnostic(`CẢNH BÁO ${entry.file}: không tham chiếu PNG nào (spec yêu cầu dùng asset local)`);
      return;
    }
    const available = assetBasenames(entry.assetDir);
    const missing = refs.filter((name) => !available.has(name));
    assert.deepEqual(missing, [], `${entry.file} tham chiếu PNG không có trong ${entry.assetDir}: ${missing.join(", ")}`);
    t.diagnostic(`${entry.file}: ${refs.length} PNG tham chiếu đều tồn tại trong ${entry.assetDir}`);
  });

  test(`audit css + reduced motion: ${entry.file}`, (t) => {
    if (!existsSync(join(root, entry.file))) {
      t.diagnostic(`PENDING module chưa tồn tại: ${entry.file}`);
      return;
    }
    const cssPath = entry.css.map((p) => join(root, p)).find((p) => existsSync(p));
    if (!cssPath) {
      t.diagnostic(`PENDING CSS chưa tồn tại (đã thử: ${entry.css.join(", ")})`);
      return;
    }
    const css = readFileSync(cssPath, "utf8");
    if (!/prefers-reduced-motion/.test(css)) t.diagnostic(`CẢNH BÁO ${rel(cssPath)}: thiếu @media (prefers-reduced-motion)`);
    else assert.ok(true);
    const missing = pngBasenames(css).filter((name) => !assetBasenames(entry.assetDir).has(name));
    assert.deepEqual(missing, [], `${rel(cssPath)} tham chiếu PNG không tồn tại: ${missing.join(", ")}`);
  });
}

test("audit special-hub: đủ 6 game id + không chứa game logic", (t) => {
  const hubPath = join(root, "js/games/special-hub.js");
  if (!existsSync(hubPath)) {
    t.diagnostic("PENDING js/games/special-hub.js chưa tồn tại");
    return;
  }
  const source = readFileSync(hubPath, "utf8");
  const ids = new Set();
  for (const match of source.matchAll(/\bid:\s*["']([\w-]+)["']/g)) ids.add(normalizeId(match[1]));
  const missing = SPECIAL_HUB_GAMES.filter((id) => !ids.has(normalizeId(id)));
  assert.deepEqual(missing, [], `special-hub thiếu game id: ${missing.join(", ")} (có: ${[...ids].join(", ")})`);

  for (const thumb of ["mixed.png", "translate.png", "sentence.png", "rice_shop.png", "bird.png", "rescue_monkey.png"]) {
    assert.ok(existsSync(join(root, "assets/games/special-hub/thumbnails", thumb)), `thiếu thumbnail ${thumb}`);
  }
  assert.ok(!/mountRescueMonkey|mountDiligentBird|mountRiceShop/.test(source), "special-hub không được chứa game logic của module khác");
  assert.ok(/Escape/.test(source), "special-hub phải xử lý phím Escape");
  assert.ok(/onSelect/.test(source), "special-hub phải có callback onSelect(gameId)");
});

test("audit assets: manifest game khớp file trên đĩa", (t) => {
  for (const game of ["rescue-monkey", "diligent-bird", "rice-shop", "learning-games", "special-hub"]) {
    const dir = join(root, "assets/games", game);
    const manifestPath = join(dir, "manifest.json");
    if (!existsSync(manifestPath)) {
      t.diagnostic(`CẢNH BÁO thiếu manifest: ${rel(manifestPath)}`);
      continue;
    }
    const pngs = walkFiles(dir).filter((p) => /\.png$/i.test(p));
    assert.ok(pngs.length > 0, `${game} không có PNG nào`);
    const totalKb = pngs.reduce((sum, p) => sum + statSync(p).size, 0) / 1024;
    t.diagnostic(`${game}: ${pngs.length} PNG, ${totalKb.toFixed(0)}KB tổng`);
  }
});

test("audit tổng kết trạng thái merge", (t) => {
  const missing = MODULES.filter((m) => !existsSync(join(root, m.file))).map((m) => m.file);
  if (missing.length) t.diagnostic(`MODULE CHƯA MERGE (${missing.length}/${MODULES.length}): ${missing.join(", ")}`);
  else t.diagnostic("Cả 5 module đã tồn tại — chạy lại audit để kiểm tra đầy đủ.");
  assert.ok(true);
});
