/**
 * The spawn table.
 *
 * Caches are *derived*, not stored: `cacheAt` is a pure function of
 * (x, y, spawnSeed). The spawn seed lives only on the server, so a player can
 * render the exact same terrain as the server yet cannot compute where the
 * loot is — they have to scan for it. Only claims are persisted.
 */

import { hash3i, mulberry32 } from './noise';
import { BIOMES, sampleTile, WORLD } from './world';
import type { Cache, CacheSignal, Rarity, RarityStyle } from './types';
import { STOCKS, sectorOf } from '@/lib/stocks';

export const RARITIES: Record<Rarity, RarityStyle> = {
  common: {
    id: 'common',
    label: 'Common',
    color: '#8fe3a8',
    glow: 'rgba(143, 227, 168, 0.55)',
    weight: 62,
    valueMultiplier: 1,
    difficulty: 1,
  },
  rare: {
    id: 'rare',
    label: 'Rare',
    color: '#5cc8ff',
    glow: 'rgba(92, 200, 255, 0.6)',
    weight: 24,
    valueMultiplier: 4.5,
    difficulty: 2,
  },
  epic: {
    id: 'epic',
    label: 'Epic',
    color: '#c07bff',
    glow: 'rgba(192, 123, 255, 0.65)',
    weight: 9.5,
    valueMultiplier: 17,
    difficulty: 3,
  },
  legendary: {
    id: 'legendary',
    label: 'Legendary',
    color: '#ffc44d',
    glow: 'rgba(255, 196, 77, 0.7)',
    weight: 3.6,
    valueMultiplier: 62,
    difficulty: 4,
  },
  mythic: {
    id: 'mythic',
    label: 'Mythic',
    color: '#ff5f8f',
    glow: 'rgba(255, 95, 143, 0.75)',
    weight: 0.9,
    valueMultiplier: 240,
    difficulty: 5,
  },
};

export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

/** Base USD notional of a common fragment before rarity multipliers. */
const BASE_NOTIONAL_USD = 0.06;

/** Roughly one cache per N walkable tiles, before biome and vein modifiers. */
const BASE_DENSITY = 1 / 430;

function rollRarity(rng: () => number, richness: number): Rarity {
  // Rich veins bend the curve upward without ever guaranteeing a mythic.
  const luck = 1 + richness * 1.9;
  const weights = RARITY_ORDER.map((id, i) => RARITIES[id].weight * Math.pow(luck, i * 0.55));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < RARITY_ORDER.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return RARITY_ORDER[i];
  }
  return 'common';
}

function pickTicker(rng: () => number, rarity: Rarity): string {
  // Higher rarities lean toward higher-priced names so the fragment stays tiny
  // while the notional climbs — a mythic is a sliver of NFLX, not a slab of HOOD.
  const tier = RARITY_ORDER.indexOf(rarity) / (RARITY_ORDER.length - 1);
  const scored = STOCKS.map((s) => {
    const priceRank = Math.log10(s.refPrice + 1) / 3;
    const affinity = 1 - Math.abs(priceRank - (0.35 + tier * 0.5));
    return { ticker: s.ticker, weight: Math.max(0.05, affinity) ** 3 };
  });
  const total = scored.reduce((a, b) => a + b.weight, 0);
  let roll = rng() * total;
  for (const s of scored) {
    roll -= s.weight;
    if (roll <= 0) return s.ticker;
  }
  return scored[0].ticker;
}

export function cacheId(x: number, y: number, epoch: number): string {
  return `c${epoch}.${x}.${y}`;
}

export function parseCacheId(id: string): { x: number; y: number; epoch: number } | null {
  const m = /^c(\d+)\.(-?\d+)\.(-?\d+)$/.exec(id);
  if (!m) return null;
  return { epoch: Number(m[1]), x: Number(m[2]), y: Number(m[3]) };
}

/**
 * Is there a cache on this exact tile? Pure, deterministic, server-secret.
 * `spawnSeed` must never reach the browser.
 */
export function cacheAt(
  x: number,
  y: number,
  spawnSeed: number,
  epoch = 0,
  worldSeed: number = WORLD.seed,
): Cache | null {
  const tile = sampleTile(x, y, worldSeed);
  if (tile.water > 2) return null; // no caches in deep ocean
  if (tile.prop === 'tower' || tile.prop === 'monolith') return null;

  const biome = BIOMES[tile.biome];
  const density = BASE_DENSITY * biome.yieldBias * (0.35 + tile.richness * 1.75);

  const gate = hash3i(x, y, epoch, spawnSeed) / 0x100000000;
  if (gate > density) return null;

  const rng = mulberry32(hash3i(x * 31, y * 17, epoch + 7, spawnSeed ^ 0x5eedca5e));
  const rarity = rollRarity(rng, tile.richness);
  const ticker = pickTicker(rng, rarity);
  const stock = STOCKS.find((s) => s.ticker === ticker)!;

  const spread = 0.55 + rng() * 0.9;
  const notionalUsd =
    BASE_NOTIONAL_USD * RARITIES[rarity].valueMultiplier * spread * (0.7 + tile.richness * 0.6);
  const fragment = notionalUsd / stock.refPrice;

  return {
    id: cacheId(x, y, epoch),
    x,
    y,
    rarity,
    ticker,
    fragment: Number(fragment.toPrecision(6)),
    notionalUsd: Number(notionalUsd.toFixed(4)),
    biome: tile.biome,
    seededAt: 0,
  };
}

/** All caches whose tile centre falls inside a square region. */
export function cachesInRegion(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  spawnSeed: number,
  epoch = 0,
  worldSeed: number = WORLD.seed,
): Cache[] {
  const out: Cache[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const c = cacheAt(x, y, spawnSeed, epoch, worldSeed);
      if (c) out.push(c);
    }
  }
  return out;
}

/** Strip a cache down to what a player is allowed to see before opening it. */
export function toSignal(cache: Cache, claimed: boolean): CacheSignal {
  return {
    id: cache.id,
    x: cache.x,
    y: cache.y,
    rarity: cache.rarity,
    biome: cache.biome,
    sector: sectorOf(cache.ticker),
    difficulty: RARITIES[cache.rarity].difficulty,
    claimed,
  };
}

/** Chebyshev distance — the grid metric the claim server enforces. */
export function tileDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}
