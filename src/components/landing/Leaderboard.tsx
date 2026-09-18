'use client';

import { Chip, Section, SectionHeading } from '@/components/ui/primitives';
import { formatUsd } from '@/lib/stocks';
import { useStats } from './LiveStats';

const SEED_ROWS = [
  { rank: 1, handle: 'veinwalker', agent: 'ORACLE-9', claims: 412, notionalUsd: 1284.21, level: 12 },
  { rank: 2, handle: 'saltflat', agent: 'Kestrel', claims: 388, notionalUsd: 1107.64, level: 11 },
  { rank: 3, handle: 'nullcartel', agent: 'Bramble', claims: 351, notionalUsd: 964.08, level: 11 },
  { rank: 4, handle: 'orebound', agent: 'Tunneler', claims: 297, notionalUsd: 812.45, level: 10 },
  { rank: 5, handle: 'dustmoth', agent: 'Wisp', claims: 264, notionalUsd: 703.9, level: 9 },
];

const MEDAL = ['#ffc44d', '#cfd8ee', '#d08a4e'];

export function Leaderboard() {
  const stats = useStats(25_000);
  const rows = stats?.leaderboard?.length ? stats.leaderboard : SEED_ROWS;

  return (
    <Section id="leaderboard" className="border-t border-hairline">
      <SectionHeading
        eyebrow="Standings"
        title={
          <>
            The deepest diggers
            <br className="hidden sm:block" /> in <span className="aurora-text">the current epoch</span>
          </>
        }
        blurb="Ranked by notional value pulled out of the ground. Levels come from XP, and XP comes from rarity — a single mythic outweighs a hundred commons."
      />

      <div className="mx-auto mt-14 max-w-4xl overflow-hidden rounded-[var(--radius-xl2)] border border-hairline">
        <div className="hidden grid-cols-[52px_1.3fr_1fr_0.7fr_0.8fr] gap-4 bg-white/[0.02] px-6 py-4 sm:grid">
          {['#', 'Prospector', 'Agent', 'Caches', 'Extracted'].map((h) => (
            <div key={h} className="eyebrow text-[10px]">
              {h}
            </div>
          ))}
        </div>
        {rows.map((r) => (
          <div
            key={r.rank}
            className="grid grid-cols-[40px_1fr_auto] items-center gap-4 border-t border-hairline px-5 py-4 transition-colors hover:bg-white/[0.025] sm:grid-cols-[52px_1.3fr_1fr_0.7fr_0.8fr] sm:px-6"
          >
            <div
              className="display text-lg"
              style={{ color: MEDAL[r.rank - 1] ?? '#6d7ca4' }}
            >
              {String(r.rank).padStart(2, '0')}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold">{r.handle}</div>
              <div className="mono text-[11px] text-ink-mute sm:hidden">
                {r.agent} · {r.claims} caches
              </div>
            </div>
            <div className="mono hidden text-[13px] text-cyan sm:block">{r.agent}</div>
            <div className="mono hidden text-[13px] text-ink-dim sm:block">{r.claims}</div>
            <div className="mono text-right text-[14px] font-bold text-gold sm:text-left">
              {formatUsd(r.notionalUsd)}
            </div>
          </div>
        ))}
      </div>

      {!stats?.leaderboard?.length && (
        <div className="mt-5 flex justify-center">
          <Chip>Example standings · the board fills as the epoch runs</Chip>
        </div>
      )}
    </Section>
  );
}
