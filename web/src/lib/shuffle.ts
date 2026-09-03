// Per-student question/choice order. The order must be stable across reloads and
// reproducible when reviewing a submission, so it's derived from the session id
// rather than stored — same session always yields the same order.

function hashToSeed(input: string): number {
  // FNV-1a, 32-bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates using a seeded PRNG. Returns a new array; input is untouched. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const rng = mulberry32(hashToSeed(seed));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Distinct namespaces so a question's choices don't shuffle in lockstep with the paper. */
export const questionOrderSeed = (sessionId: string) => `${sessionId}:questions`;
export const choiceOrderSeed = (sessionId: string, questionId: string) =>
  `${sessionId}:choices:${questionId}`;
