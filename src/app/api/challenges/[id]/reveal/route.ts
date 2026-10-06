import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public, unauthenticated, but deliberately NOT part of the bulk /api/challenges
// list — fetched on demand only once lab time is up (or an admin broadcast),
// so the walkthrough content can't be spoiled by glancing at the initial
// page-load network traffic. Covers everything the post-timer carousel needs:
// the exact vulnerable lines + their explanations, and the patched code.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const challenge = await prisma.challenge.findUnique({ where: { id } });
  if (!challenge) {
    return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  }
  return NextResponse.json({
    vulnerableLines: JSON.parse(challenge.vulnerableLines),
    explanations: JSON.parse(challenge.explanations),
    fixedCode: challenge.fixedCode ?? null,
  });
}
