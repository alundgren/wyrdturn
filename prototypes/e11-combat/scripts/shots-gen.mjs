// Headless self-check for generated levels: for each seed, load ?gen=<seed>, start a run,
// let the game's own bot-free debug hooks teleport the camera to each combat room door
// and screenshot. Also writes the level ASCII + checks. Usage: node scripts/shots-gen.mjs 1 2 3
import { createServer } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, extname } from 'node:path';
import { chromium } from 'playwright-core';
import { generate, ascii } from '../src/levelgen.js';
const root = new URL('../dist/', import.meta.url).pathname, out = new URL('../shots/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary' };
const server = createServer(async (req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)); const f = p.endsWith('/') ? join(p, 'index.html') : p;
  try { const b = await readFile(f); res.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const cache = join(homedir(), 'Library/Caches/ms-playwright');
const dir = (await readdir(cache)).filter((d) => d.startsWith('chromium_headless_shell-')).sort().pop();
const sub = (await readdir(join(cache, dir))).find((d) => d.startsWith('chrome-headless-shell'));
const browser = await chromium.launch({ executablePath: join(cache, dir, sub, 'chrome-headless-shell'), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const seeds = process.argv.slice(2).map(Number);
const files = [], report = [];
for (const seed of seeds.length ? seeds : [1, 2, 3]) {
  const lvl = generate(seed);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/?shot&look=moody&gen=${seed}`);
  await page.waitForFunction(() => window.__game?.game, null, { timeout: 90000 });
  await page.evaluate(() => window.__game.game.debug.newGame('ember'));
  // stand at the first door of each combat room, looking in
  for (const room of lvl.rooms.slice(0, 3)) {
    const d = room.doors[0];
    const facing = d.y < room.y0 ? 2 : d.y > room.y1 ? 0 : d.x < room.x0 ? 1 : 3;
    await page.evaluate(([x, y, f]) => { const r = window.__game.game.debug.run(); r.hero.x = x; r.hero.y = y; r.hero.facing = f; window.__game.setState(x, y, f); }, [d.x, d.y, facing]);
    // step in to trigger the encounter so monsters, intents and bars show
    await page.evaluate(([f]) => window.__game.game.debug.doAction({ type: 'move', dir: f }), [facing]);
    await page.waitForTimeout(1600);
    const f = `gen-${seed}-room${room.id}.png`;
    await page.screenshot({ path: out + f });
    files.push(f);
    // reset combat so the next room can trigger
    await page.evaluate(() => { const r = window.__game.game.debug.run(); r.combat = false; r.doorsLocked = false; r.cleared.push(r.room.id); r.enemies = []; });
  }
  // key and gate views: stand two tiles away on a floor cell, facing them
  for (const ch of ['K', 'L', 'H']) {
    let t = null; lvl.grid.forEach((row, y) => row.forEach((c, x) => { if (c === ch && !t) t = { x, y }; }));
    if (!t) continue;
    const D = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    let spot = null;
    for (const dist of [2, 1]) for (let f = 0; f < 4 && !spot; f++) { const x = t.x - D[f][0] * dist, y = t.y - D[f][1] * dist; if (['.', 'S'].includes(lvl.grid[y]?.[x]) && (dist === 1 || ['.', 'S', 'K'].includes(lvl.grid[t.y - D[f][1]][t.x - D[f][0]]))) spot = { x, y, f }; }
    if (!spot) continue;
    await page.evaluate(([x, y, f]) => { const r = window.__game.game.debug.run(); r.combat = false; r.doorsLocked = false; r.hero.x = x; r.hero.y = y; r.hero.facing = f; window.__game.setState(x, y, f); }, [spot.x, spot.y, spot.f]);
    await page.waitForTimeout(1200);
    const f = `gen-${seed}-${{ K: 'key', L: 'gate', H: 'shrine' }[ch]}.png`;
    await page.screenshot({ path: out + f });
    files.push(f);
  }
  report.push({ seed, attempt: lvl.attempt, checks: lvl.checks, errors, ascii: ascii(lvl) });
  await page.close();
}
const sheet = await browser.newPage({ viewport: { width: 3 * 560, height: Math.ceil(files.length / 3) * 335 } });
const cells = await Promise.all(files.map(async (f) => `<figure><img src="data:image/png;base64,${(await readFile(out + f)).toString('base64')}"><figcaption>${f}</figcaption></figure>`));
await sheet.setContent(`<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(3,560px);font:12px sans-serif;color:#ddd}figure{margin:0}img{width:560px;height:315px;display:block}figcaption{height:20px;padding-left:6px}</style>${cells.join('')}`);
await sheet.screenshot({ path: out + 'gen-sheet.png' });
await writeFile(out + 'gen-report.json', JSON.stringify(report, null, 2));
for (const r of report) console.log(`seed ${r.seed}: ok=${r.checks.ok} budgets=${r.checks.budgets} errors=${r.errors.length}`);
await browser.close(); server.close();
