// Visual regression check for screenshot sets.
//   node scripts/visual-diff.mjs approve            copy shots/game-*.png -> shots/baseline/
//   node scripts/visual-diff.mjs [pattern]          compare current shots with the baseline
// Per image: changed-pixel fraction (pixelmatch), mean brightness change, and a diff heat map
// in shots/diff/. Flags CHANGED above 2% pixels, DARKER/BRIGHTER beyond 8% brightness.
// It detects change, not quality: a human or the agent still looks at flagged images.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const shots = new URL('../shots/', import.meta.url).pathname;
const base = shots + 'baseline/', diff = shots + 'diff/';
const pattern = new RegExp(process.argv[3] ?? (process.argv[2] && process.argv[2] !== 'approve' ? process.argv[2] : '^game-0'));
if (process.argv[2] === 'approve') {
  mkdirSync(base, { recursive: true });
  const files = readdirSync(shots).filter((f) => f.endsWith('.png') && pattern.test(f));
  for (const f of files) copyFileSync(shots + f, base + f);
  console.log(`approved ${files.length} images as baseline`);
  process.exit(0);
}
if (!existsSync(base)) { console.error('no baseline: run `node scripts/visual-diff.mjs approve` first'); process.exit(2); }
mkdirSync(diff, { recursive: true });
const lum = (png) => { let s = 0; for (let i = 0; i < png.data.length; i += 4) s += 0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2]; return s / (png.data.length / 4); };
let flagged = 0;
for (const f of readdirSync(base).filter((f) => pattern.test(f))) {
  if (!existsSync(shots + f)) { console.log(`MISSING  ${f}`); flagged++; continue; }
  const a = PNG.sync.read(readFileSync(base + f)), b = PNG.sync.read(readFileSync(shots + f));
  if (a.width !== b.width || a.height !== b.height) { console.log(`SIZE     ${f}`); flagged++; continue; }
  const out = new PNG({ width: a.width, height: a.height });
  // threshold 0.12 ignores film grain and small flicker; HUD text changes still count
  const n = pixelmatch(a.data, b.data, out.data, a.width, a.height, { threshold: 0.12 });
  const frac = n / (a.width * a.height);
  const la = lum(a), lb = lum(b), dl = (lb - la) / Math.max(1, la);
  const tags = [];
  if (frac > 0.02) tags.push('CHANGED');
  if (dl < -0.08) tags.push('DARKER'); else if (dl > 0.08) tags.push('BRIGHTER');
  if (tags.length) { flagged++; writeFileSync(diff + f, PNG.sync.write(out)); }
  console.log(`${(tags.join('+') || 'same').padEnd(16)} ${f.padEnd(34)} pixels ${(frac * 100).toFixed(1).padStart(5)}%  brightness ${(dl * 100 >= 0 ? '+' : '') + (dl * 100).toFixed(1)}%`);
}
console.log(flagged ? `${flagged} image(s) flagged; heat maps in shots/diff/` : 'no visual changes beyond thresholds');
process.exit(flagged ? 1 : 0);
