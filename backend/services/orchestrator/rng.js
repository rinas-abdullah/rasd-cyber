// Deterministic pseudo-random utilities. The whole simulation is seedable so a
// session can be replayed to the exact same world state and scores — a hard
// requirement for auditable, testable consequences (brief §6, §14).

/**
 * mulberry32 — tiny, fast, deterministic 32-bit PRNG.
 * @param {number} seed
 * @returns {() => number} function returning a float in [0,1)
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stable string hash (FNV-1a 32-bit) → a deterministic numeric seed from any id.
 * @param {string} str
 * @returns {number}
 */
function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic RNG bound to an id/seed string. */
function makeRng(seedStr) {
  return mulberry32(hashSeed(seedStr));
}

/** Pick one element deterministically. */
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

module.exports = { mulberry32, hashSeed, makeRng, pick };
