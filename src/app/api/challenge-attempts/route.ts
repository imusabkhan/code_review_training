import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPlayerName } from '@/lib/playerSession';
import { MAX_CHALLENGE_ATTEMPTS } from '@/lib/constants';

export async function POST(request: NextRequest) {
  try {
    const { challengeId } = await request.json();
    if (!challengeId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }
    const name = await getPlayerName(request);
    if (!name) {
      return NextResponse.json({ attemptsUsed: 0, attemptsRemaining: MAX_CHALLENGE_ATTEMPTS });
    }
    const attemptsUsed = await prisma.challengeSubmission.count({
      where: { userName: name, challengeId },
    });
    const attemptsRemaining = Math.max(0, MAX_CHALLENGE_ATTEMPTS - attemptsUsed);
    return NextResponse.json({ attemptsUsed, attemptsRemaining });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
