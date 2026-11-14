import * as THREE from "three";

// Quick canvas textures so lighting has something to bite on.
// Placeholder until E4 delivers real painted textures.
function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function finish(c, color) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function speckle(g, r, n, size, alpha) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(r() * 255);
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2);
  }
}

export function brickWall() {
  const S = 512,
    r = rng(7);
  const col = document.createElement("canvas");
  col.width = col.height = S;
  const hgt = document.createElement("canvas");
  hgt.width = hgt.height = S;
  const g = col.getContext("2d"),
    h = hgt.getContext("2d");
  g.fillStyle = "#2a2420";
  g.fillRect(0, 0, S, S);
  h.fillStyle = "#000";
  h.fillRect(0, 0, S, S);
  const rows = 8,
    bh = S / rows;
  for (let y = 0; y < rows; y++) {
    const bw = S / 4,
      off = ((y % 2) * bw) / 2;
    for (let x = -1; x < 5; x++) {
      const px = x * bw + off + 3,
        py = y * bh + 3,
        w = bw - 6,
        hh = bh - 6;
      const v = 70 + r() * 40,
        warm = r() * 12;
      g.fillStyle = `rgb(${v + warm},${v + warm * 0.6},${v - 4})`;
      g.fillRect(px, py, w, hh);
      h.fillStyle = `rgb(${180 + r() * 60},${180},${180})`;
      h.fillRect(px, py, w, hh);
    }
  }
  speckle(g, r, 9000, S, 0.12);
  speckle(h, r, 6000, S, 0.25);
  // grime: darker toward the bottom
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(10,14,6,0.55)");
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return { map: finish(col, true), bumpMap: finish(hgt, false) };
}

export function flagstones() {
  const S = 512,
    r = rng(11);
  const col = document.createElement("canvas");
  col.width = col.height = S;
  const hgt = document.createElement("canvas");
  hgt.width = hgt.height = S;
  const g = col.getContext("2d"),
    h = hgt.getContext("2d");
  g.fillStyle = "#1c1a17";
  g.fillRect(0, 0, S, S);
  h.fillStyle = "#000";
  h.fillRect(0, 0, S, S);
  const n = 4,
    cs = S / n;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const j = () => (r() - 0.5) * 10;
      const v = 55 + r() * 30;
      g.fillStyle = `rgb(${v},${v - 3},${v - 8})`;
      h.fillStyle = `rgb(${170 + r() * 80},0,0)`;
      for (const [ctx] of [[g], [h]]) {
        ctx.beginPath();
        ctx.moveTo(x * cs + 5 + j(), y * cs + 5 + j());
        ctx.lineTo((x + 1) * cs - 5 + j(), y * cs + 5 + j());
        ctx.lineTo((x + 1) * cs - 5 + j(), (y + 1) * cs - 5 + j());
        ctx.lineTo(x * cs + 5 + j(), (y + 1) * cs - 5 + j());
        ctx.closePath();
        ctx.fill();
      }
    }
  speckle(g, r, 9000, S, 0.12);
  speckle(h, r, 6000, S, 0.3);
  return { map: finish(col, true), bumpMap: finish(hgt, false) };
}
