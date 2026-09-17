import { NextResponse } from 'next/server';
import { cacheAt, parseCacheId, RARITIES, tileDistance } from '@/game/drops';
import { explorerTxUrl, payoutFragment } from '@/lib/chain';
import { verifyPow } from '@/lib/pow';
import {
  checkAndRecordPosition,
  claimsSince,
  expireStaleReservations,
  getProfile,
  getWorld,
  isCacheClaimed,
  releaseClaim,
  reserveClaim,
  settleClaim,
  verifySecret,
  xpForClaim,
} from '@/lib/store';

export const dynamic = 'force-dynamic';

const CLAIMS_PER_MINUTE = 12;

/**
 * The claim server.
 *
 * Mirrors the Touch Grass model: the map never hands the client anything of
 * value, and a payout only happens after the server independently re-derives
 * the cache, checks you could plausibly be standing on it, checks nobody has
 * taken it, verifies the proof-of-effort, and then releases the fragment from
 * the vault. The ledger write happens before the transfer is reported so a
 * cache can never pay out twice.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });

  const playerId = String(body.playerId ?? '');
  const secret = String(body.secret ?? '');
  const cacheId = String(body.cacheId ?? '');
  const nonce = Number(body.nonce);
  const px = Math.round(Number(body.x));
  const py = Math.round(Number(body.y));

  if (!(await verifySecret(playerId, secret))) {
    return NextResponse.json({ ok: false, error: 'Invalid session. Re-link your wallet.' }, { status: 401 });
  }

  const profile = await getProfile(playerId);
  if (!profile) {
    return NextResponse.json({ ok: false, error: 'Prospector not found.' }, { status: 404 });
  }

  const parsed = parseCacheId(cacheId);
  if (!parsed) {
    return NextResponse.json({ ok: false, error: 'Malformed cache id.' }, { status: 400 });
  }

  const world = await getWorld();
  if (parsed.epoch !== world.epoch) {
    return NextResponse.json(
      { ok: false, error: 'That cache belongs to a previous seeding epoch.' },
      { status: 409 },
    );
  }

  // Re-derive the cache from the secret spawn seed. The client's claim about
  // what is buried here is never trusted.
  const cache = cacheAt(parsed.x, parsed.y, world.spawnSeed, world.epoch);
  if (!cache) {
    return NextResponse.json({ ok: false, error: 'Nothing is buried there.' }, { status: 404 });
  }

  if (!Number.isFinite(px) || !Number.isFinite(py) || tileDistance(px, py, cache.x, cache.y) > 1) {
    return NextResponse.json(
      { ok: false, error: 'You have to be standing on the cache to open it.' },
      { status: 403 },
    );
  }

  const move = await checkAndRecordPosition(playerId, px, py);
  if (!move.ok) {
    return NextResponse.json({ ok: false, error: move.reason }, { status: 403 });
  }

  if ((await claimsSince(playerId, 60_000)) >= CLAIMS_PER_MINUTE) {
    return NextResponse.json(
      { ok: false, error: 'Slow down — too many claims in the last minute.' },
      { status: 429 },
    );
  }

  const difficulty = RARITIES[cache.rarity].difficulty;
  if (!Number.isFinite(nonce) || !verifyPow(cacheId, playerId, world.epoch, nonce, difficulty)) {
    return NextResponse.json(
      { ok: false, error: 'Excavation proof rejected. Keep digging.' },
      { status: 400 },
    );
  }

  await expireStaleReservations();

  const already = await isCacheClaimed(cacheId);
  if (already) {
    return NextResponse.json(
      { ok: false, error: 'Someone got here first — this cache is empty.' },
      { status: 409 },
    );
  }

  // Reserve before asking the vault for anything: two requests racing for the
  // same cache must not both trigger a transfer.
  const reservation = await reserveClaim({
    cacheId,
    playerId,
    wallet: profile.wallet,
    ticker: cache.ticker,
    fragment: cache.fragment,
    notionalUsd: cache.notionalUsd,
    rarity: cache.rarity,
    x: cache.x,
    y: cache.y,
    txHash: '',
    simulated: false,
    claimedAt: Date.now(),
  });
  if (!reservation.ok) {
    return NextResponse.json(
      { ok: false, error: 'Someone got here first — this cache is empty.' },
      { status: 409 },
    );
  }

  const payout = await payoutFragment(
    profile.wallet,
    cache.ticker,
    cache.fragment,
    `${cacheId}:${playerId}`,
  );

  if (payout.error) {
    // The vault never moved anything — hand the cache back to the map.
    await releaseClaim(cacheId);
    return NextResponse.json(
      { ok: false, error: `Vault transfer failed: ${payout.error}` },
      { status: 502 },
    );
  }

  await settleClaim(cacheId, payout.txHash, payout.simulated);

  return NextResponse.json({
    ok: true,
    ticker: cache.ticker,
    fragment: cache.fragment,
    notionalUsd: cache.notionalUsd,
    rarity: cache.rarity,
    txHash: payout.txHash,
    explorerUrl: payout.simulated ? null : explorerTxUrl(payout.txHash),
    simulated: payout.simulated,
    xp: xpForClaim(cache.rarity),
  });
}
