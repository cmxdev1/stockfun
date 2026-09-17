import { NextResponse } from 'next/server';
import { cachesInRegion, toSignal } from '@/game/drops';
import { claimedIdsIn, getWorld, verifySecret } from '@/lib/store';

export const dynamic = 'force-dynamic';

const MAX_RADIUS = 34;

/**
 * The scanner endpoint.
 *
 * Caches are derived from a server-secret spawn seed, so this is the only way
 * a client can learn where loot is — and it only ever returns the blurred
 * signal (rarity + sector), never the ticker or the fragment size.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const x = Math.round(Number(url.searchParams.get('x')));
  const y = Math.round(Number(url.searchParams.get('y')));
  const r = Math.min(MAX_RADIUS, Math.max(4, Math.round(Number(url.searchParams.get('r')) || 26)));
  const id = url.searchParams.get('playerId') ?? '';
  const secret = url.searchParams.get('secret') ?? '';

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return NextResponse.json({ error: 'bad coordinates' }, { status: 400 });
  }
  if (!(await verifySecret(id, secret))) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
  }

  const world = await getWorld();
  const caches = cachesInRegion(x - r, y - r, x + r, y + r, world.spawnSeed, world.epoch);

  // Circular cull so the scan ring in the UI matches what it actually finds.
  const inRange = caches.filter((c) => Math.hypot(c.x - x, c.y - y) <= r);
  const claimed = await claimedIdsIn(inRange.map((c) => c.id));

  return NextResponse.json({
    origin: { x, y },
    radius: r,
    epoch: world.epoch,
    signals: inRange.map((c) => toSignal(c, claimed.has(c.id))),
  });
}
