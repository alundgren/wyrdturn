// Game layer: wires the pure rules to the 3D view and the HUD. Mouse first: click a card,
// then a lit cell; hover any lit cell to see exactly what will happen before you commit.
import {
  type Action,
  type CardId,
  type Cell,
  type GameEvent,
  type State,
  CARDS,
  LANES,
  MAX_ROUNDS,
  NAMES,
  ROWS,
  WOLF_COOLDOWN,
  apply,
  canPlay,
  cardTargets,
  clone,
  describeIntent,
  endTurn,
  groundAt,
  hero,
  legalActions,
  newFight,
  stateHash,
  threats,
  unitAt,
  unitById,
  wolf,
} from "../rules/combat.ts";
import { FIGHTS, generate } from "../rules/encounters.ts";
import { Stage, cellPos } from "./stage.ts";

const params = new URLSearchParams(location.search);
const SHOT = params.has("shot");
const $ = (id: string) => document.getElementById(id)!;

function encounter() {
  if (params.has("gen"))
    return generate(
      Number(params.get("gen")),
      params.has("d") ? Number(params.get("d")) : undefined,
    );
  const n = Math.min(FIGHTS.length, Math.max(1, Number(params.get("fight") ?? 1)));
  return FIGHTS[n - 1];
}

const stage = new Stage($("view"), { shot: SHOT });
let s: State;
let busy = false;
// what the player is about to do: a card waiting for a target, a wolf shove, a totem ward
type Pending = { t: "card"; idx: number } | { t: "ward"; id: number } | null;
let pending: Pending = null;
let hoverAction: Action | null = null;
let hoverEnd = false;
let view: State | null = null; // preview state (after the hovered action) or null

const LANE_NAME = ["left", "middle", "right"];
const cellName = (c: Cell) =>
  c.row === 0 ? `${LANE_NAME[c.lane]} line cell` : `${LANE_NAME[c.lane]} lane, row ${c.row}`;

// ---------------- setup -------------------------------------------------------------

async function main() {
  await stage.load();
  const sel = $("fight") as HTMLSelectElement;
  FIGHTS.forEach((f, i) => sel.add(new Option(`${i + 1}. ${f.name}`, String(i + 1))));
  if (params.has("gen")) sel.add(new Option(`Generated ${params.get("gen")}`, "gen", true, true));
  else sel.value = String(Math.min(FIGHTS.length, Math.max(1, Number(params.get("fight") ?? 1))));
  sel.onchange = () => {
    location.search = sel.value === "gen" ? location.search : `?fight=${sel.value}`;
  };
  $("restart").onclick = () => start();
  $("oagain").onclick = () => start();
  $("end").onclick = () => void doEnd();
  $("end").onmouseenter = () => {
    hoverEnd = true;
    refreshPreview();
  };
  $("end").onmouseleave = () => {
    hoverEnd = false;
    refreshPreview();
  };
  $("stepL").onclick = () => void heroStep(-1);
  $("stepR").onclick = () => void heroStep(1);
  for (const [id, dir] of [
    ["stepL", -1],
    ["stepR", 1],
  ] as const) {
    $(id).onmouseenter = () => setHover(stepAction(dir));
    $(id).onmouseleave = () => setHover(null);
  }
  addEventListener("mousemove", onMove);
  addEventListener("click", onClick);
  addEventListener("contextmenu", (e) => {
    e.preventDefault();
    cancel();
  });
  addEventListener("keydown", onKey);
  start();
  requestAnimationFrame(loop);
}

function start() {
  for (const id of stage.visuals.keys()) stage.removeUnit(id); // deleting during Map iteration is safe
  labels.clear();
  $("labels").innerHTML = "";
  $("overlay").style.display = "none";
  s = newFight(encounter(), Number(params.get("seed") ?? 1));
  pending = null;
  hoverAction = null;
  busy = false;
  for (const u of s.units) stage.addUnit(u.id, u.kind, u.lane, u.row);
  stage.setHeroLane(hero(s)!.lane, true);
  sync();
}

// ---------------- labels ------------------------------------------------------------

interface Label {
  el: HTMLDivElement;
  intent: HTMLDivElement;
  fill: HTMLElement;
  ghost: HTMLElement;
  btn: HTMLButtonElement;
}
const labels = new Map<number, Label>();

function labelFor(id: number): Label {
  let l = labels.get(id);
  if (l) return l;
  const u = unitById(s, id)!;
  const el = document.createElement("div");
  el.className = `ul ${u.side === "P" ? "ally" : ""}`;
  el.innerHTML = `<div class="intent"></div><div class="uname">${NAMES[u.kind]}</div><div class="hp"><i></i><b></b></div><button style="display:none"></button>`;
  $("labels").appendChild(el);
  const btn = el.querySelector("button") as HTMLButtonElement;
  btn.onclick = (e) => {
    e.stopPropagation();
    summonButton(id);
  };
  btn.onmouseenter = () => {
    const u2 = unitById(s, id);
    if (u2?.kind === "servant") setHover({ t: "ability", id, ab: "bash" });
  };
  btn.onmouseleave = () => setHover(null);
  l = {
    el,
    intent: el.querySelector(".intent") as HTMLDivElement,
    fill: el.querySelector(".hp i") as HTMLElement,
    ghost: el.querySelector(".hp b") as HTMLElement,
    btn,
  };
  labels.set(id, l);
  return l;
}

function summonButton(id: number) {
  if (busy || s.over) return;
  const u = unitById(s, id);
  if (!u) return;
  if (u.kind === "servant") void act({ t: "ability", id, ab: "bash" });
  else if (u.kind === "totem") {
    pending = { t: "ward", id };
    sync();
  }
}

// HP bars with the preview's loss shown pale.
function setBar(fill: HTMLElement, ghost: HTMLElement, hp: number, max: number, after: number) {
  const a = Math.max(0, hp) / max,
    b = Math.max(0, after) / max;
  fill.style.width = `${b * 100}%`;
  ghost.style.left = `${b * 100}%`;
  ghost.style.width = `${Math.max(0, a - b) * 100}%`;
}

const cellLabels: HTMLDivElement[] = [];
function updateOverlay() {
  const st = view ?? s;
  for (const [id, l] of labels) {
    const u = unitById(s, id);
    const v = stage.visuals.get(id);
    if (!u || !v) {
      l.el.style.display = "none";
      continue;
    }
    const p = stage.unitScreen(id, stage.unitTop(id, u.kind) + 0.15);
    if (!p || p.behind) {
      l.el.style.display = "none";
      continue;
    }
    l.el.style.display = "";
    l.el.style.left = `${p.x}px`;
    // keep far labels on screen (they hang above the anchor point)
    l.el.style.top = `${Math.max(p.y, l.el.offsetHeight + 4)}px`;
    const after = unitById(st, id);
    setBar(l.fill, l.ghost, u.hp, u.maxHp, after ? after.hp : 0);
    if (u.side === "E") {
      const pu = after ?? u;
      const txt = after ? describeIntent(st, pu) : "dies";
      l.intent.textContent = txt;
      const it = pu.intent;
      const calm = !it || it.t === "move" || it.t === "wait";
      l.intent.className = `intent ${!after ? "off" : calm ? "calm" : ""}`;
      l.intent.style.display = "";
    } else l.intent.style.display = "none";
    // summon buttons
    if (u.kind === "servant" || u.kind === "totem") {
      const can = !busy && !s.over && legalActions(s).some((a) => a.t === "ability" && a.id === id);
      l.btn.style.display = can ? "" : "none";
      l.btn.textContent = u.kind === "servant" ? "Bash 3 + push" : "Ward a line cell";
      l.btn.className = pending?.t === "ward" && pending.id === id ? "sel" : "";
    } else l.btn.style.display = "none";
  }
  // damage numbers on red cells
  const sums = new Map<number, { dmg: number; lob: boolean }>();
  for (const t of threats(st)) {
    const k = t.cell.lane + t.cell.row * LANES;
    const o = sums.get(k) ?? { dmg: 0, lob: false };
    o.dmg += t.dmg;
    o.lob ||= !!t.lob;
    sums.set(k, o);
  }
  let i = 0;
  for (const [k, o] of sums) {
    const lane = k % LANES,
      row = Math.floor(k / LANES);
    let el = cellLabels[i];
    if (!el) {
      el = document.createElement("div");
      $("cells").appendChild(el);
      cellLabels.push(el);
    }
    const p = stage.cellScreen(lane, row, 0.15);
    el.className = `dmg ${o.lob ? "lob" : ""}`;
    el.textContent = `-${o.dmg}`;
    el.style.display = p.behind ? "none" : "";
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    i++;
  }
  for (; i < cellLabels.length; i++) cellLabels[i].style.display = "none";
  // hero bar
  const h = hero(s);
  const hv = view ? hero(view) : h;
  setBar(
    $("herohpbar").querySelector("i")!,
    $("herohpbar").querySelector("b")!,
    h?.hp ?? 0,
    30,
    hv?.hp ?? 0,
  );
  $("herohp").textContent = `${h?.hp ?? 0} / 30`;
}

function pop(x: number, y: number, text: string, color: string) {
  const el = document.createElement("div");
  el.className = "pop";
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.color = color;
  $("pops").appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

// ---------------- sync state to view ------------------------------------------------

function sync() {
  const st = view ?? s;
  for (let row = 0; row <= ROWS; row++)
    for (let lane = 0; lane < LANES; lane++) {
      stage.setGround(lane, row, groundAt(st, lane, row));
      stage.setRed(lane, row, false);
      stage.setMark(lane, row, null);
    }
  for (const t of threats(st)) stage.setRed(t.cell.lane, t.cell.row, true);
  for (const c of targetCells()) stage.setMark(c.lane, c.row, "target");
  if (hoverCell) {
    const a = actionAt(hoverCell);
    if (a) stage.setMark(hoverCell.lane, hoverCell.row, a.t === "step" ? "step" : "hover");
  }
  for (const u of s.units) {
    if (!stage.visuals.has(u.id)) stage.addUnit(u.id, u.kind, u.lane, u.row, true);
    const v = stage.visuals.get(u.id);
    if (v && v.moveDur === 0 && !v.to.equals(cellPos(u.lane, u.row)))
      stage.moveUnit(u.id, u.lane, u.row, performance.now() / 1000);
    labelFor(u.id);
  }
  const h = hero(s);
  if (h) stage.setHeroLane(h.lane);
  renderHud();
}

function targetCells(): Cell[] {
  if (busy || s.over) return [];
  if (pending?.t === "card") return cardTargets(s, s.hand[pending.idx]);
  if (pending?.t === "ward")
    return [0, 1, 2].map((lane) => ({ lane, row: 0 })).filter((c) => !groundAt(s, c.lane, 0).ward);
  return [];
}

// The action a click on this cell would do right now.
function actionAt(c: Cell): Action | null {
  if (busy || s.over) return null;
  if (pending?.t === "card") {
    const ok = cardTargets(s, s.hand[pending.idx]).some(
      (x) => x.lane === c.lane && x.row === c.row,
    );
    return ok ? { t: "card", idx: pending.idx, cell: c } : null;
  }
  if (pending?.t === "ward")
    return { t: "ability", id: pending.id, ab: "ward", cell: { lane: c.lane, row: 0 } };
  const h = hero(s);
  if (h && c.row === 0 && Math.abs(c.lane - h.lane) === 1) return stepAction(c.lane - h.lane);
  return null;
}

function stepAction(dir: number): Action | null {
  const h = hero(s);
  if (!h) return null;
  const a: Action = { t: "step", id: h.id, dir };
  return legalActions(s).some((b) => b.t === "step" && b.id === h.id && b.dir === dir) ? a : null;
}

// ---------------- HUD ---------------------------------------------------------------

function reachGrid(card: CardId): string {
  // rows 5..0 top to bottom, lanes left to right; the hero stands in the middle lane
  const def = CARDS[card];
  const lit = (lane: number, row: number) => {
    if (row === 0) return def.reach === "line" && lane !== 1;
    switch (def.reach) {
      case "front":
        return lane === 1 && row === 1;
      case "pierce":
        return lane === 1 && row <= 2;
      case "near":
        return lane === 1 && row <= 4;
      case "lane":
        return lane === 1;
      case "lob":
        return card === "frost" ? row <= 3 : card === "miasma" ? row >= 2 : true;
      case "place":
        return row <= 2;
      case "line":
        return row <= 1;
    }
    return false;
  };
  let html = "";
  for (let row = ROWS; row >= 0; row--)
    for (let lane = 0; lane < LANES; lane++)
      html += `<i class="${row === 0 && lane === 1 ? "h" : lit(lane, row) ? "r" : row === 0 ? "p" : ""}"></i>`;
  return `<div class="reach">${html}</div>`;
}

function renderHud() {
  const enemyTurn = busy && !s.over;
  $("banner").textContent = s.over
    ? s.over === "win"
      ? "Victory"
      : "Defeat"
    : enemyTurn
      ? "Enemy turn"
      : `Your turn · round ${s.round}`;
  $("banner").className = enemyTurn ? "enemy" : "";
  $("sub").textContent = `${s.name} · round limit ${MAX_ROUNDS}`;
  const next = s.waves
    .filter((w) => w.round === s.round + 1)
    .flatMap((w) => w.spawns.map((x) => NAMES[x.kind]));
  const later = s.waves
    .filter((w) => w.round > s.round + 1)
    .reduce((n, w) => n + w.spawns.length, 0);
  $("wave").textContent = next.length
    ? `Through the far door next round: ${next.join(", ")}`
    : later
      ? `${later} more enemies will come through the far door`
      : "";
  $("energy").innerHTML = `${s.energy}<small>energy</small>`;
  ($("stepL") as HTMLButtonElement).disabled = !stepAction(-1);
  ($("stepR") as HTMLButtonElement).disabled = !stepAction(1);
  ($("end") as HTMLButtonElement).disabled = busy || !!s.over;
  // hand
  const hand = $("hand");
  hand.innerHTML = "";
  s.hand.forEach((c, idx) => {
    const def = CARDS[c];
    const el = document.createElement("div");
    const ok = !busy && !s.over && canPlay(s, idx);
    el.className = `card ${pending?.t === "card" && pending.idx === idx ? "sel" : ""} ${ok ? "" : "off"}`;
    el.innerHTML = `<div class="cost">${def.cost}</div><div class="cname">${def.name}</div>${reachGrid(c)}<div class="ctext">${def.text}</div>`;
    el.onclick = (e) => {
      e.stopPropagation();
      if (!ok) return;
      pending = pending?.t === "card" && pending.idx === idx ? null : { t: "card", idx };
      hoverAction = null;
      view = null;
      sync();
    };
    hand.appendChild(el);
  });
  // wolf
  const w = wolf(s);
  const wp = $("wolfpanel");
  if (!w) {
    wp.innerHTML = `<div class="ph">Wolf</div><div class="help">The wolf is down.</div>`;
  } else {
    const legal = legalActions(s).filter((a) => "id" in a && a.id === w.id);
    const has = (ab: string, dir?: number) =>
      legal.find(
        (a) =>
          (a.t === "ability" && a.ab === ab && (dir === undefined || a.dir === dir)) ||
          (ab === "step" && a.t === "step" && a.dir === dir),
      );
    const btn = (label: string, a: Action | undefined, title: string) =>
      `<button data-a='${a ? JSON.stringify(a) : ""}' ${a && !busy ? "" : "disabled"} title="${title}">${label}</button>`;
    const cd = (k: "shove" | "guard") => (s.cooldowns[k] > 0 ? ` (${s.cooldowns[k]})` : "");
    wp.innerHTML = `<div class="ph">Wolf · ${w.hp}/${w.maxHp}</div>
      <div class="help">${s.wolfActed ? "has acted" : "one action"} · ${s.wolfStepped ? "has stepped" : "one free step"}</div>
      <div class="row">${btn("Bite 4", has("bite"), "4 damage to the first enemy in rows 1-2 of the wolf's lane")}
      ${btn(`Guard${cd("guard")}`, has("guard"), `The next hit on the hero this enemy turn deals 4 less. Cooldown ${WOLF_COOLDOWN.guard}`)}</div>
      <div class="row">${btn("◀ Shove", has("shove", -1), "Push the enemy in row 1 one lane left")}${btn(`Shove ▶${cd("shove")}`, has("shove", 1), `Push the enemy in row 1 one lane right. Cooldown ${WOLF_COOLDOWN.shove}`)}</div>
      <div class="row">${btn("◀ Step", has("step", -1), "Free step left")}${btn("Step ▶", has("step", 1), "Free step right")}</div>`;
    wp.querySelectorAll("button").forEach((b) => {
      const raw = b.getAttribute("data-a");
      if (!raw) return;
      const a = JSON.parse(raw) as Action;
      b.onclick = (e) => {
        e.stopPropagation();
        void act(a);
      };
      b.onmouseenter = () => setHover(a);
      b.onmouseleave = () => setHover(null);
    });
  }
  refreshPreview();
}

// ---------------- preview -----------------------------------------------------------

function describe(before: State, ev: GameEvent[]): string[] {
  const name = (id: number) => {
    const u = unitById(before, id);
    return u ? NAMES[u.kind] : "?";
  };
  const out: string[] = [];
  for (const e of ev) {
    switch (e.t) {
      case "dmg": {
        const ally = unitById(before, e.id)?.side === "P";
        out.push(
          `<div class="ev ${ally ? "bad" : "good"}">${name(e.id)} takes ${e.amount}${e.blocked ? ` (${e.blocked} blocked)` : ""} · ${e.src}</div>`,
        );
        break;
      }
      case "die":
        out.push(
          `<div class="ev ${unitById(before, e.id)?.side === "P" ? "bad" : "good"}">${name(e.id)} dies</div>`,
        );
        break;
      case "move":
        if (e.forced)
          out.push(`<div class="ev">${name(e.id)} is moved to the ${cellName(e)}</div>`);
        break;
      case "collide":
        out.push(`<div class="ev combo">${name(e.a)} crashes into ${name(e.b)}</div>`);
        break;
      case "slam":
        out.push(`<div class="ev combo">${name(e.id)} slams into the wall</div>`);
        break;
      case "combo":
        out.push(`<div class="ev combo">${e.text} on the ${cellName(e)}</div>`);
        break;
      case "miss":
        out.push(`<div class="ev">${name(e.id)}'s ${e.name} hits nothing</div>`);
        break;
      case "summon":
        out.push(`<div class="ev good">a summon rises</div>`);
        break;
      case "spawn":
        out.push(`<div class="ev bad">an enemy comes through the door</div>`);
        break;
    }
  }
  return out;
}

function setHover(a: Action | null) {
  hoverAction = a;
  refreshPreview();
  syncMarks();
}

function refreshPreview() {
  const pv = $("preview");
  view = null;
  if (busy || s.over) {
    pv.innerHTML = s.over ? "" : `<div class="help">Enemies act...</div>`;
    return;
  }
  if (hoverAction) {
    const p = clone(s);
    const ev = apply(p, hoverAction);
    if (ev) {
      view = p;
      const lines = describe(s, ev);
      // what the enemy turn would then do to your side
      const q = clone(p);
      endTurn(q);
      const lost = (q.units.find((u) => u.kind === "hero")?.hp ?? 0) - (hero(p)?.hp ?? 0);
      const title =
        hoverAction.t === "card"
          ? CARDS[s.hand[hoverAction.idx]].name
          : hoverAction.t === "step"
            ? "Step"
            : hoverAction.t === "ability"
              ? hoverAction.ab[0].toUpperCase() + hoverAction.ab.slice(1)
              : "End turn";
      pv.innerHTML = `<div class="ph">${title}</div>${lines.join("") || `<div class="help">no damage</div>`}<div class="help">then if you end the turn: hero ${lost < 0 ? `takes ${-lost}` : "is safe"}</div>`;
    }
  } else if (hoverEnd) {
    const p = clone(s);
    const ev = endTurn(p);
    view = p;
    const lines = describe(s, ev);
    pv.innerHTML = `<div class="ph">End turn: the enemies act</div>${lines.join("") || `<div class="help">nothing hits you</div>`}`;
  } else if (pending?.t === "card") {
    const c = s.hand[pending.idx];
    pv.innerHTML = `<div class="ph">${CARDS[c].name}</div><div class="help">${CARDS[c].text}</div><div class="help">Hover a green cell to see the result. Right-click cancels.</div>`;
  } else if (pending?.t === "ward") {
    pv.innerHTML = `<div class="ph">Ward</div><div class="help">Click a line cell: hits there deal 2 less this enemy turn.</div>`;
  } else {
    pv.innerHTML = `<div class="help">Click a card, then a green cell. Step with ◀ ▶ or click a line cell beside you. Hover End turn to see what the enemies will do.</div>`;
  }
  applyViewMarks();
}

// Red cells and ground follow the preview state.
function applyViewMarks() {
  const st = view ?? s;
  for (let row = 0; row <= ROWS; row++)
    for (let lane = 0; lane < LANES; lane++) {
      stage.setRed(lane, row, false);
      stage.setGround(lane, row, groundAt(st, lane, row));
    }
  for (const t of threats(st)) stage.setRed(t.cell.lane, t.cell.row, true);
}

function syncMarks() {
  for (let row = 0; row <= ROWS; row++)
    for (let lane = 0; lane < LANES; lane++) stage.setMark(lane, row, null);
  for (const c of targetCells()) stage.setMark(c.lane, c.row, "target");
  if (hoverCell) {
    const a = actionAt(hoverCell);
    if (a) stage.setMark(hoverCell.lane, hoverCell.row, a.t === "step" ? "step" : "hover");
  }
}

// ---------------- input -------------------------------------------------------------

let hoverCell: Cell | null = null;
// cells with a visible body (the hero is the camera, so it has none)
const bodyAt = (lane: number, row: number) => {
  const u = unitAt(s, lane, row);
  return !!u && u.kind !== "hero";
};

function onMove(e: MouseEvent) {
  if ((e.target as HTMLElement).closest?.("#bottom, #fightbar, .ul button")) return;
  const c = stage.pick(e.clientX, e.clientY, bodyAt);
  const same = c && hoverCell && c.lane === hoverCell.lane && c.row === hoverCell.row;
  if (same || (!c && !hoverCell)) return;
  hoverCell = c;
  setHover(c ? actionAt(c) : null);
}

function onClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest?.("#bottom, #fightbar, #overlay, .ul button")) return;
  const c = stage.pick(e.clientX, e.clientY, bodyAt);
  if (!c) return;
  const a = actionAt(c);
  if (a) void act(a);
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") cancel();
  else if (e.key === "e" || e.key === "E" || e.key === "Enter") void doEnd();
  else if (e.key === "ArrowLeft" || e.key === "a") void heroStep(-1);
  else if (e.key === "ArrowRight" || e.key === "d") void heroStep(1);
  else if (/^[1-5]$/.test(e.key)) {
    const idx = Number(e.key) - 1;
    if (!busy && canPlay(s, idx)) {
      pending = { t: "card", idx };
      sync();
    }
  }
}

function cancel() {
  pending = null;
  hoverAction = null;
  sync();
}

async function heroStep(dir: number) {
  const a = stepAction(dir);
  if (a) await act(a);
}

// ---------------- actions and playback ----------------------------------------------

const wait = (ms: number) => new Promise((r) => setTimeout(r, SHOT ? Math.min(ms, 60) : ms));

async function act(a: Action) {
  if (busy || s.over) return;
  const before = clone(s);
  const ev = apply(s, a);
  if (!ev) return;
  pending = null;
  hoverAction = null;
  busy = true;
  await playEvents(before, ev, false);
  busy = false;
  sync();
  checkOver();
}

async function doEnd() {
  if (busy || s.over) return;
  pending = null;
  hoverAction = null;
  hoverEnd = false;
  const before = clone(s);
  const predicted = (() => {
    const p = clone(s);
    endTurn(p);
    return stateHash(p);
  })();
  busy = true;
  renderHud();
  const ev = endTurn(s);
  if (stateHash(s) !== predicted) console.error("preview mismatch");
  await playEvents(before, ev, true);
  busy = false;
  sync();
  checkOver();
}

async function playEvents(before: State, ev: GameEvent[], slow: boolean) {
  const now = () => performance.now() / 1000;
  const place = (id: number) => unitById(s, id) ?? unitById(before, id);
  for (const e of ev) {
    switch (e.t) {
      case "move": {
        const u = place(e.id);
        if (u?.kind === "hero") stage.setHeroLane(e.lane);
        else stage.moveUnit(e.id, e.lane, e.row, now());
        if (slow) await wait(200);
        break;
      }
      case "attack": {
        stage.play(e.id, "attack", now());
        for (const c of e.cells) stage.setRed(c.lane, c.row, true);
        if (slow) await wait(380);
        break;
      }
      case "dmg": {
        const u = place(e.id);
        if (!u) break;
        if (u.kind === "hero") {
          const el = $("hurt");
          el.style.opacity = "1";
          setTimeout(() => (el.style.opacity = "0"), 350);
          pop(innerWidth / 2, innerHeight - 260, `-${e.amount}`, "#ff6a5a");
        } else {
          stage.play(e.id, "hit", now());
          const p = stage.unitScreen(e.id, stage.unitTop(e.id, u.kind) * 0.6);
          if (p) pop(p.x, p.y, `-${e.amount}`, u.side === "P" ? "#ff9a80" : "#ffe08a");
        }
        if (slow) await wait(120);
        break;
      }
      case "die":
        stage.play(e.id, "death", now());
        labels.get(e.id)?.el.remove();
        labels.delete(e.id);
        if (slow) await wait(150);
        break;
      case "summon":
      case "spawn": {
        const u = unitById(s, e.id);
        if (u) stage.addUnit(u.id, u.kind, u.lane, u.row, true);
        if (slow) await wait(200);
        break;
      }
      case "combo":
      case "slam":
      case "collide": {
        const c = e.t === "combo" ? e : place(e.t === "slam" ? e.id : e.a);
        if (c) {
          const p = stage.cellScreen(c.lane, c.row, 1.2);
          pop(p.x, p.y, e.t === "combo" ? e.text : e.t === "slam" ? "slam!" : "crash!", "#ffb060");
        }
        break;
      }
      case "ground":
        stage.setGround(e.lane, e.row, groundAt(s, e.lane, e.row));
        break;
    }
  }
  if (slow) await wait(250);
}

function checkOver() {
  if (!s.over) return;
  const o = $("overlay");
  o.style.display = "flex";
  $("otitle").textContent = s.over === "win" ? "Victory" : "Defeat";
  $("otext").textContent =
    s.over === "win"
      ? `Cleared in ${s.round} rounds with ${hero(s)?.hp ?? 0} HP left.`
      : hero(s)
        ? "Out of time."
        : "The hero fell.";
  const n = Number(params.get("fight") ?? 1);
  const next = $("onext") as HTMLButtonElement;
  if (!params.has("gen") && n < FIGHTS.length && s.over === "win") {
    next.style.display = "";
    next.textContent = "Next fight";
    next.onclick = () => (location.search = `?fight=${n + 1}`);
  } else if (params.has("gen")) {
    next.style.display = "";
    next.textContent = "Next generated";
    next.onclick = () => (location.search = `?gen=${Number(params.get("gen")) + 1}`);
  } else next.style.display = "none";
}

// ---------------- frame loop --------------------------------------------------------

function loop(t: number) {
  stage.update(t / 1000);
  stage.render(t / 1000);
  updateOverlay();
  requestAnimationFrame(loop);
}

// Hooks for scripts/shots.ts (headless screenshots). Not used in play.
(window as unknown as { __e16: unknown }).__e16 = {
  state: () => s,
  busy: () => busy,
  act,
  end: doEnd,
  select: (idx: number) => {
    pending = { t: "card", idx };
    sync();
  },
  hover: (a: Action | null) => setHover(a),
  hoverEnd: (on: boolean) => {
    hoverEnd = on;
    refreshPreview();
  },
  cancel,
  // play one strong-bot turn through the normal action path (lazy: bots load only here)
  botTurn: async (endIt = true) => {
    const { search } = await import("../rules/bots.ts");
    for (const a of search(s).line) await act(a);
    if (endIt) await doEnd();
  },
  cellScreen: (lane: number, row: number) => stage.cellScreen(lane, row, 0.1),
  ready: false,
};

void main().then(() => {
  (window as unknown as { __e16: { ready: boolean } }).__e16.ready = true;
});
