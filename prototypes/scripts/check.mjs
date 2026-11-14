// Standard check for all prototypes: build every web prototype, run the unit tests,
// and run the fast headless rule checks of the combat slice. No browser, no network.
// Quiet on success, full output on failure, non-zero exit if anything fails.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const pkg = JSON.parse(await (await import('node:fs/promises')).readFile(join(root, 'package.json'), 'utf8'));
const steps = [];
for (const ws of pkg.workspaces) {
  const p = JSON.parse(await (await import('node:fs/promises')).readFile(join(root, ws, 'package.json'), 'utf8'));
  if (p.scripts?.build) steps.push([`${ws}: build`, ws, ['npm', 'run', 'build', '--silent']]);
  const hasTests = ['tests', 'src'].some((d) => existsSync(join(root, ws, d)) && readdirSync(join(root, ws, d)).some((f) => f.endsWith('.test.js')));
  if (hasTests) steps.push([`${ws}: tests`, ws, ['npx', 'vitest', 'run']]);
}
steps.push(['e11-combat: balance bots (smoke)', 'e11-combat', ['node', 'scripts/sim.mjs', '20', 'smart']]);
steps.push(['e11-combat: director eval', 'e11-combat', ['node', 'scripts/director-eval.mjs', '10']]);
steps.push(['e11-combat: descent sim (smoke)', 'e11-combat', ['node', 'scripts/descent-sim.mjs', '5', 'smart']]);

let failed = 0;
for (const [name, cwd, cmd] of steps) {
  const t = Date.now();
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd: join(root, cwd), encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' } });
  const ok = r.status === 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  if (!ok) { failed++; process.stdout.write(r.stdout ?? ''); process.stderr.write(r.stderr ?? ''); }
}
console.log(failed ? `\n${failed} step(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
