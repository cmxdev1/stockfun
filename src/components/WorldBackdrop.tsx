'use client';

/**
 * A live slice of THE LODE, rendered with the real game renderer and drifting
 * on a slow cinematic path. The landing page shows the actual world — not a
 * screenshot of it.
 */

import { useEffect, useRef } from 'react';
import { LodeRenderer, type Particle, type RenderState } from '@/game/renderer';
import { chunkKey } from '@/game/renderer';
import { mulberry32 } from '@/game/noise';
import { nearestWalkable, sampleTile, WORLD } from '@/game/world';
import type { CacheSignal, Rarity } from '@/game/types';
import { CHUNK } from '@/game/renderer';

const RARITY_POOL: Rarity[] = [
  'common',
  'common',
  'common',
  'rare',
  'rare',
  'epic',
  'legendary',
  'mythic',
];

const SECTORS = ['Big Tech', 'Semiconductors', 'Index', 'Consumer', 'Finance', 'Energy'];

export interface WorldBackdropProps {
  /** Tile-space anchor for the camera drift. */
  origin?: { x: number; y: number };
  zoom?: number;
  /** Fixed time of day, or undefined to run the full cycle. */
  dayT?: number;
  speed?: number;
  className?: string;
  /** Show decorative cache beacons. */
  beacons?: boolean;
  fadeEdges?: boolean;
  /** Depth-of-field blur in px — lets foreground copy win without killing the scene. */
  blur?: number;
  /** Extra darkening behind centred copy. */
  scrim?: boolean;
}

export function WorldBackdrop({
  origin = { x: 512, y: 340 },
  zoom = 0.78,
  dayT,
  speed = 1,
  className = '',
  beacons = true,
  fadeEdges = true,
  blur = 0,
  scrim = false,
}: WorldBackdropProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    let renderer: LodeRenderer;
    try {
      renderer = new LodeRenderer(canvas, WORLD.seed);
    } catch {
      return;
    }

    const spawn = nearestWalkable(origin.x, origin.y, WORLD.seed);
    const rng = mulberry32(0x1337 ^ (spawn.x * 73856093) ^ (spawn.y * 19349663));

    // Decorative beacons, placed on walkable ground near the camera path.
    const signals: CacheSignal[] = [];
    if (beacons) {
      for (let i = 0; i < 14; i++) {
        const ang = rng() * Math.PI * 2;
        const r = 8 + rng() * 46;
        const x = Math.round(spawn.x + Math.cos(ang) * r);
        const y = Math.round(spawn.y + Math.sin(ang) * r);
        const tile = sampleTile(x, y, WORLD.seed);
        if (tile.water > 1) continue;
        signals.push({
          id: `bg-${i}`,
          x,
          y,
          rarity: RARITY_POOL[Math.floor(rng() * RARITY_POOL.length)],
          biome: tile.biome,
          sector: SECTORS[Math.floor(rng() * SECTORS.length)],
          difficulty: 1,
          claimed: false,
        });
      }
    }

    const discovered = new Map<string, number>();
    const cr = 6;
    const bcx = Math.floor(spawn.x / CHUNK);
    const bcy = Math.floor(spawn.y / CHUNK);
    for (let dy = -cr; dy <= cr; dy++) {
      for (let dx = -cr; dx <= cr; dx++) {
        discovered.set(chunkKey(bcx + dx, bcy + dy), -10);
      }
    }

    const particles: Particle[] = [];
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let running = true;

    const onResize = () => renderer.resize();
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(() => renderer.resize());
    ro.observe(canvas);

    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt * speed;

      // Lissajous drift keeps the camera moving without ever repeating exactly.
      const camX = spawn.x + Math.sin(t * 0.06) * 26 + Math.sin(t * 0.021) * 12;
      const camY = spawn.y + Math.cos(t * 0.047) * 22 + Math.cos(t * 0.017) * 9;

      // Lazy ambient motes so the scene never looks frozen.
      if (particles.length < 60 && Math.random() < 0.3) {
        const ang = Math.random() * Math.PI * 2;
        const rr = Math.random() * 40;
        particles.push({
          x: camX + Math.cos(ang) * rr,
          y: camY + Math.sin(ang) * rr,
          z: 10 + Math.random() * 70,
          vx: (Math.random() - 0.5) * 0.2,
          vy: (Math.random() - 0.5) * 0.2,
          vz: 3 + Math.random() * 5,
          life: 5 + Math.random() * 5,
          maxLife: 10,
          color: '#8fd8ff',
          size: 1 + Math.random() * 1.4,
          kind: 'spark',
        });
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.life <= 0) particles.splice(i, 1);
      }

      const state: RenderState = {
        camera: { x: camX, y: camY, zoom },
        player: {
          x: camX,
          y: camY,
          h: 0,
          hue: 196,
          facing: 0,
          moving: false,
        },
        agent: null,
        agentActive: false,
        signals,
        focusId: null,
        discovered,
        hover: null,
        path: [],
        scanT: 0,
        scanRadius: 26,
        mining: null,
        particles,
        dayT: dayT ?? (0.28 + t * 0.0035) % 1,
        time: t,
        weather: 'clear',
      };
      // The backdrop has no prospector; draw the world only.
      state.player.label = undefined;
      renderer.render({ ...state, player: { ...state.player, x: -99999, y: -99999 } });
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    const onVisibility = () => {
      running = document.visibilityState === 'visible';
      if (running) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else {
        cancelAnimationFrame(raf);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      ro.disconnect();
      renderer.dispose();
    };
  }, [origin.x, origin.y, zoom, dayT, speed, beacons]);

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <canvas
        ref={ref}
        className="h-full w-full"
        style={blur ? { filter: `blur(${blur}px)`, transform: 'scale(1.03)' } : undefined}
      />
      {scrim && (
        <div className="absolute inset-0 bg-[radial-gradient(46%_46%_at_50%_44%,rgba(4,5,12,0.82),rgba(4,5,12,0.35)_55%,transparent_78%)]" />
      )}
      {fadeEdges && (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_15%,transparent_25%,#04050c_78%)]" />
          <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-void to-transparent" />
        </>
      )}
    </div>
  );
}
