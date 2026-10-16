// Rescue Monkey — quiz + typing arena (module tự chứa, mount/unmount/start)
const RM_BASE = "assets/games/rescue-monkey/";

export const RM_CONFIG = {
  start: 15,
  min: 2,
  max: 40,
  hit: 5,
  penalty: 4,
  milo: {
    idle: "sprites/milo/idle.png",
    ready: "sprites/milo/ready.png",
    run: "sprites/milo/run.png",
    windup: "sprites/milo/bomb_windup.png",
    throw: "sprites/milo/throw.png",
    bomb: "sprites/milo/bomb_flying.png",
    hit: "sprites/milo/hit.png",
    win: "sprites/milo/victory.png",
  },
  yeti: {
    idle: "sprites/yeti/idle.png",
    walk1: "sprites/yeti/walk_1.png",
    walk2: "sprites/yeti/walk_2.png",
    windup: "sprites/yeti/attack_windup.png",
    throw: "sprites/yeti/throw_rock.png",
    hit: "sprites/yeti/hit.png",
    knockback: "sprites/yeti/knockback.png",
    defeated: "sprites/yeti/defeated.png",
  },
  fx: {
    rock: "fx/rock_1.png",
    boom1: "fx/explosion_fire_1.png",
    boom2: "fx/explosion_fire_2.png",
  },
};

export const rmSrc = (rel) => RM_BASE + rel;

export const rmClamp = (value, { min = RM_CONFIG.min, max = RM_CONFIG.max } = {}) =>
  Math.min(max, Math.max(min, Math.round(value)));

/** Pure logic: đúng +5m, sai -4m, clamp 2..40. */
export function calculateDistance(current, correct, config = RM_CONFIG) {
  const next = Number(current) + (correct ? config.hit : -config.penalty);
  return rmClamp(next, config);
}

/** Mapping state -> sprite path, fallback idle khi state lạ. */
export function rmMiloSprite(state, config = RM_CONFIG) {
  return rmSrc(config.milo[state] || config.milo.idle);
}

export function rmYetiSprite(state, config = RM_CONFIG) {
  return rmSrc(config.yeti[state] || config.yeti.idle);
}

export function rmArenaHTML(distance, config = RM_CONFIG) {
  const safe = rmClamp(distance, config);
  const pct = Math.round((safe / config.max) * 100);
  return `<section class="rm-arena" id="rm-arena" aria-label="Đấu trường Rescue Monkey">`
    + `<div class="rm-hud"><span class="rm-hud-chip">Khoảng cách Milo → Yeti</span>`
    + `<div class="rm-distance-bar" id="rm-distance-bar" role="progressbar" aria-label="Khoảng cách Milo tới Yeti" aria-valuemin="${config.min}" aria-valuemax="${config.max}" aria-valuenow="${safe}"><span id="rm-distance-fill" style="width:${pct}%"></span></div>`
    + `<strong class="rm-distance" id="rm-distance">${safe}m</strong></div>`
    + `<div class="rm-ground" aria-hidden="true"></div>`
    + `<div class="rm-milo" aria-hidden="true"><img id="rm-milo-img" src="${rmSrc(config.milo.idle)}" alt=""></div>`
    + `<div class="rm-bomb rm-fx" aria-hidden="true"><img src="${rmSrc(config.milo.bomb)}" alt=""></div>`
    + `<div class="rm-rock rm-fx" aria-hidden="true"><img src="${rmSrc(config.fx.rock)}" alt=""></div>`
    + `<div class="rm-explosion rm-fx" aria-hidden="true"><img src="${rmSrc(config.fx.boom1)}" alt=""></div>`
    + `<div class="rm-yeti" aria-hidden="true"><img id="rm-yeti-img" src="${rmSrc(config.yeti.idle)}" alt=""></div>`
    + `</section>`;
}

let timers = [];
const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };
export function rmClearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

const prefersReduced = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const el = (root, sel) => root.querySelector(sel);
const setImg = (root, sel, rel) => {
  const img = el(root, sel);
  if (img && rel) img.setAttribute("src", rmSrc(rel));
};

function syncHud(root, distance) {
  const safe = rmClamp(distance);
  const label = el(root, "#rm-distance");
  const fill = el(root, "#rm-distance-fill");
  const bar = el(root, "#rm-distance-bar");
  if (label) label.textContent = `${safe}m`;
  if (fill) fill.style.width = `${Math.round((safe / RM_CONFIG.max) * 100)}%`;
  if (bar) bar.setAttribute("aria-valuenow", String(safe));
}

/**
 * Chạy sequence đúng/sai trên arena đã mount.
 * callbacks: { onMilo(src), onYeti(src), onHud(distance), onDone(distance) }
 * Trả về distance mới. reduced-motion rút gọn còn đổi HUD + callback.
 */
export function rmPlay(root, correct, callbacks = {}) {
  const arena = root.querySelector ? root.querySelector("#rm-arena") : null;
  const distance = rmClamp(callbacks.distance ?? RM_CONFIG.start);
  const fire = (name, arg) => { if (typeof callbacks[name] === "function") callbacks[name](arg); };
  if (!arena) {
    const next = calculateDistance(distance, correct);
    fire("onHud", next);
    fire("onDone", next);
    return next;
  }
  const next = calculateDistance(distance, correct);
  if (prefersReduced()) {
    fire("onHud", next);
    fire("onDone", next);
    return next;
  }
  fire("onLock", true);
  if (correct) {
    setImg(root, "#rm-milo-img", RM_CONFIG.milo.windup);
    fire("onMilo", rmMiloSprite("windup"));
    later(() => { setImg(root, "#rm-milo-img", RM_CONFIG.milo.throw); fire("onMilo", rmMiloSprite("throw")); arena.classList.add("anim-correct"); }, 320);
    later(() => { setImg(root, ".rm-explosion img", RM_CONFIG.fx.boom2); arena.querySelector(".rm-explosion")?.classList.add("is-on"); }, 880);
    later(() => { setImg(root, "#rm-yeti-img", RM_CONFIG.yeti.hit); fire("onYeti", rmYetiSprite("hit")); }, 940);
    later(() => { fire("onHud", next); setImg(root, "#rm-yeti-img", RM_CONFIG.yeti.knockback); fire("onYeti", rmYetiSprite("knockback")); syncHud(root, next); }, 1060);
    later(() => { arena.classList.remove("anim-correct"); arena.querySelectorAll(".rm-fx").forEach((fx) => fx.classList.remove("is-on")); setImg(root, "#rm-yeti-img", RM_CONFIG.yeti.idle); fire("onYeti", rmYetiSprite("idle")); setImg(root, "#rm-milo-img", RM_CONFIG.milo.ready); fire("onMilo", rmMiloSprite("ready")); fire("onLock", false); fire("onDone", next); }, 1520);
  } else {
    setImg(root, "#rm-yeti-img", RM_CONFIG.yeti.windup);
    fire("onYeti", rmYetiSprite("windup"));
    later(() => { setImg(root, "#rm-yeti-img", RM_CONFIG.yeti.throw); fire("onYeti", rmYetiSprite("throw")); arena.classList.add("anim-wrong"); }, 320);
    later(() => { setImg(root, "#rm-milo-img", RM_CONFIG.milo.hit); fire("onMilo", rmMiloSprite("hit")); setImg(root, "#rm-yeti-img", RM_CONFIG.yeti.walk1); fire("onYeti", rmYetiSprite("walk1")); }, 880);
    later(() => { fire("onHud", next); setImg(root, "#rm-yeti-img", RM_CONFIG.yeti.walk2); fire("onYeti", rmYetiSprite("walk2")); syncHud(root, next); }, 1020);
    later(() => { arena.classList.remove("anim-wrong"); arena.querySelectorAll(".rm-fx").forEach((fx) => fx.classList.remove("is-on")); setImg(root, "#rm-milo-img", RM_CONFIG.milo.idle); fire("onMilo", rmMiloSprite("idle")); setImg(root, "#rm-yeti-img", RM_CONFIG.yeti.idle); fire("onYeti", rmYetiSprite("idle")); fire("onLock", false); fire("onDone", next); }, 1460);
  }
  return next;
}
