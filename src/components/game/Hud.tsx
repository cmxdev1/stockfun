'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { LodeMark } from '@/components/ui/Logo';
import { RARITIES } from '@/game/drops';
import { sectorName } from '@/game/world';
import { colorOf, formatFragment, formatUsd } from '@/lib/stocks';
import type { AgentConfig, BiomeStyle, CacheSignal, Vec2 } from '@/game/types';
import { Minimap } from './Minimap';

export interface HaulEntry {
  ticker: string;
  fragment: number;
  notionalUsd: number;
  rarity: string;
  at: number;
}

export interface LogEntry {
  id: number;
  message: string;
  tone: 'info' | 'good' | 'warn';
}

/* ------------------------------------------------------------------ *
 * Top bar
 * ------------------------------------------------------------------ */

export function TopBar({
  handle,
  level,
  xp,
  xpToNext,
  biome,
  player,
  dayLabel,
  epoch,
  live,
  altitude,
  richness,
}: {
  handle: string;
  level: number;
  xp: number;
  xpToNext: number;
  biome: BiomeStyle;
  player: Vec2;
  dayLabel: string;
  epoch: number;
  live: boolean;
  altitude: number;
  richness: number;
}) {
  const pct = Math.min(100, Math.max(0, (xp / Math.max(1, xpToNext)) * 100));

  return (
    <div className="pointer-events-auto flex items-start justify-between gap-3 p-3 sm:p-4">
      <div className="glass flex items-center gap-3 rounded-2xl px-3 py-2.5">
        <Link href="/" aria-label="Back to the landing page" className="shrink-0">
          <LodeMark size={26} />
        </Link>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[14px] font-semibold leading-none">{handle}</span>
            <span className="mono shrink-0 rounded-full border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-[9px] text-gold">
              LVL {level}
            </span>
          </div>
          <div className="mt-1.5 h-1 w-32 overflow-hidden rounded-full bg-hairline sm:w-44">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan to-violet transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="glass hidden min-w-0 items-center gap-4 rounded-2xl px-4 py-2.5 md:flex">
        <div className="min-w-0">
          <div className="mono text-[9px] uppercase tracking-[0.2em] text-ink-mute">Location</div>
          <div className="truncate text-[13px] font-semibold" style={{ color: biome.accent }}>
            {biome.name}
          </div>
        </div>
        <span className="h-7 w-px bg-hairline" />
        <Readout label="Sector" value={sectorName(player.x, player.y)} />
        <Readout
          label="Coords"
          value={`${Math.round(player.x)}, ${Math.round(player.y)}`}
        />
        <Readout label="Alt" value={`${altitude}`} />
        <Readout
          label="Vein"
          value={`${Math.round(richness * 100)}%`}
          tone={richness > 0.7 ? 'text-gold' : undefined}
        />
      </div>

      <div className="glass flex items-center gap-3 rounded-2xl px-3 py-2.5">
        <div className="hidden sm:block">
          <div className="mono text-[9px] uppercase tracking-[0.2em] text-ink-mute">Sky</div>
          <div className="mono text-[12px] text-ink-dim">{dayLabel}</div>
        </div>
        <span className="hidden h-7 w-px bg-hairline sm:block" />
        <div>
          <div className="mono text-[9px] uppercase tracking-[0.2em] text-ink-mute">Epoch</div>
          <div className="mono text-[12px] text-ink-dim">#{epoch}</div>
        </div>
        <span
          className="mono flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.14em]"
          style={{
            borderColor: live ? 'rgba(109,255,168,0.35)' : 'rgba(255,196,77,0.3)',
            color: live ? '#6dffa8' : '#ffc44d',
            background: live ? 'rgba(109,255,168,0.08)' : 'rgba(255,196,77,0.08)',
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: 'currentColor', boxShadow: '0 0 8px currentColor' }}
          />
          {live ? 'vault live' : 'demo vault'}
        </span>
      </div>
    </div>
  );
}

function Readout({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="mono text-[9px] uppercase tracking-[0.2em] text-ink-mute">{label}</div>
      <div className={`mono text-[12px] ${tone ?? 'text-ink-dim'}`}>{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Signal list
 * ------------------------------------------------------------------ */

export function SignalPanel({
  signals,
  player,
  focusId,
  onTrack,
  scanning,
}: {
  signals: CacheSignal[];
  player: Vec2;
  focusId: string | null;
  onTrack: (s: CacheSignal) => void;
  scanning: boolean;
}) {
  const rows = useMemo(() => {
    return signals
      .filter((s) => !s.claimed)
      .map((s) => ({ s, d: Math.hypot(s.x - player.x, s.y - player.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 9);
    // Recomputing on every player tick is fine — the list is at most 9 rows.
  }, [signals, player.x, player.y]);

  return (
    <div className="glass pointer-events-auto flex w-[264px] flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <span className="mono text-[10px] uppercase tracking-[0.2em] text-ink-mute">Signals</span>
        <span className="mono text-[10px] text-cyan">
          {scanning ? 'sweeping…' : `${rows.length} open`}
        </span>
      </div>
      <div className="max-h-[42vh] overflow-y-auto">
        {rows.length === 0 && (
          <div className="px-4 py-6 text-center text-[12px] leading-relaxed text-ink-mute">
            Nothing on the board.
            <br />
            Run a sweep — <span className="mono text-cyan">SPACE</span>
          </div>
        )}
        {rows.map(({ s, d }) => {
          const r = RARITIES[s.rarity];
          const active = focusId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onTrack(s)}
              className={`flex w-full items-center gap-3 border-b border-hairline/60 px-4 py-2.5 text-left transition-colors last:border-0 ${
                active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.035]'
              }`}
            >
              <span
                className="h-7 w-1 shrink-0 rounded-full"
                style={{ background: r.color, boxShadow: `0 0 12px ${r.glow}` }}
              />
              <span className="min-w-0 flex-1">
                <span
                  className="mono block text-[11px] uppercase tracking-[0.14em]"
                  style={{ color: r.color }}
                >
                  {r.label}
                </span>
                <span className="block truncate text-[12px] text-ink-dim">{s.sector}</span>
              </span>
              <span className="mono shrink-0 text-right text-[11px] text-ink-mute">
                {d < 1.5 ? (
                  <span className="text-mint">in reach</span>
                ) : (
                  `${Math.round(d)}m`
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Agent panel
 * ------------------------------------------------------------------ */

export function AgentPanel({
  agent,
  onToggleAutonomy,
  distance,
}: {
  agent: AgentConfig;
  onToggleAutonomy: () => void;
  distance: number;
}) {
  const color = `hsl(${agent.hue}, 95%, 66%)`;
  return (
    <div className="glass pointer-events-auto w-[240px] overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
          style={{
            background: `radial-gradient(circle at 35% 25%, hsla(${agent.hue},95%,70%,0.4), transparent 70%)`,
            border: `1px solid hsla(${agent.hue},85%,60%,0.4)`,
          }}
        >
          <span
            className="block h-3 w-3 rotate-45 rounded-[2px]"
            style={{ background: color, boxShadow: `0 0 14px ${color}` }}
          />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{agent.name}</div>
          <div className="mono text-[10px] uppercase tracking-[0.16em] text-ink-mute">
            {agent.archetype}
          </div>
        </div>
      </div>

      <div className="space-y-2.5 px-4 py-3">
        <Meter label="Range" value={agent.range} color={color} />
        <Meter label="Greed" value={agent.greed} color={color} />
        <div className="mono flex justify-between text-[10px] uppercase tracking-[0.14em] text-ink-mute">
          <span>Tether</span>
          <span className={distance > 24 ? 'text-gold' : 'text-ink-dim'}>
            {Math.round(distance)}m
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleAutonomy}
        className="flex w-full items-center justify-between border-t border-hairline px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
      >
        <span className="text-[12px] font-medium">
          {agent.autonomous ? 'Autonomous' : 'Escort'}
        </span>
        <span
          className={`relative h-5 w-9 rounded-full transition-colors ${
            agent.autonomous ? 'bg-mint/70' : 'bg-hairline'
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
              agent.autonomous ? 'left-[18px]' : 'left-0.5'
            }`}
          />
        </span>
      </button>
    </div>
  );
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mono mb-1 flex justify-between text-[10px] uppercase tracking-[0.14em] text-ink-mute">
        <span>{label}</span>
        <span>{Math.round(value * 100)}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-hairline">
        <div
          className="h-full rounded-full"
          style={{ width: `${value * 100}%`, background: color, boxShadow: `0 0 10px ${color}` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Haul
 * ------------------------------------------------------------------ */

export function HaulPanel({ haul, total }: { haul: HaulEntry[]; total: number }) {
  return (
    <div className="glass pointer-events-auto w-[240px] overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <span className="mono text-[10px] uppercase tracking-[0.2em] text-ink-mute">Haul</span>
        <span className="mono text-[12px] font-bold text-gold">{formatUsd(total)}</span>
      </div>
      <div className="max-h-[26vh] overflow-y-auto">
        {haul.length === 0 && (
          <div className="px-4 py-5 text-center text-[12px] text-ink-mute">
            Nothing yet. Go break some ground.
          </div>
        )}
        {haul.slice(0, 12).map((h, i) => (
          <div
            key={`${h.ticker}-${h.at}-${i}`}
            className="flex items-center justify-between border-b border-hairline/60 px-4 py-2 last:border-0"
          >
            <span className="mono text-[12px] font-bold" style={{ color: colorOf(h.ticker) }}>
              ${h.ticker}
            </span>
            <span className="mono text-right text-[11px] text-ink-dim">
              {formatFragment(h.fragment)}
              <span className="ml-1.5 text-mint">{formatUsd(h.notionalUsd)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Action bar
 * ------------------------------------------------------------------ */

export function ActionBar({
  onScan,
  scanCooldown,
  scanMax,
  onDig,
  digReady,
  digging,
  digProgress,
  onZoom,
  zoom,
}: {
  onScan: () => void;
  scanCooldown: number;
  scanMax: number;
  onDig: () => void;
  digReady: boolean;
  digging: boolean;
  digProgress: number;
  onZoom: (dir: 1 | -1) => void;
  zoom: number;
}) {
  const ready = scanCooldown <= 0;
  const pct = ready ? 0 : scanCooldown / scanMax;

  return (
    <div className="pointer-events-auto flex items-end justify-center gap-3 pb-4 sm:gap-4 sm:pb-6">
      <div className="glass flex items-center gap-1 rounded-full p-1">
        <IconButton label="Zoom out" onClick={() => onZoom(-1)}>
          −
        </IconButton>
        <span className="mono w-10 text-center text-[11px] text-ink-mute">
          {zoom.toFixed(2)}×
        </span>
        <IconButton label="Zoom in" onClick={() => onZoom(1)}>
          +
        </IconButton>
      </div>

      <button
        type="button"
        onClick={onScan}
        disabled={!ready}
        className="group relative h-16 w-16 shrink-0 rounded-full transition-transform active:scale-95 disabled:cursor-not-allowed sm:h-[70px] sm:w-[70px]"
      >
        <span
          className="absolute inset-0 rounded-full transition-all"
          style={{
            background: ready
              ? 'radial-gradient(circle at 35% 25%, #9ffcff, #0f9fc4)'
              : 'rgba(18,26,50,0.9)',
            boxShadow: ready ? '0 0 34px -6px rgba(65,245,255,0.85)' : 'none',
            border: ready ? 'none' : '1px solid #1f2a50',
          }}
        />
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="#41f5ff"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={289}
            strokeDashoffset={289 * pct}
            opacity={ready ? 0 : 0.85}
          />
        </svg>
        <span
          className={`mono relative text-[10px] font-bold uppercase tracking-[0.12em] ${
            ready ? 'text-[#01161c]' : 'text-ink-mute'
          }`}
        >
          {ready ? 'SCAN' : scanCooldown.toFixed(1)}
        </span>
      </button>

      <button
        type="button"
        onClick={onDig}
        disabled={!digReady && !digging}
        className="group relative h-16 min-w-[124px] shrink-0 overflow-hidden rounded-full px-6 transition-transform active:scale-95 disabled:cursor-not-allowed sm:h-[70px]"
        style={{
          background:
            digReady || digging
              ? 'linear-gradient(180deg,#ffdd8a,#f0a81f)'
              : 'rgba(18,26,50,0.9)',
          boxShadow: digReady || digging ? '0 0 34px -8px rgba(255,196,77,0.9)' : 'none',
          border: digReady || digging ? 'none' : '1px solid #1f2a50',
        }}
      >
        {digging && (
          <span
            className="absolute inset-y-0 left-0 bg-white/30 transition-[width] duration-100"
            style={{ width: `${digProgress * 100}%` }}
          />
        )}
        <span
          className={`mono relative text-[12px] font-bold uppercase tracking-[0.16em] ${
            digReady || digging ? 'text-[#1a1002]' : 'text-ink-mute'
          }`}
        >
          {digging ? `${Math.round(digProgress * 100)}%` : digReady ? 'DIG · E' : 'NO CACHE'}
        </span>
      </button>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-full text-lg text-ink-dim transition-colors hover:bg-white/[0.07] hover:text-ink"
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Log toasts
 * ------------------------------------------------------------------ */

export function LogStack({ entries }: { entries: LogEntry[] }) {
  const tones = {
    info: 'border-hairline text-ink-dim',
    good: 'border-mint/35 text-mint',
    warn: 'border-gold/35 text-gold',
  };
  return (
    <div className="pointer-events-none flex flex-col items-center gap-2">
      {entries.slice(-4).map((e) => (
        <div
          key={e.id}
          className={`glass mono animate-[rise_0.35s_both] rounded-full border px-4 py-2 text-[11px] ${tones[e.tone]}`}
        >
          {e.message}
        </div>
      ))}
    </div>
  );
}

export { Minimap };

/* ------------------------------------------------------------------ *
 * Controls legend
 * ------------------------------------------------------------------ */

const KEYS: Array<[string, string]> = [
  ['W A S D', 'move'],
  ['CLICK', 'travel'],
  ['SPACE', 'scan'],
  ['E', 'dig'],
  ['F', 'agent mode'],
  ['SCROLL', 'zoom'],
];

export function KeyLegend() {
  return (
    <div className="glass pointer-events-auto w-[184px] rounded-2xl px-4 py-3">
      <div className="mono mb-2.5 text-[10px] uppercase tracking-[0.2em] text-ink-mute">
        Controls
      </div>
      <dl className="flex flex-col gap-1.5">
        {KEYS.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-2">
            <dt className="mono rounded-md border border-hairline bg-white/[0.04] px-1.5 py-0.5 text-[9px] tracking-[0.08em] text-ink-dim">
              {k}
            </dt>
            <dd className="mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
