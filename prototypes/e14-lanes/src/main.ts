// Game layer for e14 lanes: mouse input, HUD (cards, labels, intents, preview), and playback
// of rule events as animations. Rules live in rules.ts; the 3D scene in stage.ts.
import {
  type Ability,
  type Action,
  type GameEvent,
  type Side,
  type State,
  abilityOf,
  apply,
  cardAbility,
  clone,
  hero,
  legalActions,
  legalTargets,
  MAX_SUMMONS,
  newFight,
  slotOf,
  summonCount,
  targetSide,
  threats,
  unitAt,
  unitById,
  unitName,
  landingSlot,
  SLOTS,
} from "./rules.ts";
import { ENCOUNTERS, ENEMY_KINDS, PLAYER_KINDS, generate } from "./content.ts";
import { Stage, type Ring } from "./stage.ts";
import { search } from "./bots.ts";

const params = new URLSearchParams(location.search);
let FAST = params.has("fast");
const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

declare global {
  interface Window {
    __freeze?: number;
    __lanes?: any;
  }
}

type Sel =
  | null
  | { kind: "card"; index: number }
  | { kind: "ability"; unit: number; ability: string }
  | { kind: "unit"; unit: number }
  | { kind: "inspect"; unit: number };

const stage = new Stage($("view"), { shot: params.has("shot") });
await stage.load();

let S: State;
let fightIndex = 0; // 0-5 hand-made, 6+ generated
let sel: Sel = null;
let hover: { side: Side; slot: number } | null = null;
let busy = false;
const log: string[] = [];
const shown = new Map<number, { hp: number; maxHp: number; block: number }>();

// ---------------- fights ------------------------------------------------------------

function encounterFor(i: number) {
  return i < ENCOUNTERS.length ? ENCOUNTERS[i] : generate(i - ENCOUNTERS.length + 1);
}

function startFight(i: number): void {
  fightIndex = i;
  for (const id of stage.visuals.keys()) stage.removeUnit(id);
  S = newFight(encounterFor(i), 1000 + i * 17);
  stage.setTheme(i % 2 ? "moss" : "crypt");
  for (const side of ["P", "E"] as Side[])
    S.slots[side].forEach((id, slot) => {
      const u = unitById(S, id);
      if (u) stage.addUnit(u.id, u.kind, side, slot);
    });
  sel = null;
  hover = null;
  log.length = 0;
  syncShown();
  ($("fight") as HTMLSelectElement).value = String(Math.min(i, ENCOUNTERS.length));
  $("overlay").style.display = "none";
  refresh();
}

function syncShown(): void {
  shown.clear();
  for (const u of S.units) shown.set(u.id, { hp: u.hp, maxHp: u.maxHp, block: u.block });
}

const fightSel = $("fight") as HTMLSelectElement;
ENCOUNTERS.forEach((e, i) => fightSel.add(new Option(e.name, String(i))));
fightSel.add(new Option("Generated fights", String(ENCOUNTERS.length)));
fightSel.onchange = () => startFight(Number(fightSel.value));
$("restart").onclick = () => startFight(fightIndex);

// ---------------- selection and targets ---------------------------------------------

// Map "P2" / "E0" -> the action a click there would do, for the current selection.
function candidates(): Map<string, Action> {
  const out = new Map<string, Action>();
  if (busy || S.over || !sel) return out;
  const acts = legalActions(S);
  if (sel.kind === "card") {
    const name = S.hand[sel.index];
    const c = cardAbility(name);
    const h = hero(S)!;
    const side = targetSide(h, c);
    for (const a of acts)
      if (a.kind === "card" && S.hand[a.card] === name)
        out.set(`${side}${a.target}`, { kind: "card", card: sel.index, target: a.target });
  } else if (sel.kind === "ability") {
    const u = unitById(S, sel.unit)!;
    const ab = abilityOf(u, sel.ability)!;
    const side = targetSide(u, ab);
    for (const a of acts)
      if (a.kind === "ability" && a.unit === sel.unit && a.ability === sel.ability)
        out.set(`${side}${a.target}`, a);
  } else if (sel.kind === "unit") {
    for (const a of acts) if (a.kind === "move" && a.unit === sel.unit) out.set(`P${a.to}`, a);
  }
  return out;
}

function clickSlot(side: Side, slot: number): void {
  if (busy || S.over) return;
  const a = candidates().get(`${side}${slot}`);
  if (a) {
    void doAction(a);
    return;
  }
  const u = unitAt(S, side, slot);
  if (u && side === "P") selectUnit(u.id);
  else if (u) sel = { kind: "inspect", unit: u.id };
  else sel = null;
  refresh();
}

function selectUnit(id: number): void {
  const u = unitById(S, id);
  if (!u) return;
  // a companion or summon with exactly one ready ability goes straight to targeting it
  sel = { kind: "unit", unit: id };
}

function selectCard(i: number): void {
  if (busy || S.over) return;
  sel = sel?.kind === "card" && sel.index === i ? null : { kind: "card", index: i };
  refresh();
}

function selectAbility(unit: number, ability: string): void {
  if (busy || S.over) return;
  sel =
    sel?.kind === "ability" && sel.ability === ability && sel.unit === unit
      ? { kind: "unit", unit }
      : { kind: "ability", unit, ability };
  refresh();
}

// ---------------- playing actions ------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, FAST ? ms * 0.25 : ms));

async function doAction(a: Action): Promise<void> {
  if (busy) return;
  const before = clone(S);
  if (!apply(S, a)) return;
  busy = true;
  sel = null;
  hover = null;
  const events = S.events;
  refresh(before);
  await playEvents(events, before);
  busy = false;
  syncShown();
  refresh();
  if (S.over) showOver();
}

async function playEvents(events: GameEvent[], before: State): Promise<void> {
  const steps = [...new Set(events.map((e) => e.step))];
  const sideOf = new Map<number, Side>(before.units.map((u) => [u.id, u.side]));
  for (const st of steps) {
    const group = events.filter((e) => e.step === st);
    const now = performance.now() / 1000;
    let enemyAct = false;
    for (const e of group) {
      if (e.text) log.push(e.text);
      if (e.unit != null && e.t === "summon") sideOf.set(e.unit, e.side ?? "P");
      if (e.t === "act" && e.unit != null) {
        stage.play(e.unit, "attack", now);
        if (sideOf.get(e.unit) === "E") enemyAct = true;
      }
      if (e.t === "damage" && e.unit != null) {
        const sh = shown.get(e.unit);
        if (sh) {
          const blocked = Math.max(0, sh.hp - (e.hp ?? sh.hp) - (e.amount ?? 0));
          sh.block = Math.max(0, sh.block - blocked);
          sh.hp = e.hp ?? sh.hp;
        }
        setTimeout(
          () => {
            stage.play(e.unit!, "hit", performance.now() / 1000);
            pop(e.unit!, `-${e.amount}`, e.kind ? "#ffb070" : "#ff5a48");
          },
          FAST ? 60 : 280,
        );
      }
      if (e.t === "heal" && e.unit != null) {
        const sh = shown.get(e.unit);
        if (sh) sh.hp = e.hp ?? sh.hp;
        pop(e.unit, `+${e.amount}`, "#7dff9a");
      }
      if (e.t === "block" && e.unit != null) {
        const sh = shown.get(e.unit);
        if (sh) sh.block += e.amount ?? 0;
        pop(e.unit, `+${e.amount} block`, "#8fd0ff");
      }
      if (e.t === "move" && e.unit != null && e.side && e.to != null)
        stage.moveUnit(e.unit, e.side, e.to, now);
      if (e.t === "death" && e.unit != null)
        setTimeout(() => stage.play(e.unit!, "death", performance.now() / 1000), FAST ? 80 : 400);
      if (e.t === "summon" && e.unit != null && e.side && e.slot != null && e.kind) {
        stage.addUnit(e.unit, e.kind, e.side, e.slot, true);
        shown.set(e.unit, {
          hp: PLAYER_KINDS[e.kind].hp,
          maxHp: PLAYER_KINDS[e.kind].hp,
          block: 0,
        });
      }
      if (e.t === "fizzle" && e.unit != null) pop(e.unit, "out of position!", "#cccccc");
      if (e.t === "collide" && e.unit != null) pop(e.unit, "crash!", "#ffd65a");
      if (e.t === "wall" && e.unit != null) pop(e.unit, "wall slam!", "#ffd65a");
      if (e.t === "combo" && e.side && e.slot != null)
        stage.burst(e.side, e.slot, e.kind === "flash" ? "#c8ff60" : "#ff6a20");
    }
    // ground shows the final state of this step's slots
    updateGround(S);
    refreshLabels();
    $("preview").innerHTML = logHtml();
    const enemyPhase = group.some((e) => sideOf.get(e.unit ?? -1) === "E") || enemyAct;
    await sleep(enemyAct ? 900 : enemyPhase ? 600 : 520);
  }
}

function pop(unit: number, text: string, color: string): void {
  const p = stage.unitScreen(unit, stage.unitHeight(unit) * 0.6);
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
  $("otext").textContent = win
    ? `${S.name} cleared in ${S.round} rounds. Hero HP ${hero(S)?.hp ?? 0}.`
    : `${S.name}: the hero fell in round ${S.round}.`;
  const b = $("onext") as HTMLButtonElement;
  b.textContent = win ? "Next fight" : "Try again";
  b.onclick = () => startFight(win ? fightIndex + 1 : fightIndex);
  $("overlay").style.display = "flex";
}

$("end").onclick = () => void doAction({ kind: "end" });

// ---------------- HUD -----------------------------------------------------------------

// The lane diagram on cards: your 4 slots (4..1, left to right) then enemy 1..4.
function laneHtml(ab: Ability, here: number | null, side: Side): string {
  let h = "";
  for (let i = SLOTS - 1; i >= 0; i--) {
    const c = [
      ab.from.includes(i) ? "from" : "",
      side === "P" && ab.target !== "self" && ab.reach.includes(i) ? "ally" : "",
      i === here ? "here" : "",
    ];
    h += `<i class="${c.join(" ")}"></i>`;
  }
  for (let i = 0; i < SLOTS; i++) {
    const c = [side === "E" && ab.reach.includes(i) ? "foe" : "", i === 0 ? "mid" : ""];
    h += `<i class="${c.join(" ")}"></i>`;
  }
  const span = (xs: number[]) => (xs.length === 4 ? "any" : xs.map((x) => x + 1).join(","));
  const what =
    ab.target === "self"
      ? "self"
      : ab.target === "emptyAlly"
        ? "empty slot"
        : `${side === "E" ? "enemy" : "ally"} ${span(ab.reach)}`;
  return `<div class="lane">${h}</div><div class="lanecap">from ${span(ab.from)} → ${what}</div>`;
}

function cardWhy(name: string): string {
  const c = cardAbility(name);
  const h = hero(S);
  if (!h) return "";
  if ((c.cost ?? 0) > S.energy) return "not enough energy";
  if (!c.from.includes(slotOf(S, h)))
    return `hero must stand in slot ${c.from.map((x) => x + 1).join("/")}`;
  if (c.effects.some((e) => e.op === "summon") && summonCount(S) >= MAX_SUMMONS)
    return "2 summons already";
  if (!legalTargets(S, h, c).length) return "no target in reach";
  return "";
}

function renderHand(): void {
  const h = hero(S);
  const here = h ? slotOf(S, h) : null;
  $("hand").innerHTML = S.hand
    .map((name, i) => {
      const c = cardAbility(name);
      const why = busy || S.phase !== "player" ? "" : cardWhy(name);
      const side = targetSide(h ?? S.units[0], c);
      const cls = [
        "card",
        sel?.kind === "card" && sel.index === i ? "sel" : "",
        why ? "off" : "",
      ].join(" ");
      return `<div class="${cls}" data-card="${i}"><div class="cost">${c.cost}</div><div class="cname">${esc(c.name)}</div>${laneHtml(c, here, side)}<div class="ctext">${esc(c.text)}</div>${why ? `<div class="why">${esc(why)}</div>` : ""}</div>`;
    })
    .join("");
  for (const el of $("hand").querySelectorAll<HTMLElement>(".card")) {
    el.onclick = (ev) => {
      ev.stopPropagation();
      selectCard(Number(el.dataset.card));
    };
  }
  $("energy").innerHTML = `${S.energy}<small>/ 3 energy</small>`;
  ($("end") as HTMLButtonElement).disabled = busy || !!S.over;
}

function renderUnitPanel(): void {
  const p = $("unitpanel");
  const id = sel && sel.kind !== "card" ? sel.unit : null;
  const u = id != null ? unitById(S, id) : undefined;
  if (!u) {
    const h = hero(S);
    const ready = S.units
      .filter((x) => x.side === "P" && x.kind !== "hero" && !x.acted)
      .map((x) => unitName(x.kind));
    p.innerHTML = `<div class="ph">Your turn</div><div class="help">Click a <b>card</b> to play it with the hero, or click one of <b>your units</b> to use its abilities or move it (moving swaps with a neighbour: 1 energy for the hero, the whole action for others).<br><br>Red rings and numbers: where enemies will hit next. Hover a lit target to see exactly what happens.</div>${h ? `<div style="margin-top:6px">Ready: ${ready.length ? ready.join(", ") : "nobody"}</div>` : ""}`;
    return;
  }
  const kind = u.side === "P" ? PLAYER_KINDS[u.kind] : ENEMY_KINDS[u.kind];
  const slot = slotOf(S, u);
  let h = `<div class="ph">${esc(kind.name)} <span class="help">(slot ${slot + 1}, ${kind.role})</span></div>`;
  h += `<div>HP ${u.hp}/${u.maxHp}${u.armour ? `, armour ${u.armour}` : ""}${u.heavy ? ", heavy (ignores 1-slot push/pull)" : ""}${u.block ? `, block ${u.block}` : ""}</div>`;
  if (u.kind === "hero")
    h += `<div class="help" style="margin-top:4px">The hero plays the cards below. Click a lit neighbour slot to swap places (1 energy).</div>`;
  for (const ab of kind.abilities) {
    const cd = u.cooldowns[ab.id] ?? 0;
    const usable = u.side === "P" && !u.acted && cd === 0 && legalTargets(S, u, ab).length > 0;
    const why =
      u.side !== "P"
        ? ""
        : u.acted
          ? "already acted"
          : cd
            ? `cooldown ${cd}`
            : !ab.from.includes(slot)
              ? `needs slot ${ab.from.map((x) => x + 1).join("/")}`
              : !usable
                ? "no target"
                : "";
    const isSel = sel?.kind === "ability" && sel.ability === ab.id;
    h += `<div class="ab ${isSel ? "sel" : ""} ${usable ? "" : "off"}" data-ab="${ab.id}"><b>${esc(ab.name)}</b>${ab.cooldown ? ` <span class="help">cd ${ab.cooldown}</span>` : ""}${laneHtml(ab, slot, targetSide(u, ab))}<div>${esc(ab.text)}</div>${why ? `<div class="why" style="position:static">${esc(why)}</div>` : ""}</div>`;
  }
  if (u.side === "P" && u.kind !== "hero")
    h += `<div class="help" style="margin-top:6px">${u.acted ? "Done this turn." : "Or click a lit neighbour slot to swap places (uses its action)."}</div>`;
  p.innerHTML = h;
  for (const el of p.querySelectorAll<HTMLElement>(".ab:not(.off)"))
    el.onclick = (ev) => {
      ev.stopPropagation();
      selectAbility(u.id, el.dataset.ab!);
    };
}

function updateGround(view: State): void {
  for (const side of ["P", "E"] as Side[])
    for (let i = 0; i < SLOTS; i++) stage.setGround(side, i, view.ground[side][i]);
}

// Labels over units (name, HP, block, intent) and on the floor (slot number, hazards,
// incoming damage). `view` is the real state, or a preview of an action while hovering.
function refreshLabels(view: State = S): void {
  const labels = $("labels");
  const present = new Set<string>();
  const showIntents = !busy;
  const th = showIntents ? threats(view) : [];
  for (const v of stage.visuals.values()) {
    if (!busy && !unitById(S, v.id)) continue; // dead, still playing its fall
    const key = `u${v.id}`;
    present.add(key);
    let el = labels.querySelector<HTMLElement>(`[data-k="${key}"]`);
    if (!el) {
      el = document.createElement("div");
      el.dataset.k = key;
      el.className = `ulabel ${v.side}`;
      el.onclick = (ev) => {
        ev.stopPropagation();
        const u = unitById(S, v.id);
        if (u) clickSlot(u.side, slotOf(S, u));
      };
      labels.appendChild(el);
    }
    const u = unitById(view, v.id);
    const sh = busy
      ? shown.get(v.id)
      : u
        ? { hp: u.hp, maxHp: u.maxHp, block: u.block }
        : shown.get(v.id);
    if (!sh) continue;
    const real = unitById(S, v.id);
    const curHp = real && !busy ? real.hp : sh.hp;
    const pct = Math.max(0, sh.hp / sh.maxHp) * 100;
    const ghost = (Math.max(0, curHp - sh.hp) / sh.maxHp) * 100;
    let intent = "";
    if (u && u.side === "E" && showIntents) intent = intentHtml(view, u.id);
    let tags = "";
    if (u && u.side === "P" && u.kind !== "hero" && !u.acted && view.phase === "player" && !busy)
      tags += `<span class="tag ready">ready</span>`;
    const isSel = sel && sel.kind !== "card" && sel.unit === v.id;
    el.classList.toggle("sel", !!isSel);
    el.innerHTML = `${intent ? `<div>${intent}</div>` : ""}<div class="uname">${esc(unitName(v.kind))}${sh.block ? `<span class="block">${sh.block}</span>` : ""}</div><div class="hpbar"><div class="hpfill" style="width:${pct}%"></div><div class="hpghost" style="left:${pct}%;width:${ghost}%"></div><div class="hptxt">${Math.max(0, sh.hp)} / ${sh.maxHp}</div></div>${tags}`;
  }
  for (const el of [...labels.children] as HTMLElement[])
    if (!present.has(el.dataset.k!)) el.remove();
  // floor labels
  const slots = $("slots");
  if (!slots.children.length)
    for (const side of ["P", "E"] as Side[])
      for (let i = 0; i < SLOTS; i++) {
        const el = document.createElement("div");
        el.className = "slabel";
        el.dataset.k = `${side}${i}`;
        slots.appendChild(el);
      }
  for (const side of ["P", "E"] as Side[])
    for (let i = 0; i < SLOTS; i++) {
      const el = slots.querySelector<HTMLElement>(`[data-k="${side}${i}"]`)!;
      const g = view.ground[side][i];
      const dmg = th.filter((t) => t.side === side && t.slot === i);
      const total = dmg.reduce((a, t) => a + t.damage, 0);
      const hz = dmg.map((t) => t.hazard).filter(Boolean);
      let h = `<span class="snum">${i + 1}</span>`;
      if (total) h += `<span class="threat">-${total}${dmg.some((t) => t.push) ? " ⇄" : ""}</span>`;
      if (hz.length)
        h += `<span class="threat">${hz.includes("fire") ? "fire" : "poison"} incoming</span>`;
      h += "<br>";
      if (g.fire)
        h += `<span class="hz ${g.blaze ? "blaze" : "fire"}">${g.blaze ? "BLAZE" : "fire"} ${g.fire}</span>`;
      if (g.oil) h += `<span class="hz oil">oil</span>`;
      if (g.poison) h += `<span class="hz poison">poison ${g.poison}</span>`;
      if (g.ward) h += `<span class="hz ward">ward ${g.ward}</span>`;
      el.innerHTML = h;
      stage.setThreat(side, i, dmg.length > 0);
    }
}

function intentHtml(view: State, id: number): string {
  const e = unitById(view, id)!;
  const it = e.intent;
  if (!it) return `<span class="intent move">waits</span>`;
  if (it.ability === "move")
    return `<span class="intent move">moves to slot ${(it.to ?? 0) + 1}</span>`;
  const ab = abilityOf(e, it.ability)!;
  const out = !ab.from.includes(slotOf(view, e));
  if (ab.target === "ally" || ab.target === "self") {
    const t = unitAt(view, "E", it.target);
    return `<span class="intent ally ${out ? "fizzle" : ""}">${esc(ab.name)} → ${esc(t ? unitName(t.kind) : "ally")}</span>`;
  }
  const land = landingSlot(view, e, ab, it);
  const slots =
    land == null
      ? []
      : [land, ...(ab.area ?? []).map((o) => land + o)].filter((x) => x >= 0 && x < SLOTS);
  const dmg = ab.effects.reduce((a, f) => a + (f.op === "damage" ? f.amount : 0), 0);
  const extra = ab.effects
    .map((f) =>
      f.op === "push"
        ? "push"
        : f.op === "pull"
          ? `pull ${f.n}`
          : f.op === "fire"
            ? "fire"
            : f.op === "poison"
              ? `poison ${f.amount}`
              : "",
    )
    .filter(Boolean)
    .join(", ");
  return `<span class="intent ${out ? "fizzle" : ""}">${esc(ab.name)}${dmg ? ` ${dmg}` : ""}${extra ? ` (${extra})` : ""} <span class="tgt">→ slot ${slots.map((x) => x + 1).join("+") || "none"}</span></span>`;
}

function logHtml(): string {
  return `<div class="ph">Log</div>${log
    .slice(-8)
    .map((t) => `<div class="ev ${/Blaze|Flash/.test(t) ? "combo" : ""}">${esc(t)}</div>`)
    .join("")}`;
}

function eventsHtml(title: string, evs: GameEvent[]): string {
  const rows = evs
    .filter((e) => e.text)
    .map((e) => {
      const u = unitById(S, e.unit);
      const cls =
        e.t === "combo" ? "combo" : e.t === "damage" ? (u?.side === "P" ? "bad" : "good") : "";
      return `<div class="ev ${cls}">${esc(e.text)}</div>`;
    });
  return `<div class="ph">${esc(title)}</div>${rows.join("") || '<div class="help">no effect</div>'}`;
}

function refresh(view?: State): void {
  const v = view ?? S;
  const cand = candidates();
  for (const side of ["P", "E"] as Side[])
    for (let i = 0; i < SLOTS; i++) {
      let ring: Ring | null = null;
      if (cand.has(`${side}${i}`))
        ring =
          hover && hover.side === side && hover.slot === i
            ? "hover"
            : sel?.kind === "unit"
              ? "move"
              : "target";
      const u = unitAt(S, side, i);
      if (!ring && u && sel && sel.kind !== "card" && sel.unit === u.id) ring = "active";
      if (!ring && u && sel?.kind === "card" && u.kind === "hero") ring = "active";
      stage.setRing(side, i, ring);
    }
  // banner
  const ready = S.units.filter((x) => x.side === "P" && x.kind !== "hero" && !x.acted).length;
  $("banner").textContent = S.over
    ? S.over === "win"
      ? "Victory"
      : "Defeat"
    : busy && S.phase === "player" && v.phase === "player"
      ? `Round ${S.round}`
      : busy
        ? "Enemy turn"
        : `Round ${S.round} · Your turn`;
  $("banner").className = busy && !S.over ? "enemy" : "";
  $("sub").textContent =
    `${S.name} · ${S.energy} energy · ${ready} unit${ready === 1 ? "" : "s"} ready · deck ${S.deck.length}, discard ${S.discard.length}`;
  renderHand();
  renderUnitPanel();
  // preview of the hovered action, else the log
  const a = hover ? cand.get(`${hover.side}${hover.slot}`) : undefined;
  if (a && !busy) {
    const c = clone(S);
    apply(c, a);
    const title =
      a.kind === "card"
        ? `${cardAbility(S.hand[a.card]).name} → ${hover!.side === "P" ? "your" : "enemy"} slot ${hover!.slot + 1}`
        : a.kind === "move"
          ? `Move → slot ${a.to + 1}`
          : a.kind === "ability"
            ? `${abilityOf(unitById(S, a.unit)!, a.ability)!.name} → slot ${hover!.slot + 1}`
            : "End turn";
    $("preview").innerHTML =
      eventsHtml(title, c.events) +
      '<div class="help" style="margin-top:6px">Enemy intents above show the result.</div>';
    updateGround(c);
    refreshLabels(c);
  } else {
    if (!busy)
      $("preview").innerHTML =
        sel?.kind === "card" || sel?.kind === "ability"
          ? `<div class="ph">Pick a target</div><div class="help">Lit rings are legal targets. Hover one for the exact result; click to play. Right-click or Esc cancels.</div>`
          : logHtml();
    updateGround(S);
    refreshLabels(busy ? S : v);
  }
}

// ---------------- input -----------------------------------------------------------

const canvas = stage.renderer.domElement;
canvas.addEventListener("click", (ev) => {
  const p = stage.pick(ev.clientX, ev.clientY);
  if (p) clickSlot(p.side, p.slot);
  else {
    sel = null;
    refresh();
  }
});
canvas.addEventListener("mousemove", (ev) => {
  const p = stage.pick(ev.clientX, ev.clientY);
  const key = p ? `${p.side}${p.slot}` : "";
  const old = hover ? `${hover.side}${hover.slot}` : "";
  if (key === old) return;
  hover = p;
  refresh();
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
  }
  if (ev.key === "e" || ev.key === "E") void doAction({ kind: "end" });
  const n = Number(ev.key);
  if (n >= 1 && n <= S.hand.length) selectCard(n - 1);
});

// ---------------- frame loop --------------------------------------------------------

function frame(): void {
  const now = window.__freeze ?? performance.now() / 1000;
  stage.update(now);
  // keep labels glued to units and slots
  for (const el of $("labels").children as HTMLCollectionOf<HTMLElement>) {
    const id = Number(el.dataset.k!.slice(1));
    const p = stage.unitScreen(id, stage.unitHeight(id) + 0.15);
    if (p) {
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
    }
  }
  for (const el of $("slots").children as HTMLCollectionOf<HTMLElement>) {
    const side = el.dataset.k![0] as Side,
      i = Number(el.dataset.k![1]);
    const p = stage.screen(stage.slotPos(side, i).setZ(1.3));
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
  }
  stage.render(now);
  requestAnimationFrame(frame);
}

const startAt = params.get("gen")
  ? ENCOUNTERS.length + Number(params.get("gen")) - 1
  : Number(params.get("fight") ?? 1) - 1;
startFight(Math.max(0, startAt));
requestAnimationFrame(frame);

// Debug handle for the headless screenshot script.
window.__lanes = {
  state: () => S,
  busy: () => busy,
  start: startFight,
  selectCard,
  selectUnit: (id: number) => {
    selectUnit(id);
    refresh();
  },
  selectAbility,
  hover: (side: Side, slot: number) => {
    hover = { side, slot };
    refresh();
  },
  click: clickSlot,
  act: doAction,
  // play one turn with the strong bot (for screenshots and for watching it play)
  botTurn: async (stopBeforeEnd = false) => {
    for (const a of search(S).seq) {
      if (stopBeforeEnd && a.kind === "end") break;
      await doAction(a);
      if (S.over || a.kind === "end") break;
    }
  },
  setHand: (cards: string[]) => {
    S.hand = cards;
    refresh();
  },
  clear: () => {
    sel = null;
    hover = null;
    refresh();
  },
  setFast: (on: boolean) => (FAST = on),
  slotScreen: (side: Side, slot: number) => stage.screen(stage.slotPos(side, slot).setY(1)),
};
