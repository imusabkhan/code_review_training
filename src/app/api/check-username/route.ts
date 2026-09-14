import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { username } = await request.json();
    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
    }
    const user = await prisma.leaderboardUser.findUnique({
      where: { name: username },
    });
    return NextResponse.json({ available: !user });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
} 