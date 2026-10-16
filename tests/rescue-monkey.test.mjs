import test from "node:test";
import assert from "node:assert/strict";
import { RM_CONFIG, calculateDistance, rmArenaHTML, rmMiloSprite, rmYetiSprite, rmSrc } from "../js/games/rescue-monkey.js";

test("Rescue Monkey: đúng +5m", () => {
  assert.equal(calculateDistance(15, true), 20);
  assert.equal(calculateDistance(2, true), 7);
});

test("Rescue Monkey: sai -4m", () => {
  assert.equal(calculateDistance(15, false), 11);
  assert.equal(calculateDistance(20, false), 16);
});

test("Rescue Monkey: clamp khoảng cách trong 2..40m", () => {
  assert.equal(calculateDistance(1, false), 2);
  assert.equal(calculateDistance(0, false), 2);
  assert.equal(calculateDistance(38, true), 40);
  assert.equal(calculateDistance(100, true), 40);
  assert.equal(RM_CONFIG.min, 2);
  assert.equal(RM_CONFIG.max, 40);
  assert.equal(RM_CONFIG.start, 15);
});

test("Rescue Monkey: map state -> sprite path đúng spec", () => {
  assert.equal(rmMiloSprite("idle"), "assets/games/rescue-monkey/sprites/milo/idle.png");
  assert.equal(rmMiloSprite("ready"), "assets/games/rescue-monkey/sprites/milo/ready.png");
  assert.equal(rmMiloSprite("run"), "assets/games/rescue-monkey/sprites/milo/run.png");
  assert.equal(rmMiloSprite("windup"), "assets/games/rescue-monkey/sprites/milo/bomb_windup.png");
  assert.equal(rmMiloSprite("throw"), "assets/games/rescue-monkey/sprites/milo/throw.png");
  assert.equal(rmMiloSprite("hit"), "assets/games/rescue-monkey/sprites/milo/hit.png");
  assert.equal(rmMiloSprite("win"), "assets/games/rescue-monkey/sprites/milo/victory.png");
  assert.equal(rmYetiSprite("idle"), "assets/games/rescue-monkey/sprites/yeti/idle.png");
  assert.equal(rmYetiSprite("walk1"), "assets/games/rescue-monkey/sprites/yeti/walk_1.png");
  assert.equal(rmYetiSprite("walk2"), "assets/games/rescue-monkey/sprites/yeti/walk_2.png");
  assert.equal(rmYetiSprite("windup"), "assets/games/rescue-monkey/sprites/yeti/attack_windup.png");
  assert.equal(rmYetiSprite("throw"), "assets/games/rescue-monkey/sprites/yeti/throw_rock.png");
  assert.equal(rmYetiSprite("hit"), "assets/games/rescue-monkey/sprites/yeti/hit.png");
  assert.equal(rmYetiSprite("knockback"), "assets/games/rescue-monkey/sprites/yeti/knockback.png");
  assert.equal(rmYetiSprite("defeated"), "assets/games/rescue-monkey/sprites/yeti/defeated.png");
});

test("Rescue Monkey: state lạ fallback về idle", () => {
  assert.equal(rmMiloSprite("khong-ton-tai"), rmSrc(RM_CONFIG.milo.idle));
  assert.equal(rmYetiSprite(undefined), rmSrc(RM_CONFIG.yeti.idle));
});

test("Rescue Monkey: fx và bomb sprite đúng thư mục", () => {
  assert.equal(rmSrc(RM_CONFIG.fx.rock), "assets/games/rescue-monkey/fx/rock_1.png");
  assert.equal(rmSrc(RM_CONFIG.fx.boom1), "assets/games/rescue-monkey/fx/explosion_fire_1.png");
  assert.equal(rmSrc(RM_CONFIG.fx.boom2), "assets/games/rescue-monkey/fx/explosion_fire_2.png");
  assert.equal(rmSrc(RM_CONFIG.milo.bomb), "assets/games/rescue-monkey/sprites/milo/bomb_flying.png");
});

test("Rescue Monkey: rmArenaHTML chứa HUD, sprite và clamp khoảng cách", () => {
  const html = rmArenaHTML(15);
  assert.match(html, /class="rm-arena"/);
  assert.match(html, /class="rm-ground"/);
  assert.match(html, /id="rm-distance"[^>]*>15m</);
  assert.match(html, /aria-valuenow="15"/);
  assert.match(html, /id="rm-milo-img" src="assets\/games\/rescue-monkey\/sprites\/milo\/idle\.png"/);
  assert.match(html, /id="rm-yeti-img" src="assets\/games\/rescue-monkey\/sprites\/yeti\/idle\.png"/);
  assert.match(html, /id="rm-distance-fill" style="width:38%"/);
  const clamped = rmArenaHTML(999);
  assert.match(clamped, /aria-valuenow="40"/);
  assert.match(clamped, /id="rm-distance"[^>]*>40m</);
});
