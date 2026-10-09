import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminSession } from '@/lib/isAdminSession';

// Called by the admin dashboard's own browser session when a challenge's timer
// runs out — pacing is admin-driven (see the lock:update live-sync work), so
// this is what actually moves the group forward automatically instead of
// requiring a manual unlock click for every lab. Looks up "next" by `order`,
// not array position, since that's the one authoritative sequence.
export async function POST(request: NextRequest) {
  if (!(await isAdminSession(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const challengeId = typeof body?.challengeId === 'string' ? body.challengeId : '';
  if (!challengeId) {
    return NextResponse.json({ error: 'challengeId is required' }, { status: 400 });
  }

  const current = await prisma.challenge.findUnique({ where: { id: challengeId } });
  if (!current) {
    return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  }

  const next = await prisma.challenge.findFirst({
    where: { order: { gt: current.order } },
    orderBy: { order: 'asc' },
  });
  if (!next) {
    return NextResponse.json({ unlocked: false, reason: 'no-next-challenge' });
  }

  await prisma.challengeLock.upsert({
    where: { id: next.id },
    update: { locked: false },
    create: { id: next.id, locked: false },
  });

  return NextResponse.json({ unlocked: true, nextChallengeId: next.id });
}
