// Headless self-check for code monsters. Uses chrome-headless-shell (no window).
// Output: shots/<name>.png and shots/sheet.png (states x views), plus info.json.
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
  ".jpg": "image/jpeg",
};
const server = createServer(async (req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  const f = p.endsWith("/") ? join(p, "index.html") : p;
  try {
    const body = await readFile(f);
    res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" });
    res.end(req.method === "HEAD" ? undefined : body);
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
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const q = process.env.Q ?? "";
await page.goto(`http://127.0.0.1:${server.address().port}/?shot${q ? "&" + q : ""}`);
await page.waitForFunction(() => window.__mon?.ready, null, { timeout: 60000 });
const info = await page.evaluate(() => ({
  monsters: window.__mon.info(),
  painted: window.__mon.painted(),
}));
// Per monster: 3/4 idle, side walk, side attack (wind-up and strike), front hit, death.
const SHOTS = [
  ["idle", 0.5, [2.2, 1.5, 3.2]],
  ["walk", 0.3, [3.6, 1.2, 0]],
  ["attack", 0.3, [3.6, 1.3, 0.6]],
  ["attack", 0.45, [3.6, 1.3, 0.6]],
  ["hit", 0.17, [0, 1.3, 3.6]],
  ["death", 1.6, [2.8, 1.6, 2.8]],
];
const rows = [];
for (let i = 0; i < info.monsters.length; i++) {
  // measure in the idle pose (the previous monster's death pose would make everyone look short)
  await page.evaluate((i) => {
    window.__mon.solo(i);
    window.__mon.set("idle", 0.5);
  }, i);
  await page.waitForTimeout(150);
  const height = await page.evaluate((i) => window.__mon.solo(i), i);
  const k = height / 1.6; // frame by size: cameras were tuned for a 1.6 m monster
  console.log("frame", info.monsters[i].archetype, height.toFixed(2));
  const row = [];
  for (const [st, t, pos] of SHOTS) {
    await page.evaluate(
      ([st, t, pos, k]) =>
        window.__mon.set(st, t, { pos: pos.map((v) => v * k), target: [0, 0.75 * k, 0] }),
      [st, t, pos, k],
    );
    await page.waitForTimeout(200);
    const f = `${info.monsters[i].archetype}-${info.monsters[i].seed}-${st}-${t}.png`;
    await page.screenshot({ path: out + f });
    row.push(f);
  }
  rows.push(row);
}
await page.evaluate(() => window.__mon.solo(-1));
await page.evaluate(() => window.__mon.set("idle", 0.5, { pos: [0, 1.8, 9], target: [0, 0.8, 0] }));
await page.waitForTimeout(200);
await page.screenshot({ path: out + "lineup.png" });
const W = 320,
  H = 200;
const sheet = await browser.newPage({
  viewport: { width: SHOTS.length * W, height: rows.length * (H + 18) },
});
const cells = [];
for (const row of rows)
  for (const f of row)
    cells.push(
      `<figure><img src="data:image/png;base64,${(await readFile(out + f)).toString("base64")}"><figcaption>${f}</figcaption></figure>`,
    );
await sheet.setContent(
  `<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(${SHOTS.length},${W}px);font:11px sans-serif;color:#ddd}figure{margin:0}img{width:${W}px;height:${H}px;object-fit:cover;display:block}figcaption{height:18px;padding-left:4px;overflow:hidden}</style>${cells.join("")}`,
);
await sheet.screenshot({ path: out + "sheet.png" });
await writeFile(out + "info.json", JSON.stringify({ ...info, errors }, null, 2));
console.log(
  JSON.stringify(info),
  errors.length ? "ERRORS " + errors.join(" | ") : "no page errors",
);
await browser.close();
server.close();
