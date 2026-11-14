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
const LOOKS = (process.env.LOOKS ?? "base,lit,moody,painted").split(",");
const SPOTS = process.env.STEP
  ? [
      ["far", 3, 10, 3],
      ["near", 1, 10, 3],
      ["hall", 11, 9, 2],
      ["door-out", 6, 9, 0],
    ]
  : [
      ["door-out", 6, 9, 0],
      ["courtyard", 6, 7, 0],
      ["fountain", 3, 4, 1],
      ["trees", 10, 4, 2],
    ];
const TIMES = (process.env.TIMES ?? "day,dusk,night").split(",");
const errors = [];
const shots = [];
for (const look of LOOKS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => errors.push(`${look}: ${e}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${look}: ${m.text()}`));
  await page.goto(url + "&look=" + look + (process.env.TEX ? "&tex=" + process.env.TEX : ""));
  await page.waitForTimeout(1500); // textures
  await page.waitForFunction(() => window.__game?.isIdle());
  console.log(look, "torches", await page.evaluate(() => window.__game.torches()));
  for (const time of TIMES)
    for (const [name, x, y, f] of SPOTS) {
      await page.evaluate(
        ([x, y, f, t]) => {
          window.__game.setTime(t);
          window.__game.setState(x, y, f);
        },
        [x, y, f, time],
      );
      await page.waitForTimeout(2500); // let the indoor/outdoor blend settle
      const file = `${look}-${time}-${name}.png`;
      await page.screenshot({ path: out + file });
      shots.push({ look, name, file });
    }
  await page.close();
}
// Contact sheet: rows = looks, columns = spots.
const sheet = await browser.newPage({
  viewport: { width: 4 * 480, height: LOOKS.length * TIMES.length * 290 },
});
const { readFile: rf } = await import("node:fs/promises");
const cells = [];
for (const s of shots)
  cells.push(
    `<figure><img src="data:image/png;base64,${(await rf(out + s.file)).toString("base64")}"><figcaption>${s.file}</figcaption></figure>`,
  );
await sheet.setContent(
  `<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(4,480px);font:14px sans-serif;color:#ddd}figure{margin:0;position:relative}img{width:480px;height:270px;display:block}figcaption{height:20px;padding-left:6px}</style>${cells.join("")}`,
);
if (!process.env.STEP) await sheet.screenshot({ path: out + "contact-sheet.png", fullPage: true });
await browser.close();
server.close();
if (errors.length) {
  console.error("page errors:\n" + errors.join("\n"));
  process.exit(1);
}
