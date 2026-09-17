'use client';

import { WorldBackdrop } from '@/components/WorldBackdrop';
import { Chip, LinkButton } from '@/components/ui/primitives';
import { HeroStats, useStats } from './LiveStats';

export function Hero() {
  const stats = useStats();

  return (
    <section className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-5 pb-24 pt-28 sm:pb-32 sm:pt-32 sm:px-8">
      <WorldBackdrop origin={{ x: 1120, y: 800 }} zoom={0.76} speed={0.8} blur={2.5} scrim />

      {/* Aurora wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-45 mix-blend-screen"
        style={{
          background:
            'radial-gradient(55% 38% at 14% 10%, rgba(65,245,255,0.14), transparent 62%), radial-gradient(48% 34% at 88% 18%, rgba(160,107,255,0.14), transparent 64%), radial-gradient(70% 45% at 50% 104%, rgba(255,196,77,0.10), transparent 70%)',
        }}
      />

      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center text-center">
        <Chip tone="gold" className="animate-[rise_0.7s_both]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gold" />
          </span>
          Season 01 · The Lode is open
        </Chip>

        <h1
          className="display mt-7 text-balance text-[clamp(2.6rem,8.2vw,6.4rem)] leading-[0.95] animate-[rise_0.8s_0.05s_both]"
        >
          There is <span className="gold-text">real stock</span>
          <br />
          buried in this world.
        </h1>

        <p className="mt-7 max-w-xl text-pretty text-base leading-relaxed text-ink-dim sm:text-lg animate-[rise_0.9s_0.15s_both]">
          Real tokenised Stock Tokens, bought on Robinhood Chain and buried at random coordinates
          across <span className="text-ink">THE LODE</span> — an infinite procedural world. Forge an
          agent, sweep the ground, dig. The fragment hits your wallet before the dust settles.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row animate-[rise_1s_0.25s_both]">
          <LinkButton href="/play" tone="gold" size="lg" className="w-full sm:w-auto">
            Launch the Lode
            <span aria-hidden className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </LinkButton>
          <a
            href="#how"
            className="glass inline-flex h-14 w-full items-center justify-center gap-2 rounded-full px-8 text-base font-semibold text-ink transition-colors hover:bg-white/[0.07] sm:w-auto"
          >
            How the loot gets there
          </a>
        </div>

        <p className="mono mt-5 text-[10px] uppercase tracking-[0.2em] text-ink-mute sm:text-[11px] animate-[rise_1s_0.35s_both]">
          {stats?.live ? 'Payouts settle on Robinhood Chain' : 'Demo mode · payouts are simulated'}
        </p>

        <div className="mt-12 w-full animate-[rise_1.1s_0.45s_both]">
          <HeroStats stats={stats} />
        </div>
      </div>

      <a
        href="#how"
        aria-label="Scroll to how it works"
        className="absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 sm:block text-ink-mute transition-colors hover:text-ink"
      >
        <span className="mono flex flex-col items-center gap-2 text-[10px] uppercase tracking-[0.3em]">
          Descend
          <span className="block h-10 w-px bg-gradient-to-b from-ink-mute to-transparent" />
        </span>
      </a>
    </section>
  );
}
