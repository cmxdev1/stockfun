import { NextResponse } from 'next/server';
import { leaderboard } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get('limit') ?? 20);
  const rows = await leaderboard(Math.min(Math.max(limit, 1), 100));
  return NextResponse.json({ rows });
}
