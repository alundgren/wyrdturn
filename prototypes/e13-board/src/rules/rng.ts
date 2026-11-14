// Seeded random numbers (mulberry32), the same generator e11 uses.
// `rng(seed)` returns a function; `step(state)` is the same maths on a plain number,
// so a fight state can carry its random state and still be cloned with a spread.

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    const [v, next] = step(a);
    a = next;
    return v;
  };
}

export function step(a: number): [number, number] {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}
