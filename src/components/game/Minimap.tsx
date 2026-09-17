'use client';

import { useEffect, useRef } from 'react';
import { BIOMES, sampleTile } from '@/game/world';
import { RARITIES } from '@/game/drops';
import type { CacheSignal, Vec2 } from '@/game/types';

const SIZE = 176;
const RADIUS = 46; // tiles from centre to edge
const SCALE = SIZE / (RADIUS * 2);

/**
 * Top-down radar. Redraws the terrain layer only when the player crosses a
 * tile boundary; the sweep and the blips run every frame.
 */
export function Minimap({
  player,
  agent,
  signals,
  seed,
  discoveredCount,
}: {
  player: Vec2;
  agent: Vec2;
  signals: CacheSignal[];
  seed: number;
  discoveredCount: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const terrain = useRef<HTMLCanvasElement | null>(null);
  const lastCentre = useRef({ x: NaN, y: NaN });
  const live = useRef({ player, agent, signals });
  live.current = { player, agent, signals };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);

    if (!terrain.current) {
      terrain.current = document.createElement('canvas');
      terrain.current.width = SIZE;
      terrain.current.height = SIZE;
    }

    let raf = 0;
    let t = 0;

    const bakeTerrain = (cx: number, cy: number) => {
      const tctx = terrain.current!.getContext('2d')!;
      const img = tctx.createImageData(SIZE, SIZE);
      const data = img.data;
      for (let py = 0; py < SIZE; py++) {
        const wy = Math.round(cy + (py / SCALE - RADIUS));
        for (let px = 0; px < SIZE; px++) {
          const wx = Math.round(cx + (px / SCALE - RADIUS));
          const tile = sampleTile(wx, wy, seed);
          const b = BIOMES[tile.biome];
          const lift = 0.62 + (tile.h / 16) * 0.55;
          const i = (py * SIZE + px) * 4;
          data[i] = Math.min(255, b.top.r * lift);
          data[i + 1] = Math.min(255, b.top.g * lift);
          data[i + 2] = Math.min(255, b.top.b * lift);
          data[i + 3] = 255;
        }
      }
      tctx.putImageData(img, 0, 0);
    };

    const draw = () => {
      const { player: p, agent: a, signals: sig } = live.current;
      const cx = Math.round(p.x);
      const cy = Math.round(p.y);

      if (cx !== lastCentre.current.x || cy !== lastCentre.current.y) {
        lastCentre.current = { x: cx, y: cy };
        bakeTerrain(cx, cy);
      }

      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
      ctx.clip();

      ctx.globalAlpha = 0.88;
      ctx.drawImage(terrain.current!, 0, 0);
      ctx.globalAlpha = 1;

      // Darken away from centre so the radar reads as a scope.
      const g = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 10, SIZE / 2, SIZE / 2, SIZE / 2);
      g.addColorStop(0, 'rgba(4,6,14,0)');
      g.addColorStop(1, 'rgba(4,6,14,0.82)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, SIZE, SIZE);

      // Sweep.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(SIZE / 2, SIZE / 2);
      ctx.rotate(t * 1.1);
      const sweep = ctx.createLinearGradient(0, 0, SIZE / 2, 0);
      sweep.addColorStop(0, 'rgba(65,245,255,0.28)');
      sweep.addColorStop(1, 'rgba(65,245,255,0)');
      ctx.fillStyle = sweep;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, SIZE / 2, -0.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Rings.
      ctx.strokeStyle = 'rgba(120,160,230,0.14)';
      ctx.lineWidth = 1;
      for (let r = 1; r <= 3; r++) {
        ctx.beginPath();
        ctx.arc(SIZE / 2, SIZE / 2, (SIZE / 2) * (r / 3.2), 0, Math.PI * 2);
        ctx.stroke();
      }

      const toPx = (wx: number, wy: number) => ({
        x: SIZE / 2 + (wx - p.x) * SCALE,
        y: SIZE / 2 + (wy - p.y) * SCALE,
      });

      // Cache blips.
      for (const s of sig) {
        if (s.claimed) continue;
        const { x, y } = toPx(s.x, s.y);
        if (Math.hypot(x - SIZE / 2, y - SIZE / 2) > SIZE / 2 - 4) continue;
        const r = RARITIES[s.rarity];
        const pulse = 0.55 + 0.45 * Math.sin(t * 4 + s.x * 0.5);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = pulse * 0.32;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Agent.
      const ap = toPx(a.x, a.y);
      ctx.fillStyle = '#b388ff';
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, 2.4, 0, Math.PI * 2);
      ctx.fill();

      // Player.
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#41f5ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, 6 + Math.sin(t * 3) * 1.4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
      t += 1 / 60;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [seed]);

  return (
    <div className="glass relative mb-4 rounded-full p-1.5">
      <canvas ref={ref} style={{ width: SIZE, height: SIZE }} className="rounded-full" />
      <div className="pointer-events-none absolute inset-1.5 rounded-full ring-1 ring-inset ring-white/10" />
      <div className="mono absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-hairline bg-void/90 px-2.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-ink-mute">
        {discoveredCount} chunks charted
      </div>
    </div>
  );
}
