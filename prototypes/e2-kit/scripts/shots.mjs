// Headless screenshots. Uses Playwright's chrome-headless-shell binary, a plain
// executable with no app bundle or window. Never opens anything on the desktop.
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, extname } from 'node:path';
import { chromium } from 'playwright-core';

const root = new URL('../dist/', import.meta.url).pathname;
const out = new URL('../shots/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = p.endsWith('/') ? join(p, 'index.html') : p;
  try { res.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream' }); res.end(await readFile(f)); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const url = `http://127.0.0.1:${server.address().port}/?shot`;

const cache = join(homedir(), 'Library/Caches/ms-playwright');
const dir = (await readdir(cache)).filter((d) => d.startsWith('chromium_headless_shell-')).sort().pop();
const sub = (await readdir(join(cache, dir))).find((d) => d.startsWith('chrome-headless-shell'));
const exe = join(cache, dir, sub, 'chrome-headless-shell');
if (!existsSync(exe)) throw new Error('chrome-headless-shell not found');

const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const LOOKS = (process.env.LOOKS ?? 'base,lit,moody,painted').split(',');
const SPOTS = [
  ['corridor', 3, 5, 0],
  ['door', 3, 3, 1],
  ['torch-hall', 8, 8, 0],
  ['pillar', 5, 5, 1],
];
const errors = [];
const shots = [];
for (const look of LOOKS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(`${look}: ${e}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${look}: ${m.text()}`));
  await page.goto(url + '&look=' + look + (process.env.TEX ? '&tex=' + process.env.TEX : ''));
  await page.waitForTimeout(1500); // textures
  await page.waitForFunction(() => window.__game?.isIdle());
  console.log(look, 'torches', await page.evaluate(() => window.__game.torches()));
  for (const [name, x, y, f] of SPOTS) {
    await page.evaluate(([x, y, f]) => window.__game.setState(x, y, f), [x, y, f]);
    await page.waitForTimeout(400);
    const file = `${look}-${name}.png`;
    await page.screenshot({ path: out + file });
    shots.push({ look, name, file });
  }
  await page.close();
}
// Contact sheet: rows = looks, columns = spots.
const sheet = await browser.newPage({ viewport: { width: 4 * 480, height: LOOKS.length * 290 } });
const { readFile: rf } = await import('node:fs/promises');
const cells = [];
for (const s of shots) cells.push(`<figure><img src="data:image/png;base64,${(await rf(out + s.file)).toString('base64')}"><figcaption>${s.look} / ${s.name}</figcaption></figure>`);
await sheet.setContent(`<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(4,480px);font:14px sans-serif;color:#ddd}figure{margin:0;position:relative}img{width:480px;height:270px;display:block}figcaption{height:20px;padding-left:6px}</style>${cells.join('')}`);
await sheet.screenshot({ path: out + 'contact-sheet.png', fullPage: true });
await browser.close();
server.close();
if (errors.length) { console.error('page errors:\n' + errors.join('\n')); process.exit(1); }
