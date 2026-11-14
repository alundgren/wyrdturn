// Standard check for the whole repo (`vp run validate`): format, lint and type checks,
// then build every web prototype, unit tests and the fast headless rule checks of the
// combat slice. No browser, no network. Quiet on success, full output on failure.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const protos = join(root, "prototypes");
const steps = [["format, lint, types", ".", ["vp", "check"]]];
for (const name of readdirSync(protos).sort()) {
  const pkgFile = join(protos, name, "package.json");
  if (!existsSync(pkgFile)) continue;
  const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
  const dir = join("prototypes", name);
  if (pkg.scripts?.build) steps.push([`${name}: build`, dir, ["vp", "build"]]);
  const hasTests = existsSync(join(protos, name, "tests"));
  if (hasTests) steps.push([`${name}: tests`, dir, ["vp", "test", "run"]]);
}
const e11 = join("prototypes", "e11-combat");
steps.push(["e11-combat: balance bots (smoke)", e11, ["node", "scripts/sim.mjs", "20", "smart"]]);
steps.push(["e11-combat: director eval", e11, ["node", "scripts/director-eval.mjs", "10"]]);
steps.push([
  "e11-combat: descent sim (smoke)",
  e11,
  ["node", "scripts/descent-sim.mjs", "5", "smart"],
]);

let failed = 0;
for (const [name, cwd, cmd] of steps) {
  const t = Date.now();
  const r = spawnSync(cmd[0], cmd.slice(1), {
    cwd: join(root, cwd),
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  const ok = r.status === 0;
  console.log(`${ok ? "ok  " : "FAIL"} ${name} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  if (!ok) {
    failed++;
    process.stdout.write(r.stdout ?? "");
    process.stderr.write(r.stderr ?? "");
  }
}
console.log(failed ? `\n${failed} step(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
