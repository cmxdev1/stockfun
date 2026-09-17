/**
 * Durable state for THE LODE.
 *
 * Only three things need to persist: who is playing, which caches have been
 * taken, and the payout ledger. Everything else (terrain, cache positions,
 * loot contents) is derived from seeds on demand.
 *
 * Backed by a JSON file so the whole game runs with zero infrastructure;
 * swap `read`/`write` for a Postgres/Redis pair to scale it out.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AgentConfig, PlayerProfile, Rarity } from '@/game/types';

export interface ClaimRecord {
  cacheId: string;
  playerId: string;
  wallet: string;
  ticker: string;
  fragment: number;
  notionalUsd: number;
  rarity: Rarity;
  x: number;
  y: number;
  txHash: string;
  simulated: boolean;
  claimedAt: number;
  /** True between reservation and payout. Pending rows never score. */
  pending?: boolean;
}

export interface WorldMeta {
  /** Server-secret spawn seed. Never serialised to the client. */
  spawnSeed: number;
  /** Incremented when the operator reseeds the map. */
  epoch: number;
  /** Total USD notional deposited into the vault across all seedings. */
  seededUsd: number;
  citiesSeeded: number;
  createdAt: number;
}

interface Db {
  world: WorldMeta;
  profiles: Record<string, PlayerProfile>;
  /** Bearer secrets issued at profile creation; never leaves the server after that. */
  secrets: Record<string, string>;
  /** Last accepted position per player, used for the velocity sanity check. */
  positions: Record<string, { x: number; y: number; t: number }>;
  claims: ClaimRecord[];
}

const DATA_DIR = process.env.LODE_DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'lode.json');

function defaultDb(): Db {
  const envSeed = Number(process.env.SPAWN_SEED);
  return {
    world: {
      spawnSeed: Number.isFinite(envSeed) && envSeed !== 0 ? envSeed >>> 0 : 0xc0ffee42,
      epoch: 0,
      seededUsd: 184_320,
      citiesSeeded: 0,
      createdAt: Date.now(),
    },
    profiles: {},
    secrets: {},
    positions: {},
    claims: [],
  };
}

let cache: Db | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function read(): Promise<Db> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Db;
    cache = { ...defaultDb(), ...parsed, world: { ...defaultDb().world, ...parsed.world } };
  } catch {
    cache = defaultDb();
  }
  return cache;
}

async function write(db: Db): Promise<void> {
  cache = db;
  // Serialise writes so concurrent claims cannot interleave and truncate the file.
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${DB_PATH}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
    await fs.rename(tmp, DB_PATH);
  });
  return writeQueue;
}

export async function getWorld(): Promise<WorldMeta> {
  return (await read()).world;
}

export async function bumpEpoch(seededUsd: number): Promise<WorldMeta> {
  const db = await read();
  db.world.epoch += 1;
  db.world.seededUsd += seededUsd;
  await write(db);
  return db.world;
}

export async function getProfile(id: string): Promise<PlayerProfile | null> {
  const db = await read();
  return db.profiles[id] ?? null;
}

export async function findProfileByWallet(wallet: string): Promise<PlayerProfile | null> {
  const db = await read();
  const target = wallet.toLowerCase();
  return Object.values(db.profiles).find((p) => p.wallet.toLowerCase() === target) ?? null;
}

export async function upsertProfile(
  profile: PlayerProfile,
  secret?: string,
): Promise<PlayerProfile> {
  const db = await read();
  db.profiles[profile.id] = profile;
  if (secret) db.secrets[profile.id] = secret;
  await write(db);
  return profile;
}

export async function verifySecret(id: string, secret: string): Promise<boolean> {
  const db = await read();
  const known = db.secrets[id];
  return Boolean(known) && known === secret;
}

/**
 * Velocity gate: the server has no simulation of its own, so it checks that
 * the position a client claims is reachable from the last one it accepted.
 * `maxTilesPerSecond` is generous enough for lag but closes teleport scripts.
 */
export async function checkAndRecordPosition(
  id: string,
  x: number,
  y: number,
  maxTilesPerSecond = 14,
): Promise<{ ok: boolean; reason?: string }> {
  const db = await read();
  const now = Date.now();
  const last = db.positions[id];
  db.positions[id] = { x, y, t: now };

  if (last) {
    const dt = Math.max(0.25, (now - last.t) / 1000);
    const dist = Math.hypot(x - last.x, y - last.y);
    if (dist / dt > maxTilesPerSecond && dist > 24) {
      await write(db);
      return { ok: false, reason: 'Movement rejected: position changed faster than a prospector can walk.' };
    }
  }
  await write(db);
  return { ok: true };
}

/** Per-player claim rate limit. */
export async function claimsSince(id: string, windowMs: number): Promise<number> {
  const db = await read();
  const cutoff = Date.now() - windowMs;
  return db.claims.filter((c) => c.playerId === id && c.claimedAt >= cutoff).length;
}

/** Sweep reservations that never settled (a crash between reserve and payout). */
export async function expireStaleReservations(maxAgeMs = 60_000): Promise<void> {
  const db = await read();
  const cutoff = Date.now() - maxAgeMs;
  const before = db.claims.length;
  db.claims = db.claims.filter((c) => !c.pending || c.claimedAt >= cutoff);
  if (db.claims.length !== before) await write(db);
}

export async function updateAgent(id: string, agent: AgentConfig): Promise<PlayerProfile | null> {
  const db = await read();
  const profile = db.profiles[id];
  if (!profile) return null;
  profile.agent = agent;
  await write(db);
  return profile;
}

export async function isCacheClaimed(cacheId: string): Promise<ClaimRecord | null> {
  const db = await read();
  return db.claims.find((c) => c.cacheId === cacheId) ?? null;
}

export async function claimedIdsIn(ids: string[]): Promise<Set<string>> {
  const db = await read();
  const wanted = new Set(ids);
  const out = new Set<string>();
  for (const c of db.claims) if (wanted.has(c.cacheId)) out.add(c.cacheId);
  return out;
}

/**
 * Reserve a cache before the vault is asked for anything.
 *
 * Without this, two requests for the same cache can both pass the "is it
 * claimed?" check and both trigger a transfer. Reserving first closes that
 * window: the check and the insert happen with no await between them, so
 * within a process they are atomic. A multi-instance deployment should back
 * this with a unique constraint on `cacheId` instead.
 */
export async function reserveClaim(
  record: Omit<ClaimRecord, 'pending'>,
): Promise<{ ok: boolean; existing?: ClaimRecord }> {
  const db = await read();
  const existing = db.claims.find((c) => c.cacheId === record.cacheId);
  if (existing) return { ok: false, existing };
  db.claims.push({ ...record, pending: true });
  // Persist in the background; the in-memory reservation already holds.
  void write(db);
  return { ok: true };
}

/** Promote a reservation to a settled claim and credit the prospector. */
export async function settleClaim(
  cacheId: string,
  txHash: string,
  simulated: boolean,
): Promise<void> {
  const db = await read();
  const record = db.claims.find((c) => c.cacheId === cacheId);
  if (!record || !record.pending) return;
  record.pending = false;
  record.txHash = txHash;
  record.simulated = simulated;
  record.claimedAt = Date.now();

  const profile = db.profiles[record.playerId];
  if (profile) {
    profile.claims += 1;
    profile.notionalUsd = Number((profile.notionalUsd + record.notionalUsd).toFixed(4));
    profile.xp += xpForClaim(record.rarity);
  }
  await write(db);
}

/** Give a cache back when the payout never happened. */
export async function releaseClaim(cacheId: string): Promise<void> {
  const db = await read();
  const i = db.claims.findIndex((c) => c.cacheId === cacheId && c.pending);
  if (i === -1) return;
  db.claims.splice(i, 1);
  await write(db);
}

export function xpForClaim(rarity: Rarity): number {
  switch (rarity) {
    case 'mythic':
      return 2400;
    case 'legendary':
      return 620;
    case 'epic':
      return 180;
    case 'rare':
      return 55;
    default:
      return 18;
  }
}

export async function recentClaims(limit = 24): Promise<ClaimRecord[]> {
  const db = await read();
  return db.claims
    .filter((c) => !c.pending)
    .sort((a, b) => b.claimedAt - a.claimedAt)
    .slice(0, limit);
}

export interface LeaderRow {
  rank: number;
  handle: string;
  agent: string;
  wallet: string;
  claims: number;
  notionalUsd: number;
  xp: number;
  level: number;
}

export function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 120)) + 1);
}

export async function leaderboard(limit = 20): Promise<LeaderRow[]> {
  const db = await read();
  return Object.values(db.profiles)
    .sort((a, b) => b.notionalUsd - a.notionalUsd || b.xp - a.xp)
    .slice(0, limit)
    .map((p, i) => ({
      rank: i + 1,
      handle: p.handle,
      agent: p.agent.name,
      wallet: p.wallet,
      claims: p.claims,
      notionalUsd: p.notionalUsd,
      xp: p.xp,
      level: levelFromXp(p.xp),
    }));
}

export async function globalStats() {
  const db = await read();
  const settled = db.claims.filter((c) => !c.pending);
  const claimedUsd = settled.reduce((a, c) => a + c.notionalUsd, 0);
  return {
    prospectors: Object.keys(db.profiles).length,
    claims: settled.length,
    claimedUsd: Number(claimedUsd.toFixed(2)),
    seededUsd: db.world.seededUsd,
    epoch: db.world.epoch,
  };
}
