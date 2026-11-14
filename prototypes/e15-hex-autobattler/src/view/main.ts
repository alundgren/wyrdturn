// Game layer for e15: deployment, wolf priority, card windows with hover previews, the
// exact preview of the next interval, playback of interval events (pause, step, speeds),
// the event log with reasons, and a short run with upgrades. Rules: ../rules/*.ts.
import {
  type Build,
  type CardId,
  type Command,
  type FightSetup,
  type GameEvent,
  type Priority,
  type State,
  BASE_BUILD,
  CARDS,
  KINDS,
  PRIORITIES,
  PRIORITY_TEXT,
  UTILITY,
  allies,
  apply,
  cardBlocked,
  cardTargets,
  clone,
  enemies,
  footprint,
  hashState,
  hero,
  name,
  newFight,
  oilCells,
  preview,
  threats,
  unitAt,
  unitById,
  wolf,
} from "../rules/combat.ts";
import { CELLS, type Cell, cellName, neighbor } from "../rules/hex.ts";
import { AUTHORED_COUNT, FIGHT_NAMES, authored, generate } from "../rules/encounters.ts";
import { NEAR_MARGIN, searchWindowPublic, strongDeploy } from "./helper.ts";
import { Stage, type Mark } from "./stage.ts";

const params = new URLSearchParams(location.search);
let FAST = params.has("fast");
const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

declare global {
  interface Window {
    __freeze?: number;
    __hex?: any;
  }
}

type Sel = null | { kind: "card"; index: number; first?: Cell } | { kind: "unit"; id: number };

const stage = new Stage($("view"), { shot: params.has("shot") });
await stage.load();

let S: State;
let setup: FightSetup;
let fightIndex = 0; // 0-5 hand-made, 6 = generated
let genSeed = Number(params.get("gen") ?? 1);
let fightSeed = Number(params.get("seed") ?? 1);
let sel: Sel = null;
let hover: Cell | null = null;
let hoverPrio: Priority | null = null;
let busy = false;
let paused = false;
let stepReq = false;
let speed = 1;
let auto = false;
let autoStats = { stopped: 0, waited: 0 };
let focus: GameEvent | null = null;
const undo: State[] = [];
let lastLog: GameEvent[] = [];
const shown = new Map<number, { hp: number; maxHp: number; block: number }>();
let run: { order: number[]; at: number; build: Build } | null = params.has("run")
  ? { order: [0, 2, 4, 5], at: 0, build: { ...BASE_BUILD } }
  : null;

// ---------------- fights --------------------------------------------------------------

function setupFor(i: number): FightSetup {
  return i < AUTHORED_COUNT
    ? authored(i)
    : generate(genSeed, Number(params.get("d") ?? 1 + (genSeed % 5)));
}

function startFight(i: number): void {
  fightIndex = i;
  setup = setupFor(i);
  S = newFight(setup, fightSeed, run?.build ?? BASE_BUILD);
  stage.clearUnits();
  stage.buildRoom(setup.arena);
  for (const u of S.units) stage.addUnit(u.id, u.kind, u.cell, u.side);
  sel = null;
  hover = null;
  focus = null;
  undo.length = 0;
  lastLog = [];
  autoStats = { stopped: 0, waited: 0 };
  syncShown();
  fightSel.value = String(Math.min(i, AUTHORED_COUNT));
  $("overlay").style.display = "none";
  refresh();
}

function syncShown(): void {
  shown.clear();
  for (const u of S.units)
    if (u.hp > 0) shown.set(u.id, { hp: u.hp, maxHp: u.maxHp, block: u.block });
}

const fightSel = $("fight") as HTMLSelectElement;
FIGHT_NAMES.forEach((n, i) => fightSel.add(new Option(`${i + 1}. ${n}`, String(i))));
fightSel.add(new Option("Generated fight", String(AUTHORED_COUNT)));
fightSel.onchange = () => {
  run = null;
  const v = Number(fightSel.value);
  if (v >= AUTHORED_COUNT) genSeed = Math.floor(Math.random() * 9000) + 1;
  startFight(v);
};
$("restart").onclick = () => startFight(fightIndex);

// ---------------- commands -------------------------------------------------------------

function act(cmd: Command): boolean {
  if (busy || S.over) return false;
  const before = clone(S);
  if (!apply(S, cmd)) return false;
  if (cmd.t !== "commit") undo.push(before);
  const evs = S.events;
  if (cmd.t === "card") {
    lastLog = evs;
    for (const e of evs) {
      if (e.t === "summon" && e.unit != null) {
        const u = unitById(S, e.unit)!;
        stage.addUnit(u.id, u.kind, u.cell, "A", true);
      }
      if ((e.t === "blaze" || e.t === "ignite") && e.cell != null) stage.burst(e.cell);
      if (e.t === "topple" && e.cell != null) stage.topple(e.cell);
    }
    for (const e of evs)
      if (e.t === "damage" && e.unit != null) pop(e.unit, `-${e.amount}`, "#ffb070");
    syncPositions();
  }
  if (cmd.t === "deploy") syncPositions();
  syncShown();
  sel = null;
  hover = null;
  refresh();
  if (S.over) showOver();
  return true;
}

function syncPositions(): void {
  for (const u of S.units) {
    if (u.hp <= 0) {
      if (stage.visuals.has(u.id)) stage.play(u.id, "death", now());
      continue;
    }
    if (!stage.visuals.has(u.id)) stage.addUnit(u.id, u.kind, u.cell, u.side, true);
    stage.place(u.id, u.cell);
  }
}

function doUndo(): void {
  if (busy || !undo.length) return;
  S = undo.pop()!;
  for (const id of stage.visuals.keys()) if (!unitById(S, id)) stage.removeUnit(id);
  for (const u of S.units)
    if (u.hp > 0 && !stage.visuals.has(u.id)) stage.addUnit(u.id, u.kind, u.cell, u.side);
  for (const c of S.arena.braziers) stage.brazierObjs.get(c)?.rotation.set(0, 0, 0);
  syncPositions();
  syncShown();
  sel = null;
  refresh();
}

const now = () => window.__freeze ?? performance.now() / 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, FAST ? ms * 0.15 : ms / speed));

async function waitTurn(): Promise<void> {
  while (paused && !stepReq) await new Promise((r) => setTimeout(r, 50));
  stepReq = false;
}

/** Commit: run the interval for real, then play its events back step by step. */
async function commit(): Promise<void> {
  if (busy || S.over) return;
  const before = clone(S);
  if (!apply(S, { t: "commit" })) return;
  busy = true;
  sel = null;
  hover = null;
  focus = null;
  undo.length = 0;
  const evs = S.events;
  lastLog = evs;
  stage.clearArrows();
  for (let c = 0; c < CELLS; c++) stage.setMark(c, null);
  refresh(before);
  await playback(evs, before);
  busy = false;
  syncPositions();
  syncShown();
  refresh();
  if (S.over) {
    showOver();
    return;
  }
  if (auto) void autoContinue();
}

/** Split an interval's events into steps: one per acting unit, plus the ground tick. */
function steps(evs: GameEvent[], before: State): GameEvent[][] {
  const out: GameEvent[][] = [];
  let cur: GameEvent[] = [];
  let actor: number | null = null;
  let ground = false;
  const sideOf = new Map(before.units.map((u) => [u.id, u.side]));
  for (const e of evs) {
    const acting = e.t === "move" || e.t === "attack" || e.t === "block" || e.t === "hold";
    const actorOf = e.t === "block" ? (e.target ?? null) : (e.unit ?? null);
    const isGround =
      e.t === "damage" &&
      (e.kind === "fire" || e.kind === "poison") &&
      !ground &&
      cur.length &&
      cur[cur.length - 1].t !== "move" &&
      cur[cur.length - 1].t !== "push" &&
      sideOf.size > 0;
    if (
      (acting && actorOf !== actor) ||
      e.t === "interval" ||
      (isGround && evs.indexOf(e) > evs.findLastIndex((x) => x.t === "attack" || x.t === "move"))
    ) {
      if (cur.length) out.push(cur);
      cur = [];
      actor = acting ? actorOf : null;
      if (isGround) ground = true;
    }
    cur.push(e);
  }
  if (cur.length) out.push(cur);
  return out;
}

async function playback(evs: GameEvent[], before: State): Promise<void> {
  const sideOf = new Map(before.units.map((u) => [u.id, u.side]));
  const cellOfUnit = new Map(before.units.map((u) => [u.id, u.cell]));
  for (const st of steps(evs, before)) {
    await waitTurn();
    const t = now();
    let dur = 520;
    for (const e of st) {
      if (e.t === "move" && e.unit != null && e.path) {
        stage.move(e.unit, e.path, t, (FAST ? 0.12 : 0.4 * e.path.length) / speed);
        cellOfUnit.set(e.unit, e.path[e.path.length - 1]);
        dur = Math.max(dur, 520 * e.path.length);
      }
      if (e.t === "push" && e.unit != null && e.path) {
        stage.move(e.unit, e.path, t + 0.25 / speed, (FAST ? 0.1 : 0.22 * e.path.length) / speed);
        cellOfUnit.set(e.unit, e.path[e.path.length - 1]);
      }
      if (e.t === "attack" && e.unit != null) {
        stage.play(e.unit, "attack", t);
        const tc = e.cell ?? (e.cells?.length ? e.cells[0] : null);
        if (tc != null) stage.faceTo(e.unit, tc);
        stage.clearArrows();
        if (sideOf.get(e.unit) === "A" && e.cell != null && e.from != null)
          stage.arrow([e.from, e.cell], "#ffd65a");
        if (sideOf.get(e.unit) === "E" && e.cells) for (const c of e.cells) stage.setThreat(c, 6);
        dur = 700;
      }
      if (e.t === "damage" && e.unit != null) {
        const sh = shown.get(e.unit);
        if (sh) sh.hp = e.hp ?? sh.hp;
        const id = e.unit;
        setTimeout(
          () => {
            stage.play(id, "hit", now());
            pop(
              id,
              `-${e.amount}`,
              e.kind === "fire" || e.kind === "poison" ? "#ffb070" : "#ff5a48",
            );
          },
          FAST ? 30 : 250 / speed,
        );
      }
      if (e.t === "block" && e.unit != null) {
        const sh = shown.get(e.unit);
        if (sh) sh.block += e.amount ?? 0;
        pop(e.unit, `+${e.amount} block`, "#8fd0ff");
      }
      if (e.t === "death" || e.t === "expire") {
        const id = e.unit!;
        setTimeout(() => stage.play(id, "death", now()), FAST ? 40 : 380 / speed);
      }
      if (e.t === "collide" && e.unit != null) pop(e.unit, "crash!", "#ffd65a");
      if (e.t === "wall" && e.unit != null) pop(e.unit, "wall slam!", "#ffd65a");
      if ((e.t === "blaze" || e.t === "ignite") && e.cell != null) {
        for (const c of e.cells ?? [e.cell]) {
          stage.burst(c);
          stage.setGround(c, {
            fire: 2,
            firePow: e.t === "blaze" ? 4 : 2,
            oil: 0,
            poison: 0,
            ward: 0,
          });
        }
      }
      if (e.t === "topple" && e.cell != null) stage.topple(e.cell);
    }
    focus = st.find((e) => e.text) ?? null;
    renderLog(st[0]);
    refreshLabels(before, true);
    await sleep(dur);
    for (let c = 0; c < CELLS; c++) stage.setThreat(c, 0);
    stage.clearArrows();
  }
  focus = null;
}

/** Auto-continue: commit while no card is worth playing; stop at a useful choice. */
async function autoContinue(): Promise<void> {
  while (auto && !S.over && !busy) {
    const r = searchWindowPublic(S);
    if (r.legal > 0 && r.gain >= NEAR_MARGIN) {
      autoStats.stopped++;
      $("sub").textContent = "Auto-continue stopped: a card is worth playing now.";
      return;
    }
    autoStats.waited++;
    await commit();
  }
}

function pop(unit: number, text: string, color: string): void {
  const p = stage.unitScreen(unit, (stage.visuals.get(unit)?.height ?? 2) * 0.6);
  if (!p) return;
  const el = document.createElement("div");
  el.className = "pop";
  el.textContent = text;
  el.style.color = color;
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  $("pops").appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function showOver(): void {
  const win = S.over === "win";
  $("otitle").textContent = win ? "Victory" : "Defeat";
  const h = hero(S),
    w = wolf(S);
  $("otext").innerHTML = win
    ? `${esc(S.name)} cleared in ${S.interval} intervals. Hero ${h?.hp ?? 0} HP, wolf ${w ? `${w.hp} HP` : "fell"}.`
    : `${esc(S.name)}: ${S.interval >= 15 ? "out of time" : "the hero fell"} after ${S.interval} intervals.`;
  const box = $("obuttons");
  box.innerHTML = "";
  const btn = (label: string, f: () => void) => {
    const b = document.createElement("button");
    b.className = "upg";
    b.textContent = label;
    b.onclick = f;
    box.appendChild(b);
  };
  if (run && win && run.at < run.order.length - 1) {
    const swap = UTILITY[(fightSeed + run.at * 3) % UTILITY.length];
    const offers: [string, (b: Build) => Build][] = [
      ["+1 hero basic damage", (b) => ({ ...b, heroDmg: b.heroDmg + 1 })],
      [
        "+2 wolf HP, guard block +1",
        (b) => ({ ...b, wolfHp: b.wolfHp + 2, guardBonus: b.guardBonus + 1 }),
      ],
      [`Replace a Strike with ${CARDS[swap].name}`, (b) => ({ ...b, swap })],
    ];
    $("otext").innerHTML += "<br><br>Pick one upgrade for the next fight:";
    for (const [label, f] of offers)
      btn(label, () => {
        run!.build = f(run!.build);
        run!.at++;
        startFight(run!.order[run!.at]);
      });
  } else if (run && win) {
    btn("Run complete: start over", () => {
      run = { order: [0, 2, 4, 5], at: 0, build: { ...BASE_BUILD } };
      startFight(0);
    });
  } else {
    btn(win ? "Next fight" : "Try again", () => {
      if (run && !win) run = { order: [0, 2, 4, 5], at: 0, build: { ...BASE_BUILD } };
      startFight(
        run ? run.order[run.at] : win ? Math.min(fightIndex + 1, AUTHORED_COUNT) : fightIndex,
      );
    });
  }
  $("overlay").style.display = "flex";
}

// ---------------- selection -------------------------------------------------------------

/** What a click on each cell would do right now. */
function candidates(): Map<Cell, Command | "pick"> {
  const out = new Map<Cell, Command | "pick">();
  if (busy || S.over) return out;
  if (sel?.kind === "unit" && S.phase === "deploy" && S.played === 0) {
    const u = unitById(S, sel.id);
    if (u && (u.kind === "hero" || u.kind === "wolf"))
      for (const c of S.arena.entry) out.set(c, { t: "deploy", unit: u.kind, cell: c });
    return out;
  }
  if (sel?.kind !== "card") return out;
  const id = S.hand[sel.index];
  if (!id || cardBlocked(S, id)) return out;
  const ts = cardTargets(S, id);
  if (id === "reposition") {
    if (sel.first == null) for (const t of ts) out.set(t.target, "pick");
    else
      for (const t of ts)
        if (t.target === sel.first) out.set(t.dest!, { t: "card", index: sel.index, ...t });
  } else if (id === "oil") {
    if (sel.first == null) for (const t of ts) out.set(t.target, "pick");
    else
      for (const t of ts)
        if (t.target === sel.first)
          out.set(neighbor(t.target, t.dir!), { t: "card", index: sel.index, ...t });
  } else for (const t of ts) out.set(t.target, { t: "card", index: sel.index, ...t });
  return out;
}

function clickCell(c: Cell): void {
  if (busy || S.over) return;
  const cand = candidates().get(c);
  if (cand === "pick" && sel?.kind === "card") {
    sel = { ...sel, first: c };
    refresh();
    return;
  }
  if (cand && cand !== "pick") {
    act(cand);
    return;
  }
  const u = unitAt(S, c);
  sel = u ? { kind: "unit", id: u.id } : null;
  refresh();
}

function selectCard(i: number): void {
  if (busy || S.over || !S.hand[i]) return;
  sel = sel?.kind === "card" && sel.index === i ? null : { kind: "card", index: i };
  refresh();
}

function setPriority(p: Priority): void {
  if (busy || S.over || S.priority === p) return;
  act({ t: "priority", mode: p });
}

// ---------------- HUD ---------------------------------------------------------------------

function renderHand(): void {
  $("hand").innerHTML = S.hand
    .map((id, i) => {
      const c = CARDS[id];
      const why = busy || S.over ? "" : cardBlocked(S, id);
      const cls = [
        "card",
        `cat-${c.cat}`,
        sel?.kind === "card" && sel.index === i ? "sel" : "",
        why ? "off" : "",
      ].join(" ");
      return `<div class="${cls}" data-card="${i}"><div class="cost">${c.cost}</div><div class="cname">${esc(c.name)}</div><div class="cat">${c.cat}</div><div class="ctext">${esc(c.text)}</div>${why ? `<div class="why">${esc(why)}</div>` : ""}</div>`;
    })
    .join("");
  for (const el of $("hand").querySelectorAll<HTMLElement>(".card"))
    el.onclick = (ev) => {
      ev.stopPropagation();
      selectCard(Number(el.dataset.card));
    };
  $("energy").innerHTML = `${S.energy}<small>energy</small>`;
  const end = $("end") as HTMLButtonElement;
  end.textContent =
    S.phase === "deploy" ? "Start fight" : S.played ? "Commit interval" : "Pass: commit interval";
  end.disabled = busy || !!S.over;
  ($("undo") as HTMLButtonElement).disabled = busy || !undo.length;
  $("pause").textContent = paused ? "Play" : "Pause";
  $("pause").classList.toggle("on", paused);
  $("auto").classList.toggle("on", auto);
  for (const b of document.querySelectorAll<HTMLElement>("[data-speed]"))
    b.classList.toggle("on", Number(b.dataset.speed) === speed);
}

function renderPrio(): void {
  const w = wolf(S);
  const p = $("prio");
  p.innerHTML =
    `<div class="ph">Wolf priority</div>` +
    (w
      ? PRIORITIES.map(
          (m) =>
            `<button class="prio ${S.priority === m ? "on" : ""}" data-prio="${m}"><b>${m === "lowest" ? "Lowest HP" : m[0].toUpperCase() + m.slice(1)}</b><br>${esc(PRIORITY_TEXT[m].split(": ")[1])}</button>`,
        ).join("")
      : `<div class="help">The wolf is down.</div>`);
  for (const b of p.querySelectorAll<HTMLElement>("[data-prio]")) {
    b.onclick = () => setPriority(b.dataset.prio as Priority);
    b.onmouseenter = () => {
      hoverPrio = b.dataset.prio as Priority;
      refresh();
    };
    b.onmouseleave = () => {
      hoverPrio = null;
      refresh();
    };
  }
}

function renderUnitPanel(view: State, pv: State | null): void {
  const p = $("unitpanel");
  const id = sel?.kind === "unit" ? sel.id : hover != null ? unitAt(S, hover)?.id : undefined;
  const u = id != null ? unitById(view, id) : undefined;
  if (!u) {
    const how =
      S.phase === "deploy"
        ? "<b>Deploy:</b> click the hero or the wolf, then a blue hex in the two entry columns. Pick the wolf's priority above. You may play <b>one opening card</b>. Then <b>Start fight</b>."
        : "<b>Window:</b> play up to <b>two cards</b> (3 energy) or pass. The arrows and red hexes are exactly what the next interval will do. Hover a target to see the new result first.";
    p.innerHTML = `<div class="ph">${S.phase === "deploy" ? "Deployment" : `After interval ${S.interval}`}</div><div class="help">${how}</div><div id="cellinfo" class="help" style="margin-top:6px"></div><div id="source" style="margin-top:6px">Room: ${esc(S.arena.source)}</div>`;
    renderCellInfo(view);
    return;
  }
  const k = KINDS[u.kind];
  let h = `<div class="ph">${esc(k.name)} <span class="help">${cellName(u.cell)}</span></div>`;
  h += `<div>HP ${u.hp}/${u.maxHp}${u.block ? `, block ${u.block}` : ""}${u.ttl > 0 ? `, ${u.ttl} intervals left` : ""}</div>`;
  h += `<div class="help">${esc(k.text)}</div>`;
  if (u.side === "E" && u.intent) {
    const cells = footprint(view, u);
    h += `<div style="margin-top:4px"><b>Next:</b> ${esc(u.intent.kind)} ${u.intent.damage} on ${cells.map(cellName).join(" ")}<br><span class="help">aimed: ${esc(u.intent.aim)}</span></div>`;
  }
  if (pv) {
    const mine = pv.events.filter((e) => (e.unit === u.id || e.target === u.id) && e.text);
    if (mine.length)
      h += `<div style="margin-top:4px"><b>Next interval:</b>${mine.map((e) => `<div class="ev">${esc(e.text)}</div>`).join("")}</div>`;
  }
  if (S.phase === "deploy" && (u.kind === "hero" || u.kind === "wolf") && S.played === 0)
    h += `<div class="help" style="margin-top:4px">Click a blue hex to deploy it there.</div>`;
  p.innerHTML = h;
}

function renderCellInfo(view: State): void {
  const el = document.getElementById("cellinfo");
  if (!el || hover == null) return;
  const g = view.ground[hover];
  const parts: string[] = [cellName(hover)];
  if (view.arena.blocked[hover])
    parts.push(view.braziers.includes(hover) ? "brazier (push a unit into it: fire)" : "wall");
  if (g.fire) parts.push(`${g.firePow > 2 ? "blaze" : "fire"} ${g.firePow}, ${g.fire} left`);
  if (g.oil) parts.push(`oil, ${g.oil} left`);
  if (g.poison) parts.push(`poison, ${g.poison} left`);
  if (g.ward) parts.push(`ward, ${g.ward} left`);
  for (const t of threats(view))
    if (t.cells.includes(hover))
      parts.push(`in ${name(t.enemy.kind)}'s ${t.enemy.intent!.kind} (${t.damage})`);
  el.textContent = parts.join(" · ");
}

function evClass(e: GameEvent, view: State): string {
  if (e.t === "interval") return "head";
  if (e.kind === "fire" || e.kind === "poison" || e.t === "blaze" || e.t === "ignite") return "hz";
  const u = e.unit != null ? view.units.find((x) => x.id === e.unit) : null;
  if (e.t === "damage") return u?.side === "A" ? "foe" : "ally";
  return u?.side === "A" ? "ally" : u?.side === "E" ? "foe" : "";
}

function renderLog(active?: GameEvent): void {
  const evs = lastLog.filter((e) => e.text);
  $("preview").innerHTML =
    `<div class="ph">${busy ? "Playing" : "Last"}: event log</div>` +
    evs
      .map(
        (e, k) =>
          `<div class="ev ${evClass(e, S)} ${e === active || e === focus ? "on" : ""}" data-ev="${k}">${esc(e.text)}</div>`,
      )
      .join("");
  wireLog(evs);
  const on = $("preview").querySelector(".ev.on");
  if (on) (on as HTMLElement).scrollIntoView({ block: "nearest" });
}

function wireLog(evs: GameEvent[]): void {
  for (const el of $("preview").querySelectorAll<HTMLElement>("[data-ev]")) {
    el.onclick = () => {
      focus = evs[Number(el.dataset.ev)];
      refresh();
    };
  }
}

function previewPanel(title: string, cardEvs: GameEvent[], pv: State): void {
  const rows: string[] = [];
  if (cardEvs.length)
    rows.push(
      ...cardEvs
        .filter((e) => e.text)
        .map((e) => `<div class="ev ${evClass(e, S)}">${esc(e.text)}</div>`),
    );
  const evs = pv.events.filter((e) => e.text && e.t !== "interval");
  const h = hero(pv),
    w = wolf(pv);
  const sum = pv.over
    ? `<div class="ev head">${pv.over === "win" ? "Wins the fight" : "The fight is lost"}</div>`
    : `<div class="help">After it: hero ${h?.hp ?? 0} HP, wolf ${w ? `${w.hp} HP` : "down"}, ${enemies(pv).length} enemies left</div>`;
  $("preview").innerHTML =
    `<div class="ph">${esc(title)}</div>${rows.join("")}<div class="ph" style="margin-top:4px">Next interval (exact)</div>` +
    evs
      .map(
        (e, k) =>
          `<div class="ev ${evClass(e, pv)} ${e === focus ? "on" : ""}" data-ev="${k}">${esc(e.text)}</div>`,
      )
      .join("") +
    sum;
  wireLog(evs);
}

// Labels over units: name, HP (pale part = what the next interval takes), block, intent.
function refreshLabels(view: State, playing = false, pv: State | null = null): void {
  const labels = $("labels");
  const present = new Set<string>();
  const incoming = new Map<number, number>();
  if (pv)
    for (const e of pv.events)
      if (e.t === "damage" && e.unit != null)
        incoming.set(e.unit, (incoming.get(e.unit) ?? 0) + (e.amount ?? 0));
  const inspect = sel?.kind === "unit" ? sel.id : hover != null ? unitAt(S, hover)?.id : undefined;
  for (const v of stage.visuals.values()) {
    const key = `u${v.id}`;
    const u = view.units.find((x) => x.id === v.id);
    if (!u) continue;
    if (!playing && u.hp <= 0) continue;
    present.add(key);
    let el = labels.querySelector<HTMLElement>(`[data-k="${key}"]`);
    if (!el) {
      el = document.createElement("div");
      el.dataset.k = key;
      el.className = `ulabel ${u.side === "A" ? "P" : "E"}`;
      el.onclick = (ev) => {
        ev.stopPropagation();
        const uu = unitById(S, v.id);
        if (uu) clickCell(uu.cell);
      };
      el.onmouseenter = () => {
        const uu = unitById(S, v.id);
        if (uu && hover !== uu.cell) {
          hover = uu.cell;
          refresh();
        }
      };
      labels.appendChild(el);
    }
    const sh = playing ? shown.get(v.id) : { hp: u.hp, maxHp: u.maxHp, block: u.block };
    if (!sh) continue;
    const after = pv ? Math.max(0, pv.units.find((x) => x.id === v.id)?.hp ?? 0) : sh.hp;
    const pct = (Math.max(0, after) / sh.maxHp) * 100;
    const ghost = (Math.max(0, sh.hp - after) / sh.maxHp) * 100;
    let chips = "";
    if (!playing && u.side === "E" && u.intent && u.hp > 0)
      chips += `<span class="chip">${esc(u.intent.kind)} ${u.intent.damage}</span>`;
    if (!playing && u.side === "A" && incoming.get(u.id))
      chips += `<span class="chip inc">-${incoming.get(u.id)}</span>`;
    let detail = "";
    if (!playing && inspect === v.id && pv) {
      const mine = pv.events.filter(
        (e) => e.unit === u.id && e.text && (e.t === "attack" || e.t === "move" || e.t === "hold"),
      );
      const bits = mine.map((e) => e.text);
      if (u.side === "E" && u.intent) bits.unshift(`aims: ${u.intent.aim}`);
      if (bits.length) detail = `<div class="detail">${bits.map(esc).join("<br>")}</div>`;
    }
    const isSel = (sel?.kind === "unit" && sel.id === v.id) || inspect === v.id;
    el.classList.toggle("sel", !!isSel);
    el.innerHTML = `${detail}${chips ? `<div>${chips}</div>` : ""}<div class="uname">${esc(name(u.kind))}${sh.block ? `<span class="block">${sh.block}</span>` : ""}</div><div class="hpbar"><div class="hpfill" style="width:${pct}%"></div><div class="hpghost" style="left:${pct}%;width:${ghost}%"></div><div class="hptxt">${Math.max(0, sh.hp)} / ${sh.maxHp}</div></div>`;
  }
  for (const el of [...labels.children] as HTMLElement[])
    if (!present.has(el.dataset.k!)) el.remove();
}

// Damage numbers on threatened hexes.
function refreshCellLabels(view: State | null): void {
  const box = $("cellLabels");
  box.innerHTML = "";
  if (!view) return;
  const dmg = new Map<Cell, number>();
  for (const t of threats(view)) {
    const cells =
      t.enemy.intent!.kind === "ray"
        ? t.cells.slice(0, t.firstHit != null ? t.cells.indexOf(t.firstHit) + 1 : t.cells.length)
        : t.cells;
    for (const c of cells) if (!view.arena.blocked[c]) dmg.set(c, (dmg.get(c) ?? 0) + t.damage);
  }
  for (const [c, d] of dmg) {
    const el = document.createElement("div");
    el.className = "clabel";
    el.dataset.cell = String(c);
    el.innerHTML = `<span class="threat">-${d}</span>`;
    box.appendChild(el);
  }
}

/** Overlays for the next interval: ally paths and attacks, enemy footprints and moves. */
function drawPreview(view: State, pv: State): void {
  stage.clearArrows();
  for (let c = 0; c < CELLS; c++) stage.setThreat(c, 0);
  for (const t of threats(view)) {
    const cells =
      t.enemy.intent!.kind === "ray"
        ? t.cells.slice(0, t.firstHit != null ? t.cells.indexOf(t.firstHit) + 1 : t.cells.length)
        : t.cells;
    for (const c of cells) if (!view.arena.blocked[c]) stage.setThreat(c, t.damage);
  }
  const side = new Map(pv.units.map((u) => [u.id, u.side]));
  for (const e of pv.events) {
    const sd = e.unit != null ? side.get(e.unit) : undefined;
    if (e.t === "move" && e.path && e.from != null)
      stage.arrow([e.from, ...e.path], sd === "A" ? "#8fd0ff" : "#ff7a6a", { dashed: sd === "E" });
    if (e.t === "attack" && sd === "A" && e.from != null && e.cell != null)
      stage.arrow([e.from, e.cell], "#ffd65a", { y: 0.11, width: 0.1 });
    if (e.t === "push" && e.path && e.from != null)
      stage.arrow([e.from, ...e.path], "#ffa040", { y: 0.12, width: 0.12 });
  }
  if (focus) {
    for (const c of [focus.from, focus.cell, ...(focus.cells ?? []), ...(focus.path ?? [])])
      if (c != null && c >= 0) stage.setMark(c, "focus");
  }
}

function refresh(view?: State): void {
  const v = view ?? S;
  renderHand();
  renderPrio();
  const cand = candidates();
  // view state: the real state, or after the hovered command
  let V: State = S;
  let cardEvs: GameEvent[] = [];
  let title = S.phase === "deploy" ? "Opening" : `Window ${S.interval}`;
  const hc = hover != null ? cand.get(hover) : undefined;
  if (!busy && hc && hc !== "pick") {
    V = clone(S);
    apply(V, hc);
    cardEvs = V.events;
    title =
      hc.t === "deploy"
        ? `Deploy ${hc.unit} on ${cellName(hc.cell)}`
        : hc.t === "card"
          ? `${CARDS[S.hand[hc.index]].name} → ${cellName(hover!)}`
          : title;
  } else if (!busy && hoverPrio && hoverPrio !== S.priority && wolf(S)) {
    V = clone(S);
    apply(V, { t: "priority", mode: hoverPrio });
    title = `Wolf priority: ${hoverPrio}`;
  }
  // marks
  for (let c = 0; c < CELLS; c++) {
    let m: Mark = null;
    if (!busy && !S.over) {
      if (
        S.phase === "deploy" &&
        S.played === 0 &&
        S.arena.entry.includes(c) &&
        !(sel?.kind === "card")
      )
        m = "entry";
      if (cand.has(c)) m = hover === c ? "hover" : "target";
      if (sel?.kind === "card" && sel.first === c) m = "select";
      if (sel?.kind === "unit" && unitById(S, sel.id)?.cell === c) m = "select";
      if (
        sel?.kind === "card" &&
        S.hand[sel.index] === "oil" &&
        sel.first != null &&
        hc &&
        hc !== "pick" &&
        hc.t === "card"
      )
        if (oilCells(S, hc).includes(c)) m = "hover";
    }
    stage.setMark(c, m);
  }
  for (let c = 0; c < CELLS; c++) stage.setGround(c, (busy ? v : V).ground[c]);
  if (busy) {
    refreshLabels(v, true);
    refreshCellLabels(null);
  } else if (!S.over) {
    const pv = preview(V);
    drawPreview(V, pv);
    refreshLabels(V, false, pv);
    refreshCellLabels(V);
    if (sel?.kind === "card" && !hc) {
      const id = S.hand[sel.index];
      const step2 = sel.first != null;
      $("preview").innerHTML =
        `<div class="ph">${esc(CARDS[id].name)}: pick ${id === "reposition" ? (step2 ? "where it goes" : "an ally") : id === "oil" ? (step2 ? "a neighbour (the third hex is the next one round)" : "the centre hex") : "a target"}</div><div class="help">Lit hexes are legal. Hover one to see the exact result and the next interval with it. Right-click or Esc cancels.</div>`;
    } else previewPanel(title, cardEvs, pv);
    renderUnitPanel(V, pv);
  } else {
    stage.clearArrows();
    refreshLabels(S);
    refreshCellLabels(null);
    renderLog();
    renderUnitPanel(S, null);
  }
  const h = hero(S);
  $("banner").textContent = S.over
    ? S.over === "win"
      ? "Victory"
      : "Defeat"
    : busy
      ? `Interval ${S.interval}`
      : S.phase === "deploy"
        ? "Deploy your squad"
        : `Window after interval ${S.interval} · plan`;
  $("banner").className = busy ? "enemy" : "";
  if (!(auto && $("sub").textContent?.startsWith("Auto")))
    $("sub").textContent =
      `${S.name} · hero ${h?.hp ?? 0} HP · ${enemies(S).length} enemies · deck ${S.deck.length}, discard ${S.discard.length}${auto ? ` · auto: waited ${autoStats.waited}, stopped ${autoStats.stopped}` : ""}`;
}

// ---------------- input -----------------------------------------------------------------

const canvas = stage.renderer.domElement;
canvas.addEventListener("click", (ev) => {
  const c = stage.pick(ev.clientX, ev.clientY);
  if (c != null) clickCell(c);
  else {
    sel = null;
    refresh();
  }
});
canvas.addEventListener("mousemove", (ev) => {
  const c = stage.pick(ev.clientX, ev.clientY);
  if (c === hover) return;
  hover = c;
  if (!busy) refresh();
});
canvas.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  sel = null;
  refresh();
});
addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    sel = null;
    refresh();
  } else if (ev.key === "Enter" || ev.key === "e" || ev.key === "E") void commit();
  else if (ev.key === " ") {
    paused = !paused;
    refresh();
  } else if (ev.key === "s" || ev.key === "S") stepReq = true;
  else if (ev.key === "z" && (ev.ctrlKey || ev.metaKey)) doUndo();
  else {
    const n = Number(ev.key);
    if (n >= 1 && n <= S.hand.length) selectCard(n - 1);
  }
});
$("end").onclick = () => void commit();
$("undo").onclick = () => doUndo();
$("pause").onclick = () => {
  paused = !paused;
  refresh();
};
$("step").onclick = () => {
  stepReq = true;
  if (!busy && !S.over) {
    paused = true;
    void commit();
  }
};
for (const b of document.querySelectorAll<HTMLElement>("[data-speed]"))
  b.onclick = () => {
    speed = Number(b.dataset.speed);
    refresh();
  };
$("auto").onclick = () => {
  auto = !auto;
  refresh();
  if (auto) void autoContinue();
};

// ---------------- frame loop ------------------------------------------------------------

const frameTimes: number[] = [];
let lastFrame = performance.now();
function frame(): void {
  const t = performance.now();
  frameTimes.push(t - lastFrame);
  if (frameTimes.length > 240) frameTimes.shift();
  lastFrame = t;
  const n = now();
  stage.update(n);
  for (const el of $("labels").children as HTMLCollectionOf<HTMLElement>) {
    const p = stage.unitScreen(Number(el.dataset.k!.slice(1)));
    if (p) {
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
    }
  }
  for (const el of $("cellLabels").children as HTMLCollectionOf<HTMLElement>) {
    const p = stage.cellScreen(Number(el.dataset.cell), 0.2);
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
  }
  stage.render(n);
  requestAnimationFrame(frame);
}

const startAt = params.has("gen")
  ? AUTHORED_COUNT
  : Math.max(0, Number(params.get("fight") ?? 1) - 1);
startFight(run ? run.order[0] : startAt);
requestAnimationFrame(frame);

// Debug handle for the headless screenshot script and for watching the bot play.
window.__hex = {
  state: () => S,
  busy: () => busy,
  start: (i: number, seed?: number) => {
    if (seed != null) fightSeed = seed;
    startFight(i);
  },
  act,
  commit,
  click: clickCell,
  selectCard,
  hover: (c: Cell | null) => {
    hover = c;
    refresh();
  },
  setHand: (cards: CardId[]) => {
    S.hand = cards;
    refresh();
  },
  clear: () => {
    sel = null;
    hover = null;
    focus = null;
    refresh();
  },
  setFast: (on: boolean) => (FAST = on),
  setSpeed: (x: number) => (speed = x),
  setPaused: (p: boolean) => {
    paused = p;
    refresh();
  },
  step: () => (stepReq = true),
  /** The strong bot's deployment (deploy phase) or window plays, without committing. */
  botPlan: () => {
    if (S.phase === "deploy") for (const c of strongDeploy(S)) act(c);
    for (const c of searchWindowPublic(S).cmds) act(c);
  },

  cellScreen: (c: Cell) => stage.cellScreen(c, 0.3),
  cands: () => [...candidates().keys()],
  hash: () => hashState(S),
  frameTimes: () => [...frameTimes],
  allies: () => allies(S).map((u) => ({ id: u.id, kind: u.kind, cell: u.cell, hp: u.hp })),
};
