'use client';

import { useEffect, useRef } from 'react';
import type { AgentArchetype } from '@/game/types';

/** Animated portrait of the agent being forged. Pure canvas, no assets. */
export function AgentPreview({
  hue,
  archetype,
  autonomous,
  size = 190,
}: {
  hue: number;
  archetype: AgentArchetype;
  autonomous: boolean;
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const cfg = useRef({ hue, archetype, autonomous });
  cfg.current = { hue, archetype, autonomous };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    let raf = 0;
    let t = 0;

    const draw = () => {
      const { hue: h, archetype: a, autonomous: auto } = cfg.current;
      const cx = size / 2;
      const cy = size / 2;
      const color = `hsl(${h}, 95%, 66%)`;
      const deep = `hsl(${h}, 85%, 42%)`;

      ctx.clearRect(0, 0, size, size);

      // Ambient bloom.
      const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.48);
      bloom.addColorStop(0, `hsla(${h}, 95%, 60%, 0.28)`);
      bloom.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, size, size);

      // Orbit rings — count and tilt encode the archetype.
      const rings = a === 'scout' ? 3 : a === 'oracle' ? 4 : 2;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < rings; i++) {
        const phase = t * (0.5 + i * 0.22) + i * 1.3;
        const rx = 34 + i * 12;
        const ry = Math.abs(Math.sin(phase)) * (12 + i * 5) + 4;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.28 + 0.24 * Math.abs(Math.cos(phase));
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, (i * Math.PI) / rings + t * 0.1, 0, Math.PI * 2);
        ctx.stroke();

        // Orbiting mote.
        const ang = phase * 1.6;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(ang) * rx, cy + Math.sin(ang) * ry, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // Core.
      const sides = a === 'digger' ? 4 : a === 'drifter' ? 8 : 6;
      const spin = t * (auto ? 0.8 : 0.28);
      const r = 26 + Math.sin(t * 2) * 1.4;
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const ang = (i / sides) * Math.PI * 2 + spin;
        const px = cx + Math.cos(ang) * r;
        const py = cy + Math.sin(ang) * r * 0.92;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      const body = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      body.addColorStop(0, '#131a34');
      body.addColorStop(1, '#070b18');
      ctx.fillStyle = body;
      ctx.fill();
      ctx.strokeStyle = deep;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Eye.
      const pulse = auto ? 1 + Math.sin(t * 6) * 0.22 : 1 + Math.sin(t * 2.2) * 0.08;
      const eye = ctx.createRadialGradient(cx, cy, 0, cx, cy, 13 * pulse);
      eye.addColorStop(0, '#fff');
      eye.addColorStop(0.35, color);
      eye.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = eye;
      ctx.beginPath();
      ctx.arc(cx, cy, 13 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Scan sweep when autonomous.
      if (auto) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, size * 0.42, t * 1.4, t * 1.4 + 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      t += 1 / 60;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />;
}
