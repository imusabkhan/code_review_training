import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/isAdminSession';
import { prisma } from '@/lib/prisma';

// Admin-only. Mirrors the socket server's timer broadcast into the DB — see
// ChallengeTimer in schema.prisma for why this exists. Called by AdminPanel's
// existing timer:update socket listener on every start/pause/resume/reset, with
// the exact same payload that was just broadcast, so there's one source of truth
// for "what state is this timer in" rather than re-deriving it in two places.
export async function POST(req: NextRequest) {
  if (!(await isAdminSession(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { challengeId, startTime, duration, isRunning, isPaused } = body ?? {};
  if (typeof challengeId !== 'string' || !challengeId) {
    return NextResponse.json({ error: 'challengeId is required' }, { status: 400 });
  }

  if (!isRunning && !isPaused) {
    // Reset/cleared — back to "No Timer", which is the same as no row at all.
    await prisma.challengeTimer.deleteMany({ where: { id: challengeId } });
    return NextResponse.json({ cleared: true });
  }

  if (typeof startTime !== 'number' || typeof duration !== 'number') {
    return NextResponse.json({ error: 'startTime and duration must be numbers' }, { status: 400 });
  }

  await prisma.challengeTimer.upsert({
    where: { id: challengeId },
    update: { startTime: new Date(startTime), duration, isRunning: !!isRunning, isPaused: !!isPaused },
    create: { id: challengeId, startTime: new Date(startTime), duration, isRunning: !!isRunning, isPaused: !!isPaused },
  });
  return NextResponse.json({ success: true });
}
