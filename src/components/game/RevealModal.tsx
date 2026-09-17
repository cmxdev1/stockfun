'use client';

import { useEffect, useRef } from 'react';
import { RARITIES } from '@/game/drops';
import { colorOf, formatFragment, formatUsd, stockByTicker } from '@/lib/stocks';
import type { ClaimResult } from '@/game/types';
import { Button } from '@/components/ui/primitives';

/** The payoff. Everything about this screen exists to make opening a cache feel earned. */
export function RevealModal({
  result,
  onClose,
}: {
  result: ClaimResult;
  onClose: () => void;
}) {
  // Attach once and dispatch through a ref. Re-registering on every parent
  // render would let a mid-dispatch cleanup remove this listener before the
  // browser reaches it — the DOM never calls a listener removed during the
  // same event — and the dismiss key would silently stop working.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const rarity = RARITIES[result.rarity ?? 'common'];
  const stock = stockByTicker(result.ticker ?? '');
  const tint = colorOf(result.ticker ?? '');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-5">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 bg-void/80 backdrop-blur-md"
      />

      {/* Rarity light burst */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(40% 40% at 50% 46%, ${rarity.glow}, transparent 70%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[46%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          border: `1px solid ${rarity.color}`,
          animation: 'ringOut 1.4s ease-out forwards',
        }}
      />

      <div
        className="glass-strong relative w-full max-w-md overflow-hidden rounded-[28px] p-8 text-center"
        style={{
          animation: 'popIn 0.55s cubic-bezier(0.2,0.9,0.25,1) both',
          boxShadow: `0 0 0 1px ${rarity.color}55, 0 40px 120px -40px ${rarity.glow}`,
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${rarity.color}, transparent)` }}
        />

        <div
          className="mono text-[11px] uppercase tracking-[0.34em]"
          style={{ color: rarity.color }}
        >
          {rarity.label} cache
        </div>

        {/* Gem */}
        <div className="relative mx-auto mt-6 h-28 w-28">
          <div
            className="absolute inset-0 rounded-full blur-2xl"
            style={{ background: rarity.glow }}
          />
          <svg viewBox="0 0 100 100" className="relative h-full w-full">
            <defs>
              <linearGradient id="gem" x1="20" y1="8" x2="80" y2="92">
                <stop stopColor="#ffffff" stopOpacity="0.9" />
                <stop offset="0.45" stopColor={rarity.color} />
                <stop offset="1" stopColor={rarity.color} stopOpacity="0.5" />
              </linearGradient>
            </defs>
            <path d="M50 4 88 38 50 96 12 38 50 4Z" fill="url(#gem)" />
            <path d="M50 4 88 38 50 46 12 38 50 4Z" fill="#fff" opacity="0.45" />
            <path d="M50 46 88 38 50 96 50 46Z" fill="#000" opacity="0.22" />
          </svg>
        </div>

        <div className="mt-6">
          <div className="display text-5xl" style={{ color: tint }}>
            ${result.ticker}
          </div>
          <div className="mt-1 text-[13px] text-ink-dim">{stock?.name ?? 'Stock Token'}</div>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline/60">
          <div className="bg-obsidian px-4 py-4">
            <div className="eyebrow mb-1.5 text-[9px]">Fragment</div>
            <div className="mono text-lg text-ink">{formatFragment(result.fragment ?? 0)}</div>
            <div className="mono text-[10px] text-ink-mute">shares</div>
          </div>
          <div className="bg-obsidian px-4 py-4">
            <div className="eyebrow mb-1.5 text-[9px]">Notional</div>
            <div className="mono text-lg text-mint">{formatUsd(result.notionalUsd ?? 0)}</div>
            <div className="mono text-[10px] text-ink-mute">+{result.xp ?? 0} XP</div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-hairline bg-white/[0.02] px-4 py-3 text-left">
          <div className="flex items-center justify-between">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-ink-mute">
              {result.simulated ? 'Simulated transfer' : 'Transferred to your wallet'}
            </span>
            {result.simulated ? (
              <span className="mono rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-gold">
                demo
              </span>
            ) : (
              <span className="mono rounded-full border border-mint/30 bg-mint/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-mint">
                on-chain
              </span>
            )}
          </div>
          {result.explorerUrl ? (
            <a
              href={result.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="mono mt-2 block truncate text-[12px] text-cyan hover:underline"
            >
              {result.txHash}
            </a>
          ) : (
            <div className="mono mt-2 truncate text-[12px] text-ink-dim">{result.txHash}</div>
          )}
        </div>

        <Button tone="gold" size="lg" className="mt-7 w-full" onClick={onClose} autoFocus>
          Keep digging
        </Button>
        <div className="mono mt-3 text-[10px] uppercase tracking-[0.2em] text-ink-mute">
          press space to continue
        </div>
      </div>
    </div>
  );
}
