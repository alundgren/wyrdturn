// Headless shots of the polyfork monsters, paint overlay off/on. chrome-headless-shell only.
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, extname } from "node:path";
import { chromium } from "playwright-core";
const root = new URL("../dist/", import.meta.url).pathname,
  out = new URL("../shots/", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript" };
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
const logs = [];
page.on("console", (m) => logs.push(m.text()));
page.on("pageerror", (e) => logs.push("ERR " + e));
await page.goto(`http://127.0.0.1:${server.address().port}/?shot&look=moody&time=day`);
await page.waitForFunction(() => window.__game?.isIdle(), null, { timeout: 60000 });
for (const [name, x, y, f, paint] of [
  ["mobs", 6, 6, 0, 0],
  ["mobs-paint", 6, 6, 0, 1],
  ["ghoul-close", 4, 6, 0, 0],
  ["warrior-close", 8, 6, 0, 1],
]) {
  await page.evaluate(
    ([x, y, f, p]) => {
      window.__game.setPaint(p);
      window.__game.setState(x, y, f);
    },
    [x, y, f, paint],
  );
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}e9-${name}.png` });
}
console.log(logs.filter((l) => /mob|ERR|error/i.test(l)).join("\n"));
await browser.close();
server.close();
