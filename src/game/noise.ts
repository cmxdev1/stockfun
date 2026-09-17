/**
 * Deterministic, dependency-free noise + hashing.
 *
 * Everything in THE LODE is generated from a single world seed, so the client
 * renderer and the server-side spawn table agree on the terrain byte-for-byte
 * without ever shipping a heightmap over the wire.
 */

const UINT32 = 0x100000000;

/** 32-bit integer hash of two signed tile coordinates. */
export function hash2i(x: number, y: number, seed: number): number {
  let h = seed ^ 0x9e3779b9;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h = (h << 13) | (h >>> 19);
  h = Math.imul(h ^ (y | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Hash three ints — used for per-feature variation (props, ore, decor). */
export function hash3i(x: number, y: number, z: number, seed: number): number {
  return hash2i(hash2i(x, y, seed) ^ 0x51ed270b, z, seed ^ 0x2545f491);
}

/** Deterministic float in [0, 1) from a coordinate pair. */
export function rand2(x: number, y: number, seed: number): number {
  return hash2i(x, y, seed) / UINT32;
}

/** Deterministic float in [0, 1) from three ints. */
export function rand3(x: number, y: number, z: number, seed: number): number {
  return hash3i(x, y, z, seed) / UINT32;
}

/** Hash a string into a 32-bit seed (FNV-1a). */
export function seedFromString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small, fast, seedable PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };
}

function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

/** Classic value noise in [-1, 1]. */
export function valueNoise2(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smootherstep(x - x0);
  const fy = smootherstep(y - y0);

  const v00 = rand2(x0, y0, seed);
  const v10 = rand2(x0 + 1, y0, seed);
  const v01 = rand2(x0, y0 + 1, seed);
  const v11 = rand2(x0 + 1, y0 + 1, seed);

  const top = lerp(v00, v10, fx);
  const bottom = lerp(v01, v11, fx);
  return lerp(top, bottom, fy) * 2 - 1;
}

export interface FbmOptions {
  octaves?: number;
  frequency?: number;
  amplitude?: number;
  lacunarity?: number;
  gain?: number;
}

/** Fractal brownian motion over value noise, normalised to [-1, 1]. */
export function fbm2(x: number, y: number, seed: number, opts: FbmOptions = {}): number {
  const {
    octaves = 4,
    frequency = 1,
    amplitude = 1,
    lacunarity = 2.02,
    gain = 0.5,
  } = opts;

  let freq = frequency;
  let amp = amplitude;
  let sum = 0;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2(x * freq, y * freq, seed + i * 1013) * amp;
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }

  return norm === 0 ? 0 : sum / norm;
}

/**
 * Ridged multifractal — produces sharp mountain spines and canyon walls.
 * Returns [0, 1].
 */
export function ridged2(x: number, y: number, seed: number, opts: FbmOptions = {}): number {
  const { octaves = 4, frequency = 1, lacunarity = 2.07, gain = 0.5 } = opts;
  let freq = frequency;
  let amp = 1;
  let sum = 0;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise2(x * freq, y * freq, seed + i * 7717));
    sum += n * n * amp;
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }

  return norm === 0 ? 0 : sum / norm;
}

/**
 * Worley / cellular noise. Returns the distance to the nearest feature point,
 * roughly normalised to [0, 1]. Used for ore veins and neon-district blocks.
 */
export function worley2(x: number, y: number, seed: number): number {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let best = Infinity;

  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox;
      const gy = cy + oy;
      const px = gx + rand2(gx, gy, seed);
      const py = gy + rand2(gx, gy, seed ^ 0x68bc21eb);
      const dx = px - x;
      const dy = py - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) best = d;
    }
  }

  return clamp01(best);
}
