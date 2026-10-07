import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPlayerName } from '@/lib/playerSession';
import { MAX_CHALLENGE_ATTEMPTS } from '@/lib/constants';

// Returns this player's attempt counts for every challenge they've touched, in
// ONE query — lets the client show a correct "Attempts: N" the instant a
// challenge is opened, instead of a network round trip (and a visible loading
// state) per challenge selection. Challenges with no entry here simply have
// zero attempts used, which doesn't need a query to know.
export async function GET(req: NextRequest) {
  const name = await getPlayerName(req);
  if (!name) {
    return NextResponse.json({});
  }
  const grouped = await prisma.challengeSubmission.groupBy({
    by: ['challengeId'],
    where: { userName: name },
    _count: { _all: true },
  });
  const result: Record<string, { attemptsUsed: number; attemptsRemaining: number }> = {};
  for (const row of grouped) {
    const attemptsUsed = row._count._all;
    result[row.challengeId] = {
      attemptsUsed,
      attemptsRemaining: Math.max(0, MAX_CHALLENGE_ATTEMPTS - attemptsUsed),
    };
  }
  return NextResponse.json(result);
}
