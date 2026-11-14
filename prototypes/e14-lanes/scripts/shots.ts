// Headless screenshots of a few fight moments (chrome-headless-shell, no window ever opens).
// Run after `vp build`: node scripts/shots.ts   -> shots/*.png (gitignored)
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

const cache = join(homedir(), "Library/Caches/ms-playwright");
const dir = (await readdir(cache))
  .filter((d) => d.startsWith("chromium_headless_shell-"))
  .sort()
  .pop();
if (!dir)
  throw new Error(
    "no chrome-headless-shell: vp exec playwright-core install chromium-headless-shell",
  );
const sub = (await readdir(join(cache, dir))).find((d) => d.startsWith("chrome-headless-shell"));
const browser = await chromium.launch({
  executablePath: join(cache, dir, sub!, "chrome-headless-shell"),
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
async function open(q: string) {
  await page.goto(`http://127.0.0.1:${port}/?shot&fast&${q}`);
  await page.waitForFunction(() => !!window.__lanes, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
}
// 1. A fight starts: intents with target slots, red threat rings, the hand.
await open("fight=3");
await shot("1-start-intents");

// 2. Card preview: Firebolt aimed at an oiled slot shows the Blaze before you play it.
await page.evaluate(() => window.__lanes.setHand(["firebolt", "strike", "oil", "hook", "ward"]));
await page.evaluate(() => window.__lanes.selectCard(0));
await page.evaluate(() => window.__lanes.hover("E", 1));
await shot("2-card-preview-blaze");

// 3. Companion ability preview: the Rustback drags a back-row enemy into the line;
//    the preview lists the crash and the intents update (an archer goes out of position).
await page.evaluate(() => window.__lanes.clear());
await page.evaluate(() => {
  const s = window.__lanes.state();
  const b = s.units.find((u: any) => u.kind === "beetle");
  window.__lanes.selectAbility(b.id, "drag");
  window.__lanes.hover("E", 3);
});
await shot("3-pull-preview");

// 4. Play the bot's turn (all but End turn), then catch the enemy turn mid-animation.
await page.evaluate(() => window.__lanes.clear());
await page.evaluate(() => window.__lanes.botTurn(true));
await idle(page);
await shot("4-after-player-turn");
await page.evaluate(() => window.__lanes.setFast(false));
await page.evaluate(() => void window.__lanes.act({ kind: "end" }));
await page.waitForTimeout(1400);
await shot("5-enemy-turn", false);
await idle(page);
await shot("5b-next-turn");

// 6. Later in a hard fight: summons, ground effects, ward.
await open("fight=6");
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => window.__lanes.botTurn());
  await idle(page);
}
await shot("6-mid-fight");

// 7. Win screen.
await open("fight=1");
for (let i = 0; i < 12; i++) {
  const over = await page.evaluate(() => window.__lanes.state().over);
  if (over) break;
  await page.evaluate(() => window.__lanes.botTurn());
  await idle(page);
}
await page.waitForTimeout(800);
await shot("7-victory");

// 8. Real mouse input: click a Strike card, hover the front enemy (the preview fills in),
//    click it, and check the enemy lost HP.
await open("fight=2");
await page.evaluate(() => window.__lanes.setHand(["strike", "shove", "firebolt", "ward", "hook"]));
await page.click(".card >> nth=0");
const target = await page.evaluate(() => window.__lanes.slotScreen("E", 0));
await page.mouse.move(target.x, target.y);
await page.waitForTimeout(400);
const previewText = await page.textContent("#preview");
if (!previewText?.includes("Strike")) errors.push(`hover preview missing: ${previewText}`);
await shot("8-mouse-hover-preview");
const before = await page.evaluate(
  () => window.__lanes.state().units.find((u: any) => u.side === "E").hp,
);
await page.mouse.click(target.x, target.y);
await idle(page);
const after = await page.evaluate(
  () => window.__lanes.state().units.find((u: any) => u.side === "E").hp,
);
if (!(after < before)) errors.push(`mouse click did not play the card (${before} -> ${after})`);
console.log(`mouse play: front enemy HP ${before} -> ${after}`);

await browser.close();
server.close();
if (errors.length) {
  console.error("page errors:\n" + errors.join("\n"));
  process.exit(1);
}
console.log(`${shots.length} shots in ${out}`);
