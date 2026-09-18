import { NextResponse } from 'next/server';
import { globalStats, leaderboard, recentClaims } from '@/lib/store';
import { isLive } from '@/lib/chain';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [stats, board, feed] = await Promise.all([
    globalStats(),
    leaderboard(8),
    recentClaims(12),
  ]);
  return NextResponse.json({
    ...stats,
    live: isLive(),
    leaderboard: board,
    feed: feed.map((c) => ({
      ticker: c.ticker,
      fragment: c.fragment,
      notionalUsd: c.notionalUsd,
      rarity: c.rarity,
      at: c.claimedAt,
      wallet: `${c.wallet.slice(0, 6)}…${c.wallet.slice(-4)}`,
      simulated: c.simulated,
    })),
  });
}
