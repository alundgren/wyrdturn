// Seeded random numbers (mulberry32). Only the generator and the random bot use them;
// fights themselves have no randomness.
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pickOne = <T>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)];
