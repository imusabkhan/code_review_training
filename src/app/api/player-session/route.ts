import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { playerSessionOptions } from '@/lib/playerSession';

type PlayerSessionData = { name?: string };

// GET: who does this browser's session cookie say we are (if anyone), plus
// their current score looked up directly (not from the top-10 leaderboard,
// which would incorrectly show 0 for anyone outside the top 10).
export async function GET(request: NextRequest) {
  const session = await getIronSession<PlayerSessionData>(request.cookies as any, playerSessionOptions);
  if (!session.name) {
    return NextResponse.json({ name: null });
  }
  const user = await prisma.leaderboardUser.findUnique({ where: { name: session.name } });
  return NextResponse.json({
    name: session.name,
    avatar: user?.avatar ?? '',
    score: user?.score ?? 0,
  });
}

// POST: claim a display name for this browser. This is the only place a
// player's identity is ever established — every other endpoint trusts the
// resulting session cookie, never a client-supplied `name` field.
export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const avatar = typeof body.avatar === 'string' ? body.avatar : '';
  if (!name || name.length > 40) {
    return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
  }

  const res = NextResponse.json({ success: true });
  const session = await getIronSession<PlayerSessionData>(request, res, playerSessionOptions);

  if (session.name === name) {
    // Re-affirming the same identity (e.g. page reload) — nothing to change.
    return res;
  }

  try {
    await prisma.leaderboardUser.create({ data: { name, avatar, score: 0 } });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
    }
    console.error('Error claiming player name:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  session.name = name;
  await session.save();
  return res;
}
