// Game layer for e17 lanes: mouse input, HUD (hand bar per deck model, labels, intents,
// preview), and playback of rule events as animations. Rules live in rules.ts, timings
// and the click model in pace.ts, the 3D scene in stage.ts.
//
// URL switches: deck=hero|party|squad, pace=fast|classic (and anim, skip, buffer, group,
// oneclick, autoend), rules: short, spread, fallback, fire, revive (0|1) or rules=e14.
// Also fight=1..6, gen=<seed>.
import {
  type Ability,
  type Action,
  type GameEvent,
  type Side,
  type State,
  abilityOf,
  apply,
  cardAbility,
  cardCost,
  cardUsers,
  clone,
  DEFAULT_OPTS,
  hero,
  isLegal,
  legalActions,
  legalTargets,
  MAX_SUMMONS,
  newFight,
  ownerOf,
  slotOf,
  summonCount,
  targetSide,
  threats,
  unitAt,
  unitById,
  unitName,
  landingSlot,
  SLOTS,
  ENERGY,
} from "./rules.ts";
import { ENCOUNTERS, ENEMY_KINDS, PLAYER_KINDS, generate } from "./content.ts";
import { Stage, type Ring } from "./stage.ts";
import { search } from "./bots.ts";
import { TIMING, onlyMovesLeft, paceFrom, rulesFrom, stepDelays } from "./pace.ts";

const params = new URLSearchParams(location.search);
const PACE = paceFrom(params);
const OPTS = rulesFrom(params, DEFAULT_OPTS);
let FAST = params.has("fast"); // screenshots: everything 4x faster on top of the pace
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
  | { kind: "card"; pile: string; index: number }
  | { kind: "ability"; unit: number; ability: string }
  | { kind: "unit"; unit: number }
  | { kind: "inspect"; unit: number };

const stage = new Stage($("view"), { shot: params.has("shot") });
await stage.load();
const animFactor = () => PACE.anim * (FAST ? 0.25 : 1);
stage.speed = 1 / animFactor();
document.body.classList.add(OPTS.deck);

let S: State;
let fightIndex = 0; // 0-5 hand-made, 6+ generated
let sel: Sel = null;
let hover: { side: Side; slot: number } | null = null;
let busy = false;
let animKind: "player" | "enemy" = "player"; // what is animating while busy
let skipping = false; // finish the running animation now
let pending: Action | null = null; // input given during an animation (buffer)
let actedThisTurn = false;
let autoTimer: ReturnType<typeof setTimeout> | null = null;
// the last action's real animation time vs the pace model's sum (checked by shots.ts)
let lastTiming: { kind: string; ms: number; predicted: number } | null = null;
const log: string[] = [];
const shown = new Map<number, { hp: number; maxHp: number; block: number }>();

// ---------------- fights ------------------------------------------------------------

function encounterFor(i: number) {
  return i < ENCOUNTERS.length ? ENCOUNTERS[i] : generate(i - ENCOUNTERS.length + 1);
}

function startFight(i: number): void {
  fightIndex = i;
  cancelAutoEnd();
  for (const id of stage.visuals.keys()) stage.removeUnit(id);
  S = newFight(encounterFor(i), 1000 + i * 17, OPTS);
  stage.setTheme(i % 2 ? "moss" : "crypt");
  for (const side of ["P", "E"] as Side[])
    S.slots[side].forEach((id, slot) => {
      const u = unitById(S, id);
      if (u) stage.addUnit(u.id, u.kind, side, slot);
    });
  sel = null;
  hover = null;
  pending = null;
  actedThisTurn = false;
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
// deck and pace pickers reload the page with the switch in the URL
for (const [id, key, value] of [
  ["deck", "deck", OPTS.deck],
  ["pace", "pace", params.get("pace") === "classic" ? "classic" : "fast"],
] as const) {
  const el = $(id) as HTMLSelectElement;
  el.value = value;
  el.onchange = () => {
    const q = new URLSearchParams(location.search);
    q.set(key, el.value);
    q.set("fight", String(Math.min(fightIndex, ENCOUNTERS.length - 1) + 1));
    location.search = q.toString();
  };
}
$("blazen").textContent = OPTS.fire ? "blaze 3" : "blaze 4";

// ---------------- selection and targets ---------------------------------------------

const handOf = (pile: string) => S.piles[pile]?.hand ?? [];

// Map "P2" / "E0" -> the action a click there would do, for the current selection.
function candidates(): Map<string, Action> {
  const out = new Map<string, Action>();
  if ((busy && !PACE.buffer) || S.over || !sel) return out;
  const acts = legalActions(S);
  if (sel.kind === "card") {
    const { pile, index } = sel;
    const name = handOf(pile)[index];
    const c = cardAbility(name);
    for (const a of acts)
      if (a.kind === "card" && a.pile === pile && handOf(pile)[a.card] === name) {
        const side = targetSide(unitById(S, a.unit)!, c);
        const key = `${side}${a.target}`;
        if (!out.has(key)) out.set(key, { ...a, card: index });
      }
  } else if (sel.kind === "ability") {
    const u = unitById(S, sel.unit);
    const ab = u && abilityOf(u, sel.ability);
    if (!u || !ab) return out;
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
  if (S.over) return;
  cancelAutoEnd();
  if (busy && !PACE.buffer) return;
  const a = candidates().get(`${side}${slot}`);
  if (a) {
    void doAction(a);
    return;
  }
  if (busy && PACE.skip) {
    skip();
    return;
  }
  const u = unitAt(S, side, slot);
  if (u && side === "P") sel = { kind: "unit", unit: u.id };
  else if (u) sel = { kind: "inspect", unit: u.id };
  else sel = null;
  refresh();
}

// One click: an action with a single target plays at once.
function playIfSingle(): boolean {
  if (!PACE.oneClick) return false;
  const c = candidates();
  if (c.size !== 1) return false;
  void doAction([...c.values()][0]);
  return true;
}

function selectCard(pile: string, i: number): void {
  if (S.over || (busy && !PACE.buffer)) return;
  cancelAutoEnd();
  sel =
    sel?.kind === "card" && sel.pile === pile && sel.index === i
      ? null
      : { kind: "card", pile, index: i };
  if (sel && playIfSingle()) return;
  refresh();
}

function selectAbility(unit: number, ability: string): void {
  if (S.over || (busy && !PACE.buffer)) return;
  cancelAutoEnd();
  sel =
    sel?.kind === "ability" && sel.ability === ability && sel.unit === unit
      ? { kind: "unit", unit }
      : { kind: "ability", unit, ability };
  if (sel.kind === "ability" && playIfSingle()) return;
  refresh();
}

// ---------------- playing actions ------------------------------------------------------

// Wait ms (already scaled by the pace), or less if the player skips.
async function wait(ms: number): Promise<void> {
  const end = performance.now() + ms * (FAST ? 0.25 : 1);
  while (performance.now() < end && !skipping) await new Promise((r) => setTimeout(r, 20));
}

function skip(): void {
  if (!busy) return;
  skipping = true;
  stage.finish();
}

async function doAction(a: Action): Promise<void> {
  if (busy) {
    // buffer: remember the input; your own animation finishes at once, the enemy turn plays out
    if (!PACE.buffer) return;
    pending = a;
    sel = null;
    hover = null;
    if (animKind === "player") skip();
    refresh();
    return;
  }
  cancelAutoEnd();
  const before = clone(S);
  if (!apply(S, a)) return;
  busy = true;
  animKind = a.kind === "end" ? "enemy" : "player";
  actedThisTurn = a.kind !== "end";
  if (pending == null) {
    sel = null;
    hover = null;
  }
  const events = S.events;
  refresh(before);
  const t0 = performance.now();
  const predicted = await playEvents(events, before);
  lastTiming = { kind: a.kind, ms: performance.now() - t0, predicted };
  busy = false;
  skipping = false;
  syncShown();
  if (S.over) {
    refresh();
    showOver();
    return;
  }
  const next = pending;
  pending = null;
  if (next && isLegal(S, next)) {
    await doAction(next);
    return;
  }
  refresh();
  maybeAutoEnd();
}

// Auto end turn: after your last playable card or ability, end the turn by itself. Moving
// is still possible, so any click or key during the short banner cancels it.
function maybeAutoEnd(): void {
  if (!PACE.autoEnd || busy || S.over || S.phase !== "player" || !actedThisTurn) return;
  if (!onlyMovesLeft(S)) return;
  $("autoend").textContent = "Nothing left to play: ending the turn (click to stay)";
  autoTimer = setTimeout(() => {
    autoTimer = null;
    $("autoend").textContent = "";
    void doAction({ kind: "end" });
  }, TIMING.autoEndDelay * animFactor());
}
function cancelAutoEnd(): void {
  if (!autoTimer) return;
  clearTimeout(autoTimer);
  autoTimer = null;
  actedThisTurn = false; // don't ask again until the next action
  $("autoend").textContent = "";
}

// Plays the events; returns the wait the pace model predicts (ms, before ?fast).
async function playEvents(events: GameEvent[], before: State): Promise<number> {
  const sideOf = new Map<number, Side>(before.units.map((u) => [u.id, u.side]));
  for (const e of events) if (e.t === "summon" && e.unit != null) sideOf.set(e.unit, "P");
  const delays = stepDelays(events, sideOf, PACE);
  const k = animFactor();
  for (const d of delays) {
    const group = events.filter((e) => e.step === d.step);
    const now = performance.now() / 1000;
    for (const e of group) {
      if (e.text) log.push(e.text);
      if (skipping) {
        applyShown(e);
        continue;
      }
      if (e.t === "act" && e.unit != null) stage.play(e.unit, "attack", now);
      if (e.t === "damage" && e.unit != null) {
        applyShown(e);
        setTimeout(() => {
          stage.play(e.unit!, "hit", performance.now() / 1000);
          pop(e.unit!, `-${e.amount}`, e.kind ? "#ffb070" : "#ff5a48");
        }, TIMING.hitDelay * k);
      }
      if (e.t === "heal" && e.unit != null) {
        applyShown(e);
        pop(e.unit, `+${e.amount}`, "#7dff9a");
      }
      if (e.t === "block" && e.unit != null) {
        applyShown(e);
        pop(e.unit, `+${e.amount} block`, "#8fd0ff");
      }
      if (e.t === "move" && e.unit != null && e.side && e.to != null)
        stage.moveUnit(e.unit, e.side, e.to, now, TIMING.move / 1000);
      if (e.t === "death" && e.unit != null) {
        if (e.kind === "downed") pop(e.unit, "knocked out!", "#cccccc");
        setTimeout(
          () => stage.play(e.unit!, "death", performance.now() / 1000),
          TIMING.deathDelay * k,
        );
      }
      if (e.t === "summon") applyShown(e);
      if (e.t === "fizzle" && e.unit != null)
        pop(
          e.unit,
          e.kind === "fallback" ? "out of position: switches" : "out of position!",
          "#cccccc",
        );
      if (e.t === "collide" && e.unit != null) pop(e.unit, "crash!", "#ffd65a");
      if (e.t === "wall" && e.unit != null) pop(e.unit, "wall slam!", "#ffd65a");
      if (e.t === "combo" && e.side && e.slot != null)
        stage.burst(e.side, e.slot, e.kind === "flash" ? "#c8ff60" : "#ff6a20");
    }
    // a skipped step still has to put moved and new units where they belong
    if (skipping)
      for (const e of group) {
        if (e.t === "move" && e.unit != null && e.side && e.to != null) {
          stage.moveUnit(e.unit, e.side, e.to, now, 0.001);
        }
        if (e.t === "death" && e.unit != null) stage.play(e.unit, "death", now - 10);
      }
    updateGround(S);
    refreshLabels();
    $("preview").innerHTML = logHtml();
    await wait(d.ms);
  }
  if (skipping) stage.finish();
  return delays.reduce((a, d) => a + d.ms, 0);
}

// Keep the shown HP/block in step with the events (labels show these while animating).
function applyShown(e: GameEvent): void {
  if (e.unit == null) return;
  if (e.t === "summon" && e.kind) {
    const u = unitById(S, e.unit);
    const hp = u?.hp ?? PLAYER_KINDS[e.kind].hp;
    stage.removeUnit(e.unit); // a pet coming back after its fall
    stage.addUnit(e.unit, e.kind, e.side ?? "P", e.slot ?? 0, true);
    shown.set(e.unit, { hp, maxHp: u?.maxHp ?? hp, block: 0 });
    return;
  }
  const sh = shown.get(e.unit);
  if (!sh) return;
  if (e.t === "damage") {
    const blocked = Math.max(0, sh.hp - (e.hp ?? sh.hp) - (e.amount ?? 0));
    sh.block = Math.max(0, sh.block - blocked);
    sh.hp = e.hp ?? sh.hp;
  }
  if (e.t === "heal") sh.hp = e.hp ?? sh.hp;
  if (e.t === "block") sh.block += e.amount ?? 0;
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

// Who would play this card: the pile's unit (squad), else the first living owner.
function cardUser(pile: string, name: string) {
  if (S.opts.deck === "squad") return unitById(S, Number(pile));
  const owners = S.units.filter((u) => u.side === "P" && u.kind === ownerOf(name));
  return owners.find((u) => legalTargets(S, u, cardAbility(name)).length) ?? owners[0];
}

function cardWhy(pile: string, name: string): string {
  const c = cardAbility(name);
  const u = cardUser(pile, name);
  if (!u) return `${unitName(ownerOf(name))} is not here`;
  if (S.opts.deck === "squad") {
    if (u.ap <= 0) return "no actions left";
    if (cardCost(S, name) > u.ap) return `needs ${cardCost(S, name)} actions`;
  } else if (cardCost(S, name) > S.energy) return "not enough energy";
  if (c.effects.some((e) => e.op === "summon") && summonCount(S) >= MAX_SUMMONS)
    return "2 summons already";
  if (!cardUsers(S, pile, name).some((x) => legalTargets(S, x, c).length)) {
    if (!c.from.includes(slotOf(S, u)))
      return `${unitName(u.kind).toLowerCase()} must stand in slot ${c.from.map((x) => x + 1).join("/")}`;
    return "no target in reach";
  }
  return "";
}

function cardHtml(pile: string, name: string, i: number, badge: boolean): string {
  const c = cardAbility(name);
  const u = cardUser(pile, name);
  const here = u ? slotOf(S, u) : null;
  const why = S.phase !== "player" ? "" : cardWhy(pile, name);
  const side = u ? targetSide(u, c) : "E";
  const isSel = sel?.kind === "card" && sel.pile === pile && sel.index === i;
  const cls = ["card", isSel ? "sel" : "", why ? "off" : ""].join(" ");
  const own = ownerOf(name);
  const cost = S.opts.deck === "squad" ? cardCost(S, name) : (c.cost ?? 0);
  return `<div class="${cls}" data-pile="${pile}" data-card="${i}"><div class="cost">${cost}</div>${badge ? `<div class="owner ${own}">${esc(unitName(own))}</div>` : ""}<div class="cname">${esc(c.name)}</div>${laneHtml(c, here, side)}<div class="ctext">${esc(c.text)}</div>${why ? `<div class="why">${esc(why)}</div>` : ""}</div>`;
}

// hero model with one-click: pet and summon abilities sit in the hand bar as cards
function abilityCardsHtml(): string {
  let h = "";
  for (const u of S.units) {
    if (u.side !== "P" || u.kind === "hero") continue;
    const slot = slotOf(S, u);
    for (const ab of PLAYER_KINDS[u.kind].abilities) {
      const cd = u.cooldowns[ab.id] ?? 0;
      const why =
        u.ap <= 0
          ? "already acted"
          : cd
            ? `ready in ${cd}`
            : !ab.from.includes(slot)
              ? `needs slot ${ab.from.map((x) => x + 1).join("/")}`
              : !legalTargets(S, u, ab).length
                ? "no target"
                : "";
      const isSel = sel?.kind === "ability" && sel.unit === u.id && sel.ability === ab.id;
      h += `<div class="card ability ${isSel ? "sel" : ""} ${why ? "off" : ""}" data-unit="${u.id}" data-ab="${ab.id}"><div class="owner ${u.kind}">${esc(unitName(u.kind))}</div><div class="cname">${esc(ab.name)}</div>${laneHtml(ab, slot, targetSide(u, ab))}<div class="ctext">${esc(ab.text)}</div>${why ? `<div class="why">${esc(why)}</div>` : ""}</div>`;
    }
  }
  return h;
}

function renderHand(): void {
  const deck = S.opts.deck;
  let h = "";
  let count = 0;
  if (deck === "squad") {
    for (const id of [...S.slots.P].reverse()) {
      // back slot first: the same left-to-right order as on screen
      const u = unitById(S, id);
      const p = u && S.piles[String(u.id)];
      if (!u || !p) continue;
      count += p.hand.length;
      const cards = p.hand.map((n, i) => cardHtml(String(u.id), n, i, false)).join("");
      h += `<div class="group"><div class="glabel">${esc(unitName(u.kind))} · <b>${u.ap}</b> action${u.ap === 1 ? "" : "s"}</div><div class="ghand">${cards || '<div class="help">no cards</div>'}</div></div>`;
    }
  } else {
    const hand = handOf("main");
    count = hand.length;
    h = hand.map((n, i) => cardHtml("main", n, i, deck === "party")).join("");
    if (deck === "hero" && PACE.oneClick) {
      const ab = abilityCardsHtml();
      count += (ab.match(/class="card/g) ?? []).length;
      h += ab;
    }
  }
  const el = $("hand");
  el.classList.toggle("compact", count > 6);
  el.classList.toggle("tight", count > 8);
  el.innerHTML = h;
  for (const c of el.querySelectorAll<HTMLElement>(".card")) {
    c.onpointerdown = (ev) => {
      ev.stopPropagation();
      if (c.dataset.ab) selectAbility(Number(c.dataset.unit), c.dataset.ab);
      else startDrag(ev, c.dataset.pile!, Number(c.dataset.card));
    };
  }
  $("energy").innerHTML = `${S.energy}<small>/ ${ENERGY} energy</small>`;
  ($("end") as HTMLButtonElement).disabled = (busy && !PACE.buffer) || !!S.over;
}

function renderUnitPanel(): void {
  const p = $("unitpanel");
  const id = sel && sel.kind !== "card" ? sel.unit : null;
  const u = id != null ? unitById(S, id) : undefined;
  const deck = S.opts.deck;
  if (!u) {
    const how =
      deck === "hero"
        ? `Click a <b>card</b> to play it with the hero${PACE.oneClick ? ", or a pet or summon <b>ability</b> card (dashed)" : ", or click one of <b>your units</b> to use its abilities"}.`
        : deck === "party"
          ? "One shared deck. The tag on each card says <b>who plays it</b>, from that unit's slot. Energy is shared."
          : "Every unit has its <b>own hand</b> and actions: a card or a move each.";
    p.innerHTML = `<div class="ph">Your turn</div><div class="help">${how} Click one of your units to move it (swap with a neighbour).<br><br>Red rings and numbers: where enemies will hit next. Hover a lit target to see exactly what happens.${PACE.oneClick ? " Cards with one target play on click; you can also drag a card onto a slot." : ""}</div>`;
    return;
  }
  const kind = u.side === "P" ? PLAYER_KINDS[u.kind] : ENEMY_KINDS[u.kind];
  const slot = slotOf(S, u);
  let h = `<div class="ph">${esc(kind.name)} <span class="help">(slot ${slot + 1}, ${kind.role})</span></div>`;
  h += `<div>HP ${u.hp}/${u.maxHp}${u.armour ? `, armour ${u.armour}` : ""}${u.heavy ? ", heavy (ignores 1-slot push/pull)" : ""}${u.block ? `, block ${u.block}` : ""}</div>`;
  const moveCost =
    u.kind === "hero" && deck !== "squad"
      ? "1 energy"
      : deck === "party"
        ? "its free move"
        : "one action";
  if (u.side === "P")
    h += `<div class="help" style="margin-top:4px">Click a lit neighbour slot to swap places (${moveCost}).</div>`;
  if (deck === "hero" && u.side === "P" && u.kind !== "hero")
    for (const ab of kind.abilities) {
      const cd = u.cooldowns[ab.id] ?? 0;
      const usable = u.ap > 0 && cd === 0 && legalTargets(S, u, ab).length > 0;
      const why =
        u.ap <= 0
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
  if (u.side === "E")
    for (const ab of kind.abilities)
      h += `<div class="ab off"><b>${esc(ab.name)}</b>${laneHtml(ab, slot, targetSide(u, ab))}<div>${esc(ab.text)}</div></div>`;
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

// Units that still have something to do this turn ("ready" tag).
function readyUnits(view: State): Set<number> {
  const out = new Set<number>();
  if (view.phase !== "player") return out;
  for (const a of legalActions(view))
    if (a.kind === "card" || a.kind === "ability") out.add(a.unit);
  return out;
}

// Labels over units (name, HP, block, intent) and on the floor (slot number, hazards,
// incoming damage). `view` is the real state, or a preview of an action while hovering.
function refreshLabels(view: State = S): void {
  const labels = $("labels");
  const present = new Set<string>();
  const showIntents = !busy || animKind === "player";
  const th = showIntents ? threats(view) : [];
  const ready = busy ? new Set<number>() : readyUnits(view);
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
    if (u && u.side === "P" && ready.has(u.id)) tags += `<span class="tag ready">ready</span>`;
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
  if (!it) return `<span class="intent move">gets ready</span>`;
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
  const dmg = threats(view).find((t) => t.from === e.id && t.damage)?.damage ?? 0;
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
  const sub = out && view.opts.fallback ? fallbackText(view, e.id) : "";
  return `<span class="intent ${out ? "fizzle" : ""}">${esc(ab.name)}${dmg && !out ? ` ${dmg}` : ""}${extra ? ` (${extra})` : ""} <span class="tgt">→ slot ${slots.map((x) => x + 1).join("+") || "none"}</span></span>${sub}`;
}

// With the fallback fix, an enemy out of position shows what it will do instead.
function fallbackText(view: State, id: number): string {
  const t = threats(view).filter((x) => x.from === id);
  if (!t.length) return `<br><span class="intent move">instead: moves into position</span>`;
  const dmg = t.reduce((a, x) => Math.max(a, x.damage), 0);
  return `<br><span class="intent">instead: ${dmg ? `${dmg} ` : ""}→ slot ${t.map((x) => x.slot + 1).join("+")}</span>`;
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

function actionTitle(a: Action): string {
  if (a.kind === "card") {
    const c = cardAbility(handOf(a.pile)[a.card]);
    const u = unitById(S, a.unit)!;
    return `${unitName(u.kind)}: ${c.name} → ${targetSide(u, c) === "P" ? "your" : "enemy"} slot ${a.target + 1}`;
  }
  if (a.kind === "move") return `Move → slot ${a.to + 1}`;
  if (a.kind === "ability")
    return `${abilityOf(unitById(S, a.unit)!, a.ability)!.name} → slot ${a.target + 1}`;
  return "End turn";
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
      if (
        !ring &&
        u &&
        sel?.kind === "card" &&
        cardUser(sel.pile, handOf(sel.pile)[sel.index] ?? "")?.id === u.id
      )
        ring = "active";
      stage.setRing(side, i, ring);
    }
  // banner
  $("banner").textContent = S.over
    ? S.over === "win"
      ? "Victory"
      : "Defeat"
    : busy && animKind === "enemy"
      ? "Enemy turn"
      : `Round ${S.round} · Your turn`;
  $("banner").className = busy && animKind === "enemy" && !S.over ? "enemy" : "";
  const piles = Object.values(S.piles);
  const deckLeft = piles.reduce((a, p) => a + p.deck.length, 0);
  const discard = piles.reduce((a, p) => a + p.discard.length, 0);
  const budget = S.opts.deck === "squad" ? "own actions per unit" : `${S.energy} energy`;
  $("sub").textContent =
    `${S.name} · deck ${S.opts.deck} · ${budget} · draw ${deckLeft}, discard ${discard}${pending ? " · next action queued" : ""}`;
  renderHand();
  renderUnitPanel();
  // preview of the hovered action, else the log
  const a = hover ? cand.get(`${hover.side}${hover.slot}`) : undefined;
  if (a && (!busy || PACE.buffer)) {
    const c = clone(S);
    apply(c, a);
    $("preview").innerHTML =
      eventsHtml(actionTitle(a), c.events) +
      '<div class="help" style="margin-top:6px">Enemy intents above show the result.</div>';
    if (!busy) {
      updateGround(c);
      refreshLabels(c);
    }
  } else {
    if (!busy)
      $("preview").innerHTML =
        sel?.kind === "card" || sel?.kind === "ability"
          ? `<div class="ph">Pick a target</div><div class="help">Lit rings are legal targets. Hover one for the exact result; click to play. Right-click or Esc cancels.</div>`
          : logHtml();
    if (!busy) updateGround(S);
    refreshLabels(busy ? S : v);
  }
}

// ---------------- input -----------------------------------------------------------

// Drag a card onto a slot to play it (one gesture). A press without moving just selects.
let drag: { x: number; y: number; moved: boolean; toggle: boolean } | null = null;
function startDrag(ev: PointerEvent, pile: string, index: number): void {
  const already = sel?.kind === "card" && sel.pile === pile && sel.index === index;
  if (!already) selectCard(pile, index);
  if (sel?.kind !== "card") return; // played at once (one target) or not selectable
  drag = { x: ev.clientX, y: ev.clientY, moved: false, toggle: already };
}
addEventListener("pointermove", (ev) => {
  if (!drag) return;
  if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) > 12) drag.moved = true;
  if (drag.moved) setHover(stage.pick(ev.clientX, ev.clientY));
});
addEventListener("pointerup", (ev) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.moved) {
    const p = stage.pick(ev.clientX, ev.clientY);
    const a = p && candidates().get(`${p.side}${p.slot}`);
    if (a) void doAction(a);
  } else if (d.toggle) {
    sel = null;
    refresh();
  }
});

function setHover(p: { side: Side; slot: number } | null): void {
  const key = p ? `${p.side}${p.slot}` : "";
  const old = hover ? `${hover.side}${hover.slot}` : "";
  if (key === old) return;
  hover = p;
  refresh();
}

const canvas = stage.renderer.domElement;
canvas.addEventListener("click", (ev) => {
  const p = stage.pick(ev.clientX, ev.clientY);
  if (p) clickSlot(p.side, p.slot);
  else {
    cancelAutoEnd();
    if (busy && PACE.skip) skip();
    sel = null;
    refresh();
  }
});
canvas.addEventListener("mousemove", (ev) => {
  if (!drag) setHover(stage.pick(ev.clientX, ev.clientY));
});
canvas.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  sel = null;
  refresh();
});
addEventListener("keydown", (ev) => {
  cancelAutoEnd();
  if (ev.key === "Escape") {
    sel = null;
    refresh();
  }
  if (ev.key === " " && PACE.skip) {
    ev.preventDefault();
    skip();
  }
  if (ev.key === "e" || ev.key === "E") void doAction({ kind: "end" });
  const n = Number(ev.key);
  const first = S.opts.deck === "squad" ? String(hero(S)?.id) : "main"; // the hero's hand
  if (n >= 1 && first && n <= handOf(first).length) selectCard(first, n - 1);
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
  pace: () => PACE,
  timing: () => lastTiming,
  start: startFight,
  selectCard,
  selectUnit: (id: number) => {
    sel = { kind: "unit", unit: id };
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
      cancelAutoEnd();
      if (S.over || S.phase !== "player") break;
      await doAction(a);
      if (S.over || a.kind === "end") break;
    }
  },
  // put cards in a hand: the main pile, or a unit's pile in squad
  setHand: (cards: string[], pile = Object.keys(S.piles)[0]) => {
    S.piles[pile].hand = cards;
    refresh();
  },
  clear: () => {
    sel = null;
    hover = null;
    refresh();
  },
  setFast: (on: boolean) => {
    FAST = on;
    stage.speed = 1 / animFactor();
  },
  slotScreen: (side: Side, slot: number) => stage.screen(stage.slotPos(side, slot).setY(1)),
};
