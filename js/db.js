import { uid } from "./core.js";

const DB_NAME = "luyen-tu-mvp";
const DB_VERSION = 1;
const STORES = ["decks", "cards", "activities", "profile"];
let connection;

const requestResult = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function openDatabase() {
  if (connection) return connection;
  connection = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("decks")) db.createObjectStore("decks", { keyPath: "id" });
      if (!db.objectStoreNames.contains("cards")) {
        const cards = db.createObjectStore("cards", { keyPath: "id" });
        cards.createIndex("deckId", "deckId", { unique: false });
        cards.createIndex("dueAt", "dueAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("activities")) db.createObjectStore("activities", { keyPath: "id" });
      if (!db.objectStoreNames.contains("profile")) db.createObjectStore("profile", { keyPath: "id" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); if (connection === db) connection = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
  return connection;
}

async function useStore(storeName, mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    try { result = operation(store); } catch (error) { reject(error); return; }
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export const getAll = async (store) => requestResult((await openDatabase()).transaction(store).objectStore(store).getAll());
export const put = (store, value) => useStore(store, "readwrite", (objectStore) => objectStore.put(value));
export const remove = (store, id) => useStore(store, "readwrite", (objectStore) => objectStore.delete(id));

export async function getSnapshot() {
  const [decks, cards, activities, profiles] = await Promise.all(STORES.map((name) => getAll(name)));
  return { decks, cards, activities, profile: profiles.find((item) => item.id === "me") || defaultProfile() };
}

const defaultProfile = () => ({ id: "me", name: "Người học", xp: 0, coins: 30, streak: 0, lastStudyDate: null, dailyGoal: 10, createdAt: new Date().toISOString() });

export async function seedDatabase() {
  const profiles = await getAll("profile");
  if (profiles.some((item) => item.id === "me")) return;
  const now = new Date().toISOString();
  const starterDecks = [
    { id: "deck_english", name: "Tiếng Anh giao tiếp", description: "Từ vựng thiết yếu cho hội thoại hằng ngày", color: "violet", icon: "💬", createdAt: now, updatedAt: now },
    { id: "deck_work", name: "Từ vựng công việc", description: "Giao tiếp trong môi trường chuyên nghiệp", color: "blue", icon: "💼", createdAt: now, updatedAt: now },
  ];
  const words = [
    ["deck_english", "hello", "xin chào", "Hello, nice to meet you!", "/həˈləʊ/"],
    ["deck_english", "grateful", "biết ơn", "I am grateful for your help.", "/ˈɡreɪtfəl/"],
    ["deck_english", "journey", "hành trình", "Learning is a lifelong journey.", "/ˈdʒɜːni/"],
    ["deck_english", "confident", "tự tin", "She feels confident today.", "/ˈkɒnfɪdənt/"],
    ["deck_english", "improve", "cải thiện", "Practice helps you improve.", "/ɪmˈpruːv/"],
    ["deck_english", "habit", "thói quen", "Reading is a useful habit.", "/ˈhæbɪt/"],
    ["deck_work", "deadline", "hạn chót", "The deadline is Friday.", "/ˈdedlaɪn/"],
    ["deck_work", "feedback", "phản hồi", "Thank you for your feedback.", "/ˈfiːdbæk/"],
    ["deck_work", "schedule", "lịch trình", "Let's check the schedule.", "/ˈʃedjuːl/"],
    ["deck_work", "collaborate", "hợp tác", "We collaborate across teams.", "/kəˈlæbəreɪt/"],
    ["deck_work", "proposal", "đề xuất", "The proposal looks promising.", "/prəˈpəʊzəl/"],
    ["deck_work", "efficient", "hiệu quả", "This workflow is efficient.", "/ɪˈfɪʃənt/"],
  ];
  await Promise.all(starterDecks.map((deck) => put("decks", deck)));
  await Promise.all(words.map(([deckId, term, meaning, example, pronunciation], index) => put("cards", {
    id: `card_seed_${index + 1}`, deckId, term, meaning, example, pronunciation,
    level: "new", interval: 0, ease: 2.5, repetitions: 0, dueAt: now, createdAt: now, updatedAt: now,
  })));
  await put("profile", defaultProfile());
}

export async function saveActivity({
  type,
  xp = 0,
  coins = 0,
  detail = "",
  mode = type,
  deckId = null,
  deckName = "",
  total = 0,
  correct = 0,
  wrong = 0,
  accuracy,
  duration = 0,
  startedAt = null,
  sessionXp,
  sessionCoins,
} = {}) {
  const profile = (await getAll("profile")).find((item) => item.id === "me") || defaultProfile();
  const today = new Date().toLocaleDateString("en-CA");
  let streak = profile.streak || 0;
  if (profile.lastStudyDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    streak = profile.lastStudyDate === yesterday.toLocaleDateString("en-CA") ? streak + 1 : 1;
  }
  const gainXp = Number(xp) || 0;
  const gainCoins = Number(coins) || 0;
  const answered = Math.max(0, Number(total) || 0);
  const hits = Math.max(0, Number(correct) || 0);
  const misses = Math.max(0, Number(wrong) || 0);
  const graded = answered || hits + misses;
  const record = {
    id: uid("act"),
    type: type || "study",
    xp: gainXp,
    coins: gainCoins,
    detail,
    createdAt: new Date().toISOString(),
    mode: mode || type || "study",
    deckId,
    deckName: String(deckName || ""),
    total: graded,
    correct: hits,
    wrong: misses,
    accuracy: accuracy == null ? (graded ? Math.round((hits / graded) * 100) : 0) : Math.round(Number(accuracy) || 0),
    duration: Math.max(0, Math.round(Number(duration) || 0)),
    startedAt: startedAt || null,
    sessionXp: Number(sessionXp ?? gainXp) || 0,
    sessionCoins: Number(sessionCoins ?? gainCoins) || 0,
  };
  await put("profile", { ...profile, xp: profile.xp + gainXp, coins: profile.coins + gainCoins, streak, lastStudyDate: today });
  await put("activities", record);
  return record;
}

export async function deleteDeckCascade(deckId) {
  const cards = (await getAll("cards")).filter((card) => card.deckId === deckId);
  await Promise.all(cards.map((card) => remove("cards", card.id)));
  await remove("decks", deckId);
}

export async function replaceAll(data) {
  const db = await openDatabase();
  await Promise.all(STORES.map((storeName) => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).clear();
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  })));
  for (const deck of data.decks || []) await put("decks", deck);
  for (const card of data.cards || []) await put("cards", card);
  for (const activity of data.activities || []) await put("activities", activity);
  await put("profile", data.profile || defaultProfile());
}

export async function resetDatabase() {
  if (connection) connection.close();
  connection = null;
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  await openDatabase();
  await seedDatabase();
}
