// Headless screenshots. Uses Playwright's chrome-headless-shell binary, a plain
// executable with no app bundle or window. Never opens anything on the desktop.
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, extname } from "node:path";
import { chromium } from "playwright-core";

const root = new URL("../dist/", import.meta.url).pathname;
const out = new URL("../shots/", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  const f = p.endsWith("/") ? join(p, "index.html") : p;
  try {
    res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" });
    res.end(await readFile(f));
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const url = `http://127.0.0.1:${server.address().port}/?shot`;

const cache = join(homedir(), "Library/Caches/ms-playwright");
const dir = (await readdir(cache))
  .filter((d) => d.startsWith("chromium_headless_shell-"))
  .sort()
  .pop();
const sub = (await readdir(join(cache, dir))).find((d) => d.startsWith("chrome-headless-shell"));
const exe = join(cache, dir, sub, "chrome-headless-shell");
if (!existsSync(exe)) throw new Error("chrome-headless-shell not found");

const browser = await chromium.launch({
  executablePath: exe,
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(url);
await page.waitForFunction(() => window.__game?.isIdle());
await page.waitForTimeout(300);

const idle = () => page.waitForFunction(() => window.__game.isIdle(), null, { timeout: 5000 });
const shot = async (name) => {
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${out}${name}.png` });
  console.log("shot", name, await page.evaluate(() => JSON.stringify(window.__game.ctrl.state)));
};

const run = async (...acts) => {
  for (const a of acts) {
    await page.evaluate((a) => window.__game.press(a), a);
    await idle();
  }
};
await shot("01-start");
await page.evaluate(() => window.__game.press("turnRight"));
await page.waitForTimeout(70);
await page.screenshot({ path: `${out}02-mid-turn.png` });
await idle();
await run("forward", "turnLeft", "forward", "forward", "forward");
await shot("03-corridor-north");
await run("forward", "forward", "turnRight");
await shot("04-facing-door");
await run("forward");
await shot("05-before-door");
await run("forward", "forward");
await page.evaluate(() => window.__game.press("forward")); // (7,3) is wall -> bump
await page.waitForTimeout(80);
await page.screenshot({ path: `${out}06-mid-bump.png` });
await idle();
await shot("07-after-bump");
await browser.close();
server.close();
if (errors.length) {
  console.error("page errors:\n" + errors.join("\n"));
  process.exit(1);
}
