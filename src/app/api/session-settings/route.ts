import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public, read-only — the welcome screen needs this before anyone is signed in.
export async function GET() {
  const settings = await prisma.sessionSettings.findUnique({ where: { id: 'default' } });
  return NextResponse.json({
    title: settings?.title ?? null,
    logoUrl: settings?.logoUrl ?? null,
  });
}
