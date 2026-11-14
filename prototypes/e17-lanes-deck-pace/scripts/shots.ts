// Headless screenshots and browser checks for e17 (chrome-headless-shell, no window opens).
// Run after `vp build`: node scripts/shots.ts   -> shots/*.png (gitignored)
// Checks: real mouse play (click and drag), one-click play, auto end turn, and that the
// enemy turn takes as long in the browser as src/pace.ts says (classic vs fast).
import { createServer } from "node:http";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { chromium, type Page } from "playwright-core";

const root = new URL("../dist/", import.meta.url).pathname;
const out = new URL("../shots/", import.meta.url).pathname;
await mkdir(out, { recursive: true });
const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".webp": "image/webp",
  ".glb": "model/gltf-binary",
};
const server = createServer(async (req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
  const f = p.endsWith("/") ? join(p, "index.html") : p;
  try {
    const b = await readFile(f);
    res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" });
    res.end(b);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const port = (server.address() as AddressInfo).port;

// Playwright's browser cache: macOS, then Linux, then PLAYWRIGHT_BROWSERS_PATH.
async function findShell(): Promise<string> {
  const caches = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(homedir(), "Library/Caches/ms-playwright"),
    join(homedir(), ".cache/ms-playwright"),
  ].filter((x): x is string => !!x);
  for (const cache of caches) {
    const dir = (await readdir(cache).catch(() => [] as string[]))
      .filter((d) => d.startsWith("chromium_headless_shell-"))
      .sort()
      .pop();
    if (!dir) continue;
    const sub = (await readdir(join(cache, dir))).find((d) =>
      d.startsWith("chrome-headless-shell"),
    );
    if (sub) return join(cache, dir, sub, "chrome-headless-shell");
  }
  throw new Error(
    "no chrome-headless-shell: vp exec playwright-core install chromium-headless-shell",
  );
}
const browser = await chromium.launch({
  executablePath: await findShell(),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000); // software rendering is slow
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

const idle = (p: Page) =>
  p.waitForFunction(() => window.__lanes && !window.__lanes.busy(), null, { timeout: 120000 });
const shots: string[] = [];
async function shot(name: string, freeze = true) {
  if (freeze) await page.evaluate(() => (window.__freeze = 1000));
  await page.waitForTimeout(freeze ? 900 : 50);
  await page.screenshot({ path: `${out}${name}.png` });
  if (freeze) await page.evaluate(() => (window.__freeze = undefined));
  shots.push(name);
  console.log("shot", name);
}
async function open(q: string, fast = true) {
  await page.goto(`http://127.0.0.1:${port}/?shot&${fast ? "fast&" : ""}${q}`, {
    waitUntil: "domcontentloaded",
    timeout: 180000,
  });
  await page.waitForFunction(() => !!window.__lanes, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
}
const state = () => page.evaluate(() => window.__lanes.state());

// 1-3. The three deck models at the start of Crossfire: party (owner tags on cards),
// squad (one small hand per unit), hero (e14's hand plus the pet's abilities as cards).
for (const [i, deck] of [
  [1, "party"],
  [2, "squad"],
  [3, "hero"],
] as const) {
  await open(`deck=${deck}&autoend=0&fight=3`);
  await shot(`${i}-deck-${deck}`);
}

// 4. The new pet next to the Cave Spider (Spider Cellar).
await open("deck=party&autoend=0&fight=2");
await shot("4-pet-and-spider");

// 5. Pull preview with the fallback fix: a priest hooked into the front row shows what it
// does instead of its Fire Rain.
await open("deck=party&autoend=0&fight=4");
await page.evaluate(() => window.__lanes.setHand(["hook", "strike", "firebolt", "ward", "bite"]));
await page.evaluate(() => window.__lanes.selectCard("main", 0));
await page.evaluate(() => window.__lanes.hover("E", 2));
await shot("5-hook-preview-fallback");

// 6. Enemy turn with the fast pace: enemies act together (caught mid-animation).
await open("deck=party&autoend=0&fight=3", false);
await page.evaluate(() => window.__lanes.botTurn(true));
await idle(page);
await page.evaluate(() => void window.__lanes.act({ kind: "end" }));
await page.waitForTimeout(250);
await shot("6-enemy-turn-fast", false);
await idle(page);

// 7. Timing check: the enemy turn of The Deep Choir (4 enemies act), classic vs fast. The
// browser can only be slower than the pace model (frames and timers add time; software
// rendering adds a lot), so the check is: never faster than predicted, and fast < classic.
const timing: Record<string, { ms: number; predicted: number }> = {};
for (const pace of ["classic", "fast"]) {
  await open(`deck=party&autoend=0&fight=6&pace=${pace}`, false);
  await page.evaluate(() => window.__lanes.act({ kind: "end" }));
  await idle(page);
  const t = await page.evaluate(() => window.__lanes.timing());
  timing[pace] = t;
  console.log(
    `enemy turn, ${pace}: ${(t.ms / 1000).toFixed(2)} s in the browser, ${(t.predicted / 1000).toFixed(2)} s predicted`,
  );
  if (t.ms < t.predicted - 50)
    errors.push(`${pace} enemy turn took ${t.ms} ms, less than the ${t.predicted} ms it waits`);
}
if (!(timing.fast.ms < timing.classic.ms)) errors.push("fast enemy turn is not faster");

// 8. Mid-fight in a hard fight (squad deck), and the victory screen.
await open("deck=squad&autoend=0&fight=6");
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => window.__lanes.botTurn());
  await idle(page);
}
await shot("8-mid-fight-squad");
await open("deck=party&autoend=0&fight=1");
for (let i = 0; i < 12; i++) {
  if ((await state()).over) break;
  await page.evaluate(() => window.__lanes.botTurn());
  await idle(page);
}
await page.waitForTimeout(800);
await shot("9-victory");

// 10. Real mouse input. Drag a Strike from the hand onto the front enemy and check it hit.
await open("deck=party&autoend=0&fight=3");
await page.evaluate(() => window.__lanes.setHand(["strike", "shove", "firebolt", "ward", "hook"]));
const target = await page.evaluate(() => window.__lanes.slotScreen("E", 0));
const card = (await page.locator(".card >> nth=0").boundingBox())!;
const hpOf = async () => (await state()).units.find((u: any) => u.side === "E").hp;
let before = await hpOf();
await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
await page.mouse.down();
await page.mouse.move(target.x, target.y, { steps: 8 });
await page.waitForTimeout(200);
await shot("10-drag-preview");
await page.mouse.up();
await idle(page);
let after = await hpOf();
if (!(after < before)) errors.push(`drag did not play the card (${before} -> ${after})`);
console.log(`drag play: front enemy HP ${before} -> ${after}`);

// 11. One click: Shell Wall has a single target (the pet itself), so the card click plays it.
await open("deck=party&autoend=0&fight=1");
await page.evaluate(() => window.__lanes.setHand(["shell", "ward"]));
const blockOf = async () => (await state()).units.find((u: any) => u.kind === "hero").block;
const b0 = await blockOf();
await page.click(".card >> nth=0");
await idle(page);
const b1 = await blockOf();
if (!(b1 > b0)) errors.push(`one-click did not play Shell Wall (hero block ${b0} -> ${b1})`);
console.log(`one-click play: hero block ${b0} -> ${b1}`);

// 12. Auto end turn: with one card in hand, playing it ends the turn by itself.
await open("deck=party&fight=1");
await page.evaluate(() => window.__lanes.setHand(["strike"]));
const round0 = (await state()).round;
await page.click(".card >> nth=0");
const t0 = await page.evaluate(() => window.__lanes.slotScreen("E", 0));
if ((await state()).round === round0 && !(await page.evaluate(() => window.__lanes.busy())))
  await page.mouse.click(t0.x, t0.y);
for (let i = 0; i < 60; i++) {
  const s = await state();
  if (s.round > round0 || s.over) break;
  await page.waitForTimeout(100);
}
const round1 = (await state()).round;
console.log(`auto end: round ${round0} -> ${round1}`);
if (!(round1 > round0) && !(await state()).over) errors.push("auto end turn did not fire");

await browser.close();
server.close();
if (errors.length) {
  console.error("page errors:\n" + errors.join("\n"));
  process.exit(1);
}
console.log(`${shots.length} shots in ${out}`);
