import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET: Return leaderboard (top users by score)
// There is deliberately no POST here — scores are only ever changed as a side
// effect of a verified correct submission in /api/submit-challenge and
// /api/submit-flag. A direct score-write endpoint would let anyone set any
// player's score to anything.
export async function GET() {
  const users = await prisma.leaderboardUser.findMany({
    orderBy: { score: 'desc' },
    take: 10,
  });
  return NextResponse.json(users);
}
