// Headless screenshots of fight moments (chrome-headless-shell, no window ever opens).
// Needs a build first: vp build && node scripts/shots.ts
// Writes shots/board-*.png, a contact sheet and shots/board-check.json (page errors).
import { createServer } from "node:http";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
  ".png": "image/png",
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
  .pop()!;
const sub = (await readdir(join(cache, dir))).find((d) => d.startsWith("chrome-headless-shell"))!;
const browser = await chromium.launch({
  executablePath: join(cache, dir, sub, "chrome-headless-shell"),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors: string[] = [];
const shots: string[] = [];

async function open(q: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => errors.push(`${q}: ${String(e)}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${q}: ${m.text()}`);
  });
  await page.goto(`http://127.0.0.1:${port}/?shot&${q}`);
  await page.waitForFunction(() => (window as any).__board, null, { timeout: 120000 });
  await page.waitForTimeout(1500); // textures
  return page;
}
const idle = (page: Page) =>
  page.waitForFunction(() => !(window as any).__board.busy(), null, { timeout: 120000 });
async function shot(page: Page, name: string) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}board-${name}.png` });
  shots.push(name);
}
async function botTurns(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    const over = await page.evaluate(() => (window as any).__board.state().over);
    if (over) return;
    await page.evaluate(() => (window as any).__board.botTurn());
    await page.waitForTimeout(200);
    await idle(page);
    await page.waitForTimeout(300);
  }
}
// 1. Hand-made fight 6: first person, rising, top view
{
  const page = await open("fight=6&hold");
  await page.evaluate(() => (window as any).__board.intro(0));
  await page.waitForTimeout(400);
  await shot(page, "01-first-person");
  await page.evaluate(() => (window as any).__board.intro(0.45));
  await shot(page, "02-rising");
  await page.evaluate(() => (window as any).__board.intro(1));
  await shot(page, "03-board-intents");
  // move range of the hero, hovering a tile shows the path
  await page.evaluate(() => {
    const B = (window as any).__board;
    const s = B.state();
    const h = s.units.find((u: any) => u.kind === "hero");
    B.select(h.id);
    const d = s.board.room;
    B.hover({ x: Math.round((d.x0 + d.x1) / 2), y: Math.round((d.y0 + d.y1) / 2) });
  });
  await shot(page, "04-move-range");
  await botTurns(page, 1);
  const aimed = await page.evaluate(() => (window as any).__board.bestCard());
  console.log("card preview:", aimed?.text);
  await shot(page, "05-card-preview");
  await page.evaluate(() => (window as any).__board.hover(null));
  await page.keyboard.press("Escape");
  await botTurns(page, 1);
  await shot(page, "06-after-two-turns");
  // mid enemy phase
  await page.evaluate(() => (window as any).__board.botTurn());
  await page.waitForFunction(() => document.getElementById("banner")!.style.opacity === "1", null, {
    timeout: 60000,
  });
  await page.waitForTimeout(900);
  await shot(page, "07-enemy-phase");
  await idle(page);
  await page.close();
}
// 2. Rot Garden: oil next to a brazier, a hexer making poison
{
  const page = await open("fight=3&top");
  await idle(page);
  await botTurns(page, 2);
  await shot(page, "08-rot-garden");
  await page.close();
}
// 3. A generated fight and a summon-heavy moment
{
  const page = await open("gen=14&top");
  await idle(page);
  await shot(page, "09-generated");
  await botTurns(page, 3);
  await shot(page, "10-generated-later");
  await page.close();
}

const sheet = await browser.newPage({ viewport: { width: 3 * 640, height: 4 * 380 } });
const cells = await Promise.all(
  shots.map(
    async (n) =>
      `<figure><img src="data:image/png;base64,${(await readFile(`${out}board-${n}.png`)).toString("base64")}"><figcaption>${n}</figcaption></figure>`,
  ),
);
await sheet.setContent(
  `<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(3,640px);font:13px sans-serif;color:#ddd}figure{margin:0}img{width:640px;height:360px;display:block}figcaption{height:20px;padding-left:6px}</style>${cells.join("")}`,
);
await sheet.screenshot({ path: `${out}board-sheet.png`, fullPage: true });
await writeFile(`${out}board-check.json`, JSON.stringify({ shots, errors }, null, 2));
console.log(errors.length ? `ERRORS\n${errors.join("\n")}` : "no page errors");
await browser.close();
server.close();
