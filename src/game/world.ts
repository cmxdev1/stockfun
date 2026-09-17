/**
 * Terrain generation for THE LODE.
 *
 * The world is infinite and fully deterministic: `sampleTile` is a pure
 * function of (x, y, seed), so the browser renderer and the server spawn table
 * see exactly the same ground without exchanging a single byte of heightmap.
 */

import { clamp, clamp01, fbm2, rand2, rand3, ridged2, worley2 } from './noise';
import type { BiomeId, BiomeStyle, PropId, Rgb, Tile } from './types';

export const WORLD = {
  /** Tiles per chunk edge. */
  chunk: 24,
  /** Height levels available to a column. */
  maxHeight: 24,
  /** Height level that counts as sea level. */
  seaLevel: 8,
  /** Master seed — override with NEXT_PUBLIC_WORLD_SEED. */
  seed: 0x50c4fa11,
} as const;

const rgb = (r: number, g: number, b: number): Rgb => ({ r, g, b });

export const BIOMES: Record<BiomeId, BiomeStyle> = {
  abyss: {
    id: 'abyss',
    name: 'The Abyss Shelf',
    tagline: 'Cold water, old money. Signals travel far down here.',
    top: rgb(14, 30, 74),
    topAlt: rgb(10, 22, 58),
    side: rgb(8, 16, 44),
    accent: '#3d6bff',
    yieldBias: 0.55,
    mood: 'pressure',
  },
  shallows: {
    id: 'shallows',
    name: 'The Shallows',
    tagline: 'Warm shelf water. Easy wading, thin loot.',
    top: rgb(26, 86, 140),
    topAlt: rgb(22, 74, 126),
    side: rgb(16, 52, 96),
    accent: '#38e0ff',
    yieldBias: 0.7,
    mood: 'lapping',
  },
  shore: {
    id: 'shore',
    name: 'Sablewash',
    tagline: 'Black sand beaches where the tide leaves fragments behind.',
    top: rgb(206, 186, 140),
    topAlt: rgb(188, 166, 122),
    side: rgb(142, 122, 86),
    accent: '#ffd98a',
    yieldBias: 1.0,
    mood: 'surf',
  },
  verdant: {
    id: 'verdant',
    name: 'Verdant Flats',
    tagline: 'The starter fields. Dense with common caches.',
    top: rgb(74, 158, 88),
    topAlt: rgb(62, 140, 78),
    side: rgb(44, 100, 56),
    accent: '#6dffa8',
    yieldBias: 1.0,
    mood: 'wind',
  },
  bloom: {
    id: 'bloom',
    name: 'Bloomfield',
    tagline: 'Perpetual spring. Momentum tickers cluster in the canopy.',
    top: rgb(126, 176, 108),
    topAlt: rgb(150, 122, 168),
    side: rgb(78, 96, 74),
    accent: '#ff8fd0',
    yieldBias: 1.15,
    mood: 'petals',
  },
  hollow: {
    id: 'hollow',
    name: 'Fungal Hollow',
    tagline: 'Bioluminescent swamp. High variance, higher rewards.',
    top: rgb(60, 78, 92),
    topAlt: rgb(84, 62, 112),
    side: rgb(38, 46, 62),
    accent: '#b388ff',
    yieldBias: 1.35,
    mood: 'spores',
  },
  dunes: {
    id: 'dunes',
    name: 'Gilded Dunes',
    tagline: 'Sun-bleached and rich. Legendary caches drift under the sand.',
    top: rgb(224, 196, 122),
    topAlt: rgb(210, 176, 100),
    side: rgb(166, 132, 70),
    accent: '#ffc84a',
    yieldBias: 1.45,
    mood: 'heat',
  },
  sprawl: {
    id: 'sprawl',
    name: 'Neon Sprawl',
    tagline: 'The vertical market. Mega-cap fragments stack in the towers.',
    top: rgb(46, 48, 72),
    topAlt: rgb(34, 36, 58),
    side: rgb(24, 24, 42),
    accent: '#41f5ff',
    yieldBias: 1.6,
    mood: 'hum',
  },
  tundra: {
    id: 'tundra',
    name: 'Cobalt Tundra',
    tagline: 'Frozen order book. Slow, quiet, dependable yield.',
    top: rgb(216, 230, 246),
    topAlt: rgb(196, 214, 238),
    side: rgb(150, 172, 206),
    accent: '#9fe8ff',
    yieldBias: 1.2,
    mood: 'hush',
  },
  ember: {
    id: 'ember',
    name: 'Ember Wastes',
    tagline: 'Volatility made landscape. Mythics burn down here.',
    top: rgb(92, 46, 44),
    topAlt: rgb(72, 34, 36),
    side: rgb(54, 24, 26),
    accent: '#ff6a3d',
    yieldBias: 1.75,
    mood: 'roar',
  },
  peaks: {
    id: 'peaks',
    name: 'Argent Peaks',
    tagline: 'Above the treeline. Thin air, thick veins.',
    top: rgb(198, 204, 218),
    topAlt: rgb(174, 182, 200),
    side: rgb(112, 120, 140),
    accent: '#e6f0ff',
    yieldBias: 1.5,
    mood: 'gale',
  },
};

export const BIOME_ORDER: BiomeId[] = [
  'abyss',
  'shallows',
  'shore',
  'verdant',
  'bloom',
  'hollow',
  'dunes',
  'sprawl',
  'tundra',
  'ember',
  'peaks',
];

/** Continent mask — large, slow noise that carves oceans between landmasses. */
function continent(x: number, y: number, seed: number): number {
  const base = fbm2(x * 0.0042, y * 0.0042, seed, { octaves: 5, gain: 0.52 });
  const warp = fbm2(x * 0.011 + 41.7, y * 0.011 - 18.3, seed ^ 0x3f10, { octaves: 3 });
  return base * 0.78 + warp * 0.22;
}

function elevationAt(x: number, y: number, seed: number): number {
  const c = continent(x, y, seed);
  // Mountain spines ride on top of the continent mask.
  const ridge = ridged2(x * 0.017, y * 0.017, seed ^ 0x77a1, { octaves: 5, gain: 0.48 });
  // Mid-frequency rolling so even the plains are never a flat table.
  const rolling = fbm2(x * 0.028, y * 0.028, seed ^ 0x4c11, { octaves: 3 }) * 0.5 + 0.5;
  const detail = fbm2(x * 0.075, y * 0.075, seed ^ 0x2bd3, { octaves: 3 }) * 0.5 + 0.5;

  const land = clamp01(c * 0.5 + 0.5);
  // Gamma pushes lowlands down and lets highlands run away — without it the
  // whole world sits in a narrow band of heights and reads as one plateau.
  const shaped = Math.pow(land, 1.45);
  const mountainMask = clamp01((land - 0.5) * 2.3);
  const spine = ridge * ridge * mountainMask;

  return clamp01(shaped * 0.7 + spine * 0.92 + rolling * 0.12 + detail * 0.05 - 0.02);
}

function moistureAt(x: number, y: number, seed: number): number {
  return clamp01(fbm2(x * 0.0091 - 220.5, y * 0.0091 + 90.25, seed ^ 0x51ab, { octaves: 4 }) * 0.5 + 0.5);
}

function temperatureAt(x: number, y: number, seed: number, elevation: number): number {
  // Latitude bands give the world recognisable climate belts.
  const latitude = Math.cos((y / 1400) * Math.PI) * 0.5 + 0.5;
  const drift = fbm2(x * 0.0055 + 610.1, y * 0.0055 - 402.7, seed ^ 0x9d21, { octaves: 3 }) * 0.5 + 0.5;
  const raw = latitude * 0.62 + drift * 0.38;
  // High ground is cold ground.
  return clamp01(raw - Math.max(0, elevation - 0.68) * 1.35);
}

/** Cities are rare, blocky attractors dropped by cellular noise. */
function sprawlMask(x: number, y: number, seed: number): number {
  const cells = worley2(x * 0.0125, y * 0.0125, seed ^ 0x01c17ee);
  return clamp01(1 - cells * 3.1);
}

function pickBiome(
  elevation: number,
  moisture: number,
  temperature: number,
  urban: number,
): BiomeId {
  if (elevation < 0.34) return 'abyss';
  if (elevation < 0.44) return 'shallows';
  if (elevation < 0.475) return 'shore';
  if (urban > 0.55 && elevation < 0.72) return 'sprawl';
  if (elevation > 0.845) return 'peaks';
  if (temperature < 0.27) return 'tundra';
  if (temperature > 0.78 && moisture < 0.32) return 'dunes';
  if (temperature > 0.74 && moisture > 0.62 && elevation > 0.66) return 'ember';
  if (moisture > 0.68) return 'hollow';
  if (moisture > 0.5) return 'bloom';
  return 'verdant';
}

function pickProp(
  x: number,
  y: number,
  seed: number,
  biome: BiomeId,
  h: number,
  water: number,
): PropId {
  if (water > 0) {
    return water < 2 && rand3(x, y, 9, seed) > 0.965 ? 'reed' : 'none';
  }

  const r = rand3(x, y, 3, seed);
  const clusters = fbm2(x * 0.14, y * 0.14, seed ^ 0x7ee5, { octaves: 2 }) * 0.5 + 0.5;
  const density = clusters * clusters;

  switch (biome) {
    case 'verdant':
      if (r < density * 0.24) return r < density * 0.09 ? 'pine' : 'broadleaf';
      if (r > 0.985) return 'rock';
      return 'none';
    case 'bloom':
      if (r < density * 0.32) return r < density * 0.16 ? 'blossom' : 'broadleaf';
      return 'none';
    case 'hollow':
      if (r < density * 0.34) return 'shroom';
      if (r > 0.981) return 'monolith';
      return 'none';
    case 'dunes':
      if (r < density * 0.075) return 'cactus';
      if (r > 0.9915) return 'monolith';
      return 'none';
    case 'sprawl': {
      // Towers snap to a street grid so the city reads as built, not scattered.
      const block = (x & 7) !== 0 && (y & 7) !== 0;
      if (block && r < 0.44) return 'tower';
      if (!block && r > 0.9) return 'lamp';
      return 'none';
    }
    case 'tundra':
      if (r < density * 0.14) return 'pine';
      if (r > 0.99) return 'crystal';
      return 'none';
    case 'ember':
      if (r < density * 0.1) return 'vent';
      if (r > 0.977) return 'rock';
      return 'none';
    case 'peaks':
      if (r < density * 0.1) return 'crystal';
      if (r > 0.95) return 'rock';
      return 'none';
    case 'shore':
      if (r > 0.988) return 'rock';
      return 'none';
    default:
      return 'none';
  }
}

/** Mineral veins — snaking cellular bands that raise cache density and yield. */
export function richnessAt(x: number, y: number, seed: number): number {
  const vein = 1 - worley2(x * 0.045, y * 0.045, seed ^ 0x00e5da7);
  const depth = fbm2(x * 0.021 + 88.2, y * 0.021 - 12.9, seed ^ 0xbeef, { octaves: 3 }) * 0.5 + 0.5;
  return clamp01(Math.pow(clamp01(vein * 1.25), 2.2) * 0.65 + depth * 0.35);
}

const tileCache = new Map<string, Tile>();
const TILE_CACHE_LIMIT = 90_000;

/** Pure terrain sample. Memoised because the renderer hits hot tiles repeatedly. */
export function sampleTile(x: number, y: number, seed: number = WORLD.seed): Tile {
  const key = `${x}:${y}:${seed}`;
  const hit = tileCache.get(key);
  if (hit) return hit;

  const elevation = elevationAt(x, y, seed);
  const moisture = moistureAt(x, y, seed);
  const temperature = temperatureAt(x, y, seed, elevation);
  const urban = sprawlMask(x, y, seed);
  const biome = pickBiome(elevation, moisture, temperature, urban);

  let h = Math.round(elevation * (WORLD.maxHeight - 1));
  if (biome === 'sprawl') {
    // Flatten the city so streets stay walkable.
    h = Math.max(WORLD.seaLevel + 1, Math.round(h * 0.42 + (WORLD.seaLevel + 3) * 0.58));
  }
  h = clamp(h, 0, WORLD.maxHeight - 1);

  const water = h < WORLD.seaLevel ? WORLD.seaLevel - h : 0;
  const tile: Tile = {
    h,
    biome,
    water,
    prop: pickProp(x, y, seed, biome, h, water),
    jitter: rand2(x, y, seed ^ 0x1234),
    richness: richnessAt(x, y, seed),
  };

  if (tileCache.size > TILE_CACHE_LIMIT) tileCache.clear();
  tileCache.set(key, tile);
  return tile;
}

/** Maximum height difference a prospector can climb in one step. */
export const MAX_CLIMB = 3;

/** True when a prospector can stand on this column. */
export function isWalkable(x: number, y: number, seed: number = WORLD.seed): boolean {
  const tile = sampleTile(x, y, seed);
  if (tile.water > 2) return false;
  if (tile.prop === 'tower' || tile.prop === 'monolith') return false;
  return true;
}

/** True when a prospector can step from one column to an adjacent one. */
export function canStep(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  seed: number = WORLD.seed,
): boolean {
  if (!isWalkable(toX, toY, seed)) return false;
  const climb = Math.abs(surfaceHeight(toX, toY, seed) - surfaceHeight(fromX, fromY, seed));
  return climb <= MAX_CLIMB;
}

/** Surface height a prospector's feet rest at, including shallow water. */
export function surfaceHeight(x: number, y: number, seed: number = WORLD.seed): number {
  const tile = sampleTile(x, y, seed);
  return tile.water > 0 ? WORLD.seaLevel : tile.h;
}

/** Nearest walkable tile to a target, spiralling outwards. Used for spawns. */
export function nearestWalkable(
  x: number,
  y: number,
  seed: number = WORLD.seed,
  maxRadius = 64,
  requireDry = false,
): { x: number; y: number } {
  const ok = (px: number, py: number) =>
    isWalkable(px, py, seed) && (!requireDry || sampleTile(px, py, seed).water === 0);

  if (ok(x, y)) return { x, y };
  for (let r = 1; r <= maxRadius; r++) {
    for (let i = -r; i <= r; i++) {
      const candidates = [
        { x: x + i, y: y - r },
        { x: x + i, y: y + r },
        { x: x - r, y: y + i },
        { x: x + r, y: y + i },
      ];
      for (const c of candidates) {
        if (ok(c.x, c.y)) return c;
      }
    }
  }
  return requireDry ? nearestWalkable(x, y, seed, maxRadius, false) : { x, y };
}

export function biomeAt(x: number, y: number, seed: number = WORLD.seed): BiomeStyle {
  return BIOMES[sampleTile(x, y, seed).biome];
}

/** Human-friendly sector name, e.g. "SECTOR G-14". Purely cosmetic. */
export function sectorName(x: number, y: number): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const sx = Math.floor(x / 128);
  const sy = Math.floor(y / 128);
  const letter = letters[((sx % letters.length) + letters.length) % letters.length];
  return `${letter}-${((sy % 999) + 999) % 999}`;
}
