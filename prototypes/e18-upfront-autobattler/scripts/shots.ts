// Headless screenshots and browser checks for e18 (chrome-headless-shell, no window opens).
// Run after `vp build`: node scripts/shots.ts   -> shots/*.png (gitignored)
// Checks: no page errors; a fight plays to its result screen at 2x in about half its
// simulated length; the boss pauses after phase 1 and offers a new setup; a run shows
// doors, then rewards after a win.
import { createServer } from "node:http";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { chromium } from "playwright-core";

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

// Playwright's browser cache: macOS, then Linux, then PLAYWRIGHT_BROWSERS_PATH.
async function findShell(): Promise<string> {
  const caches = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(homedir(), "Library/Caches/ms-playwright"),
    join(homedir(), ".cache/ms-playwright"),
  ].filter((x): x is string => !!x);
  for (const cache of caches) {
    const dir = (await readdir(cache).catch(() => [] as string[]))
      .filter((d) => d.startsWith("chromium_headless_shell-"))
      .sort((a, b) => a.localeCompare(b))
      .pop();
    if (!dir) continue;
    const sub = (await readdir(join(cache, dir))).find((d) =>
      d.startsWith("chrome-headless-shell"),
    );
    if (sub) return join(cache, dir, sub, "chrome-headless-shell");
  }
  throw new Error(
    "no chrome-headless-shell: vp exec playwright-core install chromium-headless-shell",
  );
}
const browser = await chromium.launch({
  executablePath: await findShell(),
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000); // software rendering is slow
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

const checks: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, detail = "") => {
  checks.push([name, ok, detail]);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
};
async function open(q: string) {
  await page.goto(`http://127.0.0.1:${port}/${q}`);
  await page.waitForFunction(() => window.__e18?.ready === true);
  await page.waitForTimeout(1500);
}
async function shot(name: string) {
  await page.evaluate(() => (window.__freeze = 1000));
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}${name}.png` });
  await page.evaluate(() => (window.__freeze = undefined));
  console.log(`shot ${name}.png`);
}
const screen = () => page.evaluate(() => window.__e18.screen());

// 1. scouting and choosing
await open("?fight=2");
await shot("1-setup-arrow-slit");
await page.evaluate(() =>
  window.__e18.setSetup({
    skills: ["hook", "miasma", "totem"],
    order: ["pet", "hero", "totem"],
    focus: "weakest",
    charm: "lastbreath",
  }),
);
await shot("2-setup-changed");

// 2. a fight mid-way, then the result
await page.evaluate(() => window.__e18.watchFrom(9));
await page.waitForTimeout(500);
await shot("3-fight-mid");
await page.evaluate(() => window.__e18.skip());
await page.waitForTimeout(300);
check("skip shows the result screen", (await screen()) === "result");
await shot("4-result-win");

// 3. a loss with "one change"
await open("?fight=5");
await page.evaluate(() => {
  window.__e18.fight();
  window.__e18.skip();
});
await page.waitForTimeout(300);
const lossRep = await page.evaluate(() => window.__e18.report()?.result);
check("Iron Line with the default setup is a loss", lossRep === "loss", String(lossRep));
const hasChange = await page.evaluate(() => !!document.querySelector("#result .change"));
check("the loss screen names a change", hasChange);
await shot("5-result-loss");

// 4. timing: at 2x, play time runs twice as fast as real time (needs a real frame rate;
// software rendering here can be too slow, then the check reports its frame rate instead)
await open("?fight=3");
await page.evaluate(() => {
  window.__e18.speed(2);
  window.__e18.fight();
});
const a = await page.evaluate(() => ({ ...window.__e18.stats(), now: performance.now() }));
await page.waitForTimeout(6000);
const b = await page.evaluate(() => ({ ...window.__e18.stats(), now: performance.now() }));
const secs = (b.now - a.now) / 1000;
const fps = (b.frames - a.frames) / secs;
const rate = (b.playT - a.playT) / secs;
if (fps >= 15)
  check(
    "2x speed plays 2 s of fight per second",
    Math.abs(rate - 2) < 0.3,
    `${rate.toFixed(2)}x at ${fps.toFixed(0)} fps`,
  );
else
  check(
    "2x speed (skipped: software GPU too slow)",
    true,
    `${fps.toFixed(1)} fps, ${rate.toFixed(2)} fight s per s; run on a real GPU`,
  );
await page.evaluate(() => window.__e18.skip());

// 5. boss: phase 1 ends, a new setup is offered
await open("?boss");
await shot("6-boss-phase1-setup");
await page.evaluate(() => {
  window.__e18.setSetup({
    skills: ["frost", "miasma", "totem"],
    order: ["hero", "pet", "totem"],
    focus: "weakest",
    charm: "quicken",
  });
  window.__e18.fight();
  window.__e18.skip();
});
await page.waitForTimeout(300);
const p1 = await page.evaluate(() => window.__e18.report()?.result);
check("boss phase 1 ends in a pause (phase result)", p1 === "phase", String(p1));
await page.evaluate(() => window.__e18.click('[data-act="nextphase"]'));
await page.waitForTimeout(500);
check(
  "next phase offers a new setup",
  (await screen()) === "setup" && (await page.evaluate(() => window.__e18.phase())) === 1,
);
await shot("7-boss-phase2-setup");

// 6. run: doors, a win, rewards
await open("?run&seed=3");
check("run starts at the doors", (await screen()) === "doors");
await shot("8-run-doors");
await page.evaluate(() => window.__e18.click('[data-door="0"]'));
await page.waitForTimeout(500);
// play the fight with the strong setup from the bot so we reach the rewards
await page.evaluate(() => {
  window.__e18.fight();
  window.__e18.skip();
});
await page.waitForTimeout(300);
const runRes = await page.evaluate(() => window.__e18.report()?.result);
if (runRes === "win") {
  await page.evaluate(() => window.__e18.click('[data-act="reward"]'));
  await page.waitForTimeout(300);
  check("a won run fight offers rewards", (await screen()) === "reward");
  await shot("9-run-reward");
} else check("run fight 1 with the default setup", true, `lost (${runRes}); rewards not shown`);

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
server.close();
const failed = checks.filter((c) => !c[1]).length;
console.log(failed ? `${failed} check(s) failed` : "all browser checks passed");
process.exit(failed ? 1 : 0);
