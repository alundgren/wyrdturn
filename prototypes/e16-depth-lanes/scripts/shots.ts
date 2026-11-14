// Headless screenshots of fight moments (chrome-headless-shell, no window ever opens).
// Run after `vp build`: node scripts/shots.ts   -> shots/*.png (gitignored)
import { createServer } from "node:http";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
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

// Playwright's browser cache: macOS or Linux
const caches = [
  join(homedir(), "Library/Caches/ms-playwright"),
  join(homedir(), ".cache/ms-playwright"),
].filter((c) => existsSync(c));
let exe = "";
for (const cache of caches) {
  const dir = (await readdir(cache))
    .filter((d) => d.startsWith("chromium_headless_shell-"))
    .sort()
    .pop();
  if (!dir) continue;
  const sub = (await readdir(join(cache, dir))).find((d) => d.startsWith("chrome-headless-shell"));
  if (sub) exe = join(cache, dir, sub, "chrome-headless-shell");
}
if (!exe)
  throw new Error(
    "no chrome-headless-shell: vp exec playwright-core install chromium-headless-shell",
  );
const browser = await chromium.launch({
  executablePath: exe,
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// software WebGL (SwiftShader) can take about a second a frame, so be patient
page.setDefaultTimeout(180000);
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

type Api = {
  ready: boolean;
  busy: () => boolean;
  state: () => {
    round: number;
    over: string | null;
    hand: string[];
    units: { id: number; kind: string; side: string; hp: number; lane: number; row: number }[];
  };
  act: (a: unknown) => Promise<void>;
  end: () => Promise<void>;
  select: (i: number) => void;
  hover: (a: unknown) => void;
  hoverEnd: (on: boolean) => void;
  cancel: () => void;
  botTurn: (endIt?: boolean) => Promise<void>;
  cellScreen: (lane: number, row: number) => { x: number; y: number };
};
declare global {
  interface Window {
    __e16: Api;
  }
}

const idle = (p: Page) =>
  p.waitForFunction(() => window.__e16?.ready && !window.__e16.busy(), null, { timeout: 180000 });
const shots: string[] = [];
async function shot(name: string, settle = 700) {
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${out}${name}.png` });
  shots.push(name);
  console.log("shot", name);
}
async function open(q: string) {
  await page.goto(`http://127.0.0.1:${port}/?shot&${q}`);
  await page.waitForFunction(() => window.__e16?.ready, null, { timeout: 180000 });
  await idle(page);
}
async function forceCard(name: string) {
  // put the card in hand slot 0 for a repeatable moment
  await page.evaluate((n) => {
    const s = window.__e16.state();
    s.hand[0] = n;
    window.__e16.cancel();
  }, name);
  return 0;
}

// 1. A fight starts: intents over enemies, red cells with damage on the line
await open("fight=1");
await shot("1-start-intents");

// 2. Card preview: Firebolt selected, hovering its target
let i = await forceCard("firebolt");
await page.evaluate((idx) => window.__e16.select(idx), i);
const tgt = await page.evaluate(() => {
  const s = window.__e16.state();
  const h = s.units.find((u) => u.kind === "hero")!;
  const e = s.units
    .filter((u) => u.side === "E" && u.lane === h.lane)
    .sort((a, b) => a.row - b.row)[0];
  return e ? { lane: e.lane, row: e.row } : null;
});
if (tgt)
  await page.evaluate(({ idx, c }) => window.__e16.hover({ t: "card", idx, cell: c }), {
    idx: i,
    c: tgt,
  });
await shot("2-card-preview");

// 3. Arrow Lanes: a Bone Servant in front of the hero catches the aimed shot (preview)
await open("fight=2");
i = await forceCard("servant");
await page.evaluate((idx) => window.__e16.select(idx), i);
await page.evaluate((idx) => window.__e16.hover({ t: "card", idx, cell: { lane: 1, row: 1 } }), i);
await shot("3-blocker-preview");

// 4. Oil Cellar: Firebolt into oil, the blaze preview
await open("fight=4");
await page.evaluate(() => window.__e16.botTurn(true));
await idle(page);
i = await forceCard("firebolt");
await page.evaluate((idx) => window.__e16.select(idx), i);
const t4 = await page.evaluate(() => {
  const s = window.__e16.state();
  const h = s.units.find((u) => u.kind === "hero")!;
  const e = s.units
    .filter((u) => u.side === "E" && u.lane === h.lane)
    .sort((a, b) => a.row - b.row)[0];
  return e ? { lane: e.lane, row: e.row } : null;
});
if (t4)
  await page.evaluate(({ idx, c }) => window.__e16.hover({ t: "card", idx, cell: c }), {
    idx: i,
    c: t4,
  });
await shot("4-oil-fire-preview");

// 5. Bile Choir mid-fight after three bot turns, then the end-turn preview
await open("fight=5");
for (let k = 0; k < 3; k++) {
  await page.evaluate(() => window.__e16.botTurn(true));
  await idle(page);
}
await shot("5-mid-fight");
await page.evaluate(() => window.__e16.hoverEnd(true));
await shot("6-end-turn-preview");
await page.evaluate(() => window.__e16.hoverEnd(false));

// 7. Enemy turn mid-animation
await page.evaluate(() => {
  void window.__e16.end();
});
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}7-enemy-turn.png` });
shots.push("7-enemy-turn");
await idle(page);

// 8. Real mouse input: click a card, hover a green cell, click it, check the enemy lost HP
await open("fight=1");
await page.evaluate(() => {
  const s = window.__e16.state();
  s.hand[0] = "firebolt";
  window.__e16.cancel();
});
await page.mouse.click(0, 0);
const card = page.locator(".card").first();
await card.click();
const before = await page.evaluate(() =>
  window.__e16
    .state()
    .units.filter((u) => u.side === "E")
    .reduce((a, u) => a + u.hp, 0),
);
const fb = await page.evaluate(() => {
  const s = window.__e16.state();
  const h = s.units.find((u) => u.kind === "hero")!;
  const e = s.units
    .filter((u) => u.side === "E" && u.lane === h.lane)
    .sort((a, b) => a.row - b.row)[0];
  return window.__e16.cellScreen(e.lane, e.row);
});
await page.mouse.move(fb.x, fb.y);
await shot("8-mouse-hover");
await page.mouse.click(fb.x, fb.y);
await idle(page);
const after = await page.evaluate(() =>
  window.__e16
    .state()
    .units.filter((u) => u.side === "E")
    .reduce((a, u) => a + u.hp, 0),
);
if (!(after < before)) errors.push(`mouse play did not deal damage (${before} -> ${after})`);

// 9. Play fight 1 to the end with the bot
for (let k = 0; k < 20; k++) {
  const over = await page.evaluate(() => window.__e16.state().over);
  if (over) break;
  await page.evaluate(() => window.__e16.botTurn(true));
  await idle(page);
}
await shot("9-end-screen");

await browser.close();
server.close();
console.log(`${shots.length} shots in shots/`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
