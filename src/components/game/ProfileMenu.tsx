'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { formatUsd } from '@/lib/stocks';
import { shortAddress } from '@/lib/wallet';
import type { PlayerProfile } from '@/game/types';

/**
 * The prospector's own record. Most importantly it keeps the destination
 * wallet visible at all times — a player should never have to wonder where
 * what they dug up is going.
 */
export function ProfileMenu({
  profile,
  level,
  xp,
  claims,
  haulUsd,
  explorerBase,
  onSwitch,
}: {
  profile: PlayerProfile;
  level: number;
  xp: number;
  claims: number;
  haulUsd: number;
  explorerBase: string;
  onSwitch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(profile.wallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard is blocked in some contexts; the address is on screen anyway */
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Prospector record"
        className="mono flex items-center gap-1.5 rounded-full border border-hairline bg-white/[0.03] px-2.5 py-1 text-[10px] text-ink-dim transition-colors hover:bg-white/[0.07] hover:text-ink"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-mint shadow-[0_0_8px_currentColor]" />
        <span className="hidden sm:inline">{shortAddress(profile.wallet)}</span>
        <span className="sm:hidden">wallet</span>
      </button>

      {open && (
        <div className="glass-strong absolute left-0 top-[calc(100%+10px)] z-50 w-[286px] overflow-hidden rounded-2xl">
          <div className="border-b border-hairline px-5 py-4">
            <div className="eyebrow mb-2 text-[9px]">Payouts go to</div>
            <div className="flex items-start gap-2">
              <code className="mono min-w-0 flex-1 break-all text-[11px] leading-[1.5] text-mint">
                {profile.wallet}
              </code>
              <button
                type="button"
                onClick={copy}
                className="mono shrink-0 rounded-md border border-hairline px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-ink-mute transition-colors hover:text-ink"
              >
                {copied ? 'copied' : 'copy'}
              </button>
            </div>
            <a
              href={`${explorerBase}/address/${profile.wallet}`}
              target="_blank"
              rel="noreferrer"
              className="mono mt-2 inline-block text-[10px] uppercase tracking-[0.14em] text-cyan hover:underline"
            >
              View on explorer ↗
            </a>
          </div>

          <dl className="grid grid-cols-3 gap-px bg-hairline/60">
            <Stat label="Level" value={String(level)} tone="text-gold" />
            <Stat label="XP" value={xp.toLocaleString('en-US')} tone="text-cyan" />
            <Stat label="Caches" value={String(claims)} tone="text-violet" />
          </dl>

          <div className="border-t border-hairline px-5 py-3">
            <div className="flex items-baseline justify-between">
              <span className="mono text-[10px] uppercase tracking-[0.16em] text-ink-mute">
                Extracted this session
              </span>
              <span className="mono text-[13px] font-bold text-gold">{formatUsd(haulUsd)}</span>
            </div>
          </div>

          <div className="flex border-t border-hairline">
            <Link
              href="/"
              className="mono flex-1 px-4 py-3 text-center text-[10px] uppercase tracking-[0.14em] text-ink-mute transition-colors hover:bg-white/[0.04] hover:text-ink"
            >
              Leave the Lode
            </Link>
            <span className="w-px bg-hairline" />
            <button
              type="button"
              onClick={onSwitch}
              className="mono flex-1 px-4 py-3 text-center text-[10px] uppercase tracking-[0.14em] text-ink-mute transition-colors hover:bg-white/[0.04] hover:text-rose"
            >
              Switch wallet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="bg-obsidian px-3 py-3 text-center">
      <dd className={`mono text-[15px] ${tone}`}>{value}</dd>
      <dt className="mono mt-0.5 text-[9px] uppercase tracking-[0.14em] text-ink-mute">{label}</dt>
    </div>
  );
}
