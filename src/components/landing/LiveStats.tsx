'use client';

import { useEffect, useState } from 'react';
import { STOCKS, formatUsd } from '@/lib/stocks';
import { BIOME_ORDER } from '@/game/world';

export interface StatsPayload {
  prospectors: number;
  claims: number;
  claimedUsd: number;
  seededUsd: number;
  epoch: number;
  live: boolean;
  leaderboard: Array<{
    rank: number;
    handle: string;
    agent: string;
    claims: number;
    notionalUsd: number;
    level: number;
  }>;
  feed: Array<{
    ticker: string;
    fragment: number;
    notionalUsd: number;
    rarity: string;
    at: number;
    wallet: string;
    simulated: boolean;
  }>;
}

export function useStats(pollMs = 20_000) {
  const [stats, setStats] = useState<StatsPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/stats', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as StatsPayload;
        if (!cancelled) setStats(data);
      } catch {
        /* the landing page renders fine without live numbers */
      }
    };
    load();
    const id = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs]);

  return stats;
}

/** Count-up number that respects reduced motion. */
export function Odometer({ value, prefix = '', decimals = 0 }: { value: number; prefix?: string; decimals?: number }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return;
    }
    let raf = 0;
    const from = shown;
    const start = performance.now();
    const dur = 900;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span className="mono tabular-nums">
      {prefix}
      {shown.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
}

export function HeroStats({ stats }: { stats: StatsPayload | null }) {
  const rows = [
    {
      label: 'Seeded into the map',
      value: stats ? formatUsd(stats.seededUsd) : '—',
      tone: 'text-gold',
    },
    {
      label: 'Stock Tokens buried',
      value: String(STOCKS.length),
      tone: 'text-cyan',
    },
    {
      label: 'Biomes to sweep',
      value: String(BIOME_ORDER.length),
      tone: 'text-mint',
    },
    {
      label: 'Caches opened',
      value: stats ? stats.claims.toLocaleString('en-US') : '—',
      tone: 'text-violet',
    },
  ];

  return (
    <div className="grid w-full max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline/60 sm:grid-cols-4">
      {rows.map((r) => (
        <div key={r.label} className="bg-obsidian/80 px-4 py-4 backdrop-blur-xl">
          <div className={`display text-xl sm:text-2xl ${r.tone}`}>{r.value}</div>
          <div className="mono mt-1 text-[10px] uppercase tracking-[0.14em] text-ink-mute">
            {r.label}
          </div>
        </div>
      ))}
    </div>
  );
}
