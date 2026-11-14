// Asset gate: checks GLB files before anyone judges the art.
//   node scripts/gate.mjs [--profile prop|monster|kit|tree] file.glb [more.glb ...]
// Per file: Khronos glTF validator, stats (tris, textures, skins, bounds), geometry checks
// (degenerate triangles, non-manifold/open edges, UVs, skin weights), budget checks for the
// profile, and a headless picture sheet (front/side/back/3-4/top/silhouette/in-game view).
// Writes reports/<name>.png, reports/report.json and reports/report.md. Exit code 1 if any FAIL.
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join, extname, basename, resolve } from 'node:path';
import validator from 'gltf-validator';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
let profile = 'prop';
const files = [];
for (let i = 0; i < args.length; i++) { if (args[i] === '--profile') profile = args[++i]; else files.push(resolve(args[i])); }
if (!files.length) { console.error('usage: gate.mjs [--profile prop|monster|kit|tree] file.glb ...'); process.exit(2); }

// Budgets are first guesses for a 60 fps MacBook Air target; see RESULT.md.
const PROFILES = {
  prop: { maxTris: 8000, maxTex: 2048, height: [0.15, 3.0] },
  monster: { maxTris: 15000, maxTex: 2048, height: [0.4, 3.5], wantSkin: true },
  kit: { maxTris: 2000, maxTex: 2048, height: [0.05, 3.2] },
  tree: { maxTris: 12000, maxTex: 2048, height: [1.0, 8.0] },
};
const P = PROFILES[profile];
const out = new URL('../reports/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function geometryChecks(doc) {
  let tris = 0, verts = 0, degenerate = 0, nonManifold = 0, openEdges = 0, edgesTotal = 0, noUV = 0, uvOut = 0, uvArea = 0, badWeights = 0, skinnedVerts = 0;
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    if (prim.getMode() !== 4) continue; // triangles only
    const pos = prim.getAttribute('POSITION'); if (!pos) continue;
    const idx = prim.getIndices();
    const n = idx ? idx.getCount() : pos.getCount();
    const I = (k) => (idx ? idx.getScalar(k) : k);
    verts += pos.getCount();
    tris += n / 3;
    const uv = prim.getAttribute('TEXCOORD_0');
    if (!uv) noUV += n / 3;
    // weld positions so seams (split UV/normal vertices) don't count as open edges
    const weld = new Map(), id = new Int32Array(pos.getCount());
    for (let v = 0; v < pos.getCount(); v++) { pos.getElement(v, a); const k = a.map((x) => Math.round(x * 1e4)).join(','); if (!weld.has(k)) weld.set(k, weld.size); id[v] = weld.get(k); }
    const edges = new Map();
    for (let t = 0; t < n; t += 3) {
      const i0 = I(t), i1 = I(t + 1), i2 = I(t + 2);
      pos.getElement(i0, a); pos.getElement(i1, b); pos.getElement(i2, c);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      if (Math.hypot(cx, cy, cz) < 1e-10) degenerate++;
      for (const [p, q] of [[i0, i1], [i1, i2], [i2, i0]]) { const e = id[p] < id[q] ? `${id[p]}_${id[q]}` : `${id[q]}_${id[p]}`; edges.set(e, (edges.get(e) ?? 0) + 1); }
      if (uv) {
        const ta = uv.getElement(i0, [0, 0]), tb = uv.getElement(i1, [0, 0]), tc = uv.getElement(i2, [0, 0]);
        uvArea += Math.abs((tb[0] - ta[0]) * (tc[1] - ta[1]) - (tc[0] - ta[0]) * (tb[1] - ta[1])) / 2;
        for (const t2 of [ta, tb, tc]) if (t2[0] < -0.01 || t2[0] > 1.01 || t2[1] < -0.01 || t2[1] > 1.01) uvOut++;
      }
    }
    for (const count of edges.values()) { edgesTotal++; if (count === 1) openEdges++; if (count > 2) nonManifold++; }
    const w = prim.getAttribute('WEIGHTS_0');
    if (w) for (let v = 0; v < w.getCount(); v++) { const e = w.getElement(v, [0, 0, 0, 0]); skinnedVerts++; const sum = e[0] + e[1] + e[2] + e[3]; if (Math.abs(sum - 1) > 0.02) badWeights++; }
  }
  return { tris, verts, degenerate, nonManifold, openEdgeRatio: edgesTotal ? openEdges / edgesTotal : 0, noUVTris: noUV, uvOutside: uvOut, uvArea: +uvArea.toFixed(3), skinnedVerts, badWeights };
}

async function textureInfo(doc) {
  const list = [];
  for (const t of doc.getRoot().listTextures()) {
    const img = t.getImage();
    let w = 0, h = 0;
    if (img && t.getMimeType() === 'image/png' && img.length > 24) { w = (img[16] << 24) | (img[17] << 16) | (img[18] << 8) | img[19]; h = (img[20] << 24) | (img[21] << 16) | (img[22] << 8) | img[23]; }
    if (img && t.getMimeType() === 'image/jpeg') { for (let i = 2; i < img.length - 9;) { if (img[i] !== 0xff) break; const m = img[i + 1], len = (img[i + 2] << 8) | img[i + 3]; if (m >= 0xc0 && m <= 0xc3) { h = (img[i + 5] << 8) | img[i + 6]; w = (img[i + 7] << 8) | img[i + 8]; break; } i += 2 + len; } }
    list.push({ name: t.getName() || t.getURI() || '(embedded)', mime: t.getMimeType(), w, h, kb: Math.round((img?.length ?? 0) / 1024) });
  }
  return list;
}

const reports = [];
for (const file of files) {
  const bytes = new Uint8Array(await readFile(file));
  const v = await validator.validateBytes(bytes, { maxIssues: 50 }).catch((e) => ({ issues: { numErrors: 1, numWarnings: 0, messages: [{ severity: 0, code: 'UNREADABLE', message: String(e) }] } }));
  let doc;
  try { doc = await io.readBinary(bytes); } catch (e) {
    reports.push({ file, name: basename(file, extname(file)), profile, mb: +(bytes.length / 1048576).toFixed(2), unreadable: String(e).slice(0, 200), validator: { errors: v.issues.numErrors, warnings: 0, first: [] }, textures: [], tris: 0, skins: 0 });
    continue;
  }
  const g = geometryChecks(doc);
  const tex = await textureInfo(doc);
  const root = doc.getRoot();
  const r = {
    file, name: basename(file, extname(file)), profile, mb: +(bytes.length / 1048576).toFixed(2),
    validator: { errors: v.issues.numErrors, warnings: v.issues.numWarnings, first: v.issues.messages.filter((m) => m.severity === 0).slice(0, 3).map((m) => `${m.code}: ${m.message}`) },
    meshes: root.listMeshes().length, materials: root.listMaterials().length, textures: tex, skins: root.listSkins().length, animations: root.listAnimations().map((a) => a.getName()),
    ...g,
  };
  reports.push(r);
}

// --- pictures (headless Chromium, no window) ---
const root = new URL('../dist/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/asset') { const f = u.searchParams.get('f'); if (!files.includes(f)) throw new Error('not allowed'); res.writeHead(200, { 'content-type': 'model/gltf-binary' }); res.end(await readFile(f)); return; }
    const p = join(root, decodeURIComponent(u.pathname)); const f = p.endsWith('/') ? join(p, 'index.html') : p;
    res.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream' }); res.end(await readFile(f));
  } catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise((ok) => server.once('listening', ok));
const cache = join(homedir(), 'Library/Caches/ms-playwright');
const dir = (await readdir(cache)).filter((d) => d.startsWith('chromium_headless_shell-')).sort().pop();
const sub = (await readdir(join(cache, dir))).find((d) => d.startsWith('chrome-headless-shell'));
const browser = await chromium.launch({ executablePath: join(cache, dir, sub, 'chrome-headless-shell'), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const VIEWS = ['front', 'side', 'back', 'threeq', 'top', 'silhouette', 'grid'];
for (const r of reports) {
  if (r.unreadable) { r.renderErrors = ['unreadable']; continue; }
  const page = await browser.newPage({ viewport: { width: 480, height: 400 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.__view?.ready);
  try {
    const info = await page.evaluate((u) => window.__view.load(u), `/asset?f=${encodeURIComponent(r.file)}`);
    r.size = info.size; r.floorOffset = info.minY;
    const imgs = [];
    for (const v of VIEWS) { await page.evaluate((v) => window.__view.shot(v), v); imgs.push((await page.screenshot()).toString('base64')); }
    const sheet = await browser.newPage({ viewport: { width: 4 * 300, height: 2 * 270 + 40 } });
    await sheet.setContent(`<style>body{margin:0;background:#111;color:#ddd;font:13px sans-serif;display:grid;grid-template-columns:repeat(4,300px)}figure{margin:0}img{width:300px;height:250px;display:block}figcaption{height:20px;padding-left:4px}h3{grid-column:1/-1;margin:6px 8px;font-weight:normal}</style><h3>${r.name} · ${r.profile} · ${Math.round(r.tris)} tris · ${r.size.join(' x ')} m</h3>${imgs.map((b, i) => `<figure><img src="data:image/png;base64,${b}"><figcaption>${VIEWS[i]}</figcaption></figure>`).join('')}`);
    await sheet.screenshot({ path: `${out}${r.name}.png` });
    await sheet.close();
  } catch (e) { errs.push(String(e)); }
  r.renderErrors = errs;
  await page.close();
}
await browser.close(); server.close();

// --- verdicts ---
for (const r of reports) {
  const fail = [], warn = [];
  if (r.unreadable) fail.push(`unreadable: ${r.unreadable}`);
  if (r.validator.errors) fail.push(`glTF validator: ${r.validator.errors} errors (${r.validator.first[0] ?? ''})`);
  if (r.renderErrors.length) fail.push('render failed');
  if (r.tris > P.maxTris) (r.tris > P.maxTris * 4 ? fail : warn).push(`${Math.round(r.tris)} tris > budget ${P.maxTris}`);
  const h = r.size?.[1] ?? 0;
  if (h < P.height[0] || h > P.height[1]) warn.push(`height ${h} m outside ${P.height.join('-')} m (scale?)`);
  if (Math.abs(r.floorOffset ?? 0) > 0.05) warn.push(`origin not on the floor (min y ${r.floorOffset})`);
  for (const t of r.textures) if (Math.max(t.w, t.h) > P.maxTex) warn.push(`texture ${t.w}x${t.h} > ${P.maxTex}`);
  if (r.degenerate > r.tris * 0.01) warn.push(`${r.degenerate} degenerate triangles`);
  if (r.nonManifold > 0) warn.push(`${r.nonManifold} non-manifold edges`);
  if (r.openEdgeRatio > 0.02 && profile !== 'kit') warn.push(`open edges ${(r.openEdgeRatio * 100).toFixed(1)}% (holes or cards)`);
  if (r.noUVTris > 0 && r.textures.length) fail.push(`${r.noUVTris} textured tris without UVs`);
  if (r.badWeights > 0) fail.push(`${r.badWeights} skinned vertices with weights not summing to 1`);
  if (P.wantSkin && !r.skins) warn.push('no skeleton: needs rigging before animation');
  r.verdict = fail.length ? 'FAIL' : warn.length ? 'WARN' : 'PASS';
  r.reasons = [...fail, ...warn];
}
await writeFile(out + 'report.json', JSON.stringify(reports, null, 2));
const md = ['# Asset gate report', '', `Profile: ${profile}`, '', '| Asset | Verdict | Tris | MB | Size (m) | Textures | Skin | Reasons |', '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...reports.map((r) => `| ${r.name} | ${r.verdict} | ${Math.round(r.tris)} | ${r.mb} | ${r.size?.join(' x ')} | ${r.textures.map((t) => `${t.w}x${t.h}`).join(', ') || '-'} | ${r.skins ? 'yes' : 'no'} | ${r.reasons.join('; ') || '-'} |`)];
await writeFile(out + 'report.md', md.join('\n') + '\n');
for (const r of reports) console.log(`${r.verdict.padEnd(4)} ${r.name.padEnd(28)} ${String(Math.round(r.tris)).padStart(7)} tris ${String(r.mb).padStart(6)} MB  ${r.reasons.join('; ')}`);
process.exit(reports.some((r) => r.verdict === 'FAIL') ? 1 : 0);
