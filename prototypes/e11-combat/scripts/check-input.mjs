// Headless self-check of the playable slice (chrome-headless-shell, no window).
// Plays a scripted path and saves screenshots + a contact sheet + errors to shots/game-*.
import { createServer } from "node:http";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, extname } from "node:path";
import { chromium } from "playwright-core";
const root = new URL("../dist/", import.meta.url).pathname,
  out = new URL("../shots/", import.meta.url).pathname;
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".png": "image/png",
  ".webp": "image/webp",
  ".glb": "model/gltf-binary",
};
const server = createServer(async (req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
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
const cache = join(homedir(), "Library/Caches/ms-playwright");
const dir = (await readdir(cache))
  .filter((d) => d.startsWith("chromium_headless_shell-"))
  .sort()
  .pop();
const sub = (await readdir(join(cache, dir))).find((d) => d.startsWith("chrome-headless-shell"));
const browser = await chromium.launch({
  executablePath: join(cache, dir, sub, "chrome-headless-shell"),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(
  `http://127.0.0.1:${server.address().port}/?shot&look=moody${process.env.GENSEED ? "&gen=" + process.env.GENSEED : ""}${process.env.Q ? "&" + process.env.Q : ""}`,
);
await page.waitForFunction(() => window.__game?.game, null, { timeout: 90000 });
await page.goto(`http://127.0.0.1:${server.address().port}/?shot&look=moody`);
await page.waitForFunction(() => window.__game?.game, null, { timeout: 90000 });
await page.evaluate(() => {
  try {
    localStorage.clear();
  } catch {}
  window.__game.game.debug.newGame("ember", 4242);
});
await page.waitForFunction(() => !window.__game.game.debug.busy(), null, { timeout: 30000 });
// Quick-key check: a turn pressed during a move must not be lost.
let lost = 0;
const N = 8;
for (let i = 0; i < N; i++) {
  const before = await page.evaluate(() => window.__game.game.debug.run().hero.facing);
  await page.keyboard.press(i % 2 ? "KeyS" : "KeyW");
  await page.waitForTimeout(40);
  await page.keyboard.press("KeyE");
  // wait until the move, the enemy turn and the queued turn have all played out
  for (let k = 0; k < 3; k++) {
    await page.waitForTimeout(200);
    await page.waitForFunction(() => !window.__game.game.debug.busy(), null, { timeout: 15000 });
  }
  const after = await page.evaluate(() => window.__game.game.debug.run().hero.facing);
  if (after === before) lost++;
}
console.log(
  `INPUT: ${N - lost}/${N} quick turns kept; errors: ${errors.length}`,
  errors.slice(0, 3),
);
await page.screenshot({ path: new URL("../shots/check-input.png", import.meta.url).pathname });
await browser.close();
server.close();
process.exit(lost ? 1 : 0);
