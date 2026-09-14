import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPlayerName } from '@/lib/playerSession';

export async function POST(request: NextRequest) {
  try {
    const { challengeId } = await request.json();
    if (!challengeId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }
    const name = await getPlayerName(request);
    if (!name) {
      return NextResponse.json({ solved: false });
    }
    const solved = await prisma.challengeSubmission.findFirst({
      where: {
        userName: name,
        challengeId,
        correct: true,
      },
    });
    return NextResponse.json({ solved: !!solved });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
