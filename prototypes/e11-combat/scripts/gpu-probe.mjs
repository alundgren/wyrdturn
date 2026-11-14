// Which hidden-browser setups get the real GPU? Prints the WebGL renderer for each.
import { chromium } from "playwright-core";
import { homedir } from "node:os";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
const cache = join(homedir(), "Library/Caches/ms-playwright");
const shellDir = (await readdir(cache))
  .filter((d) => d.startsWith("chromium_headless_shell-"))
  .sort()
  .pop();
const shell = join(
  cache,
  shellDir,
  (await readdir(join(cache, shellDir))).find((d) => d.startsWith("chrome-headless-shell")),
  "chrome-headless-shell",
);
const chromDir = (await readdir(cache))
  .filter((d) => /^chromium-\d+$/.test(d))
  .sort()
  .pop();
const chromSub = (await readdir(join(cache, chromDir))).find((d) => d.startsWith("chrome-mac"));
const appName = (await readdir(join(cache, chromDir, chromSub))).find((d) => d.endsWith(".app"));
const full = join(
  cache,
  chromDir,
  chromSub,
  appName,
  "Contents/MacOS",
  appName.replace(".app", ""),
);
const gpuArgs = [
  "--use-angle=metal",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-gpu-rasterization",
];
const setups = [
  [
    "shell + swiftshader (today)",
    shell,
    ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  ],
  ["shell + metal", shell, gpuArgs],
  ["full chromium headless=new + metal", full, ["--headless=new", ...gpuArgs]],
];
for (const [name, exe, args] of setups) {
  try {
    const b = await chromium.launch({ executablePath: exe, headless: true, args });
    const p = await b.newPage();
    const r = await p.evaluate(() => {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2");
      if (!gl) return "no webgl2";
      const e = gl.getExtension("WEBGL_debug_renderer_info");
      return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });
    console.log(`${name}: ${r}`);
    await b.close();
  } catch (e) {
    console.log(`${name}: FAILED ${String(e).split("\n")[0]}`);
  }
}
