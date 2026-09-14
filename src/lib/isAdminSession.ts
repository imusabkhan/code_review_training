import { NextRequest } from 'next/server';
import { getIronSession, SessionOptions } from 'iron-session';

const SESSION_COOKIE = 'admin_session';
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'complex_password_at_least_32_characters_long';

export const sessionOptions: SessionOptions = {
  cookieName: SESSION_COOKIE,
  password: SESSION_SECRET,
  cookieOptions: {
    maxAge: 60 * 60 * 24, // 1 day
    httpOnly: true,
    // The default Docker/README deployment serves plain http with no TLS termination.
    // A `secure` cookie would be silently dropped by the browser there, so this stays
    // false unless ADMIN_SESSION_SECURE_COOKIE is explicitly set (e.g. behind HTTPS).
    secure: process.env.ADMIN_SESSION_SECURE_COOKIE === 'true',
    sameSite: 'lax' as const,
  },
};

type AdminSession = {
  isAdmin?: boolean;
};

export async function isAdminSession(request: NextRequest) {
  try {
    // request.cookies.get() already returns the {name, value} shape iron-session's
    // CookieStore expects — no custom adapter needed. (`set`'s type differs slightly
    // and is irrelevant here since we never write through this read-only session.)
    const session = await getIronSession<AdminSession>(request.cookies as any, sessionOptions);
    return !!session.isAdmin;
  } catch (error) {
    console.error('[ADMIN-SESSION] Error checking admin session:', error);
    return false;
  }
}