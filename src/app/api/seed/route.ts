import { NextResponse } from 'next/server';
import { bumpEpoch, getWorld } from '@/lib/store';
import { cachesInRegion } from '@/game/drops';
import { isLive, vaultBalance } from '@/lib/chain';

export const dynamic = 'force-dynamic';

/**
 * Operator endpoint: report what a region currently holds, and reseed the map.
 *
 * Reseeding bumps the epoch, which invalidates every previous cache id and
 * re-rolls the entire spawn table — the on-chain analogue is depositing a new
 * tranche of Stock Tokens into the vault before the new epoch opens.
 */
export async function GET(req: Request) {
  const key = req.headers.get('x-admin-key');
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const url = new URL(req.url);
  const x = Math.round(Number(url.searchParams.get('x')) || 0);
  const y = Math.round(Number(url.searchParams.get('y')) || 0);
  const r = Math.min(160, Math.max(8, Math.round(Number(url.searchParams.get('r')) || 64)));

  const world = await getWorld();
  const caches = cachesInRegion(x - r, y - r, x + r, y + r, world.spawnSeed, world.epoch);
  const byTicker = new Map<string, { count: number; shares: number; usd: number }>();
  for (const c of caches) {
    const row = byTicker.get(c.ticker) ?? { count: 0, shares: 0, usd: 0 };
    row.count += 1;
    row.shares += c.fragment;
    row.usd += c.notionalUsd;
    byTicker.set(c.ticker, row);
  }

  const manifest = await Promise.all(
    [...byTicker.entries()].map(async ([ticker, row]) => ({
      ticker,
      caches: row.count,
      sharesRequired: Number(row.shares.toPrecision(8)),
      notionalUsd: Number(row.usd.toFixed(2)),
      vaultBalance: await vaultBalance(ticker),
    })),
  );

  return NextResponse.json({
    epoch: world.epoch,
    region: { x, y, r },
    totalCaches: caches.length,
    live: isLive(),
    manifest: manifest.sort((a, b) => b.notionalUsd - a.notionalUsd),
  });
}

export async function POST(req: Request) {
  const key = req.headers.get('x-admin-key');
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { depositedUsd?: number };
  const world = await bumpEpoch(Number(body.depositedUsd) || 0);
  return NextResponse.json({ epoch: world.epoch, seededUsd: world.seededUsd });
}
