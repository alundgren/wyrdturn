// Visual critic packet (research priority #9): turns "is this better?" into a blind, fixed task
// an agent or human can answer consistently.
//   node scripts/critic-packet.mjs <dirA> <dirB> [pattern]
// For every image name present in both folders it writes critic/pair-N.png with the two versions
// side by side as "Left"/"Right" in a seeded random order, plus critic/RUBRIC.md and
// critic/key.json (which side is which, kept apart so the judge stays blind).
// The judge (agent or human) fills critic/answers.json: { "pair-1": { "winner": "left|right|same",
// "scores": { "left": {...}, "right": {...} }, "defects": [...] } }; then
//   node scripts/critic-packet.mjs --score
// reveals the key and reports wins per side. Show each pair twice (orders swapped) to catch
// order bias: pairs come in mirrored couples (N and N+1).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { PNG } from 'pngjs';
const out = new URL('../critic/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const RUBRIC = `# Visual critic rubric (score 0-4 each, higher is better)

1. Readability: can you tell what each monster is and where it stands from one tile away?
2. Painted consistency: do surfaces, monsters and props look like one painted art style?
3. Lighting and mood: bright enough to read, with colour and shadow doing the mood work?
4. Intent clarity: are threats (markers, warnings, labels) obvious without hiding the scene?
5. Defects: clipping, floating objects, stretched textures, black or blown-out areas (4 = none).

Rules: judge only what is visible. Name each defect with its rough position
(e.g. "left third, floor: brazier floats 10 cm"). Hard failures (missing
monster, broken UI, black screen) decide the pair on their own: they are not
averaged with the other scores. Each pair appears twice with sides swapped;
answer each one independently.
`;
if (process.argv[2] === '--score') {
  const key = JSON.parse(readFileSync(out + 'key.json', 'utf8'));
  const ans = JSON.parse(readFileSync(out + 'answers.json', 'utf8'));
  const tally = { A: 0, B: 0, same: 0 }; let flips = 0;
  for (const [pair, k] of Object.entries(key)) {
    const a = ans[pair]?.winner; if (!a) continue;
    const w = a === 'same' ? 'same' : k[a];
    tally[w]++;
    const twin = key[k.twin] && ans[k.twin]?.winner; // mirrored pair answered differently = order bias
    if (twin && (twin === 'same' ? 'same' : key[k.twin][twin]) !== w) flips++;
  }
  console.log(`A (${key._dirs.A}) wins ${tally.A}, B (${key._dirs.B}) wins ${tally.B}, same ${tally.same}; inconsistent mirrored pairs: ${flips / 2}`);
  process.exit(0);
}
const [dirA, dirB, pat] = process.argv.slice(2);
const re = new RegExp(pat ?? '.png$');
const names = readdirSync(dirA).filter((f) => re.test(f) && existsSync(`${dirB}/${f}`));
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const key = { _dirs: { A: dirA, B: dirB } };
let n = 0;
const comp = (left, right, file) => {
  const a = PNG.sync.read(readFileSync(left)), b = PNG.sync.read(readFileSync(right));
  const gap = 16, outp = new PNG({ width: a.width + b.width + gap, height: Math.max(a.height, b.height) });
  outp.data.fill(20);
  PNG.bitblt(a, outp, 0, 0, a.width, a.height, 0, 0);
  PNG.bitblt(b, outp, 0, 0, b.width, b.height, a.width + gap, 0);
  writeFileSync(file, PNG.sync.write(outp));
};
for (const f of names) {
  const aLeft = rnd() < 0.5;
  for (const swap of [false, true]) {
    n++;
    const left = aLeft !== swap ? 'A' : 'B';
    comp(left === 'A' ? `${dirA}/${f}` : `${dirB}/${f}`, left === 'A' ? `${dirB}/${f}` : `${dirA}/${f}`, `${out}pair-${n}.png`);
    key[`pair-${n}`] = { image: f, left, right: left === 'A' ? 'B' : 'A', twin: `pair-${swap ? n - 1 : n + 1}` };
  }
}
writeFileSync(out + 'RUBRIC.md', RUBRIC);
writeFileSync(out + 'key.json', JSON.stringify(key, null, 2));
if (!existsSync(out + 'answers.json')) writeFileSync(out + 'answers.json', '{}\n');
console.log(`${n} pairs from ${names.length} images -> critic/ (open pair-*.png, follow RUBRIC.md, fill answers.json, then --score)`);
