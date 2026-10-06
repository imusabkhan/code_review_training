import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/isAdminSession';
import { prisma } from '@/lib/prisma';
import type { Challenge as ChallengeRow } from '@/generated/prisma';
import type { Challenge } from '@/types/challenge';

// Admin-only. Returns/accepts the full challenge object, including answers and flags.
// Player-facing reads must go through /api/challenges instead.

function toChallenge(row: ChallengeRow): Challenge {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    code: row.code,
    vulnerableLines: JSON.parse(row.vulnerableLines),
    difficulty: row.difficulty as Challenge['difficulty'],
    hints: row.hints ? JSON.parse(row.hints) : undefined,
    explanations: JSON.parse(row.explanations),
    flag: row.flag ?? undefined,
    labUrl: row.labUrl ?? undefined,
    maxSelectableLines: row.maxSelectableLines ?? undefined,
    fixedCode: row.fixedCode ?? undefined,
    order: row.order,
  };
}

function toRow(challenge: Challenge) {
  return {
    id: challenge.id,
    title: challenge.title,
    description: challenge.description,
    code: challenge.code,
    vulnerableLines: JSON.stringify(challenge.vulnerableLines),
    difficulty: challenge.difficulty,
    hints: challenge.hints ? JSON.stringify(challenge.hints) : null,
    explanations: JSON.stringify(challenge.explanations),
    flag: challenge.flag ?? null,
    labUrl: challenge.labUrl ?? null,
    maxSelectableLines: challenge.maxSelectableLines ?? null,
    fixedCode: challenge.fixedCode ?? null,
    order: challenge.order ?? 0,
  };
}

// GET: Return all challenges (full data, admin only)
export async function GET(req: NextRequest) {
  if (!(await isAdminSession(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const rows = await prisma.challenge.findMany({ orderBy: [{ order: 'asc' }, { id: 'asc' }] });
    return NextResponse.json(rows.map(toChallenge));
  } catch (error) {
    console.error('Error fetching challenges:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Create a new challenge
export async function POST(req: NextRequest) {
  if (!(await isAdminSession(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const challenge: Challenge = await req.json();

    if (!challenge.id || !challenge.title || !challenge.code || !challenge.vulnerableLines) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const existing = await prisma.challenge.findUnique({ where: { id: challenge.id } });
    if (existing) {
      return NextResponse.json({ error: 'Challenge with this ID already exists' }, { status: 409 });
    }

    // Default new challenges to the end of the sequence unless an order was set explicitly
    if (typeof challenge.order !== 'number') {
      const last = await prisma.challenge.findFirst({ orderBy: { order: 'desc' } });
      challenge.order = (last?.order ?? -1) + 1;
    }

    const row = await prisma.challenge.create({ data: toRow(challenge) });
    return NextResponse.json(toChallenge(row), { status: 201 });
  } catch (error) {
    console.error('Error creating challenge:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT: Update an existing challenge
export async function PUT(req: NextRequest) {
  if (!(await isAdminSession(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const challenge: Challenge = await req.json();

    if (!challenge.id || !challenge.title || !challenge.code || !challenge.vulnerableLines) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const existing = await prisma.challenge.findUnique({ where: { id: challenge.id } });
    if (!existing) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    const row = await prisma.challenge.update({ where: { id: challenge.id }, data: toRow(challenge) });
    return NextResponse.json(toChallenge(row));
  } catch (error) {
    console.error('Error updating challenge:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Delete a challenge
export async function DELETE(req: NextRequest) {
  if (!(await isAdminSession(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Challenge ID is required' }, { status: 400 });
    }

    if (id === 'DEMO') {
      return NextResponse.json({ error: 'Cannot delete DEMO challenge' }, { status: 403 });
    }

    const existing = await prisma.challenge.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    await prisma.challenge.delete({ where: { id } });
    return NextResponse.json({ message: 'Challenge deleted successfully', challenge: toChallenge(existing) });
  } catch (error) {
    console.error('Error deleting challenge:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
