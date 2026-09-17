/**
 * THE LODE — isometric voxel renderer (Canvas 2D, zero dependencies).
 *
 * Strategy: terrain is expensive and static, everything else is cheap and
 * animated. So each 16x16 chunk is baked once into an offscreen canvas
 * (columns, cliff faces, ambient occlusion, props, contour lines) and then
 * blitted per frame. Water shimmer, emissive lights, beacons, weather, the
 * prospector and the agent are drawn live on top.
 *
 * Time of day is a single screen-space grade pass rather than a re-bake, which
 * is why dawn-to-midnight costs nothing.
 */

import { clamp, clamp01, fbm2, lerp, rand3 } from './noise';
import { BIOMES, sampleTile, WORLD } from './world';
import { RARITIES } from './drops';
import type { BiomeId, CacheSignal, PropId, Rgb, Tile, Vec2 } from './types';

/* ------------------------------------------------------------------ *
 * Projection
 * ------------------------------------------------------------------ */

export const TILE_W = 48;
export const TILE_H = 24;
export const LEVEL_H = 11;
export const CHUNK = 16;

const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

/** Tile space -> world-screen space (before camera). */
export function isoX(x: number, y: number): number {
  return (x - y) * HALF_W;
}

export function isoY(x: number, y: number, h = 0): number {
  return (x + y) * HALF_H - h * LEVEL_H;
}

/** Inverse projection onto the ground plane at a given height. */
export function screenToTile(sx: number, sy: number, h = 0): Vec2 {
  const y0 = sy + h * LEVEL_H;
  const a = sx / HALF_W;
  const b = y0 / HALF_H;
  return { x: (b + a) / 2, y: (b - a) / 2 };
}

/* ------------------------------------------------------------------ *
 * Colour helpers
 * ------------------------------------------------------------------ */

function shade(c: Rgb, k: number, tint: Rgb | null = null, tintAmt = 0): string {
  let r = c.r * k;
  let g = c.g * k;
  let b = c.b * k;
  if (tint && tintAmt > 0) {
    r = lerp(r, tint.r, tintAmt);
    g = lerp(g, tint.g, tintAmt);
    b = lerp(b, tint.b, tintAmt);
  }
  return `rgb(${Math.round(clamp(r, 0, 255))},${Math.round(clamp(g, 0, 255))},${Math.round(
    clamp(b, 0, 255),
  )})`;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}

/* ------------------------------------------------------------------ *
 * Time of day
 * ------------------------------------------------------------------ */

export interface DayGrade {
  /** 0..1 through the 24h cycle. */
  t: number;
  label: string;
  /** Multiply layer (darkening + colour cast). */
  multiply: string;
  /** Screen/overlay layer (warm or cold bloom). */
  bloom: string;
  bloomAlpha: number;
  /** How strongly emissive props glow. */
  emissive: number;
  /** Sky gradient stops for the backdrop. */
  sky: [string, string, string];
  starAlpha: number;
}

const PHASES: Array<Omit<DayGrade, 't'>> = [
  {
    label: 'Deep Night',
    multiply: 'rgb(58,74,128)',
    bloom: 'rgba(40,70,170,0.30)',
    bloomAlpha: 0.3,
    emissive: 1,
    sky: ['#05060f', '#0a1030', '#121a45'],
    starAlpha: 1,
  },
  {
    label: 'First Light',
    multiply: 'rgb(150,140,168)',
    bloom: 'rgba(255,150,120,0.22)',
    bloomAlpha: 0.22,
    emissive: 0.6,
    sky: ['#161436', '#4a2f5e', '#d1727a'],
    starAlpha: 0.35,
  },
  {
    label: 'Golden Hour',
    multiply: 'rgb(255,226,190)',
    bloom: 'rgba(255,186,96,0.20)',
    bloomAlpha: 0.2,
    emissive: 0.25,
    sky: ['#3a2a63', '#b7628a', '#ffbe6e'],
    starAlpha: 0,
  },
  {
    label: 'High Sun',
    multiply: 'rgb(255,252,246)',
    bloom: 'rgba(180,225,255,0.10)',
    bloomAlpha: 0.1,
    emissive: 0.05,
    sky: ['#2a6cc9', '#67b2ee', '#bfe6ff'],
    starAlpha: 0,
  },
  {
    label: 'Long Shadows',
    multiply: 'rgb(250,225,205)',
    bloom: 'rgba(255,170,110,0.18)',
    bloomAlpha: 0.18,
    emissive: 0.2,
    sky: ['#2c4f9e', '#8f7fc4', '#ffb27a'],
    starAlpha: 0,
  },
  {
    label: 'Dusk Fall',
    multiply: 'rgb(140,140,196)',
    bloom: 'rgba(160,110,255,0.26)',
    bloomAlpha: 0.26,
    emissive: 0.75,
    sky: ['#0d0f2c', '#3a2470', '#a34f86'],
    starAlpha: 0.6,
  },
];

function lerpColorStr(a: string, b: string, t: number): string {
  const pa = a.match(/[\d.]+/g)!.map(Number);
  const pb = b.match(/[\d.]+/g)!.map(Number);
  const out = pa.map((v, i) => lerp(v, pb[i] ?? v, t));
  return pa.length > 3
    ? `rgba(${out[0].toFixed(0)},${out[1].toFixed(0)},${out[2].toFixed(0)},${out[3].toFixed(3)})`
    : `rgb(${out[0].toFixed(0)},${out[1].toFixed(0)},${out[2].toFixed(0)})`;
}

function hexLerp(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const out = pa.map((v, i) => Math.round(lerp(v, pb[i], t)));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function dayGrade(t: number): DayGrade {
  const n = PHASES.length;
  const scaled = ((t % 1) + 1) % 1 * n;
  const i = Math.floor(scaled);
  const f = scaled - i;
  const a = PHASES[i % n];
  const b = PHASES[(i + 1) % n];
  return {
    t,
    label: f < 0.5 ? a.label : b.label,
    multiply: lerpColorStr(a.multiply, b.multiply, f),
    bloom: lerpColorStr(a.bloom, b.bloom, f),
    bloomAlpha: lerp(a.bloomAlpha, b.bloomAlpha, f),
    emissive: lerp(a.emissive, b.emissive, f),
    sky: [
      hexLerp(a.sky[0], b.sky[0], f),
      hexLerp(a.sky[1], b.sky[1], f),
      hexLerp(a.sky[2], b.sky[2], f),
    ],
    starAlpha: lerp(a.starAlpha, b.starAlpha, f),
  };
}

/* ------------------------------------------------------------------ *
 * Chunk baking
 * ------------------------------------------------------------------ */

interface EmissiveLight {
  sx: number;
  sy: number;
  color: string;
  radius: number;
  strength: number;
  flicker: number;
}

interface WaterCell {
  sx: number;
  sy: number;
  depth: number;
  shoreline: boolean;
}

interface BakedChunk {
  canvas: HTMLCanvasElement;
  /** World-screen coordinate of the canvas top-left. */
  ox: number;
  oy: number;
  w: number;
  h: number;
  lights: EmissiveLight[];
  water: WaterCell[];
  lastUsed: number;
}

/** Sun comes from the north-west; these are the face multipliers. */
const K_TOP = 1.0;
const K_LEFT = 0.60;
const K_RIGHT = 0.35;

const FOG: Rgb = { r: 168, g: 184, b: 214 };

function propHeight(prop: PropId): number {
  switch (prop) {
    case 'tower':
      return 9;
    case 'pine':
      return 4;
    case 'broadleaf':
    case 'blossom':
      return 3.4;
    case 'crystal':
    case 'monolith':
      return 3.2;
    case 'cactus':
      return 2.4;
    case 'shroom':
      return 2;
    case 'lamp':
      return 2.6;
    default:
      return 1;
  }
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy);
  ctx.lineTo(cx, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy);
  ctx.closePath();
}

/* ------------------------------------------------------------------ *
 * Props — drawn procedurally so the world ships with zero art assets
 * ------------------------------------------------------------------ */

function drawProp(
  ctx: CanvasRenderingContext2D,
  prop: PropId,
  sx: number,
  sy: number,
  tile: Tile,
  biome: BiomeId,
  seed: number,
  wx: number,
  wy: number,
  lights: EmissiveLight[],
): void {
  const v = rand3(wx, wy, 11, seed);
  const v2 = rand3(wx, wy, 23, seed);
  const style = BIOMES[biome];

  switch (prop) {
    case 'pine': {
      const hgt = 26 + v * 16;
      const trunk = shade({ r: 74, g: 52, b: 38 }, 1);
      ctx.fillStyle = trunk;
      ctx.fillRect(sx - 2, sy - hgt * 0.32, 4, hgt * 0.34);
      const dark = biome === 'tundra' ? { r: 46, g: 84, b: 78 } : { r: 32, g: 84, b: 52 };
      const lightC = biome === 'tundra' ? { r: 92, g: 148, b: 142 } : { r: 74, g: 148, b: 84 };
      for (let i = 0; i < 3; i++) {
        const t = i / 2;
        const w = (30 - i * 8) * (0.85 + v2 * 0.3);
        const cy = sy - hgt * (0.28 + t * 0.42);
        ctx.fillStyle = shade(mix(dark, lightC, t * 0.7 + 0.15), 1);
        ctx.beginPath();
        ctx.moveTo(sx, cy - 14);
        ctx.lineTo(sx + w / 2, cy + 4);
        ctx.lineTo(sx, cy + 9);
        ctx.lineTo(sx - w / 2, cy + 4);
        ctx.closePath();
        ctx.fill();
      }
      if (biome === 'tundra') {
        ctx.fillStyle = 'rgba(240,248,255,0.7)';
        ctx.beginPath();
        ctx.moveTo(sx, sy - hgt - 6);
        ctx.lineTo(sx + 6, sy - hgt + 4);
        ctx.lineTo(sx - 6, sy - hgt + 4);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'broadleaf':
    case 'blossom': {
      const hgt = 20 + v * 12;
      ctx.fillStyle = 'rgb(76,54,40)';
      ctx.fillRect(sx - 2, sy - hgt * 0.4, 4, hgt * 0.42);
      const canopy =
        prop === 'blossom'
          ? mix({ r: 238, g: 140, b: 200 }, { r: 255, g: 210, b: 236 }, v2)
          : mix({ r: 58, g: 128, b: 66 }, { r: 106, g: 178, b: 92 }, v2);
      for (let i = 0; i < 3; i++) {
        const r = (16 - i * 3) * (0.9 + v * 0.35);
        const ox = (rand3(wx, wy, 40 + i, seed) - 0.5) * 12;
        const oy = -hgt * 0.5 - i * 5;
        ctx.fillStyle = shade(canopy, 1 - i * 0.12);
        ctx.beginPath();
        ctx.ellipse(sx + ox, sy + oy, r, r * 0.74, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'cactus': {
      const hgt = 16 + v * 12;
      ctx.fillStyle = 'rgb(66,132,80)';
      ctx.fillRect(sx - 3, sy - hgt, 6, hgt);
      ctx.fillStyle = 'rgb(84,158,96)';
      ctx.fillRect(sx - 3, sy - hgt, 2, hgt);
      if (v2 > 0.45) {
        ctx.fillStyle = 'rgb(66,132,80)';
        ctx.fillRect(sx + 3, sy - hgt * 0.75, 6, 4);
        ctx.fillRect(sx + 7, sy - hgt * 0.95, 4, hgt * 0.24);
      }
      break;
    }
    case 'shroom': {
      const hgt = 10 + v * 12;
      ctx.fillStyle = 'rgb(206,198,220)';
      ctx.fillRect(sx - 2, sy - hgt, 4, hgt);
      const cap = mix({ r: 150, g: 90, b: 220 }, { r: 90, g: 220, b: 210 }, v2);
      ctx.fillStyle = shade(cap, 1);
      ctx.beginPath();
      ctx.ellipse(sx, sy - hgt, 10 + v * 5, 6 + v * 3, 0, Math.PI, 0);
      ctx.fill();
      lights.push({
        sx,
        sy: sy - hgt - 2,
        color: style.accent,
        radius: 34,
        strength: 0.5,
        flicker: 0.35,
      });
      break;
    }
    case 'crystal': {
      const hgt = 18 + v * 18;
      const col = biome === 'tundra' ? '#9fe8ff' : '#dce8ff';
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(sx, sy - hgt);
      ctx.lineTo(sx + 7, sy - hgt * 0.35);
      ctx.lineTo(sx + 3, sy);
      ctx.lineTo(sx - 4, sy);
      ctx.lineTo(sx - 7, sy - hgt * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.moveTo(sx, sy - hgt);
      ctx.lineTo(sx + 7, sy - hgt * 0.35);
      ctx.lineTo(sx + 1, sy - hgt * 0.3);
      ctx.closePath();
      ctx.fill();
      lights.push({ sx, sy: sy - hgt * 0.6, color: col, radius: 46, strength: 0.7, flicker: 0.12 });
      break;
    }
    case 'monolith': {
      const hgt = 26 + v * 18;
      ctx.fillStyle = 'rgb(28,26,42)';
      ctx.fillRect(sx - 8, sy - hgt, 16, hgt);
      ctx.fillStyle = 'rgb(44,40,66)';
      ctx.fillRect(sx - 8, sy - hgt, 6, hgt);
      ctx.strokeStyle = style.accent;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy - hgt + 8);
      ctx.lineTo(sx, sy - 8);
      ctx.stroke();
      ctx.globalAlpha = 1;
      lights.push({
        sx,
        sy: sy - hgt * 0.5,
        color: style.accent,
        radius: 64,
        strength: 0.85,
        flicker: 0.25,
      });
      break;
    }
    case 'tower': {
      const floors = 3 + Math.floor(v * 9);
      const hgt = floors * 9;
      const w = 26;
      const top = mix({ r: 30, g: 32, b: 54 }, { r: 58, g: 60, b: 96 }, v2);
      // Body: left + right faces, then the roof diamond.
      ctx.fillStyle = shade(top, K_LEFT);
      ctx.beginPath();
      ctx.moveTo(sx - w / 2, sy - 6);
      ctx.lineTo(sx, sy + 6);
      ctx.lineTo(sx, sy + 6 - hgt);
      ctx.lineTo(sx - w / 2, sy - 6 - hgt);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(top, K_RIGHT);
      ctx.beginPath();
      ctx.moveTo(sx + w / 2, sy - 6);
      ctx.lineTo(sx, sy + 6);
      ctx.lineTo(sx, sy + 6 - hgt);
      ctx.lineTo(sx + w / 2, sy - 6 - hgt);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(top, K_TOP);
      drawDiamond(ctx, sx, sy - 6 - hgt + 6, w, 12);
      ctx.fill();
      // Window grid — the thing that sells a city at night.
      for (let f = 0; f < floors; f++) {
        for (let c = 0; c < 2; c++) {
          if (rand3(wx * 7 + c, wy * 13 + f, 5, seed) < 0.42) continue;
          const lit = rand3(wx + c, wy + f, 9, seed) > 0.45;
          ctx.fillStyle = lit ? 'rgba(255,214,140,0.92)' : 'rgba(120,150,200,0.22)';
          const bx = sx - w / 2 + 5 + c * 8;
          const by = sy - 12 - f * 9;
          ctx.fillRect(bx, by, 4, 4);
        }
      }
      lights.push({
        sx,
        sy: sy - hgt * 0.55,
        color: '#41f5ff',
        radius: 44,
        strength: 0.26,
        flicker: 0.08,
      });
      // Aircraft warning beacon.
      ctx.fillStyle = '#ff4d6a';
      ctx.fillRect(sx - 1.5, sy - 8 - hgt, 3, 3);
      break;
    }
    case 'lamp': {
      ctx.fillStyle = 'rgb(38,42,60)';
      ctx.fillRect(sx - 1.5, sy - 22, 3, 22);
      ctx.fillStyle = '#ffd98a';
      ctx.beginPath();
      ctx.arc(sx, sy - 24, 3.5, 0, Math.PI * 2);
      ctx.fill();
      lights.push({
        sx,
        sy: sy - 24,
        color: '#ffc46a',
        radius: 58,
        strength: 0.9,
        flicker: 0.06,
      });
      break;
    }
    case 'vent': {
      ctx.fillStyle = 'rgb(46,26,26)';
      drawDiamond(ctx, sx, sy - 2, 22, 11);
      ctx.fill();
      ctx.fillStyle = '#ff6a3d';
      drawDiamond(ctx, sx, sy - 3, 12, 6);
      ctx.fill();
      lights.push({
        sx,
        sy: sy - 6,
        color: '#ff5a2a',
        radius: 62,
        strength: 1,
        flicker: 0.55,
      });
      break;
    }
    case 'rock': {
      const r = 7 + v * 7;
      ctx.fillStyle = shade(BIOMES[biome].side, 1.25);
      ctx.beginPath();
      ctx.ellipse(sx, sy - r * 0.35, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(BIOMES[biome].side, 1.7);
      ctx.beginPath();
      ctx.ellipse(sx - r * 0.25, sy - r * 0.55, r * 0.5, r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'reed': {
      ctx.strokeStyle = 'rgba(120,180,140,0.8)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const ox = (rand3(wx, wy, 60 + i, seed) - 0.5) * 14;
        ctx.beginPath();
        ctx.moveTo(sx + ox, sy);
        ctx.quadraticCurveTo(sx + ox + 2, sy - 8, sx + ox + 5, sy - 13);
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
}

/* ------------------------------------------------------------------ *
 * Chunk bake
 * ------------------------------------------------------------------ */

const PAD = 80;

const chunkPeak = new Map<string, number>();

/** Tallest column in a chunk — lets the bake canvas shrink to fit. */
function peakHeight(cx: number, cy: number, seed: number): number {
  const key = `${cx},${cy},${seed}`;
  const hit = chunkPeak.get(key);
  if (hit !== undefined) return hit;
  let peak = 0;
  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;
  for (let y = y0; y < y0 + CHUNK; y++) {
    for (let x = x0; x < x0 + CHUNK; x++) {
      const h = sampleTile(x, y, seed).h;
      if (h > peak) peak = h;
    }
  }
  if (chunkPeak.size > 4000) chunkPeak.clear();
  chunkPeak.set(key, peak);
  return peak;
}

function chunkBounds(cx: number, cy: number, seed: number = WORLD.seed) {
  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;
  const x1 = x0 + CHUNK - 1;
  const y1 = y0 + CHUNK - 1;
  // Iso extremes of the chunk's tile square.
  const minSx = isoX(x0, y1) - HALF_W;
  const maxSx = isoX(x1, y0) + HALF_W;
  const minSy = isoY(x0, y0, peakHeight(cx, cy, seed)) - PAD;
  const maxSy = isoY(x1, y1, 0) + TILE_H;
  return { x0, y0, x1, y1, minSx, maxSx, minSy, maxSy };
}

function bakeChunk(cx: number, cy: number, seed: number, dpr: number): BakedChunk {
  const b = chunkBounds(cx, cy, seed);
  const w = Math.ceil(b.maxSx - b.minSx);
  const h = Math.ceil(b.maxSy - b.minSy);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * dpr));
  canvas.height = Math.max(1, Math.ceil(h * dpr));
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.translate(-b.minSx, -b.minSy);

  const lights: EmissiveLight[] = [];
  const water: WaterCell[] = [];

  // Painter's algorithm: back to front along the iso depth axis.
  for (let d = 0; d <= (CHUNK - 1) * 2; d++) {
    for (let ox = 0; ox < CHUNK; ox++) {
      const oy = d - ox;
      if (oy < 0 || oy >= CHUNK) continue;
      const wx = b.x0 + ox;
      const wy = b.y0 + oy;
      const tile = sampleTile(wx, wy, seed);
      const style = BIOMES[tile.biome];

      const groundH = tile.water > 0 ? tile.h : tile.h;
      const sx = isoX(wx, wy);
      const sy = isoY(wx, wy, groundH);

      // --- cliff faces -------------------------------------------------
      const south = sampleTile(wx, wy + 1, seed);
      const east = sampleTile(wx + 1, wy, seed);
      const dropL = Math.max(0, groundH - south.h);
      const dropR = Math.max(0, groundH - east.h);
      const faceDepth = Math.max(dropL, dropR, tile.water > 0 ? 0 : 0);

      if (dropL > 0) {
        const hgt = dropL * LEVEL_H;
        ctx.fillStyle = shade(style.side, K_LEFT + tile.jitter * 0.05);
        ctx.beginPath();
        ctx.moveTo(sx - HALF_W, sy);
        ctx.lineTo(sx, sy + HALF_H);
        ctx.lineTo(sx, sy + HALF_H + hgt);
        ctx.lineTo(sx - HALF_W, sy + hgt);
        ctx.closePath();
        ctx.fill();
        // Strata banding gives cliffs readable scale.
        ctx.strokeStyle = 'rgba(0,0,0,0.14)';
        ctx.lineWidth = 1;
        for (let i = 1; i < dropL; i++) {
          const yy = sy + i * LEVEL_H;
          ctx.beginPath();
          ctx.moveTo(sx - HALF_W, yy);
          ctx.lineTo(sx, yy + HALF_H);
          ctx.stroke();
        }
      }

      if (dropR > 0) {
        const hgt = dropR * LEVEL_H;
        ctx.fillStyle = shade(style.side, K_RIGHT + tile.jitter * 0.04);
        ctx.beginPath();
        ctx.moveTo(sx + HALF_W, sy);
        ctx.lineTo(sx, sy + HALF_H);
        ctx.lineTo(sx, sy + HALF_H + hgt);
        ctx.lineTo(sx + HALF_W, sy + hgt);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1;
        for (let i = 1; i < dropR; i++) {
          const yy = sy + i * LEVEL_H;
          ctx.beginPath();
          ctx.moveTo(sx + HALF_W, yy);
          ctx.lineTo(sx, yy + HALF_H);
          ctx.stroke();
        }
      }

      // --- top face ----------------------------------------------------
      const north = sampleTile(wx, wy - 1, seed);
      const west = sampleTile(wx - 1, wy, seed);
      // Cheap ambient occlusion from taller neighbours behind the tile.
      const ao = clamp01(
        (Math.max(0, north.h - groundH) + Math.max(0, west.h - groundH)) * 0.14,
      );
      const topCol = mix(style.top, style.topAlt, tile.jitter);
      // Higher ground catches more sun; low ground sinks into shadow.
      const heightLift = 0.92 + (groundH - WORLD.seaLevel) * 0.028;
      ctx.fillStyle = shade(topCol, K_TOP * heightLift * (1 - ao * 0.75));
      drawDiamond(ctx, sx, sy, TILE_W, TILE_H);
      ctx.fill();

      // Crisp north-west rim: what makes voxels read as voxels.
      ctx.strokeStyle = `rgba(255,255,255,${0.05 + tile.jitter * 0.05})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx - HALF_W, sy);
      ctx.lineTo(sx, sy - HALF_H);
      ctx.lineTo(sx + HALF_W, sy);
      ctx.stroke();

      // Cartographer's contour lines every 3 levels — the treasure-map tell.
      if (tile.water === 0 && groundH % 3 === 0 && (south.h !== groundH || east.h !== groundH)) {
        ctx.strokeStyle = 'rgba(24,18,8,0.10)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx - HALF_W, sy);
        ctx.lineTo(sx, sy + HALF_H);
        ctx.lineTo(sx + HALF_W, sy);
        ctx.stroke();
      }

      // Mineral veins glint through the surface.
      if (tile.water === 0 && tile.richness > 0.74) {
        ctx.globalAlpha = (tile.richness - 0.74) * 1.6;
        ctx.fillStyle = style.accent;
        drawDiamond(ctx, sx, sy, TILE_W * 0.34, TILE_H * 0.34);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // --- water -------------------------------------------------------
      if (tile.water > 0) {
        const wsy = isoY(wx, wy, WORLD.seaLevel);
        const depth = clamp01(tile.water / 6);
        const deep = { r: 10, g: 26, b: 68 };
        const shallowC = { r: 46, g: 150, b: 190 };
        ctx.globalAlpha = 0.82;
        ctx.fillStyle = shade(mix(shallowC, deep, depth), 1);
        drawDiamond(ctx, sx, wsy, TILE_W, TILE_H);
        ctx.fill();
        ctx.globalAlpha = 1;

        const shoreline = south.water === 0 || east.water === 0 || north.water === 0 || west.water === 0;
        if (shoreline) {
          ctx.strokeStyle = 'rgba(210,244,255,0.55)';
          ctx.lineWidth = 1.5;
          drawDiamond(ctx, sx, wsy, TILE_W * 0.92, TILE_H * 0.92);
          ctx.stroke();
        }
        water.push({ sx, sy: wsy, depth, shoreline });
      }

      // --- props -------------------------------------------------------
      if (tile.prop !== 'none') {
        drawProp(ctx, tile.prop, sx, sy - 1, tile, tile.biome, seed, wx, wy, lights);
      }

      void faceDepth;
    }
  }

  return { canvas, ox: b.minSx, oy: b.minSy, w, h, lights, water, lastUsed: performance.now() };
}

/* ------------------------------------------------------------------ *
 * Render state
 * ------------------------------------------------------------------ */

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface EntityView {
  x: number;
  y: number;
  h: number;
  hue: number;
  label?: string;
  sublabel?: string;
  facing: number;
  moving: boolean;
}

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  kind: 'spark' | 'chip' | 'ring' | 'coin';
}

export interface RenderState {
  camera: Camera;
  player: EntityView;
  agent: EntityView | null;
  agentActive: boolean;
  signals: CacheSignal[];
  focusId: string | null;
  discovered: Map<string, number>;
  hover: Vec2 | null;
  path: Vec2[];
  scanT: number;
  scanRadius: number;
  mining: { x: number; y: number; progress: number; rarity: string } | null;
  particles: Particle[];
  dayT: number;
  time: number;
  weather: 'clear' | 'rain' | 'snow' | 'ash' | 'spores';
}

export function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

/* ------------------------------------------------------------------ *
 * Renderer
 * ------------------------------------------------------------------ */

export class LodeRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private chunks = new Map<string, BakedChunk>();
  private dpr = 1;
  private seed: number;
  private vw = 0;
  private vh = 0;
  private bakeBudget = 3;
  private starField: Array<{ x: number; y: number; r: number; tw: number }> = [];

  constructor(canvas: HTMLCanvasElement, seed: number = WORLD.seed) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.seed = seed;
    this.resize();
    for (let i = 0; i < 220; i++) {
      this.starField.push({
        x: Math.random(),
        y: Math.random() * 0.55,
        r: Math.random() * 1.3 + 0.3,
        tw: Math.random() * Math.PI * 2,
      });
    }
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.vw = Math.max(1, Math.floor(rect.width));
    this.vh = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.vw * this.dpr);
    this.canvas.height = Math.floor(this.vh * this.dpr);
  }

  dispose(): void {
    this.chunks.clear();
  }

  get viewport() {
    return { w: this.vw, h: this.vh };
  }

  /** Screen pixel -> tile coordinate, accounting for camera and zoom. */
  pickTile(px: number, py: number, cam: Camera): Vec2 {
    const cx = this.vw / 2;
    const cy = this.vh / 2;
    const camSx = isoX(cam.x, cam.y);
    const camSy = isoY(cam.x, cam.y, 0);
    const worldX = (px - cx) / cam.zoom + camSx;
    const worldY = (py - cy) / cam.zoom + camSy;
    const rough = screenToTile(worldX, worldY, 0);
    // Correct for column height so clicks land on the visible surface.
    const guess = sampleTile(Math.floor(rough.x), Math.floor(rough.y), this.seed);
    const corrected = screenToTile(worldX, worldY, guess.water > 0 ? WORLD.seaLevel : guess.h);
    return { x: Math.floor(corrected.x), y: Math.floor(corrected.y) };
  }

  private getChunk(cx: number, cy: number, budget: { left: number }): BakedChunk | null {
    const key = chunkKey(cx, cy);
    const hit = this.chunks.get(key);
    if (hit) {
      hit.lastUsed = performance.now();
      return hit;
    }
    if (budget.left <= 0) return null;
    budget.left -= 1;
    const baked = bakeChunk(cx, cy, this.seed, Math.min(this.dpr, 1.25));
    this.chunks.set(key, baked);
    if (this.chunks.size > 36) {
      let oldestKey: string | null = null;
      let oldest = Infinity;
      for (const [k, v] of this.chunks) {
        if (v.lastUsed < oldest) {
          oldest = v.lastUsed;
          oldestKey = k;
        }
      }
      if (oldestKey) this.chunks.delete(oldestKey);
    }
    return baked;
  }

  render(state: RenderState): void {
    try {
      this.renderFrame(state);
    } catch (err) {
      // A single bad draw must never kill the render loop; the next frame
      // re-runs from a clean transform.
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.globalAlpha = 1;
      this.ctx.globalCompositeOperation = 'source-over';
      if (!this.reportedError) {
        this.reportedError = true;
        console.error('[lode] render frame failed', err);
      }
    }
  }

  private reportedError = false;

  private renderFrame(state: RenderState): void {
    const { ctx } = this;
    const cam = state.camera;
    const grade = dayGrade(state.dayT);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Deep atmosphere backdrop — visible at the fringes and through haze.
    ctx.fillStyle = grade.sky[0];
    ctx.fillRect(0, 0, this.vw, this.vh);

    const camSx = isoX(cam.x, cam.y);
    const camSy = isoY(cam.x, cam.y, 0);
    const originX = this.vw / 2 - camSx * cam.zoom;
    const originY = this.vh / 2 - camSy * cam.zoom;

    ctx.save();
    ctx.translate(originX, originY);
    ctx.scale(cam.zoom, cam.zoom);

    this.drawChunks(state, cam);
    this.drawWaterShimmer(state, cam);
    ctx.restore();

    // ---- cloud shadows, then the day/night grade, over the terrain ----
    this.drawCloudShadows(state, cam, grade);

    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = grade.multiply;
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.globalCompositeOperation = 'source-over';

    // ---- emissive lights (additive, night only) ----
    if (grade.emissive > 0.04) {
      ctx.save();
      ctx.translate(originX, originY);
      ctx.scale(cam.zoom, cam.zoom);
      this.drawLights(state, cam, grade.emissive);
      ctx.restore();
    }

    this.drawHorizonHaze(grade, state);

    // ---- world-space gameplay layer (never dimmed, always readable) ----
    ctx.save();
    ctx.translate(originX, originY);
    ctx.scale(cam.zoom, cam.zoom);
    this.drawPath(state);
    this.drawHover(state);
    this.drawScanPulse(state);
    this.drawDepthSorted(state, grade);
    this.drawParticles(state);
    ctx.restore();

    this.drawWeather(state, cam);
    this.drawSunShafts(state, grade);
    this.drawBloom(grade);
    this.drawVignette();
  }

  /* ---------------- terrain ---------------- */

  private drawChunks(state: RenderState, cam: Camera): void {
    const { ctx } = this;
    const halfW = this.vw / (2 * cam.zoom);
    const halfH = this.vh / (2 * cam.zoom);
    const camSx = isoX(cam.x, cam.y);
    const camSy = isoY(cam.x, cam.y, 0);
    const viewMinX = camSx - halfW;
    const viewMaxX = camSx + halfW;
    const viewMinY = camSy - halfH;
    const viewMaxY = camSy + halfH;

    // Convert the screen rect into a tile-space AABB, then to chunk indices.
    const corners = [
      screenToTile(viewMinX, viewMinY),
      screenToTile(viewMaxX, viewMinY),
      screenToTile(viewMinX, viewMaxY),
      screenToTile(viewMaxX, viewMaxY),
    ];
    const pad = 3;
    const minTx = Math.min(...corners.map((c) => c.x)) - pad;
    const maxTx = Math.max(...corners.map((c) => c.x)) + pad;
    const minTy = Math.min(...corners.map((c) => c.y)) - pad;
    const maxTy = Math.max(...corners.map((c) => c.y)) + pad;

    const c0x = Math.floor(minTx / CHUNK);
    const c1x = Math.floor(maxTx / CHUNK);
    const c0y = Math.floor(minTy / CHUNK);
    const c1y = Math.floor(maxTy / CHUNK);

    const budget = { left: this.bakeBudget };
    const list: Array<{ cx: number; cy: number }> = [];
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) list.push({ cx, cy });
    }
    // Bake nearest-first so the ground under the player is never missing.
    const pcx = Math.floor(state.player.x / CHUNK);
    const pcy = Math.floor(state.player.y / CHUNK);
    list.sort(
      (a, b) =>
        Math.hypot(a.cx - pcx, a.cy - pcy) - Math.hypot(b.cx - pcx, b.cy - pcy),
    );
    // ...but paint back-to-front.
    const paintOrder = [...list].sort((a, b) => a.cx + a.cy - (b.cx + b.cy));

    const wanted = new Set<string>();
    for (const { cx, cy } of list) {
      const key = chunkKey(cx, cy);
      wanted.add(key);
      const discoveredAt = state.discovered.get(key);
      if (discoveredAt === undefined) continue;
      this.getChunk(cx, cy, budget);
    }

    for (const { cx, cy } of paintOrder) {
      const key = chunkKey(cx, cy);
      const discoveredAt = state.discovered.get(key);
      const b = chunkBounds(cx, cy, this.seed);

      if (discoveredAt === undefined) {
        this.drawUncharted(cx, cy, state);
        continue;
      }

      const baked = this.chunks.get(key);
      if (!baked) {
        this.drawUncharted(cx, cy, state, 0.6);
        continue;
      }
      baked.lastUsed = performance.now();

      // Chunks fade in as they are charted.
      const age = (state.time - discoveredAt) / 0.75;
      const alpha = clamp01(age);
      if (alpha < 1) {
        this.drawUncharted(cx, cy, state, 1 - alpha);
      }
      ctx.globalAlpha = alpha;
      ctx.drawImage(baked.canvas, b.minSx, b.minSy, baked.w, baked.h);
      ctx.globalAlpha = 1;
    }
  }

  /** Unexplored ground: a stylised survey grid, not blank space. */
  private drawUncharted(cx: number, cy: number, state: RenderState, alpha = 1): void {
    const { ctx } = this;
    const b = chunkBounds(cx, cy, this.seed);
    ctx.save();
    ctx.globalAlpha = alpha;
    // Trace the chunk's iso outline as a single quad.
    ctx.beginPath();
    const p0 = { x: isoX(b.x0, b.y0), y: isoY(b.x0, b.y0, 0) };
    const p1 = { x: isoX(b.x1 + 1, b.y0), y: isoY(b.x1 + 1, b.y0, 0) };
    const p2 = { x: isoX(b.x1 + 1, b.y1 + 1), y: isoY(b.x1 + 1, b.y1 + 1, 0) };
    const p3 = { x: isoX(b.x0, b.y1 + 1), y: isoY(b.x0, b.y1 + 1, 0) };
    ctx.moveTo(p0.x, p0.y - HALF_H);
    ctx.lineTo(p1.x, p1.y - HALF_H);
    ctx.lineTo(p2.x, p2.y - HALF_H);
    ctx.lineTo(p3.x, p3.y - HALF_H);
    ctx.closePath();

    const g = ctx.createLinearGradient(p0.x, p0.y, p2.x, p2.y);
    g.addColorStop(0, '#04060f');
    g.addColorStop(1, '#070a16');
    ctx.fillStyle = g;
    ctx.fill();

    ctx.clip();
    ctx.strokeStyle = 'rgba(96,140,220,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= CHUNK; i += 4) {
      ctx.beginPath();
      ctx.moveTo(isoX(b.x0 + i, b.y0), isoY(b.x0 + i, b.y0, 0) - HALF_H);
      ctx.lineTo(isoX(b.x0 + i, b.y1 + 1), isoY(b.x0 + i, b.y1 + 1, 0) - HALF_H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(isoX(b.x0, b.y0 + i), isoY(b.x0, b.y0 + i, 0) - HALF_H);
      ctx.lineTo(isoX(b.x1 + 1, b.y0 + i), isoY(b.x1 + 1, b.y0 + i, 0) - HALF_H);
      ctx.stroke();
    }

    // A slow scan sweep so unmapped ground still feels alive.
    const sweep = ((state.time * 0.22 + (cx * 7 + cy * 13) * 0.11) % 1) * (p2.y - p0.y) + p0.y;
    const sg = ctx.createLinearGradient(0, sweep - 70, 0, sweep + 70);
    sg.addColorStop(0, 'rgba(90,160,255,0)');
    sg.addColorStop(0.5, 'rgba(120,190,255,0.09)');
    sg.addColorStop(1, 'rgba(90,160,255,0)');
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.restore();
  }

  /* ---------------- water ---------------- */

  private drawWaterShimmer(state: RenderState, cam: Camera): void {
    const { ctx } = this;
    const t = state.time;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [key, baked] of this.chunks) {
      if (!state.discovered.has(key)) continue;
      if (baked.water.length === 0) continue;
      // Cull chunks outside the viewport cheaply via their screen AABB.
      if (!this.chunkVisible(baked, cam)) continue;
      for (let i = 0; i < baked.water.length; i += 1) {
        const w = baked.water[i];
        const phase = (w.sx * 0.021 + w.sy * 0.037) + t * 1.35;
        const a = (Math.sin(phase) * 0.5 + 0.5) ** 3;
        if (a < 0.06) continue;
        ctx.globalAlpha = a * (w.shoreline ? 0.32 : 0.16) * (1 - w.depth * 0.5);
        ctx.fillStyle = w.depth > 0.6 ? '#4a7dff' : '#8ff0ff';
        drawDiamond(ctx, w.sx, w.sy - Math.sin(phase * 0.8) * 1.2, TILE_W * 0.7, TILE_H * 0.7);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private chunkVisible(baked: BakedChunk, cam: Camera): boolean {
    const camSx = isoX(cam.x, cam.y);
    const camSy = isoY(cam.x, cam.y, 0);
    const halfW = this.vw / (2 * cam.zoom);
    const halfH = this.vh / (2 * cam.zoom);
    return !(
      baked.ox > camSx + halfW ||
      baked.ox + baked.w < camSx - halfW ||
      baked.oy > camSy + halfH ||
      baked.oy + baked.h < camSy - halfH
    );
  }

  /* ---------------- emissive ---------------- */

  private drawLights(state: RenderState, cam: Camera, emissive: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [key, baked] of this.chunks) {
      if (!state.discovered.has(key)) continue;
      if (!this.chunkVisible(baked, cam)) continue;
      for (const l of baked.lights) {
        const flick =
          1 - l.flicker * (Math.sin(state.time * 6.3 + l.sx * 0.13 + l.sy * 0.07) * 0.5 + 0.5);
        const r = l.radius * flick;
        const g = ctx.createRadialGradient(l.sx, l.sy, 0, l.sx, l.sy, r);
        g.addColorStop(0, l.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.34 * l.strength * emissive * flick;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(l.sx, l.sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ---------------- atmosphere ---------------- */

  private drawHorizonHaze(grade: DayGrade, state: RenderState): void {
    const { ctx } = this;
    const band = this.vh * 0.34;

    if (grade.starAlpha > 0.02) {
      ctx.save();
      for (const s of this.starField) {
        const tw = 0.55 + 0.45 * Math.sin(state.time * 1.7 + s.tw);
        ctx.globalAlpha = grade.starAlpha * tw * (1 - s.y / 0.55) * 0.9;
        ctx.fillStyle = '#e8f2ff';
        ctx.beginPath();
        ctx.arc(s.x * this.vw, s.y * band, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    const g = ctx.createLinearGradient(0, 0, 0, band);
    g.addColorStop(0, `${grade.sky[1]}b0`);
    g.addColorStop(0.35, `${grade.sky[2]}4d`);
    g.addColorStop(1, `${grade.sky[2]}00`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.vw, band);
  }

  /**
   * Drifting cloud shadows. A handful of soft multiply blobs does more for the
   * sense of open sky than any amount of terrain detail.
   */
  private drawCloudShadows(state: RenderState, cam: Camera, grade: DayGrade): void {
    const { ctx } = this;
    const strength = (1 - grade.emissive) * 0.5 + 0.08;
    if (strength < 0.06) return;
    const camSx = isoX(cam.x, cam.y) * 0.35;
    const camSy = isoY(cam.x, cam.y, 0) * 0.35;

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 9; i++) {
      const seedA = (i * 0.6180339887) % 1;
      const seedB = (i * 0.2794) % 1;
      const w = (340 + seedA * 620) * cam.zoom;
      const h = w * (0.34 + seedB * 0.16);
      const x =
        (((seedA * 2600 + state.time * (14 + seedB * 22) - camSx) % (this.vw + w * 2)) +
          this.vw +
          w * 2) %
          (this.vw + w * 2) -
        w;
      const y =
        (((seedB * 1500 + state.time * 5 - camSy) % (this.vh + h * 2)) + this.vh + h * 2) %
          (this.vh + h * 2) -
        h;
      const g = ctx.createRadialGradient(x, y, 0, x, y, w / 2);
      const a = (0.1 + seedB * 0.1) * strength;
      g.addColorStop(0, `rgba(58,74,120,${a})`);
      g.addColorStop(0.62, `rgba(96,112,160,${a * 0.45})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, h / w);
      ctx.translate(-x, -y);
      ctx.beginPath();
      ctx.arc(x, y, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /** Low-angle sun shafts. Dawn and dusk only — never after dark. */
  private drawSunShafts(state: RenderState, grade: DayGrade): void {
    const { ctx } = this;
    const warmth = grade.bloomAlpha;
    if (warmth < 0.14) return;
    // Fade out as the emissive (night) pass takes over.
    const daylight = clamp01(1 - (grade.emissive - 0.25) / 0.4);
    if (daylight <= 0.02) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const originX = this.vw * 0.22;
    const originY = -this.vh * 0.25;
    for (let i = 0; i < 5; i++) {
      const sway = Math.sin(state.time * 0.13 + i * 1.7) * 0.06;
      const ang = 0.68 + i * 0.075 + sway;
      const len = Math.hypot(this.vw, this.vh) * 1.5;
      const ex = originX + Math.cos(ang) * len;
      const ey = originY + Math.sin(ang) * len;
      const g = ctx.createLinearGradient(originX, originY, ex, ey);
      const a = (0.055 + (i % 2) * 0.03) * (warmth / 0.3) * daylight;
      g.addColorStop(0, `rgba(255,226,170,${a})`);
      g.addColorStop(0.55, `rgba(255,196,120,${a * 0.5})`);
      g.addColorStop(1, 'rgba(255,180,90,0)');
      ctx.fillStyle = g;
      const spread = 46 + i * 22;
      ctx.beginPath();
      ctx.moveTo(originX - spread * 0.3, originY);
      ctx.lineTo(originX + spread * 0.3, originY);
      ctx.lineTo(ex + spread, ey);
      ctx.lineTo(ex - spread, ey);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBloom(grade: DayGrade): void {
    const { ctx } = this;
    if (grade.bloomAlpha <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(
      this.vw * 0.5,
      this.vh * 0.28,
      0,
      this.vw * 0.5,
      this.vh * 0.28,
      Math.max(this.vw, this.vh) * 0.85,
    );
    g.addColorStop(0, grade.bloom);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.restore();
  }

  private drawVignette(): void {
    const { ctx } = this;
    const g = ctx.createRadialGradient(
      this.vw / 2,
      this.vh / 2,
      Math.min(this.vw, this.vh) * 0.28,
      this.vw / 2,
      this.vh / 2,
      Math.max(this.vw, this.vh) * 0.78,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, 'rgba(2,4,12,0.14)');
    g.addColorStop(1, 'rgba(2,4,12,0.78)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.vw, this.vh);
  }

  private drawWeather(state: RenderState, cam: Camera): void {
    if (state.weather === 'clear') return;
    const { ctx } = this;
    const t = state.time;
    ctx.save();
    const count = state.weather === 'rain' ? 190 : 120;
    for (let i = 0; i < count; i++) {
      const seedA = (i * 0.618) % 1;
      const speed = state.weather === 'rain' ? 780 : state.weather === 'ash' ? 60 : 90;
      const drift = state.weather === 'rain' ? 60 : 130;
      const x = ((seedA * this.vw + t * drift * (0.4 + seedA)) % (this.vw + 60)) - 30;
      const y = ((i * 137.5 + t * speed * (0.6 + seedA * 0.7)) % (this.vh + 80)) - 40;
      if (state.weather === 'rain') {
        ctx.strokeStyle = 'rgba(180,215,255,0.34)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 4, y + 16);
        ctx.stroke();
      } else {
        const r = state.weather === 'snow' ? 1.6 + seedA * 1.6 : 1 + seedA * 1.8;
        ctx.globalAlpha = 0.28 + seedA * 0.3;
        ctx.fillStyle =
          state.weather === 'snow'
            ? '#eaf4ff'
            : state.weather === 'ash'
              ? '#ff8a58'
              : '#c79bff';
        ctx.beginPath();
        ctx.arc(x + Math.sin(t * 1.4 + i) * 12, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    void cam;
  }

  /* ---------------- gameplay layer ---------------- */

  private tileTop(x: number, y: number): { sx: number; sy: number } {
    const t = sampleTile(Math.floor(x), Math.floor(y), this.seed);
    const h = t.water > 0 ? WORLD.seaLevel : t.h;
    return { sx: isoX(x, y), sy: isoY(x, y, h) };
  }

  private drawPath(state: RenderState): void {
    if (state.path.length < 1) return;
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < state.path.length; i++) {
      const p = state.path[i];
      const { sx, sy } = this.tileTop(p.x + 0.5, p.y + 0.5);
      const pulse = 0.35 + 0.35 * Math.sin(state.time * 5 - i * 0.55);
      ctx.globalAlpha = pulse * (1 - i / (state.path.length + 6));
      ctx.fillStyle = '#5fd7ff';
      drawDiamond(ctx, sx, sy, TILE_W * 0.34, TILE_H * 0.34);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawHover(state: RenderState): void {
    if (!state.hover) return;
    const { ctx } = this;
    const { sx, sy } = this.tileTop(state.hover.x + 0.5, state.hover.y + 0.5);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(160,230,255,0.85)';
    ctx.lineWidth = 2;
    drawDiamond(ctx, sx, sy, TILE_W * 0.94, TILE_H * 0.94);
    ctx.stroke();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#7fe6ff';
    ctx.fill();
    ctx.restore();
  }

  private drawScanPulse(state: RenderState): void {
    if (state.scanT <= 0) return;
    const { ctx } = this;
    const p = state.player;
    const { sx, sy } = this.tileTop(p.x, p.y);
    const progress = 1 - state.scanT;
    const r = progress * state.scanRadius;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const rr = r - i * 2.2;
      if (rr <= 0) continue;
      ctx.globalAlpha = (1 - progress) * (0.5 - i * 0.14);
      ctx.strokeStyle = i === 0 ? '#9dfcff' : '#3fa6ff';
      ctx.lineWidth = 3 - i;
      ctx.beginPath();
      ctx.ellipse(sx, sy, rr * HALF_W, rr * HALF_H, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = (1 - progress) * 0.1;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * HALF_W);
    g.addColorStop(0, 'rgba(90,220,255,0)');
    g.addColorStop(0.82, 'rgba(90,220,255,0.5)');
    g.addColorStop(1, 'rgba(90,220,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(sx, sy, r * HALF_W, r * HALF_H, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Beacons, the prospector and the agent all share one depth queue. */
  private drawDepthSorted(state: RenderState, grade: DayGrade): void {
    type Item = { depth: number; draw: () => void };
    const items: Item[] = [];

    for (const s of state.signals) {
      if (s.claimed) continue;
      items.push({
        depth: s.x + s.y,
        draw: () => this.drawBeacon(s, state),
      });
    }

    if (state.agent) {
      const a = state.agent;
      items.push({ depth: a.x + a.y + 0.1, draw: () => this.drawAgent(a, state) });
    }

    const p = state.player;
    items.push({ depth: p.x + p.y + 0.2, draw: () => this.drawProspector(p, state, grade) });

    if (state.mining) {
      const m = state.mining;
      items.push({ depth: m.x + m.y + 0.3, draw: () => this.drawMining(m, state) });
    }

    items.sort((a, b) => a.depth - b.depth);
    for (const i of items) i.draw();
  }

  private drawBeacon(s: CacheSignal, state: RenderState): void {
    const { ctx } = this;
    const rarity = RARITIES[s.rarity];
    const { sx, sy } = this.tileTop(s.x + 0.5, s.y + 0.5);
    const t = state.time;
    const focused = state.focusId === s.id;
    const bob = Math.sin(t * 2.1 + s.x * 0.7 + s.y * 0.31) * 4;
    const height = 52 + RARITY_INDEX[s.rarity] * 16;

    ctx.save();

    // Ground pool.
    ctx.globalCompositeOperation = 'lighter';
    const pool = ctx.createRadialGradient(sx, sy, 0, sx, sy, TILE_W * 0.85);
    pool.addColorStop(0, rarity.glow);
    pool.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.55 + 0.18 * Math.sin(t * 3 + s.x);
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(sx, sy, TILE_W * 0.85, TILE_H * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    // Light column.
    const col = ctx.createLinearGradient(sx, sy, sx, sy - height);
    col.addColorStop(0, rarity.glow);
    col.addColorStop(0.55, `${rarity.color}55`);
    col.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(sx - 9, sy + 2);
    ctx.lineTo(sx + 9, sy + 2);
    ctx.lineTo(sx + 3, sy - height);
    ctx.lineTo(sx - 3, sy - height);
    ctx.closePath();
    ctx.fill();

    // Rotating orbital rings.
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = rarity.color;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 2; i++) {
      const rr = 15 + i * 7;
      const squash = Math.abs(Math.sin(t * 1.6 + i * 1.2)) * 0.5 + 0.18;
      ctx.beginPath();
      ctx.ellipse(sx, sy - 24 + bob, rr, rr * squash, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // The cache itself — a faceted gem crate.
    const gx = sx;
    const gy = sy - 24 + bob;
    const size = 13;
    ctx.fillStyle = rarity.color;
    ctx.beginPath();
    ctx.moveTo(gx, gy - size);
    ctx.lineTo(gx + size * 0.82, gy - size * 0.2);
    ctx.lineTo(gx, gy + size);
    ctx.lineTo(gx - size * 0.82, gy - size * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(gx, gy - size);
    ctx.lineTo(gx + size * 0.82, gy - size * 0.2);
    ctx.lineTo(gx, gy - size * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.moveTo(gx, gy + size);
    ctx.lineTo(gx + size * 0.82, gy - size * 0.2);
    ctx.lineTo(gx, gy - size * 0.05);
    ctx.closePath();
    ctx.fill();

    if (focused) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 7);
      drawDiamond(ctx, sx, sy, TILE_W * 1.05, TILE_H * 1.05);
      ctx.stroke();
      ctx.globalAlpha = 1;
      this.drawTag(sx, sy - height - 12, rarity.label.toUpperCase(), s.sector, rarity.color);
    }

    ctx.restore();
  }

  private drawTag(sx: number, sy: number, title: string, sub: string, color: string): void {
    const { ctx } = this;
    ctx.save();
    ctx.font = '700 11px "JetBrains Mono", ui-monospace, monospace';
    const tw = Math.max(ctx.measureText(title).width, ctx.measureText(sub).width) + 18;
    const th = sub ? 32 : 20;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(6,10,24,0.86)';
    roundRect(ctx, sx - tw / 2, sy - th, tw, th, 6);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(title, sx, sy - th + 14);
    if (sub) {
      ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = 'rgba(210,225,255,0.75)';
      ctx.fillText(sub, sx, sy - th + 26);
    }
    ctx.restore();
  }

  private drawShadow(sx: number, sy: number, scale = 1): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 2, 14 * scale, 7 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawProspector(p: EntityView, state: RenderState, grade: DayGrade): void {
    const { ctx } = this;
    const { sx, sy } = this.tileTop(p.x, p.y);
    const t = state.time;
    const bob = p.moving ? Math.sin(t * 11) * 2.4 : Math.sin(t * 2.2) * 1.1;
    const lean = p.moving ? Math.sin(t * 11) * 0.06 : 0;
    const accent = `hsl(${p.hue}, 92%, 62%)`;
    const accentDeep = `hsl(${p.hue}, 88%, 44%)`;

    this.drawShadow(sx, sy, 1);

    // Hover ring — the Pokémon-GO "you are here" affordance.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 3);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 20 + Math.sin(t * 3) * 2, 10 + Math.sin(t * 3), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(sx, sy - 6 + bob);
    ctx.rotate(lean);
    // The prospector is the one thing a player looks at constantly — keep the
    // silhouette a touch larger than true iso scale so it never gets lost.
    ctx.scale(1.28, 1.28);

    // Cloak.
    const cloak = ctx.createLinearGradient(0, -30, 0, 6);
    cloak.addColorStop(0, '#2b3352');
    cloak.addColorStop(1, '#131829');
    ctx.fillStyle = cloak;
    ctx.beginPath();
    ctx.moveTo(0, -32);
    ctx.quadraticCurveTo(13, -20, 11, 4);
    ctx.lineTo(-11, 4);
    ctx.quadraticCurveTo(-13, -20, 0, -32);
    ctx.closePath();
    ctx.fill();

    // Trim.
    ctx.strokeStyle = accentDeep;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-9, 2);
    ctx.quadraticCurveTo(0, -6, 9, 2);
    ctx.stroke();

    // Head + visor.
    ctx.fillStyle = '#1b2036';
    ctx.beginPath();
    ctx.ellipse(0, -36, 9, 9.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.95;
    roundRect(ctx, -7, -39, 14, 6, 3);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Pickaxe slung on the back.
    ctx.strokeStyle = '#8a6a44';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-10, -8);
    ctx.lineTo(9, -30);
    ctx.stroke();
    ctx.strokeStyle = '#d9e2f2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(4, -26);
    ctx.quadraticCurveTo(12, -34, 15, -26);
    ctx.stroke();

    ctx.restore();

    // Lantern glow at night.
    if (grade.emissive > 0.15) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(sx, sy - 18, 0, sx, sy - 18, 120);
      g.addColorStop(0, accent);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.22 * grade.emissive;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy - 18, 120, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (p.label) this.drawTag(sx, sy - 66, p.label, p.sublabel ?? '', accent);
  }

  private drawAgent(a: EntityView, state: RenderState): void {
    const { ctx } = this;
    const { sx, sy } = this.tileTop(a.x, a.y);
    const t = state.time;
    const hover = Math.sin(t * 2.6 + 1.2) * 4;
    const cy = sy - 40 + hover;
    const color = `hsl(${a.hue}, 95%, 66%)`;
    const dim = `hsl(${a.hue}, 85%, 42%)`;

    this.drawShadow(sx, sy, 0.6);

    // Tether back to the prospector.
    const p = this.tileTop(state.player.x, state.player.y);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 6]);
    ctx.lineDashOffset = -t * 18;
    ctx.beginPath();
    ctx.moveTo(sx, cy);
    ctx.lineTo(p.sx, p.sy - 30);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Scan cone when autonomous.
    if (state.agentActive) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const sweep = (t * 1.1) % (Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.moveTo(sx, cy);
      ctx.ellipse(sx, cy, 96, 48, 0, sweep, sweep + 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(sx, cy);

    // Rotating containment ring.
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 6 + Math.abs(Math.sin(t * 1.9)) * 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';

    // Hex core.
    ctx.fillStyle = '#0d1226';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + t * 0.4;
      const px = Math.cos(ang) * 11;
      const py = Math.sin(ang) * 11 * 0.86;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = dim;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Eye.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 4 + Math.sin(t * 5) * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(sx, cy, 0, sx, cy, 70);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, cy, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (a.label) this.drawTag(sx, cy - 26, a.label, a.sublabel ?? '', color);
  }

  private drawMining(
    m: { x: number; y: number; progress: number; rarity: string },
    state: RenderState,
  ): void {
    const { ctx } = this;
    const { sx, sy } = this.tileTop(m.x + 0.5, m.y + 0.5);
    const rarity = RARITIES[(m.rarity as keyof typeof RARITIES) ?? 'common'];
    const t = state.time;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const ph = ((t * 1.6 + i / 3) % 1);
      ctx.globalAlpha = (1 - ph) * 0.45;
      ctx.strokeStyle = rarity.color;
      ctx.lineWidth = 2.5 * (1 - ph) + 0.5;
      ctx.beginPath();
      ctx.ellipse(sx, sy, ph * TILE_W * 1.4, ph * TILE_H * 1.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Progress arc.
    ctx.save();
    ctx.translate(sx, sy - 58);
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(8,12,26,0.85)';
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rarity.color;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(m.progress));
    ctx.stroke();
    ctx.fillStyle = '#eaf2ff';
    ctx.font = '700 12px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(m.progress * 100)}`, 0, 1);
    ctx.restore();
  }

  private drawParticles(state: RenderState): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      const life = p.life / p.maxLife;
      if (life <= 0) continue;
      const sx = isoX(p.x, p.y);
      const sy = isoY(p.x, p.y, 0) - p.z;
      ctx.globalAlpha = life * 0.9;
      ctx.fillStyle = p.color;
      if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 * life;
        ctx.beginPath();
        ctx.ellipse(sx, sy, (1 - life) * 60, (1 - life) * 30, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, p.size * (0.4 + life * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

const RARITY_INDEX: Record<string, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
  mythic: 4,
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Biome-appropriate ambient weather. */
export function weatherFor(biome: BiomeId): RenderState['weather'] {
  switch (biome) {
    case 'tundra':
    case 'peaks':
      return 'snow';
    case 'ember':
      return 'ash';
    case 'hollow':
      return 'spores';
    case 'bloom':
      return 'clear';
    default:
      return 'clear';
  }
}

export { fbm2, clamp01, FOG };
