// Headless run of the ?bench=1 route: checks draw-call and triangle budgets per spot.
// Frame times from the software renderer are NOT real performance; run the route in a
// real browser on the target Mac for fps. Usage: node scripts/bench.mjs [genSeed]
import { createServer } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, extname } from 'node:path';
import { chromium } from 'playwright-core';
const BUDGET = { calls: 450, tris: 400000 }; // first guesses; tune against real-Mac fps
const root = new URL('../dist/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary' };
const server = createServer(async (req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)); const f = p.endsWith('/') ? join(p, 'index.html') : p;
  try { const b = await readFile(f); res.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const cache = join(homedir(), 'Library/Caches/ms-playwright');
const dir = (await readdir(cache)).filter((d) => d.startsWith('chromium_headless_shell-')).sort().pop();
const sub = (await readdir(join(cache, dir))).find((d) => d.startsWith('chrome-headless-shell'));
const GPU = !!process.env.GPU;
const browser = await chromium.launch({ executablePath: join(cache, dir, sub, 'chrome-headless-shell'), headless: true, args: GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', ...(process.env.UNCAPPED ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
// GPU=1: real Apple GPU in the hidden browser, at a MacBook-like window (1440x900, retina).
const page = await browser.newPage(GPU ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
const gen = process.argv[2];
await page.goto(`http://127.0.0.1:${server.address().port}/?${GPU ? '' : 'shot&'}look=moody&bench=1&benchFrames=${GPU ? 90 : 4}${gen ? '&gen=' + gen : ''}`);
await page.waitForFunction(() => window.__bench, null, { timeout: 600000, polling: 1000 });
const r = await page.evaluate(() => window.__bench);
const over = r.spots.filter((s) => s.calls > BUDGET.calls || s.tris > BUDGET.tris);
await writeFile(new URL(`../shots/bench${gen ? '-gen' + gen : ''}.json`, import.meta.url), JSON.stringify(r, null, 2));
console.log(`level ${gen ? 'gen ' + gen : 'slice'}: maxCalls ${r.summary.maxCalls} maxTris ${r.summary.maxTris}, avg ${r.summary.avgMs} ms, worst p95 ${r.summary.worstP95Ms} ms (budget ${BUDGET.calls} calls, ${BUDGET.tris} tris) -> ${over.length ? 'OVER at ' + over.map((s) => `${s.x},${s.y}`).join(' ') : 'OK'}`);
await browser.close(); server.close();
