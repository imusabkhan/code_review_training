import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { PlayerChallenge } from '@/types/challenge';

// Public, unauthenticated. Never include vulnerableLines, explanations, or flag here —
// those are the answer key and must only be revealed via a real submission
// (see /api/submit-challenge and /api/submit-flag).
export async function GET() {
  try {
    const rows = await prisma.challenge.findMany();
    const publicChallenges: PlayerChallenge[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      code: row.code,
      difficulty: row.difficulty as PlayerChallenge['difficulty'],
      hints: row.hints ? JSON.parse(row.hints) : undefined,
      labUrl: row.labUrl ?? undefined,
      maxSelectableLines: row.maxSelectableLines ?? undefined,
    }));
    return NextResponse.json(publicChallenges);
  } catch (error) {
    console.error('Error fetching challenges:', error);
    return NextResponse.json({ error: 'Failed to fetch challenges' }, { status: 500 });
  }
}
