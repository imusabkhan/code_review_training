export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/isAdminSession';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

type AdminSession = {
  isAdmin?: boolean;
};

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const { password, logout } = body;

  const res = NextResponse.json({ success: true });
  const session = await getIronSession<AdminSession>(request, res, sessionOptions);

  if (logout) {
    session.destroy();
    await session.save();
    return res;
  }

  if (!password) {
    return NextResponse.json({ success: false, error: 'Missing password' }, { status: 400 });
  }
  if (password === ADMIN_PASSWORD) {
    session.isAdmin = true;
    await session.save();
    return res;
  } else {
    return NextResponse.json({ success: false, error: 'Incorrect password' }, { status: 401 });
  }
}

export async function GET(request: NextRequest) {
  const session = await getIronSession<AdminSession>(request.cookies as any, sessionOptions);
  return NextResponse.json({ authenticated: !!session.isAdmin });
}
