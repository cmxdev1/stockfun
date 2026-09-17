import { randomBytes, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { findProfileByWallet, getProfile, levelFromXp, upsertProfile, verifySecret } from '@/lib/store';
import { isAddress } from '@/lib/chain';
import { spawnForWallet } from '@/game/sites';
import type { AgentConfig, PlayerProfile } from '@/game/types';

export const dynamic = 'force-dynamic';

const ARCHETYPES = new Set(['scout', 'digger', 'oracle', 'drifter']);

function sanitiseAgent(input: unknown): AgentConfig | null {
  if (!input || typeof input !== 'object') return null;
  const a = input as Record<string, unknown>;
  const name = String(a.name ?? '').trim().slice(0, 24);
  const archetype = String(a.archetype ?? 'scout');
  if (!name || !ARCHETYPES.has(archetype)) return null;
  return {
    name,
    archetype: archetype as AgentConfig['archetype'],
    range: Math.min(1, Math.max(0, Number(a.range ?? 0.5))),
    greed: Math.min(1, Math.max(0, Number(a.greed ?? 0.5))),
    hue: Math.round(Math.min(360, Math.max(0, Number(a.hue ?? 190)))),
    autonomous: Boolean(a.autonomous),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const secret = url.searchParams.get('secret');
  if (!id || !secret) return NextResponse.json({ error: 'missing credentials' }, { status: 400 });
  if (!(await verifySecret(id, secret))) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
  }
  const profile = await getProfile(id);
  if (!profile) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({
    profile,
    level: levelFromXp(profile.xp),
    spawn: spawnForWallet(profile.wallet),
  });
}

/** Create a prospector, or re-issue credentials for a wallet already enrolled. */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const handle = String(body.handle ?? '').trim().slice(0, 20);
  const wallet = String(body.wallet ?? '').trim();
  const agent = sanitiseAgent(body.agent);

  if (handle.length < 3) {
    return NextResponse.json({ error: 'Handle needs at least 3 characters.' }, { status: 400 });
  }
  if (!isAddress(wallet)) {
    return NextResponse.json({ error: 'That is not a valid wallet address.' }, { status: 400 });
  }
  if (!agent) {
    return NextResponse.json({ error: 'Agent configuration is incomplete.' }, { status: 400 });
  }

  const existing = await findProfileByWallet(wallet);
  const secret = randomBytes(24).toString('hex');

  const profile: PlayerProfile = existing
    ? { ...existing, handle, agent }
    : {
        id: randomUUID(),
        handle,
        wallet: wallet as `0x${string}`,
        agent,
        createdAt: Date.now(),
        distance: 0,
        xp: 0,
        claims: 0,
        notionalUsd: 0,
      };

  await upsertProfile(profile, secret);

  return NextResponse.json({
    profile,
    secret,
    level: levelFromXp(profile.xp),
    spawn: spawnForWallet(profile.wallet),
    returning: Boolean(existing),
  });
}
