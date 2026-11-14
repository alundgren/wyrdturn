// Headless check of the Descent flow: start -> floor 1 -> carry state -> floor 2 -> floor 3 -> end.
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
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
const ready = () => page.waitForFunction(() => window.__game?.game, null, { timeout: 120000 });
await page.goto(`http://127.0.0.1:${server.address().port}/?shot&look=moody`);
await ready();
const fails = [];
const check = (cond, msg) => {
  console.log((cond ? "ok   " : "FAIL ") + msg);
  if (!cond) fails.push(msg);
};
await page.keyboard.press("Digit1"); // Ember in Descent (default) -> navigates to floor 1
await page.waitForURL(/floor=1/);
await ready();
await page.waitForTimeout(800);
let st = await page.evaluate(() => ({
  url: location.search,
  mode: window.__game.game.debug.mode(),
  hp: window.__game.game.debug.run()?.hero.hp,
  skills: window.__game.game.debug.run()?.hero.skills,
}));
check(
  st.mode === "play" && st.hp === 30,
  `floor 1 starts in play with 30 HP (${st.mode}, ${st.hp})`,
);
await page.screenshot({ path: out + "descent-1.png" });
for (const floor of [1, 2]) {
  await page.evaluate(() => {
    const d = window.__game.game.debug;
    const r = d.run();
    r.hero.hp = 17;
    r.hero.upgrades = { ember: 2 };
    r.hero.relic = "ash";
    d.descend();
  });
  await page.waitForURL(new RegExp(`floor=${floor + 1}`));
  await ready();
  await page.waitForTimeout(800);
  st = await page.evaluate(() => {
    const r = window.__game.game.debug.run();
    return {
      mode: window.__game.game.debug.mode(),
      hp: r?.hero.hp,
      up: r?.hero.upgrades,
      relic: r?.hero.relic,
      rooms: r?.rooms.length,
      url: location.search,
    };
  });
  check(
    st.mode === "play" && st.hp === 17 && st.up?.ember === 2 && st.relic === "ash",
    `floor ${floor + 1}: HP, upgrade and relic carried (${JSON.stringify(st)})`,
  );
  await page.screenshot({ path: out + `descent-${floor + 1}.png` });
}
console.log(errors.length ? "page errors: " + errors.join(" | ") : "no page errors");
await browser.close();
server.close();
process.exit(fails.length || errors.length ? 1 : 0);
