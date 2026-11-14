// Headless screenshots of e15 fight moments (chrome-headless-shell, no window ever opens).
// Run after `vp build`: node scripts/shots.ts   -> shots/*.png (gitignored)
// Finds Playwright's chrome-headless-shell in ~/.cache/ms-playwright (Linux) or
// ~/Library/Caches/ms-playwright (macOS). Install it with
//   vp exec playwright-core install chromium-headless-shell
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { chromium, type Page } from "playwright-core";
import { type Moment, findMoments } from "./moments.ts";

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

async function findShell(): Promise<string> {
  const caches = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(homedir(), ".cache/ms-playwright"),
    join(homedir(), "Library/Caches/ms-playwright"),
  ].filter((d): d is string => !!d && existsSync(d));
  for (const cache of caches) {
    const dirs = (await readdir(cache))
      .filter((d) => d.startsWith("chromium_headless_shell-"))
      .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
    for (const dir of dirs) {
      for (const sub of await readdir(join(cache, dir))) {
        const exe = join(cache, dir, sub, "chrome-headless-shell");
        if (sub.startsWith("chrome-headless-shell") && existsSync(exe)) return exe;
      }
    }
  }
  throw new Error(
    "no chrome-headless-shell: vp exec playwright-core install chromium-headless-shell",
  );
}

const moments = findMoments();
console.log(
  "moments:",
  Object.entries(moments)
    .map(([k, m]) => `${k} ${m.fight ? `fight ${m.fight}` : `gen ${m.gen}`} window ${m.window}`)
    .join(", "),
);

const browser = await chromium.launch({
  executablePath: await findShell(),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

const idle = (p: Page) =>
  p.waitForFunction(() => window.__hex && !window.__hex.busy(), null, { timeout: 180000 });
const shots: string[] = [];
async function shot(name: string, freeze = true) {
  if (freeze) await page.evaluate(() => (window.__freeze = 1000));
  await page.waitForTimeout(freeze ? 900 : 50);
  await page.screenshot({ path: `${out}${name}.png` });
  if (freeze) await page.evaluate(() => (window.__freeze = undefined));
  shots.push(name);
  console.log("shot", name);
}
async function open(q: string) {
  await page.goto(`http://127.0.0.1:${port}/?shot&fast&${q}`);
  await page.waitForFunction(() => !!window.__hex, null, { timeout: 120000 });
  await page.waitForTimeout(1200);
}
/** Let the strong bot play windows until window w is open. */
async function playTo(w: number) {
  for (let k = 0; k < w; k++) {
    if (await page.evaluate(() => !!window.__hex.state().over)) break;
    await page.evaluate(() => window.__hex.botPlan());
    await page.evaluate(() => void window.__hex.commit());
    await idle(page);
  }
}
async function reach(m: Moment, label: string) {
  await open(query(m));
  await playTo(m.window);
  const h = await page.evaluate(() => window.__hex.hash());
  if (h !== m.hash)
    errors.push(`${label}: the view reached state ${h}, the rules run reached ${m.hash}`);
}
const query = (m: Moment) =>
  m.fight ? `fight=${m.fight}&seed=${m.seed}` : `gen=${m.gen}&seed=${m.seed}`;

// 1. Deployment: hero selected, blue entry hexes lit, hovering one previews interval 1 from there.
await open("fight=2");
await page.evaluate(() => {
  const h = window.__hex.allies().find((u: any) => u.kind === "hero");
  window.__hex.click(h.cell);
  window.__hex.hover(2 * 7 + 1);
});
await shot("1-deployment");

// 2. The exact preview of the next interval: paths, attacks, footprints, the wolf's reason.
await page.evaluate(() => window.__hex.clear());
await playTo(1);
await page.evaluate(() => {
  const w = window.__hex.allies().find((u: any) => u.kind === "wolf");
  if (w) window.__hex.hover(w.cell);
});
await shot("2-next-interval-preview");

// 3. A push or pull into fire / a blaze: hover the card first, then watch it resolve.
const push = moments.push;
if (push) {
  await reach(push, "push");
  for (const cmd of push.cmds) {
    const id = await page.evaluate(
      (c: any) => (c.t === "card" ? window.__hex.state().hand[c.index] : ""),
      cmd,
    );
    if (cmd.t === "card" && (id === "shoulder" || id === "hook")) {
      await page.evaluate((c: any) => {
        window.__hex.selectCard(c.index);
        window.__hex.hover(c.target);
      }, cmd);
      await shot("3-push-into-hazard-preview");
    }
    await page.evaluate((c: any) => window.__hex.act(c), cmd);
  }
  await shot("3b-after-push");
} else errors.push("no push-into-hazard moment found");

// 4. A saved pet: passing would kill the wolf (pale HP), the bot's cards keep it alive.
const pet = moments.pet;
if (pet) {
  await reach(pet, "pet");
  for (const cmd of pet.cmds)
    if (cmd.t === "priority") await page.evaluate((c: any) => window.__hex.act(c), cmd);
  await page.evaluate(() => {
    const w = window.__hex.allies().find((u: any) => u.kind === "wolf");
    if (w) window.__hex.hover(w.cell);
  });
  await shot("4a-pet-in-danger");
  const cards = pet.cmds.filter((c) => c.t === "card");
  for (let k = 0; k < cards.length; k++) {
    if (k === cards.length - 1)
      await page.evaluate((c: any) => {
        window.__hex.selectCard(c.index);
        window.__hex.hover(c.target);
      }, cards[k]);
    else await page.evaluate((c: any) => window.__hex.act(c), cards[k]);
  }
  await shot("4b-pet-saved-preview");
  await page.evaluate(() => window.__hex.clear());
} else errors.push("no saved-pet moment found");

// 5. A deliberate pass: cards are legal, but the next interval already does the job.
const pass = moments.pass;
if (pass) {
  await reach(pass, "pass");
  await shot("5-deliberate-pass");
} else errors.push("no deliberate-pass moment found");

// 6. Victory, and a capture mid-playback on the way.
await open("fight=1&seed=1");
await playTo(1);
await page.evaluate(() => {
  window.__hex.setFast(false);
  window.__hex.botPlan();
  void window.__hex.commit();
});
await page.waitForTimeout(1500);
await shot("6a-playback", false);
await idle(page);
await page.evaluate(() => window.__hex.setFast(true));
await playTo(16);
await page.waitForTimeout(600);
await shot("6-victory");

// 7. Real mouse input: deploy by clicking, click a card, hover a lit hex (the preview fills
//    in), click it, and check that the card was played.
await open("fight=1&seed=2");
const heroCell = await page.evaluate(
  () => window.__hex.allies().find((u: any) => u.kind === "hero").cell,
);
let p = await page.evaluate((c) => window.__hex.cellScreen(c), heroCell);
await page.mouse.click(p.x, p.y);
const entry = 3 * 7;
p = await page.evaluate((c) => window.__hex.cellScreen(c), entry);
await page.mouse.click(p.x, p.y);
const moved = await page.evaluate(
  () => window.__hex.allies().find((u: any) => u.kind === "hero").cell,
);
if (moved !== entry) errors.push(`mouse deploy failed: hero on ${moved}, wanted ${entry}`);
await page.click("#end");
await idle(page);
await page.evaluate(() => window.__hex.setHand(["firebolt", "ward", "oil", "hook", "reposition"]));
await page.click(".card >> nth=0");
const targets: number[] = await page.evaluate(() => window.__hex.cands());
const t = targets[Math.floor(targets.length / 2)];
p = await page.evaluate((c) => window.__hex.cellScreen(c), t);
await page.mouse.move(p.x, p.y);
await page.waitForTimeout(300);
const previewText = await page.textContent("#preview");
if (!previewText?.includes("Firebolt"))
  errors.push(`hover preview missing: ${previewText?.slice(0, 120)}`);
await shot("7-mouse-hover-preview");
const before = await page.evaluate(() => window.__hex.state().energy);
await page.mouse.click(p.x, p.y);
const after = await page.evaluate(() => window.__hex.state().energy);
if (!(after < before))
  errors.push(`mouse click did not play the card (energy ${before} -> ${after})`);
console.log(`mouse play: energy ${before} -> ${after}`);

// frame time in this headless browser (SwiftShader: software, far slower than a real GPU)
await page.waitForTimeout(2000);
const ft: number[] = await page.evaluate(() => window.__hex.frameTimes());
ft.sort((a, b) => a - b);
console.log(
  `frame time (SwiftShader, 1280x720): median ${ft[Math.floor(ft.length / 2)].toFixed(1)} ms, p95 ${ft[Math.floor(ft.length * 0.95)].toFixed(1)} ms`,
);

await browser.close();
server.close();
if (errors.length) {
  console.error("errors:\n" + errors.join("\n"));
  process.exit(1);
}
console.log(`${shots.length} shots in ${out}`);
