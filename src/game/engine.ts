/**
 * Simulation for THE LODE: movement, pathfinding, chunk discovery, the
 * scanner, the mining loop and the autonomous agent.
 *
 * The engine is framework-agnostic — React drives it with `step(dt)` and reads
 * the state out each frame. Anything that mutates real value (claims) goes
 * through callbacks so the server stays authoritative.
 */

import { clamp, clamp01, mulberry32 } from './noise';
import { CHUNK, weatherFor, type Particle, type RenderState } from './renderer';
import { RARITIES } from './drops';
import {
  BIOMES,
  canStep,
  isWalkable,
  MAX_CLIMB,
  nearestWalkable,
  sampleTile,
  surfaceHeight,
  WORLD,
} from './world';
import type { AgentConfig, CacheSignal, Vec2 } from './types';

export interface EngineCallbacks {
  onScan: (x: number, y: number) => void;
  onMineComplete: (signal: CacheSignal) => void;
  onDiscover: (chunks: string[]) => void;
  onLog: (message: string, tone?: 'info' | 'good' | 'warn') => void;
}

export interface EngineOptions {
  seed?: number;
  spawn?: Vec2;
  agent: AgentConfig;
  handle: string;
  level: number;
}

const WALK_SPEED = 4.6; // tiles / second
const AGENT_SPEED = 6.4;
const DISCOVER_RADIUS = 3.1; // in chunks
const SCAN_COOLDOWN = 6.5;
const SCAN_RADIUS = 26;

export class LodeEngine {
  seed: number;
  handle: string;
  level: number;
  agentConfig: AgentConfig;

  player: Vec2;
  playerFacing = 0.25;
  playerMoving = false;
  private path: Vec2[] = [];

  agent: Vec2;
  agentTarget: Vec2 | null = null;

  camera = { x: 0, y: 0, zoom: 1 };
  targetZoom = 1;

  signals: CacheSignal[] = [];
  focusId: string | null = null;
  hover: Vec2 | null = null;

  discovered = new Map<string, number>();
  particles: Particle[] = [];

  time = 0;
  dayT = 0.32;
  dayLengthSeconds = 420;

  scanT = 0;
  scanCooldown = 0;

  mining: { signal: CacheSignal; progress: number; taps: number } | null = null;
  distanceWalked = 0;

  /** Input axes, set by the host component. */
  input = { up: false, down: false, left: false, right: false };

  private cb: EngineCallbacks;
  private rng: () => number;
  private lastDiscoverCheck = -1;
  private lastAgentTargetId: string | null = null;
  private agentChatterAt = -99;
  private lastBiomeId: string | null = null;

  constructor(opts: EngineOptions, cb: EngineCallbacks) {
    this.seed = opts.seed ?? WORLD.seed;
    this.cb = cb;
    this.handle = opts.handle;
    this.level = opts.level;
    this.agentConfig = opts.agent;
    this.rng = mulberry32(0x9e3779b9);

    const spawn = nearestWalkable(opts.spawn?.x ?? 0, opts.spawn?.y ?? 0, this.seed);
    this.player = { x: spawn.x + 0.5, y: spawn.y + 0.5 };
    this.agent = { x: this.player.x + 1.5, y: this.player.y + 1.5 };
    this.camera = { x: this.player.x, y: this.player.y, zoom: 1 };
    this.revealAround(true);
  }

  /* ------------------------------ input ------------------------------ */

  setHover(tile: Vec2 | null): void {
    this.hover = tile;
  }

  setZoom(z: number): void {
    this.targetZoom = clamp(z, 0.52, 1.35);
  }

  nudgeZoom(delta: number): void {
    this.setZoom(this.targetZoom * (1 - delta * 0.0016));
  }

  /** Click-to-move. Returns false when the destination is unreachable. */
  moveTo(tile: Vec2): boolean {
    const goal = { x: Math.floor(tile.x), y: Math.floor(tile.y) };
    if (!isWalkable(goal.x, goal.y, this.seed)) {
      this.cb.onLog('Impassable terrain — the route dead-ends.', 'warn');
      return false;
    }
    const start = { x: Math.floor(this.player.x), y: Math.floor(this.player.y) };
    const path = findPath(start, goal, this.seed, 4200);
    if (!path) {
      this.cb.onLog('No route found from here.', 'warn');
      return false;
    }
    this.path = path;
    return true;
  }

  focus(id: string | null): void {
    this.focusId = id;
  }

  /** Walk to a cache and start mining when adjacent. */
  travelTo(signal: CacheSignal): void {
    this.focusId = signal.id;
    this.moveTo({ x: signal.x, y: signal.y });
  }

  scan(): boolean {
    if (this.scanCooldown > 0) return false;
    this.scanCooldown = SCAN_COOLDOWN;
    this.scanT = 1;
    this.cb.onScan(Math.floor(this.player.x), Math.floor(this.player.y));
    this.cb.onLog('Resonance sweep deployed. Reading the substrate…', 'info');
    return true;
  }

  get scanReadyIn(): number {
    return Math.max(0, this.scanCooldown);
  }

  /** The cache the prospector is currently standing on or beside. */
  cacheInReach(): CacheSignal | null {
    const px = Math.floor(this.player.x);
    const py = Math.floor(this.player.y);
    let best: CacheSignal | null = null;
    let bestD = Infinity;
    for (const s of this.signals) {
      if (s.claimed) continue;
      const d = Math.max(Math.abs(s.x - px), Math.abs(s.y - py));
      if (d <= 1 && d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  beginMining(signal?: CacheSignal | null): boolean {
    const target = signal ?? this.cacheInReach();
    if (!target) return false;
    if (this.mining?.signal.id === target.id) return true;
    this.mining = { signal: target, progress: 0, taps: 0 };
    this.focusId = target.id;
    this.path = [];
    this.cb.onLog(`Breaking ground on a ${RARITIES[target.rarity].label} cache…`, 'info');
    return true;
  }

  cancelMining(): void {
    if (this.mining) this.cb.onLog('Excavation aborted.', 'warn');
    this.mining = null;
  }

  /** Each strike adds progress; rarer caches need more of them. */
  strike(): void {
    if (!this.mining) {
      this.beginMining();
      return;
    }
    const diff = RARITIES[this.mining.signal.rarity].difficulty;
    this.mining.taps += 1;
    this.mining.progress += 1 / (diff * 4);
    this.spawnChips(this.mining.signal, 8);
    if (this.mining.progress >= 1) {
      const done = this.mining.signal;
      this.mining = null;
      this.spawnBurst(done);
      this.cb.onMineComplete(done);
    }
  }

  markClaimed(id: string): void {
    const s = this.signals.find((x) => x.id === id);
    if (s) s.claimed = true;
    if (this.focusId === id) this.focusId = null;
  }

  setSignals(next: CacheSignal[]): void {
    // Merge so locally-claimed caches do not flicker back to unclaimed.
    const claimed = new Set(this.signals.filter((s) => s.claimed).map((s) => s.id));
    const byId = new Map<string, CacheSignal>();
    for (const s of next) byId.set(s.id, { ...s, claimed: s.claimed || claimed.has(s.id) });
    for (const s of this.signals) if (!byId.has(s.id)) byId.set(s.id, s);
    this.signals = [...byId.values()];
  }

  /* ------------------------------ loop ------------------------------ */

  step(dt: number): void {
    const d = Math.min(dt, 0.05);
    this.time += d;
    this.dayT = (this.dayT + d / this.dayLengthSeconds) % 1;
    this.scanCooldown = Math.max(0, this.scanCooldown - d);
    if (this.scanT > 0) this.scanT = Math.max(0, this.scanT - d * 1.15);

    this.stepPlayer(d);
    this.stepAgent(d);
    this.stepMining(d);
    this.stepParticles(d);
    this.stepCamera(d);
    this.revealAround(false);
    this.checkBiome();
  }

  private checkBiome(): void {
    const b = this.biome;
    if (b.id === this.lastBiomeId) return;
    const first = this.lastBiomeId === null;
    this.lastBiomeId = b.id;
    if (!first) this.cb.onLog(`Entering ${b.name} — ${b.tagline}`, 'info');
  }

  private stepPlayer(dt: number): void {
    const { input } = this;
    let vx = 0;
    let vy = 0;

    // Screen-relative WASD mapped onto the iso axes.
    if (input.up) {
      vx -= 1;
      vy -= 1;
    }
    if (input.down) {
      vx += 1;
      vy += 1;
    }
    if (input.left) {
      vx -= 1;
      vy += 1;
    }
    if (input.right) {
      vx += 1;
      vy -= 1;
    }

    if (vx !== 0 || vy !== 0) {
      this.path = [];
      const len = Math.hypot(vx, vy) || 1;
      this.tryMove((vx / len) * WALK_SPEED * dt, (vy / len) * WALK_SPEED * dt);
      this.playerMoving = true;
      this.playerFacing = Math.atan2(vy, vx);
      return;
    }

    if (this.path.length > 0) {
      const next = this.path[0];
      const tx = next.x + 0.5;
      const ty = next.y + 0.5;
      const dx = tx - this.player.x;
      const dy = ty - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.08) {
        this.path.shift();
        if (this.path.length === 0) this.onArrive();
      } else {
        const stepLen = Math.min(dist, WALK_SPEED * dt);
        this.tryMove((dx / dist) * stepLen, (dy / dist) * stepLen);
        this.playerFacing = Math.atan2(dy, dx);
      }
      this.playerMoving = true;
      return;
    }

    this.playerMoving = false;
  }

  private onArrive(): void {
    const reach = this.cacheInReach();
    if (reach && (!this.focusId || this.focusId === reach.id)) {
      this.beginMining(reach);
    }
  }

  private tryMove(dx: number, dy: number): void {
    const r = 0.3;
    const cx = Math.floor(this.player.x);
    const cy = Math.floor(this.player.y);
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;

    // Axis-separated collision keeps the prospector sliding along cliff edges
    // instead of sticking to them. Cliffs taller than MAX_CLIMB are walls.
    const tx = Math.floor(nx + Math.sign(dx) * r);
    if (tx === cx || canStep(cx, cy, tx, cy, this.seed)) {
      this.player.x = nx;
      this.distanceWalked += Math.abs(dx);
    }
    const ty = Math.floor(ny + Math.sign(dy) * r);
    const ax = Math.floor(this.player.x);
    if (ty === cy || canStep(ax, cy, ax, ty, this.seed)) {
      this.player.y = ny;
      this.distanceWalked += Math.abs(dy);
    }
  }

  private stepAgent(dt: number): void {
    const cfg = this.agentConfig;
    const follow = { x: this.player.x - 1.2, y: this.player.y - 1.2 };

    if (cfg.autonomous) {
      if (!this.agentTarget || this.reached(this.agent, this.agentTarget, 0.6)) {
        this.agentTarget = this.pickAgentTarget();
      }
    } else {
      this.agentTarget = follow;
    }

    const target = this.agentTarget ?? follow;
    const dx = target.x - this.agent.x;
    const dy = target.y - this.agent.y;
    const dist = Math.hypot(dx, dy);
    const speed = AGENT_SPEED * (cfg.archetype === 'scout' ? 1.25 : 1);
    if (dist > 0.05) {
      const stepLen = Math.min(dist, speed * dt);
      this.agent.x += (dx / dist) * stepLen;
      this.agent.y += (dy / dist) * stepLen;
    }

    // Drift back if the agent strays past its leash.
    const leash = 6 + cfg.range * 26;
    const fromPlayer = Math.hypot(this.agent.x - this.player.x, this.agent.y - this.player.y);
    if (fromPlayer > leash) {
      this.agentTarget = follow;
    }
  }

  private reached(a: Vec2, b: Vec2, eps: number): boolean {
    return Math.hypot(a.x - b.x, a.y - b.y) < eps;
  }

  /**
   * Agent target selection. `greed` trades distance against rarity, which is
   * what makes two differently-tuned agents feel genuinely different to play.
   */
  private pickAgentTarget(): Vec2 {
    const cfg = this.agentConfig;
    const open = this.signals.filter((s) => !s.claimed);
    if (open.length > 0) {
      let best: CacheSignal | null = null;
      let bestScore = -Infinity;
      for (const s of open) {
        const dist = Math.hypot(s.x - this.player.x, s.y - this.player.y);
        const rarityScore = RARITIES[s.rarity].difficulty / 5;
        const score = rarityScore * cfg.greed * 3 - (dist / 40) * (1 - cfg.greed * 0.6);
        if (score > bestScore) {
          bestScore = score;
          best = s;
        }
      }
      if (best) {
        // Only narrate when the agent actually changes its mind, and never
        // more than once every 12 seconds.
        if (best.id !== this.lastAgentTargetId && this.time - this.agentChatterAt > 12) {
          this.lastAgentTargetId = best.id;
          this.agentChatterAt = this.time;
          const label = RARITIES[best.rarity].label;
          const article = /^[AEIOU]/i.test(label) ? 'an' : 'a';
          this.cb.onLog(`${cfg.name} is circling ${article} ${label} signal.`, 'info');
        }
        this.lastAgentTargetId = best.id;
        return { x: best.x + 0.5, y: best.y + 0.5 };
      }
    }

    // Nothing on the board: wander the richest ground within the leash.
    const radius = 5 + cfg.range * 20;
    let best = { x: this.player.x, y: this.player.y };
    let bestRichness = -1;
    for (let i = 0; i < 24; i++) {
      const ang = this.rng() * Math.PI * 2;
      const r = radius * (0.35 + this.rng() * 0.65);
      const px = Math.round(this.player.x + Math.cos(ang) * r);
      const py = Math.round(this.player.y + Math.sin(ang) * r);
      const tile = sampleTile(px, py, this.seed);
      const score = tile.richness * BIOMES[tile.biome].yieldBias - (tile.water > 0 ? 0.4 : 0);
      if (score > bestRichness) {
        bestRichness = score;
        best = { x: px + 0.5, y: py + 0.5 };
      }
    }
    return best;
  }

  private stepMining(dt: number): void {
    if (!this.mining) return;
    const s = this.mining.signal;
    const px = Math.floor(this.player.x);
    const py = Math.floor(this.player.y);
    if (Math.max(Math.abs(s.x - px), Math.abs(s.y - py)) > 1.5) {
      this.cancelMining();
      return;
    }
    // Passive drill progress; striking accelerates it.
    const diff = RARITIES[s.rarity].difficulty;
    const assist = this.agentConfig.archetype === 'digger' ? 1.45 : 1;
    this.mining.progress += (dt / (2.2 + diff * 1.5)) * assist;
    if (this.rng() < dt * 22) this.spawnChips(s, 1);
    if (this.mining.progress >= 1) {
      const done = s;
      this.mining = null;
      this.spawnBurst(done);
      this.cb.onMineComplete(done);
    }
  }

  private stepParticles(dt: number): void {
    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz -= 62 * dt;
      if (p.z < 0) {
        p.z = 0;
        p.vz *= -0.32;
        p.vx *= 0.6;
        p.vy *= 0.6;
      }
      alive.push(p);
    }
    this.particles = alive;

    // Ambient motes tied to the biome underfoot.
    const tile = sampleTile(Math.floor(this.player.x), Math.floor(this.player.y), this.seed);
    if (this.rng() < dt * 9) {
      const accent = BIOMES[tile.biome].accent;
      const ang = this.rng() * Math.PI * 2;
      const r = 4 + this.rng() * 16;
      this.particles.push({
        x: this.player.x + Math.cos(ang) * r,
        y: this.player.y + Math.sin(ang) * r,
        z: 6 + this.rng() * 40,
        vx: (this.rng() - 0.5) * 0.25,
        vy: (this.rng() - 0.5) * 0.25,
        vz: 4 + this.rng() * 8,
        life: 2.4 + this.rng() * 2,
        maxLife: 4.4,
        color: accent,
        size: 1 + this.rng() * 1.6,
        kind: 'spark',
      });
    }
  }

  private spawnChips(s: CacheSignal, n: number): void {
    const color = RARITIES[s.rarity].color;
    for (let i = 0; i < n; i++) {
      const ang = this.rng() * Math.PI * 2;
      this.particles.push({
        x: s.x + 0.5,
        y: s.y + 0.5,
        z: 12 + this.rng() * 10,
        vx: Math.cos(ang) * (0.6 + this.rng()),
        vy: Math.sin(ang) * (0.6 + this.rng()),
        vz: 40 + this.rng() * 70,
        life: 0.5 + this.rng() * 0.5,
        maxLife: 1,
        color,
        size: 1.4 + this.rng() * 1.6,
        kind: 'chip',
      });
    }
  }

  private spawnBurst(s: CacheSignal): void {
    const color = RARITIES[s.rarity].color;
    const n = 26 + RARITIES[s.rarity].difficulty * 16;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + this.rng() * 0.3;
      const sp = 1.2 + this.rng() * 2.4;
      this.particles.push({
        x: s.x + 0.5,
        y: s.y + 0.5,
        z: 14,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        vz: 90 + this.rng() * 130,
        life: 1.1 + this.rng() * 0.9,
        maxLife: 2,
        color,
        size: 1.6 + this.rng() * 2.4,
        kind: 'coin',
      });
    }
    this.particles.push({
      x: s.x + 0.5,
      y: s.y + 0.5,
      z: 4,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0.85,
      maxLife: 0.85,
      color,
      size: 0,
      kind: 'ring',
    });
  }

  private stepCamera(dt: number): void {
    const k = 1 - Math.pow(0.0012, dt);
    this.camera.x += (this.player.x - this.camera.x) * k;
    this.camera.y += (this.player.y - this.camera.y) * k;
    this.camera.zoom += (this.targetZoom - this.camera.zoom) * (1 - Math.pow(0.02, dt));
  }

  private revealAround(force: boolean): void {
    const cx = Math.floor(this.player.x / CHUNK);
    const cy = Math.floor(this.player.y / CHUNK);
    const key = cx * 100003 + cy;
    if (!force && key === this.lastDiscoverCheck) return;
    this.lastDiscoverCheck = key;

    const r = Math.ceil(DISCOVER_RADIUS);
    const fresh: string[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.hypot(dx, dy) > DISCOVER_RADIUS + 0.35) continue;
        const k = `${cx + dx},${cy + dy}`;
        if (!this.discovered.has(k)) {
          this.discovered.set(k, this.time);
          fresh.push(k);
        }
      }
    }
    if (fresh.length) this.cb.onDiscover(fresh);
  }

  /* ------------------------------ views ------------------------------ */

  get biome() {
    return BIOMES[sampleTile(Math.floor(this.player.x), Math.floor(this.player.y), this.seed).biome];
  }

  get altitude(): number {
    return surfaceHeight(Math.floor(this.player.x), Math.floor(this.player.y), this.seed);
  }

  get richness(): number {
    return sampleTile(Math.floor(this.player.x), Math.floor(this.player.y), this.seed).richness;
  }

  toRenderState(): RenderState {
    const hue = this.agentConfig.hue;
    return {
      camera: this.camera,
      player: {
        x: this.player.x,
        y: this.player.y,
        h: this.altitude,
        hue: 196,
        label: this.handle,
        sublabel: `LVL ${this.level}`,
        facing: this.playerFacing,
        moving: this.playerMoving,
      },
      agent: {
        x: this.agent.x,
        y: this.agent.y,
        h: this.altitude,
        hue,
        label: this.agentConfig.name,
        sublabel: this.agentConfig.autonomous ? 'AUTONOMOUS' : 'ESCORT',
        facing: 0,
        moving: true,
      },
      agentActive: this.agentConfig.autonomous,
      signals: this.signals,
      focusId: this.focusId,
      discovered: this.discovered,
      hover: this.hover,
      path: this.path,
      scanT: this.scanT,
      scanRadius: SCAN_RADIUS,
      mining: this.mining
        ? {
            x: this.mining.signal.x,
            y: this.mining.signal.y,
            progress: clamp01(this.mining.progress),
            rarity: this.mining.signal.rarity,
          }
        : null,
      particles: this.particles,
      dayT: this.dayT,
      time: this.time,
      weather: weatherFor(this.biome.id),
    };
  }
}

/* ------------------------------ pathfinding ------------------------------ */

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
  parent: Node | null;
}

/** A* over the deterministic walkable grid, with a hard node budget. */
export function findPath(
  start: Vec2,
  goal: Vec2,
  seed: number,
  maxNodes = 3000,
): Vec2[] | null {
  if (start.x === goal.x && start.y === goal.y) return [];
  const open: Node[] = [];
  const seen = new Map<string, number>();
  const h = (x: number, y: number) => Math.hypot(x - goal.x, y - goal.y);

  const startNode: Node = { x: start.x, y: start.y, g: 0, f: h(start.x, start.y), parent: null };
  open.push(startNode);
  seen.set(`${start.x},${start.y}`, 0);

  let expanded = 0;
  while (open.length > 0 && expanded < maxNodes) {
    // Small maps; a linear scan beats the constant factor of a heap here.
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bestIdx].f) bestIdx = i;
    const current = open.splice(bestIdx, 1)[0];
    expanded++;

    if (current.x === goal.x && current.y === goal.y) {
      const path: Vec2[] = [];
      let n: Node | null = current;
      while (n && n.parent) {
        path.push({ x: n.x, y: n.y });
        n = n.parent;
      }
      return path.reverse();
    }

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = current.x + dx;
        const ny = current.y + dy;
        if (!isWalkable(nx, ny, seed)) continue;
        // No corner-cutting through diagonal gaps.
        if (dx !== 0 && dy !== 0) {
          if (!isWalkable(current.x + dx, current.y, seed)) continue;
          if (!isWalkable(current.x, current.y + dy, seed)) continue;
        }
        const climb = Math.abs(
          surfaceHeight(nx, ny, seed) - surfaceHeight(current.x, current.y, seed),
        );
        if (climb > MAX_CLIMB) continue; // cliffs are walls
        const step = (dx !== 0 && dy !== 0 ? 1.414 : 1) + climb * 0.55;
        const g = current.g + step;
        const key = `${nx},${ny}`;
        const prev = seen.get(key);
        if (prev !== undefined && prev <= g) continue;
        seen.set(key, g);
        open.push({ x: nx, y: ny, g, f: g + h(nx, ny) * 1.05, parent: current });
      }
    }
  }
  return null;
}

export { SCAN_RADIUS, SCAN_COOLDOWN };
