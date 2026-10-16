import test from "node:test";
import assert from "node:assert/strict";
import * as games from "../js/games/index.js";

test("special game aggregate exports required integration API", () => {
  const required = [
    "openSpecialHub", "closeSpecialHub",
    "rmArenaHTML", "rmPlay", "rmClearTimers",
    "mountDiligentBird", "startDiligentBird", "unmountDiligentBird",
    "mountLearningGames", "startLearningGames", "unmountLearningGames",
    "mountRiceShop", "startRiceShop", "unmountRiceShop",
  ];
  for (const key of required) {
    assert.equal(typeof games[key], "function", key + " must be exported as a function");
  }
});

test("special game aggregate exposes game definitions", () => {
  assert.ok(Array.isArray(games.SPECIAL_GAMES));
  assert.ok(games.SPECIAL_GAMES.length >= 6);
  assert.ok(games.RM_CONFIG);
  assert.ok(Array.isArray(games.INGREDIENTS));
});
