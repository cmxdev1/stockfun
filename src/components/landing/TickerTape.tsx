'use client';

import { colorOf, formatFragment, formatUsd } from '@/lib/stocks';
import { useStats } from './LiveStats';

const PLACEHOLDER = [
  { ticker: 'NVDA', fragment: 0.00042, notionalUsd: 0.07, rarity: 'common', wallet: '0x8f…41c2' },
  { ticker: 'AAPL', fragment: 0.00118, notionalUsd: 0.31, rarity: 'rare', wallet: '0x2b…9ae0' },
  { ticker: 'NFLX', fragment: 0.00251, notionalUsd: 2.32, rarity: 'epic', wallet: '0xc4…10fd' },
  { ticker: 'HOOD', fragment: 0.04106, notionalUsd: 4.88, rarity: 'epic', wallet: '0x71…5b33' },
  { ticker: 'SPY', fragment: 0.01903, notionalUsd: 12.98, rarity: 'legendary', wallet: '0x9d…7c81' },
  { ticker: 'META', fragment: 0.00087, notionalUsd: 0.54, rarity: 'rare', wallet: '0x33…ee40' },
  { ticker: 'AMD', fragment: 0.00619, notionalUsd: 1.33, rarity: 'rare', wallet: '0xab…2d19' },
  { ticker: 'LLY', fragment: 0.00034, notionalUsd: 0.28, rarity: 'common', wallet: '0x50…88bc' },
];

const RARITY_COLOR: Record<string, string> = {
  common: '#8fe3a8',
  rare: '#5cc8ff',
  epic: '#c07bff',
  legendary: '#ffc44d',
  mythic: '#ff5f8f',
};

export function TickerTape() {
  const stats = useStats(30_000);
  const feed = stats?.feed?.length ? stats.feed : PLACEHOLDER;
  const items = [...feed, ...feed, ...feed].slice(0, 30);

  return (
    <div className="relative overflow-hidden border-y border-hairline bg-obsidian/70 py-3 backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-void to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-void to-transparent" />
      <div className="flex w-max animate-[marquee_46s_linear_infinite] items-center gap-8 pr-8">
        {items.map((f, i) => (
          <div key={`${f.ticker}-${i}`} className="flex shrink-0 items-center gap-3">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: RARITY_COLOR[f.rarity] ?? '#8fe3a8',
                boxShadow: `0 0 12px ${RARITY_COLOR[f.rarity] ?? '#8fe3a8'}`,
              }}
            />
            <span className="mono text-[12px] font-bold" style={{ color: colorOf(f.ticker) }}>
              ${f.ticker}
            </span>
            <span className="mono text-[12px] text-ink-dim">{formatFragment(f.fragment)} sh</span>
            <span className="mono text-[12px] text-mint">{formatUsd(f.notionalUsd)}</span>
            <span className="mono text-[11px] text-ink-mute">→ {f.wallet}</span>
            <span className="h-3 w-px bg-hairline" />
          </div>
        ))}
      </div>
    </div>
  );
}
