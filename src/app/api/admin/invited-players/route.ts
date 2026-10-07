import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminSession } from '@/lib/isAdminSession';
import { deriveNameFromEmail, generateInviteCode, parseEmailList } from '@/lib/inviteCode';

export async function GET(request: NextRequest) {
  if (!(await isAdminSession(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const players = await prisma.invitedPlayer.findMany({ orderBy: { createdAt: 'asc' } });
  return NextResponse.json(players);
}

// Adds new invited players from a pasted blob of emails. Existing emails are
// left untouched — re-pasting the same list (e.g. to add a couple more
// people) must not rotate anyone's code or they'd lose access mid-session.
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
  const raw = typeof body?.emails === 'string' ? body.emails : '';
  const emails = parseEmailList(raw);
  if (emails.length === 0) {
    return NextResponse.json({ error: 'No valid email addresses found' }, { status: 400 });
  }

  const existing = await prisma.invitedPlayer.findMany({
    where: { email: { in: emails } },
    select: { email: true },
  });
  const existingSet = new Set(existing.map((e) => e.email));
  const toCreate = emails.filter((e) => !existingSet.has(e));

  const existingCodes = new Set((await prisma.invitedPlayer.findMany({ select: { code: true } })).map((p) => p.code));
  const rows = toCreate.map((email) => {
    let code = generateInviteCode();
    while (existingCodes.has(code)) code = generateInviteCode();
    existingCodes.add(code);
    return { email, name: deriveNameFromEmail(email), code };
  });

  if (rows.length > 0) {
    await prisma.invitedPlayer.createMany({ data: rows });
  }

  const players = await prisma.invitedPlayer.findMany({ orderBy: { createdAt: 'asc' } });
  return NextResponse.json({ created: rows.length, skipped: emails.length - rows.length, players });
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdminSession(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }
  await prisma.invitedPlayer.deleteMany({ where: { id } });
  return NextResponse.json({ success: true });
}
