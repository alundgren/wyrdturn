// e18 browser game: scout the enemies, make the up-front choices, watch the fight (no
// input but speed), read why it went that way. Boss phases pause for a new setup.
// `?run` chains fights with doors and rewards.
import { Stage } from "./view/stage.ts";
import {
  BOSS_PHASES,
  CHARM,
  ENEMIES,
  FOCI,
  FOCUS_TEXT,
  SKILL,
  type AbilityDef,
  type Focus,
  type Side,
} from "./rules/content.ts";
import { BOSS, FIGHTS, generate } from "./rules/encounters.ts";
import {
  DARK_AT,
  DEFAULT_OPTS,
  nextPhase,
  runToEnd,
  startFight,
  step,
  type Encounter,
  type Ev,
  type Mods,
  type Setup,
  type State,
  type Unit,
} from "./rules/sim.ts";
import {
  defaultFor,
  fixOrder,
  FULL_POOL,
  SKILL_PLACES,
  summonsOf,
  unitName,
  type Pool,
} from "./rules/setup.ts";
import { report, startHp, type Report } from "./rules/report.ts";
import { oneChange, won } from "./rules/bots.ts";
import {
  applyReward,
  doors as runDoors,
  newRun,
  rewards as runRewards,
  RUN_FIGHTS,
  type Door,
  type Reward,
  type RunState,
} from "./rules/run.ts";

declare global {
  interface Window {
    __e18: any;
    __freeze?: number;
  }
}

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const params = new URLSearchParams(location.search);
const stage = new Stage($("canvas"), { shot: params.has("shot") });

type Screen = "setup" | "fight" | "result" | "doors" | "reward" | "over";
let screen: Screen = "setup";
let enc: Encounter = FIGHTS[0];
let pool: Pool = FULL_POOL;
let mods: Mods = {};
let setup: Setup = defaultFor(pool);
let selSlot: number | null = null;
let run: RunState | null = null;
let door: Door | null = null;
let picked: number[] = [];
// boss: the state each phase starts from (null for phase 1) and the phase index
let phaseBase: (State | null)[] = [null];
let phase = 0;
let preview: State;
let live: State | null = null;
let hp0: Record<number, number> = {};
let rep: Report | null = null;
let changeText = "";
let playT = 0;
let speed = Number(params.get("speed") ?? 1) || 1;
let evIndex = 0;
let lastNow = performance.now() / 1000;
let bannerUntil = 0;
let overAt = 0;

// ---------------- building fights ----------------------------------------------------

function startFor(s: Setup): State {
  const base = phaseBase[phase];
  if (base) return nextPhase(base, s, mods);
  return startFight(enc, s, DEFAULT_OPTS, mods, true);
}

function setSetup(s: Setup) {
  setup = { ...s, order: fixOrder(s.order, s.skills) };
  if (screen === "setup") showPreview();
}

function showPreview() {
  preview = startFor(setup);
  syncUnits(preview, true);
  syncGround(preview);
  renderSetup();
  renderLabels(preview);
}

function syncUnits(s: State, instant: boolean) {
  const now = performance.now() / 1000;
  const alive = new Set<number>();
  for (const side of ["P", "E"] as Side[])
    s.rows[side].forEach((u, i) => {
      alive.add(u.id);
      if (!stage.visuals.has(u.id)) stage.addUnit(u.id, u.kind, side, i);
      else stage.moveUnit(u.id, side, i, now, instant ? 0.001 : 0.35);
    });
  for (const id of Array.from(stage.visuals.keys())) if (!alive.has(id)) stage.removeUnit(id);
  if (instant) stage.finish();
}

let groundKey = "";
function syncGround(s: State) {
  const k = JSON.stringify(s.ground, (key, v) =>
    key.endsWith("By") ? undefined : v > 0 && typeof v === "number" ? 1 : v,
  );
  if (k === groundKey) return;
  groundKey = k;
  for (const side of ["P", "E"] as Side[])
    s.ground[side].forEach((g, i) => stage.setGround(side, i, g));
}

// ---------------- labels and floor tags --------------------------------------------------

function abilityRange(a: AbilityDef): string {
  const r = (xs: number[]) =>
    xs.length === 4
      ? "any"
      : xs.length > 1
        ? `${xs[0] + 1}-${xs[xs.length - 1] + 1}`
        : `${xs[0] + 1}`;
  return `from ${r(a.from)}`;
}

function renderLabels(s: State) {
  const box = $("labels");
  const html: string[] = [];
  for (const side of ["P", "E"] as Side[])
    s.rows[side].forEach((u, slot) => {
      const pct = Math.max(0, (100 * u.hp) / u.maxHp);
      const tags: string[] = [];
      if (u.shield) tags.push(`<span class="tag shield">${u.shield} shield</span>`);
      if (u.armour) tags.push(`<span class="tag">armour ${u.armour}</span>`);
      if (u.heavy) tags.push(`<span class="tag">heavy</span>`);
      if (u.immune.length) tags.push(`<span class="tag">immune ${u.immune.join(", ")}</span>`);
      if (u.rage) {
        const extra = u.abs.reduce((a, x) => Math.max(a, x.bonus), 0);
        tags.push(
          `<span class="tag" style="background:#7a2a1a">rage +${u.rage}${extra ? ` (now +${extra})` : ""}</span>`,
        );
      }
      const cds = u.abs
        .map((a) => {
          const usable = a.def.from.includes(slot);
          const f = Math.max(0, Math.min(1, 1 - a.cd / (a.def.cd * a.cdMul)));
          return `<div class="cd" title="${esc(a.def.name)}" style="opacity:${usable ? 1 : 0.3}"><i style="width:${(100 * f).toFixed(0)}%"></i></div>`;
        })
        .join("");
      const scout =
        screen === "setup" && side === "E"
          ? `<div class="scoutab">${u.abs
              .map((a) => `<div><b>${esc(a.def.name)}</b> ${esc(shortAb(a.def, s.dmgMul))}</div>`)
              .join("")}</div>`
          : "";
      const skills =
        screen === "setup" && side === "P"
          ? `<div>${u.abs
              .map((a) => {
                const ok = a.def.from.includes(slot);
                return `<span class="tag" style="background:${ok ? "#2a5a2a" : "#3a2a2a"};${ok ? "" : "text-decoration:line-through;color:#a88"}" title="${esc(a.def.name)}: ${abilityRange(a.def)}">${esc(a.def.name)}</span>`;
              })
              .join("")}</div>`
          : "";
      html.push(
        `<div class="ulabel ${side}${screen === "setup" && side === "P" && selSlot === slot ? " sel" : ""}" data-id="${u.id}"><div class="uname">${esc(u.name)}</div><div class="hpbar"><div class="hpfill" style="width:${pct}%"></div><div class="hptxt">${Math.max(0, u.hp)} / ${u.maxHp}</div></div><div class="cds">${cds}</div>${tags.join("")}${skills}${scout}</div>`,
      );
    });
  box.innerHTML = html.join("");
  // floor: slot numbers, ground, and (while choosing) what aims at your slots
  const aims = screen === "setup" ? aimedAt(s) : null;
  const sl: string[] = [];
  for (const side of ["P", "E"] as Side[])
    for (let i = 0; i < 4; i++) {
      const g = s.ground[side][i];
      const hz: string[] = [];
      if (g.fire > 0) hz.push(`<span class="hz fire">${g.blaze ? "blaze" : "fire"}</span>`);
      if (g.oil > 0) hz.push(`<span class="hz oil">oil</span>`);
      if (g.ice > 0) hz.push(`<span class="hz ice">ice</span>`);
      if (g.poison > 0) hz.push(`<span class="hz poison">poison</span>`);
      if (g.ward > 0) hz.push(`<span class="hz ward">ward</span>`);
      const aim =
        aims && side === "P" && aims[i].length
          ? aims[i].map((a) => `<span class="aim">${esc(a)}</span>`).join("")
          : "";
      sl.push(
        `<div class="slabel" data-k="${side}${i}"><span class="snum">${i + 1}</span>${hz.join("")}${aim}</div>`,
      );
    }
  $("slots").innerHTML = sl.join("");
  placeLabels();
}

// One line per enemy ability for the scout labels: "6 to your front unit, push, 4 s".
function shortAb(d: AbilityDef, mul: number): string {
  const parts: string[] = [];
  const dmg = d.dmg ? Math.round(d.dmg * mul) : 0;
  const slots = (xs: number[]) =>
    xs.length > 1 ? `${xs[0] + 1}-${xs[xs.length - 1] + 1}` : `${xs[0] + 1}`;
  if (d.target === "area")
    parts.push(`${dmg ? `${dmg} + ` : ""}${d.ground} on your ${slots(d.groundOn as number[])}`);
  else if (d.target === "raise") parts.push(`raises a ${d.raise}`);
  else if (d.target === "ally")
    parts.push(d.shield ? `shields its weakest ${d.shield}` : `heals ${d.heal}`);
  else {
    const who = d.all
      ? "all your units"
      : d.aim === "back"
        ? "your back unit"
        : d.aim === "weakest"
          ? "your weakest"
          : "your front unit";
    parts.push(`${dmg} to ${who}`);
    if (d.push) parts.push("push");
  }
  parts.push(`every ${d.cd} s`);
  const from = d.from.length < 4 ? ` (from ${slots(d.from)})` : "";
  return parts.join(", ") + from;
}

// What each enemy aims at, by your slot, from where everyone stands now.
function aimedAt(s: State): string[][] {
  const out: string[][] = [[], [], [], []];
  const P = s.rows.P;
  for (const e of s.rows.E) {
    for (const a of e.abs) {
      const d = a.def;
      if (d.target === "ally" || d.target === "raise") continue;
      const dmg = d.dmg ? ` ${Math.round(d.dmg * s.dmgMul)}` : "";
      const fx = d.ground ? ` +${d.ground}` : "";
      const txt = `${e.name.split(" ").pop()}: ${d.name}${dmg}${fx}`;
      if (d.target === "area") {
        for (const i of d.groundOn as number[]) if (i < 4) out[i].push(txt);
        continue;
      }
      const reach = d.reach ?? [0, 1, 2, 3];
      const cands = P.map((u, i) => ({ u, i })).filter((x) => reach.includes(x.i));
      if (!cands.length) continue;
      if (d.all) {
        for (const c of cands) out[c.i].push(txt);
        continue;
      }
      let pick = cands[0];
      for (const c of cands) {
        if (d.aim === "back" && c.i > pick.i) pick = c;
        if (d.aim === "weakest" && c.u.hp + c.u.shield < pick.u.hp + pick.u.shield) pick = c;
      }
      out[pick.i].push(txt);
    }
  }
  return out;
}

function placeLabels() {
  for (const el of $("labels").children as HTMLCollectionOf<HTMLElement>) {
    const id = Number(el.dataset.id);
    const p = stage.unitScreen(id, stage.unitHeight(id) + 0.15);
    if (p) {
      el.style.left = `${p.x}px`;
      // keep tall labels (the King, scouting notes) on screen
      el.style.top = `${Math.max(p.y, el.offsetHeight + 4)}px`;
    }
  }
  for (const el of $("slots").children as HTMLCollectionOf<HTMLElement>) {
    const side = el.dataset.k![0] as Side;
    const i = Number(el.dataset.k![1]);
    const p = stage.screen(stage.slotPos(side, i).setZ(1.3));
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
  }
}

function pop(id: number, text: string, color: string, small = false) {
  const p = stage.unitScreen(id, stage.unitHeight(id) * (small ? 1.05 : 0.6));
  if (!p) return;
  const el = document.createElement("div");
  el.className = small ? "pop small" : "pop";
  el.textContent = text;
  el.style.color = color;
  el.style.left = `${p.x + (Math.random() - 0.5) * 20}px`;
  el.style.top = `${p.y}px`;
  $("pops").appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function banner(text: string, secs = 1.6) {
  $("banner").textContent = text;
  $("banner").style.opacity = "1";
  bannerUntil = performance.now() / 1000 + secs;
}

// ---------------- setup screen ---------------------------------------------------------------

function show(id: string, on: boolean) {
  $(id).classList.toggle("hidden", !on);
}

function setScreen(s: Screen) {
  screen = s;
  show("setup", s === "setup");
  show("speed", s === "fight");
  show("result", s === "result");
  show("doors", s === "doors");
  show("reward", s === "reward" || s === "over");
  $("clock").innerHTML = "";
  renderTitle();
}

function renderTitle() {
  const boss = enc.boss
    ? ` - phase ${phase + 1} of ${BOSS_PHASES.length}: ${BOSS_PHASES[phase].name}`
    : "";
  $("title").textContent =
    screen === "doors" || screen === "reward" || screen === "over" ? "Run" : `${enc.name}${boss}`;
  const ph = enc.boss ? BOSS_PHASES[phase] : null;
  const phaseText = ph
    ? `${ph.text}${phase < BOSS_PHASES.length - 1 ? ` Ends when the King drops to ${Math.round(ph.until * 100)}% HP; then you choose again.` : ""}`
    : "";
  const floor =
    (enc.ground ?? []).length && phase === 0
      ? ` On the floor: ${(enc.ground ?? []).map((g) => `${g.kind} on ${g.side === "E" ? "enemy" : "your"} slot ${g.slot + 1}`).join(", ")}.`
      : "";
  const runText = run
    ? `Run (seed ${run.seed}), fight ${Math.min(run.step + 1, RUN_FIGHTS + 1)} of ${RUN_FIGHTS + 1}. `
    : "";
  $("sub").textContent = `${runText}${phaseText || enc.text || ""}${floor}`;
}

function renderSetup() {
  const chosen = new Set(setup.skills);
  const skills = pool.skills
    .map((id) => {
      const sk = SKILL[id];
      const on = chosen.has(id);
      const dis = !on && chosen.size >= SKILL_PLACES;
      const range = sk.ability
        ? ` <span class="k">${abilityRange(sk.ability)}</span>`
        : ` <span class="k">summon</span>`;
      return `<button class="skill${on ? " on" : ""}" data-skill="${id}" title="${esc(sk.ability?.text ?? sk.text)}" ${dis ? "disabled" : ""}><b>${esc(sk.name)}</b>${range}<span class="d">${esc(sk.text)}</span></button>`;
    })
    .join("");
  const foci = FOCI.map(
    (f) =>
      `<button class="opt${setup.focus === f ? " on" : ""}" data-focus="${f}" title="${esc(FOCUS_TEXT[f])}">${f}</button>`,
  ).join("");
  const charms = pool.charms
    .map(
      (c) =>
        `<button class="opt${setup.charm === c ? " on" : ""}" data-charm="${c}" title="${esc(CHARM[c].text)}">${esc(CHARM[c].name)}</button>`,
    )
    .join("");
  const order = setup.order
    .map(
      (k, i) =>
        `<button class="opt${selSlot === i ? " on" : ""}" data-slot="${i}">${i + 1}. ${esc(unitName(k))}</button>`,
    )
    .join("");
  $("setup").innerHTML = `
    <div><h3>Skills: bring ${SKILL_PLACES} (summons take a place)</h3><div class="skills">${skills}</div></div>
    <div><h3>Formation</h3><div class="row">${order}</div>
      <div class="why">Click two units (here or on the floor) to swap them. Slot 1 is the front. Struck-through skills can't be used from that slot.</div>
      <h3 style="margin-top:8px">Focus</h3><div class="row">${foci}</div>
      <div class="why">${esc(FOCUS_TEXT[setup.focus])}</div></div>
    <div><h3>Charm (fires once)</h3><div class="row">${charms}</div>
      <div class="why"><b>${esc(CHARM[setup.charm]?.name ?? "")}</b>: ${esc(CHARM[setup.charm]?.text ?? "")}</div></div>
    <div id="go"><button class="big" data-go="1">Fight!</button><br><br><button data-reset="1">Default setup</button></div>`;
}

$("setup").addEventListener("click", (ev) => {
  const b = (ev.target as HTMLElement).closest("button") as HTMLButtonElement | null;
  if (!b) return;
  const d = b.dataset;
  if (d.skill) {
    const has = setup.skills.includes(d.skill);
    const skills = has ? setup.skills.filter((x) => x !== d.skill) : [...setup.skills, d.skill];
    if (skills.length > SKILL_PLACES) return;
    setSetup({ ...setup, skills });
  } else if (d.focus) setSetup({ ...setup, focus: d.focus as Focus });
  else if (d.charm) setSetup({ ...setup, charm: d.charm });
  else if (d.slot) clickSlot(Number(d.slot));
  else if (d.reset) setSetup(defaultFor(pool));
  else if (d.go) startWatch();
});

function clickSlot(i: number) {
  if (i >= setup.order.length) return;
  if (selSlot === null) selSlot = i;
  else {
    if (selSlot !== i) {
      const order = setup.order.slice();
      [order[selSlot], order[i]] = [order[i], order[selSlot]];
      setup = { ...setup, order };
    }
    selSlot = null;
  }
  showPreview();
}

addEventListener("click", (ev) => {
  if (screen !== "setup" || (ev.target as HTMLElement).closest(".ui")) return;
  const p = stage.pick(ev.clientX, ev.clientY);
  if (p && p.side === "P") clickSlot(p.slot);
});

// ---------------- watching a fight ------------------------------------------------------------

function startWatch(skipTo = 0) {
  if (setup.skills.length < SKILL_PLACES) {
    banner(`Pick ${SKILL_PLACES} skills first`);
    return;
  }
  selSlot = null;
  live = startFor(setup);
  hp0 = startHp(live);
  syncUnits(live, true);
  evIndex = live.log!.length; // phase start events are already shown
  playT = 0;
  overAt = 0;
  rep = null;
  setScreen("fight");
  renderSpeed();
  if (skipTo > 0) {
    while (!live.over && live.t < skipTo) step(live);
    playT = live.t;
    drainEvents(true);
  }
  renderLabels(live);
}

function renderSpeed() {
  for (const b of $("speed").querySelectorAll<HTMLButtonElement>("[data-speed]"))
    b.classList.toggle("on", Number(b.dataset.speed) === speed);
}
$("speed").addEventListener("click", (ev) => {
  const b = (ev.target as HTMLElement).closest("button") as HTMLButtonElement | null;
  if (!b) return;
  if (b.id === "skip") skipFight();
  else {
    speed = Number(b.dataset.speed);
    renderSpeed();
  }
});
addEventListener("keydown", (ev) => {
  if (screen === "fight" && (ev.key === " " || ev.key === "s")) skipFight();
  if (screen === "fight" && (ev.key === "1" || ev.key === "2")) {
    speed = Number(ev.key);
    renderSpeed();
  }
  if (screen === "setup" && ev.key === "Enter") startWatch();
});

function skipFight() {
  if (!live) return;
  runToEnd(live);
  playT = live.t;
  drainEvents(true);
  finishFight();
}

const name = (id: number) => live?.units.find((u) => u.id === id)?.name ?? "";
const unitOf = (id: number): Unit | undefined => live?.units.find((u) => u.id === id);

function drainEvents(quiet: boolean) {
  if (!live) return;
  const log = live.log!;
  const now = performance.now() / 1000;
  stage.speed = speed;
  for (; evIndex < log.length; evIndex++) {
    const ev = log[evIndex];
    if (!quiet && ev.t > playT + 1e-9) break;
    applyEvent(ev, quiet, now);
  }
  if (quiet) {
    syncUnits(live, true);
    stage.finish();
  }
}

const DMG_COLOR: Record<string, string> = {
  fire: "#ff9a40",
  blaze: "#ff5a20",
  flash: "#ffe060",
  poison: "#9ae05a",
  dark: "#c8a0ff",
  crash: "#e0d0c0",
  wall: "#e0d0c0",
};

function applyEvent(ev: Ev, quiet: boolean, now: number) {
  if (ev.e === "move") {
    const u = unitOf(ev.u);
    if (u && u.alive && !quiet)
      stage.moveUnit(ev.u, u.side, ev.slot, now, ev.why === "up" ? 0.5 : 0.3);
    return;
  }
  if (ev.e === "spawn") {
    const u = unitOf(ev.u);
    if (u) stage.addUnit(u.id, u.kind, u.side, ev.slot, !quiet);
    return;
  }
  if (ev.e === "die") {
    if (!quiet) stage.play(ev.u, "death", now);
    else stage.removeUnit(ev.u);
    return;
  }
  if (quiet) return;
  if (ev.e === "use") {
    stage.play(ev.u, "attack", now);
    pop(ev.u, ev.name, "#fff", true);
  } else if (ev.e === "dmg") {
    const u = unitOf(ev.u);
    if (ev.kind === "hit" && ev.amt > 0) stage.play(ev.u, "hit", now);
    const col = DMG_COLOR[ev.kind] ?? (u?.side === "P" ? "#ff6a5a" : "#ffe8c0");
    if (ev.amt > 0 || ev.blocked > 0)
      pop(
        ev.u,
        ev.amt > 0
          ? `-${ev.amt}${ev.blocked ? ` (${ev.blocked} blocked)` : ""}`
          : `${ev.blocked} blocked`,
        col,
      );
  } else if (ev.e === "heal") pop(ev.u, `+${ev.amt}`, "#7dff9a");
  else if (ev.e === "shield") pop(ev.u, `+${ev.amt} shield`, "#8fd0ff");
  else if (ev.e === "resist") pop(ev.u, "heavy: not moved", "#d8d8f0", true);
  else if (ev.e === "rage") pop(ev.u, `rage +${ev.amt}`, "#ff8a5a", true);
  else if (ev.e === "combo") {
    const col = { blaze: "#ff5a20", flash: "#ffe060", melt: "#bfe8ff" }[ev.what];
    stage.burst(ev.side, ev.slot, col);
    banner(
      {
        blaze: "Blaze! Fire on oil",
        flash: "Flash! Fire on poison",
        melt: "Ice and fire cancel out",
      }[ev.what],
      1.2,
    );
  } else if (ev.e === "charm") {
    banner(`Charm: ${CHARM[ev.id].name}${ev.u ? ` (${name(ev.u)})` : ""}`);
  } else if (ev.e === "dark") banner("The dark closes in", 2);
}

function finishFight() {
  if (!live) return;
  rep = report(live, hp0);
  changeText = explainChange();
  renderResult();
  setScreen("result");
}

function explainChange(): string {
  if (!live) return "";
  const base = phaseBase[phase];
  const start = base ? (s: Setup) => nextPhase(base, s, mods) : undefined;
  const { flips, base: o } = oneChange(enc, setup, pool, DEFAULT_OPTS, mods, start);
  const fmtO = (x: (typeof flips)[0]) =>
    won(x.o)
      ? `${x.o.result === "phase" ? "clears the phase" : "wins"} at ${x.o.t.toFixed(1)} s with ${Math.round(100 * x.o.heroHp)}% hero HP`
      : `loses at ${x.o.t.toFixed(1)} s`;
  if (!won(o)) {
    if (!flips.length)
      return `<div class="change lost">No single change wins this one. Try changing two things: different skills <i>and</i> a different formation or focus.</div>`;
    return `<div class="change"><b>One change that would have won:</b><br>${flips
      .slice(0, 3)
      .map((f) => `• ${esc(f.text)}: ${fmtO(f)}`)
      .join(
        "<br>",
      )}${flips.length > 3 ? `<br><i>(${flips.length} single changes win in all)</i>` : ""}</div>`;
  }
  if (!flips.length)
    return `<div class="change">Every single change to your setup still wins. A safe setup.</div>`;
  return `<div class="change lost"><b>Close calls:</b> ${flips.length} single change${flips.length > 1 ? "s" : ""} would have lost, for example:<br>${flips
    .slice(0, 2)
    .map((f) => `• ${esc(f.text)}: ${fmtO(f)}`)
    .join("<br>")}</div>`;
}

// ---------------- result screen ---------------------------------------------------------------

function curveSvg(r: Report): string {
  const W = 300;
  const H = 90;
  const T = Math.max(1, r.t);
  const path = (k: "P" | "E") =>
    r.curve
      .map((p, i) => `${i ? "L" : "M"}${((p.t / T) * W).toFixed(1)},${(H - p[k] * H).toFixed(1)}`)
      .join("");
  const marks = r.moments
    .filter((m) => m.kind === "fall" || m.kind === "kill" || m.kind === "turn")
    .map(
      (m) =>
        `<circle cx="${((m.t / T) * W).toFixed(1)}" cy="${H - 2}" r="3" fill="${m.kind === "fall" ? "#ff5a48" : m.kind === "kill" ? "#7dff9a" : "#ffd65a"}"/>`,
    )
    .join("");
  const dark =
    r.t > DARK_AT
      ? `<rect x="${((DARK_AT / T) * W).toFixed(1)}" y="0" width="${(W - (DARK_AT / T) * W).toFixed(1)}" height="${H}" fill="#6a3a9a33"/>`
      : "";
  return `<svg width="${W}" height="${H + 14}" viewBox="0 0 ${W} ${H + 14}">${dark}<path d="${path("P")}" stroke="#7dff9a" fill="none" stroke-width="2"/><path d="${path("E")}" stroke="#ff5a48" fill="none" stroke-width="2"/>${marks}<text x="0" y="${H + 12}">0 s</text><text x="${W - 30}" y="${H + 12}">${r.t.toFixed(0)} s</text></svg>`;
}

function barsHtml(bs: { src: string; amt: number }[], cls: string): string {
  const max = Math.max(1, ...bs.map((b) => b.amt));
  return bs
    .slice(0, 7)
    .map(
      (b) =>
        `<div class="bar ${cls}"><span>${esc(b.src)}</span><div class="b" style="width:${(100 * b.amt) / max}%"></div><span class="n">${b.amt}</span></div>`,
    )
    .join("");
}

function renderResult() {
  const r = rep!;
  const win = r.result !== "loss";
  const title =
    r.result === "phase" ? `Phase ${phase + 1} cleared` : r.result === "win" ? "Victory" : "Defeat";
  const moments = r.moments
    .map(
      (m) =>
        `<div class="moment ${m.kind}" data-t="${m.t}"><span class="t">${m.t.toFixed(1)} s</span>${esc(m.text)}</div>`,
    )
    .join("");
  const buttons: string[] = [`<button data-act="watch">Watch again</button>`];
  if (r.result === "phase")
    buttons.push(
      `<button data-act="retry">Retry this phase</button>`,
      `<button class="big" data-act="nextphase">Next phase: choose again</button>`,
    );
  else if (run) {
    if (win && enc.boss)
      buttons.push(`<button class="big" data-act="runwon">Finish the run</button>`);
    else if (win)
      buttons.push(
        `<button class="big" data-act="reward">Choose ${door?.picks === 2 ? "2 rewards" : "a reward"}</button>`,
      );
    else buttons.push(`<button class="big" data-act="runover">End of the run</button>`);
  } else {
    buttons.push(`<button data-act="retry">Change setup and retry</button>`);
    if (!enc.boss) buttons.push(`<button class="big" data-act="next">Next fight</button>`);
  }
  $("result").innerHTML = `
    <h2 class="${win ? "win" : "loss"}">${title} <span style="font-size:14px;color:var(--dim)">${r.t.toFixed(1)} s at 1x</span></h2>
    <div class="verdict">${esc(r.verdict)}</div>
    ${changeText}
    <div class="cols">
      <div><h3>Your damage, by source</h3>${barsHtml(r.dealt, "")}</div>
      <div><h3>Damage you took, by source</h3>${barsHtml(r.taken, "e")}${
        r.takenHero.length
          ? `<div class="why">On the hero: ${r.takenHero
              .slice(0, 3)
              .map((b) => `${esc(b.src)} ${b.amt}`)
              .join(", ")}</div>`
          : ""
      }</div>
      <div><h3>HP over time</h3>${curveSvg(r)}<div class="why"><span style="color:#7dff9a">your side</span> / <span style="color:#ff5a48">enemies</span>; dots: falls and kills</div></div>
    </div>
    <h3 style="margin-top:10px">Key moments <span style="text-transform:none;color:var(--dim)">(click one to replay from there)</span></h3>
    <div style="columns:2">${moments}</div>
    <div class="buttons">${buttons.join("")}</div>`;
}

$("result").addEventListener("click", (ev) => {
  const el = ev.target as HTMLElement;
  const m = el.closest(".moment") as HTMLElement | null;
  if (m) {
    startWatch(Math.max(0, Number(m.dataset.t) - 1.5));
    return;
  }
  const b = el.closest("button") as HTMLButtonElement | null;
  if (!b) return;
  const act = b.dataset.act;
  if (act === "watch") startWatch();
  else if (act === "retry") toSetup();
  else if (act === "nextphase") {
    phaseBase[phase + 1] = live;
    phase++;
    toSetup();
  } else if (act === "next") {
    const i = FIGHTS.indexOf(enc);
    location.search = i >= 0 && i < FIGHTS.length - 1 ? `?fight=${i + 2}` : "?boss";
  } else if (act === "reward") showRewards();
  else if (act === "runover") showOver(false);
  else if (act === "runwon") showOver(true);
});

function toSetup() {
  live = null;
  setScreen("setup");
  groundKey = "";
  showPreview();
}

// ---------------- run: doors and rewards --------------------------------------------------------

function showDoors() {
  if (!run) return;
  const ds = runDoors(run);
  pool = run.pool;
  mods = run.mods;
  const cards = ds
    .map((d, i) => {
      const enemies = d.enc.boss
        ? "The Ossuary King, three phases"
        : d.enc.enemies.map((k) => ENEMIES[k].name).join(", ");
      const g = (d.enc.ground ?? []).length
        ? `<br>Floor: ${(d.enc.ground ?? []).map((x) => `${x.kind} on ${x.side === "E" ? "enemy" : "your"} slot ${x.slot + 1}`).join(", ")}`
        : "";
      return `<button class="card" data-door="${i}"><b>${d.hard ? "Hard door" : "Door"}</b>: ${esc(enemies)}${g}<br><span style="color:var(--dim)">${esc(d.text)}</span></button>`;
    })
    .join("");
  const build = `Your build: skills ${run.pool.skills.map((s) => SKILL[s].name).join(", ")}; charms ${run.pool.charms.map((c) => CHARM[c].name).join(", ")}${run.log.length ? `; upgrades and finds: ${run.log.map(esc).join(" ")}` : ""}`;
  $("doors").innerHTML =
    `<h2>${run.step >= RUN_FIGHTS ? "The last door" : `Fight ${run.step + 1} of ${RUN_FIGHTS}: pick a door`}</h2><div class="why" style="max-width:none">${build}</div><div class="cards">${cards}</div>`;
  setScreen("doors");
  for (const id of Array.from(stage.visuals.keys())) stage.removeUnit(id);
  $("labels").innerHTML = "";
  $("slots").innerHTML = "";
}

$("doors").addEventListener("click", (ev) => {
  const b = (ev.target as HTMLElement).closest("button") as HTMLButtonElement | null;
  if (!b || !run) return;
  door = runDoors(run)[Number(b.dataset.door)];
  enc = door.enc;
  phase = 0;
  phaseBase = [null];
  setup = { ...defaultFor(pool), ...keepSetup(setup, pool) };
  toSetup();
});

// keep last fight's choices where the pool allows
function keepSetup(s: Setup, p: Pool): Partial<Setup> {
  const skills = s.skills.filter((x) => p.skills.includes(x));
  if (skills.length < SKILL_PLACES) return {};
  return {
    skills,
    order: fixOrder(s.order, skills),
    focus: s.focus,
    charm: p.charms.includes(s.charm) ? s.charm : p.charms[0],
  };
}

let offer: Reward[] = [];
function showRewards() {
  if (!run || !door) return;
  offer = runRewards(run);
  picked = [];
  renderRewards();
  setScreen("reward");
}
function renderRewards() {
  const need = door!.picks;
  const cards = offer
    .map(
      (r, i) =>
        `<button class="card${picked.includes(i) ? " picked" : ""}" data-rw="${i}">${esc(r.text)}</button>`,
    )
    .join("");
  $("reward").innerHTML =
    `<h2>Pick ${need} reward${need > 1 ? "s" : ""}</h2><div class="cards">${cards}</div><div class="buttons"><button class="big" data-take="1" ${picked.length === need ? "" : "disabled"}>Take and go on</button></div>`;
}
$("reward").addEventListener("click", (ev) => {
  const b = (ev.target as HTMLElement).closest("button") as HTMLButtonElement | null;
  if (!b || !run) return;
  if (b.dataset.newrun) {
    location.search = `?run&seed=${run.seed + 1}`;
    return;
  }
  if (b.dataset.rw) {
    const i = Number(b.dataset.rw);
    picked = picked.includes(i)
      ? picked.filter((x) => x !== i)
      : [...picked, i].slice(-door!.picks);
    renderRewards();
    return;
  }
  if (b.dataset.take) {
    for (const i of picked) run = applyReward(run!, offer[i]);
    run = { ...run!, step: run!.step + 1 };
    showDoors();
  }
});

function showOver(wonRun: boolean) {
  $("reward").innerHTML =
    `<h2 class="${wonRun ? "win" : "loss"}">${wonRun ? "The run is won" : "The run is over"}</h2><div class="verdict">${wonRun ? "The Ossuary King falls." : `You fell in fight ${run!.step + 1}.`}</div><div class="why" style="max-width:none">Build at the end: ${run!.pool.skills.map((s) => SKILL[s].name).join(", ")}; ${run!.pool.charms.map((c) => CHARM[c].name).join(", ")}. ${run!.log.map(esc).join(" ")}</div><div class="buttons"><button class="big" data-newrun="1">New run</button></div>`;
  setScreen("over");
}

// ---------------- fight picker ---------------------------------------------------------------------

function initPicker() {
  const opts = [
    ...FIGHTS.map((f, i) => [`?fight=${i + 1}`, `Fight ${i + 1}: ${f.name}`]),
    ["?boss", "Boss: the Ossuary King"],
    [`?gen=${1 + Math.floor(Math.random() * 999)}`, "A generated fight"],
    ["?run", "Run: 4 fights and the boss"],
  ];
  const cur = location.search || "?fight=1";
  $("pickfight").innerHTML = opts
    .map(
      ([v, t]) =>
        `<option value="${v}" ${cur.startsWith(v.split("=")[0]) && (v.includes("gen") || cur === v || (v === "?run" && cur.startsWith("?run"))) ? "selected" : ""}>${esc(t)}</option>`,
    )
    .join("");
  $("pickfight").addEventListener("change", (ev) => {
    location.search = (ev.target as HTMLSelectElement).value;
  });
}

// ---------------- frame loop -------------------------------------------------------------------------

let frames = 0;
function frame(): void {
  frames++;
  const real = performance.now() / 1000;
  const dt = Math.min(0.1, real - lastNow);
  lastNow = real;
  const now = window.__freeze ?? real;
  if (screen === "fight" && live) {
    if (!live.over) {
      playT += dt * speed;
      while (!live.over && live.t + 1e-9 < playT) step(live);
    } else {
      playT += dt * speed;
      if (!overAt) overAt = real;
    }
    drainEvents(false);
    syncGround(live);
    renderLabels(live);
    const darkIn = DARK_AT - live.t;
    $("clock").innerHTML =
      `${Math.min(playT, live.t).toFixed(1)} s<span class="dark">${darkIn > 0 ? `the dark at ${DARK_AT} s` : "the dark is closing in"}</span>`;
    if (live.over && overAt && real - overAt > 1.2) finishFight();
  } else placeLabels();
  if (real > bannerUntil) $("banner").style.opacity = "0";
  stage.update(now);
  stage.render(now);
  requestAnimationFrame(frame);
}

// ---------------- start ---------------------------------------------------------------------------------

async function main() {
  await stage.load();
  initPicker();
  if (params.has("run")) {
    run = newRun(Number(params.get("seed") ?? 1));
    showDoors();
  } else {
    if (params.has("boss")) enc = BOSS;
    else if (params.has("gen"))
      enc = generate(Number(params.get("gen")), Number(params.get("d") ?? 3));
    else
      enc = FIGHTS[Math.max(0, Math.min(FIGHTS.length - 1, Number(params.get("fight") ?? 1) - 1))];
    pool = FULL_POOL;
    setup = defaultFor(pool);
    toSetup();
  }
  requestAnimationFrame(frame);
  window.__e18.ready = true;
}
void main();

// Debug handle for scripts/shots.ts.
window.__e18 = {
  ready: false,
  screen: () => screen,
  setup: () => setup,
  setSetup,
  fight: () => startWatch(),
  watchFrom: (t: number) => startWatch(t),
  stats: () => ({ playT, frames }),
  skip: skipFight,
  speed: (n: number) => {
    speed = n;
    renderSpeed();
  },
  live: () => live,
  report: () => rep,
  phase: () => phase,
  click: (sel: string) => (document.querySelector(sel) as HTMLElement | null)?.click(),
  summons: () => summonsOf(setup.skills),
};
