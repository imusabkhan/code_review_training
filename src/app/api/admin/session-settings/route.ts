import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminSession } from '@/lib/isAdminSession';

export async function GET(request: NextRequest) {
  if (!(await isAdminSession(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const settings = await prisma.sessionSettings.findUnique({ where: { id: 'default' } });
  return NextResponse.json({
    title: settings?.title ?? '',
    logoUrl: settings?.logoUrl ?? '',
  });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminSession(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : '';
  const logoUrl = typeof body?.logoUrl === 'string' ? body.logoUrl.trim().slice(0, 2000) : '';

  await prisma.sessionSettings.upsert({
    where: { id: 'default' },
    update: { title: title || null, logoUrl: logoUrl || null },
    create: { id: 'default', title: title || null, logoUrl: logoUrl || null },
  });
  return NextResponse.json({ success: true });
}
