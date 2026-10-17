import { spawn, spawnSync } from "node:child_process";

const ORCA = process.env.ORCA_BIN || "orca";
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:4173";
const GAMES = ["rice_shop","bird","translate","sentence","rescue_monkey","mixed"];
let server = null, profile = null, page = null, passed = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (m, d = "") => { throw new Error(m + (d ? "\n" + d : "")); };
const ok = (c, m, d = "") => { if (!c) die(m, d); };
const pass = (m) => { passed += 1; console.log("✓ " + m); };

function orca(args, allowFailure = false) {
  const p = spawnSync(ORCA, args, { cwd: process.cwd(), encoding: "utf8", windowsHide: true, timeout: 20000 });
  if (p.error || p.status !== 0) {
    if (allowFailure) return null;
    die("Orca CLI failed: " + args.join(" "), [p.error?.message, p.stdout, p.stderr].filter(Boolean).join("\n"));
  }
  const raw = String(p.stdout || "").trim();
  if (!raw) return {};
  const data = JSON.parse(raw);
  if (data.ok === false && !allowFailure) die(data.error?.message || "Orca error", raw);
  return data;
}
const result = (args) => orca(args.concat("--json"))?.result;
const evaluate = (js) => result(["eval","--page",page,"--expression",js])?.result;
const evalJson = (js) => {
  const v = evaluate(js);
  if (typeof v === "object" && v) return v;
  return JSON.parse(String(v));
};

async function ready() {
  try {
    const r = await fetch(BASE, { signal: AbortSignal.timeout(900) });
    return r.ok;
  } catch { return false; }
}
async function ensureServer() {
  if (await ready()) return;
  server = spawn(process.execPath, ["server.mjs"], { cwd: process.cwd(), stdio: "ignore", windowsHide: true });
  for (let i=0;i<40;i+=1) {
    if (await ready()) return;
    if (server.exitCode != null) die("server.mjs stopped before ready");
    await sleep(100);
  }
  die("Server not ready at " + BASE);
}
async function waitFor(js, label, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const v = evaluate(js);
      if (v === true || String(v) === "true") return;
    } catch {}
    await sleep(100);
  }
  die("Timeout: " + label);
}
async function go(url) {
  result(["goto","--page",page,"--url",url]);
  await sleep(80);
}
async function game(id) {
  await go(BASE + "/#study?special=" + id);
  await waitFor('document.querySelector("#immersive-game-layer")?.dataset.game === "' + id + '"', "fullscreen " + id);
  const s = evalJson('(()=>{const l=document.querySelector("#immersive-game-layer"),e=document.querySelector(".immersive-game-exit")?.getBoundingClientRect();return JSON.stringify({app:getComputedStyle(document.querySelector("#app-shell")).display,inert:document.querySelector("#app-shell").inert,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,exit:!!e&&e.right<=innerWidth&&e.bottom<=innerHeight,w:l?.getBoundingClientRect().width,h:l?.getBoundingClientRect().height,vw:innerWidth,vh:innerHeight})})()');
  ok(s.app === "none" && s.inert === true, id + ": site shell is not hidden/inert", JSON.stringify(s));
  ok(!s.overflow && s.exit, id + ": overflow or hidden exit", JSON.stringify(s));
  return s;
}
async function exitGame(id) {
  evaluate('(()=>{document.querySelector(".immersive-game-exit")?.click();return true})()');
  await waitFor('!document.querySelector("#immersive-game-layer")', "exit " + id);
  await waitFor('!!document.querySelector(".shb-overlay")', "hub " + id);
  const s = evalJson('JSON.stringify({cards:document.querySelectorAll(".shb-card").length,app:getComputedStyle(document.querySelector("#app-shell")).display,inert:document.querySelector("#app-shell").inert})');
  ok(s.cards === 6 && s.app !== "none" && s.inert === false, id + ": exit did not restore hub", JSON.stringify(s));
}

async function rice() {
  await game("rice_shop");
  await waitFor('!!document.querySelector(".rs-tutorial-scene")', "Rice tutorial");
  evaluate('(()=>{for(let i=0;i<3;i++)document.querySelector("[data-rs=tutorial-next]")?.click();document.querySelector("[data-rs=starter-stock]")?.click();document.querySelector("[data-rs=open-day]")?.click();return true})()');
  await waitFor('!!document.querySelector(".rs-game-scene")', "Rice gameplay");
  evaluate('(()=>{document.querySelector("[data-rs=answer]")?.click();return true})()');
  await waitFor('!!document.querySelector(".rs-order-status")', "Rice answer");
  const p = evalJson('(()=>{for(const id of ["com","ga","cucumber","nuoc_mam"])document.querySelector("[data-rs=pick][data-id="+id+"]")?.click();const s=document.querySelector("[data-rs=serve]");return JSON.stringify({picked:document.querySelectorAll(".rs-picked li").length,disabled:s?.disabled})})()');
  ok(p.picked === 4 && p.disabled === false, "Rice plate cannot be served", JSON.stringify(p));
  evaluate('(()=>{document.querySelector("[data-rs=serve]")?.click();return true})()');
  await sleep(1300);
  const a = evalJson('JSON.stringify({report:!!document.querySelector(".rs-report"),customer:document.querySelector(".rs-hud-progress span")?.textContent||""})');
  ok(a.report || /2\/5/.test(a.customer), "Rice did not advance customer", JSON.stringify(a));
  pass("Rice: tutorial → prep → answer → plate → serve");
  await exitGame("rice_shop");
}
async function bird() {
  await game("bird");
  await waitFor('document.querySelectorAll(".dbird-gate").length === 4', "Bird gates");
  const b = evalJson('JSON.stringify({prompt:document.querySelector(".dbird-prompt")?.textContent,gates:document.querySelectorAll(".dbird-gate").length,score:document.querySelector(".dbird-score")?.textContent,lives:document.querySelector(".dbird-lives")?.getAttribute("aria-label")})');
  ok(b.gates === 4, "Bird gates != 4", JSON.stringify(b));
  evaluate('(()=>{document.querySelectorAll(".dbird-gate")[0]?.click();return true})()');
  await sleep(100);
  const a = evalJson('JSON.stringify({prompt:document.querySelector(".dbird-prompt")?.textContent,score:document.querySelector(".dbird-score")?.textContent,lives:document.querySelector(".dbird-lives")?.getAttribute("aria-label"),finish:!!document.querySelector(".dbird-finish")})');
  ok(a.finish || a.prompt !== b.prompt || a.score !== b.score || a.lives !== b.lives, "Bird state did not advance", JSON.stringify({b,a}));
  pass("Bird: 4 gates + answer advances state");
  await exitGame("bird");
}
async function translate() {
  await game("translate");
  await waitFor('!!document.querySelector("[data-lg-form] input")', "Translate input");
  evaluate('(()=>{const f=document.querySelector("[data-lg-form]"),i=f?.querySelector("input");if(i)i.value="__wrong__";f?.requestSubmit();return true})()');
  const s = evalJson('JSON.stringify({i:document.querySelector("[data-lg-form] input")?.disabled,b:document.querySelector("[data-lg-form] button")?.disabled,skip:document.querySelector("[data-lg=skip]")?.disabled,badge:document.querySelector(".lg-badge.is-on")?.getAttribute("src")||"",feedback:document.querySelector("[data-lg-feedback]")?.textContent?.trim()||""})');
  ok(s.i && s.b && s.skip && s.badge.includes("wrong_badge") && s.feedback, "Translate lock/feedback failed", JSON.stringify(s));
  pass("Translate: wrong answer locks controls + feedback");
  await exitGame("translate");
}
async function sentence() {
  await game("sentence");
  await waitFor('document.querySelectorAll("[data-lg=pick]").length > 0', "Sentence tiles");
  evaluate('(()=>{document.querySelector("[data-lg=hint]")?.click();document.querySelector("[data-lg=pick]")?.click();return true})()');
  ok(Number(evaluate('document.querySelectorAll("[data-lg-answer] .lg-tile").length')) === 1, "Sentence pick failed");
  evaluate('(()=>{document.querySelector("[data-lg=undo]")?.click();return true})()');
  const n = Number(evaluate('document.querySelectorAll("[data-lg-answer] .lg-tile").length'));
  const h = String(evaluate('document.querySelector("[data-lg-hint]")?.textContent||""'));
  ok(n === 0 && h.length > 0, "Sentence undo/hint failed", JSON.stringify({n,h}));
  pass("Sentence: hint + pick + undo");
  await exitGame("sentence");
}
async function rescue() {
  await game("rescue_monkey");
  await waitFor('document.querySelectorAll(".immersive-mode-option").length === 2', "Rescue mode picker");
  evaluate('(()=>{document.querySelector(".immersive-mode-option[data-mode=quiz]")?.click();return true})()');
  await waitFor('!!document.querySelector(".rm-arena")', "Rescue arena");
  await waitFor('document.querySelectorAll(".option").length >= 2', "Rescue quiz options");
  const before = String(evaluate('document.querySelector(".rm-distance")?.textContent||""'));
  evaluate('(()=>{document.querySelector(".option")?.click();return true})()');
  await waitFor('document.querySelector(".rm-distance")?.textContent !== "15m"', "Rescue distance update", 2500);
  const after = String(evaluate('document.querySelector(".rm-distance")?.textContent||""'));
  ok(before === "15m" && after !== before, "Rescue distance did not change", JSON.stringify({before,after}));
  pass("Rescue: mode picker → quiz → distance changes");
  await exitGame("rescue_monkey");
}
async function mixed() {
  await game("mixed");
  await waitFor('!!document.querySelector(".session-bar") && !!document.querySelector(".study-card")', "Mixed first card");
  const s = evalJson('JSON.stringify({session:document.querySelector(".session-bar")?.textContent?.replace(/\\s+/g," ").trim()||"",variant:document.querySelector(".flashcard-card")?"flashcard":document.querySelector(".quiz-card")?"quiz":document.querySelector(".match-card")?"match":document.querySelector(".typing-card")?"typing":document.querySelector(".listening-card")?"listening":"unknown"})');
  ok(/1\/\d+/.test(s.session), "Mixed did not start at question 1", JSON.stringify(s));
  ok(["flashcard","quiz","match","typing","listening"].includes(s.variant), "Mixed invalid variant", JSON.stringify(s));
  pass("Mixed: fullscreen session + valid variant");
  await exitGame("mixed");
}
async function mobile() {
  result(["set","device","--page",page,"--name","iPhone 12"]);
  for (const id of GAMES) {
    const s = await game(id);
    ok(Math.round(s.w) === 390 && Math.round(s.h) === 844, id + ": mobile fullscreen mismatch", JSON.stringify(s));
    pass("Mobile: " + id + " 390×844 no overflow");
    await exitGame(id);
  }
}

async function setup() {
  orca(["status","--json"]);
  profile = result(["tab","profile","create","--label","luyentu-e2e-"+Date.now(),"--scope","isolated"])?.profile?.id;
  ok(profile, "Cannot create isolated profile");
  page = result(["tab","create","--url",BASE+"/#study","--profile",profile])?.browserPageId;
  ok(page, "Cannot create browser tab");
  result(["set","media","--page",page,"--reduced-motion","reduce"]);
  await waitFor('!!document.querySelector("[data-action=open-special-hub]")', "Study Hub", 7000);
}
function cleanup() {
  if (page) orca(["tab","close","--page",page,"--json"], true);
  if (profile) orca(["tab","profile","delete","--profile",profile,"--json"], true);
  if (server && server.exitCode == null) server.kill();
}

async function main() {
  console.log("Special Games browser E2E");
  console.log("Base:", BASE);
  try {
    await ensureServer();
    await setup();
    await rice();
    await bird();
    await translate();
    await sentence();
    await rescue();
    await mixed();
    await mobile();
    console.log("\nPASS " + passed + "/12 browser checks");
  } finally { cleanup(); }
}
main().catch((e) => { console.error("\nE2E FAIL\n" + (e?.stack || e)); process.exitCode = 1; });
