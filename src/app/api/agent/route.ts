import { NextResponse } from 'next/server';
import { updateAgent, verifySecret } from '@/lib/store';
import type { AgentConfig } from '@/game/types';

export const dynamic = 'force-dynamic';

const ARCHETYPES = new Set(['scout', 'digger', 'oracle', 'drifter']);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const id = String(body.playerId ?? '');
  const secret = String(body.secret ?? '');
  if (!(await verifySecret(id, secret))) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
  }

  const a = (body.agent ?? {}) as Record<string, unknown>;
  const archetype = String(a.archetype ?? 'scout');
  const name = String(a.name ?? '').trim().slice(0, 24);
  if (!name || !ARCHETYPES.has(archetype)) {
    return NextResponse.json({ error: 'Agent configuration is incomplete.' }, { status: 400 });
  }

  const agent: AgentConfig = {
    name,
    archetype: archetype as AgentConfig['archetype'],
    range: Math.min(1, Math.max(0, Number(a.range ?? 0.5))),
    greed: Math.min(1, Math.max(0, Number(a.greed ?? 0.5))),
    hue: Math.round(Math.min(360, Math.max(0, Number(a.hue ?? 190)))),
    autonomous: Boolean(a.autonomous),
  };

  const profile = await updateAgent(id, agent);
  if (!profile) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ profile });
}
