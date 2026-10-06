import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPlayerName } from '@/lib/playerSession';
import { MAX_CHALLENGE_ATTEMPTS } from '@/lib/constants';

export async function POST(req: NextRequest) {
  const { avatar, challengeId, selectedLines } = await req.json();
  if (
    typeof avatar !== 'string' ||
    typeof challengeId !== 'string' ||
    !Array.isArray(selectedLines) ||
    !selectedLines.every((n) => typeof n === 'number')
  ) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Identity comes from the signed session cookie, never the request body —
  // otherwise anyone could submit (or burn attempts) under another player's name.
  const name = await getPlayerName(req);
  if (!name) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  // Challenge + lock are independent reads — fetch them together instead of
  // sequentially. This route is on the hot path (every submit), and each extra
  // round trip to the DB is directly felt as UI lag.
  const [challengeRow, lock] = await Promise.all([
    prisma.challenge.findUnique({ where: { id: challengeId } }),
    prisma.challengeLock.findUnique({ where: { id: challengeId } }),
  ]);
  if (!challengeRow) {
    return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  }
  if (lock && lock.locked) {
    return NextResponse.json({ error: 'Challenge is locked' }, { status: 423 });
  }
  const vulnerableLines: number[] = JSON.parse(challengeRow.vulnerableLines);
  const explanations: Record<number, string> = JSON.parse(challengeRow.explanations);

  // Enforce maxSelectableLines
  if (typeof challengeRow.maxSelectableLines === 'number' && selectedLines.length > challengeRow.maxSelectableLines) {
    return NextResponse.json({ error: `You can select at most ${challengeRow.maxSelectableLines} lines for this challenge.` }, { status: 400 });
  }

  // Validate the answer: all and only vulnerable lines must be selected
  const vulnerableSet = new Set(vulnerableLines);
  const allCorrect =
    selectedLines.length === vulnerableLines.length &&
    selectedLines.every((line) => vulnerableSet.has(line));

  // Per-line feedback (only for selected lines)
  const feedback = selectedLines.map((line) => {
    if (vulnerableSet.has(line)) return { line, status: 'correct' };
    return { line, status: 'incorrect' };
  });

  // Already-solved check (only relevant if this submission would otherwise score) and
  // the attempts count are independent reads — run them together.
  const [alreadySolved, attempts] = await Promise.all([
    allCorrect
      ? prisma.challengeSubmission.findFirst({ where: { userName: name, challengeId, correct: true } })
      : Promise.resolve(null),
    prisma.challengeSubmission.count({ where: { userName: name, challengeId } }),
  ]);
  if (allCorrect && alreadySolved) {
    return NextResponse.json({ error: 'Challenge already solved', alreadySolved: true }, { status: 403 });
  }

  const maxAttempts = MAX_CHALLENGE_ATTEMPTS;
  if (attempts >= maxAttempts) {
    return NextResponse.json({
      error: 'No attempts remaining',
      attemptsUsed: attempts,
      attemptsRemaining: 0,
    }, { status: 403 });
  }

  // Store the submission and update the leaderboard in parallel — different tables,
  // neither depends on the other's result. (No extra re-count needed afterward: we
  // already know exactly one more submission now exists for this user/challenge.)
  const [, user] = await Promise.all([
    prisma.challengeSubmission.create({
      data: {
        userName: name,
        challengeId,
        selectedLines: JSON.stringify(selectedLines),
        correct: allCorrect,
      },
    }),
    allCorrect
      ? prisma.leaderboardUser.upsert({
          where: { name },
          update: { score: { increment: 1 }, avatar },
          create: { name, avatar, score: 1 },
        })
      : prisma.leaderboardUser.upsert({
          where: { name },
          update: { avatar },
          create: { name, avatar, score: 0 },
        }),
  ]);
  const attemptsAfter = attempts + 1;

  return NextResponse.json({
    correct: allCorrect,
    score: user.score,
    attemptsUsed: attemptsAfter,
    attemptsRemaining: Math.max(0, maxAttempts - attemptsAfter),
    feedback,
    // Only reveal the answer key once it's actually been earned.
    ...(allCorrect ? { vulnerableLines, explanations } : {}),
  });
}
