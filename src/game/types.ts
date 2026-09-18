/** Shared vocabulary for THE LODE — used by the renderer, the engine and the API. */

export type BiomeId =
  | 'abyss'
  | 'shallows'
  | 'shore'
  | 'verdant'
  | 'bloom'
  | 'hollow'
  | 'dunes'
  | 'sprawl'
  | 'tundra'
  | 'ember'
  | 'peaks';

export type PropId =
  | 'none'
  | 'pine'
  | 'broadleaf'
  | 'blossom'
  | 'cactus'
  | 'shroom'
  | 'crystal'
  | 'tower'
  | 'lamp'
  | 'rock'
  | 'reed'
  | 'vent'
  | 'monolith';

export interface Tile {
  /** Integer stack height, 0 = sea floor. */
  h: number;
  biome: BiomeId;
  /** 0 = dry land, >0 = depth of water above the column. */
  water: number;
  prop: PropId;
  /** Per-tile 0..1 dither used for colour variation. */
  jitter: number;
  /** 0..1 — how mineral-rich this tile is, drives cache density and mining yield. */
  richness: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface BiomeStyle {
  id: BiomeId;
  name: string;
  /** Short flavour line shown in the HUD locator. */
  tagline: string;
  top: Rgb;
  topAlt: Rgb;
  side: Rgb;
  /** Emissive accent used for props, fog tint and minimap. */
  accent: string;
  /** Multiplier on cache spawn density. */
  yieldBias: number;
  /** Ambient sound/mood tag used by the HUD. */
  mood: string;
}

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface RarityStyle {
  id: Rarity;
  label: string;
  color: string;
  glow: string;
  /** Relative weight when rolling a cache. */
  weight: number;
  /** Multiplier applied to the seeded fragment size. */
  valueMultiplier: number;
  /** Server-verified mining difficulty (taps required / hash leading zeroes). */
  difficulty: number;
}

/** A buried stock cache. `amount` and `ticker` are only revealed once claimed. */
export interface Cache {
  id: string;
  x: number;
  y: number;
  rarity: Rarity;
  /** Ticker symbol of the tokenised stock buried here. */
  ticker: string;
  /** Fragment size in whole-share units (e.g. 0.00042 of a share). */
  fragment: number;
  /** USD notional at seed time, used for leaderboard scoring. */
  notionalUsd: number;
  biome: BiomeId;
  seededAt: number;
  claimedBy?: string;
  claimedAt?: number;
  txHash?: string;
}

/** What the client is allowed to see before a cache is opened. */
export interface CacheSignal {
  id: string;
  x: number;
  y: number;
  rarity: Rarity;
  biome: BiomeId;
  /** Blurred hint — sector of the market, not the ticker itself. */
  sector: string;
  difficulty: number;
  claimed: boolean;
}

export interface Vec2 {
  x: number;
  y: number;
}

export type AgentArchetype = 'scout' | 'digger' | 'oracle' | 'drifter';

export interface AgentConfig {
  name: string;
  archetype: AgentArchetype;
  /** 0..1 — how far the agent will wander from the player. */
  range: number;
  /** 0..1 — chance the agent prioritises rare signals over close ones. */
  greed: number;
  /** Hex colour for the agent's trail and aura. */
  hue: number;
  /** Autonomy: when true the agent walks and mines on its own. */
  autonomous: boolean;
}

export interface PlayerProfile {
  id: string;
  handle: string;
  wallet: `0x${string}`;
  agent: AgentConfig;
  createdAt: number;
  /** Tiles walked — feeds the XP curve. */
  distance: number;
  xp: number;
  claims: number;
  notionalUsd: number;
}

export interface ClaimResult {
  ok: boolean;
  error?: string;
  ticker?: string;
  fragment?: number;
  notionalUsd?: number;
  rarity?: Rarity;
  txHash?: string;
  explorerUrl?: string;
  /** True when the transfer was simulated because no vault key is configured. */
  simulated?: boolean;
  xp?: number;
}
