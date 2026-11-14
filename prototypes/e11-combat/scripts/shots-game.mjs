// Headless self-check of the playable slice (chrome-headless-shell, no window).
// Plays a scripted path and saves screenshots + a contact sheet + errors to shots/game-*.
import { createServer } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, extname } from 'node:path';
import { chromium } from 'playwright-core';
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://127.0.0.1:${server.address().port}/?shot&look=moody${process.env.GENSEED ? '&gen=' + process.env.GENSEED : ''}${process.env.Q ? '&' + process.env.Q : ''}`);
await page.waitForFunction(() => window.__game?.game, null, { timeout: 90000 });
const G = 'window.__game.game.debug';
const idle = () => page.waitForFunction(() => !window.__game.game.debug.busy(), null, { timeout: 30000 });
const shots = [];
const shot = async (name) => {
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__freeze = 100000; }); // fixed clock: same pose, flicker and grain every run
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}game-${name}.png` }); shots.push(name);
  await page.evaluate(() => { delete window.__freeze; });
};
const act = async (a) => { const r = await page.evaluate((a) => { const r = window.__game.game.debug.doAction(a); return { ok: r.ok, reason: r.reason }; }, a); await page.waitForTimeout(50); await idle(); return r; };
const state = () => page.evaluate(() => { const r = window.__game.game.debug.run(); return { hero: r.hero, enemies: r.enemies.map((e) => ({ name: e.name, x: e.x, y: e.y, hp: e.hp, intent: e.intent?.kind })), combat: r.combat, cleared: r.cleared, over: r.over, mode: window.__game.game.debug.mode() }; });

await shot('01-start');
await page.evaluate(() => { try { localStorage.clear(); } catch {} window.__game.game.debug.newGame('ember', 4242); }); // fixed seed: same monster variants every run
await idle();
for (let i = 0; i < 4; i++) await act({ type: 'move', dir: 1 });
await shot('02-room1-enter');
let s = await state();
for (let i = 0; i < 6 && s.enemies[0]?.intent !== 'attack'; i++) { await act({ type: 'wait' }); s = await state(); }
await shot('03-chaser-attack-intent');
// face the enemy and strike until the room is clear (or 30 actions)
for (let i = 0; i < 30 && s.combat; i++) {
  const e = s.enemies.find((x) => x.hp > 0);
  const dx = e.x - s.hero.x, dy = e.y - s.hero.y;
  const want = dy < 0 && dx === 0 ? 0 : dx > 0 && dy === 0 ? 1 : dy > 0 && dx === 0 ? 2 : dx < 0 && dy === 0 ? 3 : null;
  if (want !== null) await page.evaluate((f) => { const r = window.__game.game.debug.run(); r.hero.facing = f; window.__game.ctrl.state.facing = f; window.__game.setState(r.hero.x, r.hero.y, f); }, want);
  let r = await act({ type: 'skill', id: 'ember' });
  if (!r.ok) r = await act({ type: 'skill', id: 'strike' });
  if (!r.ok) r = await act({ type: 'move', dir: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0 });
  if (!r.ok) await act({ type: 'wait' });
  if (i === 0) await shot('04-mid-fight'); // was i === 1: fight already over, the critic packet showed the reward screen
  s = await state();
}
await page.waitForTimeout(800);
await shot('05-reward');
await page.evaluate(() => window.__game.game.debug.pickReward(1));
await page.evaluate(() => { const r = window.__game.game.debug.run(); r.hero.facing = 1; window.__game.setState(r.hero.x, r.hero.y, 1); });
s = await state();
for (let i = 0; i < 12 && !s.combat; i++) { if (s.hero.y !== 3) await act({ type: 'move', dir: s.hero.y < 3 ? 2 : 0 }); else await act({ type: 'move', dir: 1 }); s = await state(); }
await page.evaluate(() => { const r = window.__game.game.debug.run(); r.hero.facing = 1; window.__game.setState(r.hero.x, r.hero.y, 1); });
await act({ type: 'wait' });
await shot('06-room2');
const final = await state();
// contact sheet
const sheet = await browser.newPage({ viewport: { width: 3 * 640, height: 2 * 380 } });
const cells = await Promise.all(shots.map(async (n) => `<figure><img src="data:image/png;base64,${(await readFile(`${out}game-${n}.png`)).toString('base64')}"><figcaption>${n}</figcaption></figure>`));
await sheet.setContent(`<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(3,640px);font:13px sans-serif;color:#ddd}figure{margin:0}img{width:640px;height:360px;display:block}figcaption{height:20px;padding-left:6px}</style>${cells.join('')}`);
await sheet.screenshot({ path: out + 'game-sheet.png' });
await writeFile(out + 'game-check.json', JSON.stringify({ final, errors }, null, 2));
console.log('final', JSON.stringify(final).slice(0, 400));
console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'no page errors');
await browser.close(); server.close();
