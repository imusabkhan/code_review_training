import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminSession } from '@/lib/isAdminSession';

export async function POST(request: NextRequest) {
  if (!(await isAdminSession(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await prisma.challengeSubmission.deleteMany();
    await prisma.flagSubmission.deleteMany();
    await prisma.leaderboardUser.deleteMany();
    await prisma.challengeLock.deleteMany();
    // Without this, a stale "expired" timer row from a demo/mock run would keep
    // blocking real submissions after the reset, even with everything else fresh.
    await prisma.challengeTimer.deleteMany();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to reset database' }, { status: 500 });
  }
} 