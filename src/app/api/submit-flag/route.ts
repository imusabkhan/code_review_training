import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPlayerName } from '@/lib/playerSession';
import { isChallengeTimerExpired } from '@/lib/challengeTimerExpired';

export async function POST(req: NextRequest) {
  try {
    const { challengeId, flag } = await req.json();

    if (!challengeId || !flag) {
      return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });
    }

    // Identity comes from the signed session cookie, never the request body —
    // otherwise anyone could submit a known flag under another player's name.
    const name = await getPlayerName(req);
    if (!name) {
      return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 });
    }

    // Challenge, lock, timer-expiry, and already-solved are independent reads —
    // fetch them together instead of sequentially (same pattern as
    // submit-challenge). This route is on the hot path (every flag submit),
    // and each extra round trip to the DB is directly felt as UI lag.
    const [challenge, lock, timerExpired, existing] = await Promise.all([
      prisma.challenge.findUnique({ where: { id: challengeId } }),
      prisma.challengeLock.findUnique({ where: { id: challengeId } }),
      isChallengeTimerExpired(challengeId),
      prisma.flagSubmission.findFirst({ where: { userName: name, challengeId, correct: true } }),
    ]);

    if (!challenge) {
      return NextResponse.json({ success: false, error: 'Challenge not found' }, { status: 404 });
    }

    // Check if challenge has a flag property (for challenges created via admin panel)
    let expectedFlag = challenge.flag ?? undefined;

    // If no flag in challenge object, try environment variable
    if (!expectedFlag) {
      const envVarName = `FLAG_${challengeId}`;
      expectedFlag = process.env[envVarName];
      console.log('Looking for flag in env var:', envVarName, 'Found:', expectedFlag ? 'yes' : 'no');
    }

    if (!expectedFlag) {
      return NextResponse.json({
        success: false,
        error: `Flag for challenge ${challengeId} not found. Please set FLAG_${challengeId} environment variable or add flag to challenge.`
      }, { status: 500 });
    }

    if (lock && lock.locked) {
      return NextResponse.json({ success: false, error: 'Challenge is locked' }, { status: 423 });
    }
    // Enforced server-side, not just a disabled button — the leaderboard is shared,
    // so a submission after time's up would be an unfair advantage over everyone
    // who worked within the window.
    if (timerExpired) {
      return NextResponse.json({ success: false, error: "Time's up for this challenge — submissions are closed." }, { status: 423 });
    }

    if (existing) {
      // Already solved
      const user = await prisma.leaderboardUser.findUnique({ where: { name } });
      return NextResponse.json({ success: true, correct: true, alreadySolved: true, score: user?.score ?? 0 });
    }

    // Check flag
    const correct = flag.trim() === expectedFlag.trim();
    console.log('Flag check:', { submitted: flag.trim(), expected: expectedFlag.trim(), correct });

    // Recording the submission and reading/updating the leaderboard touch
    // different rows — run them together instead of one after the other.
    let score = 0;
    if (correct) {
      const [, user] = await Promise.all([
        prisma.flagSubmission.create({ data: { userName: name, challengeId, flag, correct: true } }),
        prisma.leaderboardUser.upsert({
          where: { name },
          update: { score: { increment: 5 } },
          create: { name, score: 5, avatar: "" },
        }),
      ]);
      score = user.score;
    } else {
      const [, user] = await Promise.all([
        prisma.flagSubmission.create({ data: { userName: name, challengeId, flag, correct: false } }),
        prisma.leaderboardUser.findUnique({ where: { name } }),
      ]);
      score = user?.score ?? 0;
    }

    return NextResponse.json({ success: true, correct, alreadySolved: false, score });
  } catch (error) {
    console.error('Error in flag submission:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
} 