import { NextResponse } from 'next/server';
import { getWorld, globalStats } from '@/lib/store';
import { WORLD } from '@/game/world';
import { isLive, activeChain } from '@/lib/chain';

export const dynamic = 'force-dynamic';

/** Public world descriptor. The spawn seed is deliberately absent. */
export async function GET() {
  const world = await getWorld();
  const stats = await globalStats();
  return NextResponse.json({
    worldSeed: WORLD.seed,
    epoch: world.epoch,
    chunk: WORLD.chunk,
    seaLevel: WORLD.seaLevel,
    maxHeight: WORLD.maxHeight,
    chain: {
      id: activeChain().id,
      name: activeChain().name,
      live: isLive(),
      explorer: activeChain().blockExplorers?.default.url ?? null,
    },
    stats,
  });
}
