import { NextRequest } from 'next/server';
import { getIronSession, SessionOptions } from 'iron-session';

const SESSION_COOKIE = 'player_session';
const SESSION_SECRET =
  process.env.PLAYER_SESSION_SECRET || 'another_complex_password_at_least_32_characters_long';

export const playerSessionOptions: SessionOptions = {
  cookieName: SESSION_COOKIE,
  password: SESSION_SECRET,
  cookieOptions: {
    maxAge: 60 * 60 * 24 * 2, // 2 days — long enough to span a training session
    httpOnly: true,
    secure: process.env.ADMIN_SESSION_SECURE_COOKIE === 'true',
    sameSite: 'lax' as const,
  },
};

type PlayerSessionData = {
  name?: string;
};

// The player's display name as bound to THIS browser by a real signed cookie —
// never trust a `name` field from the request body for anything that affects
// score, attempts, or solved-state, or any player can impersonate any other
// player just by knowing their (public, leaderboard-visible) name.
export async function getPlayerName(request: NextRequest): Promise<string | null> {
  try {
    const session = await getIronSession<PlayerSessionData>(request.cookies as any, playerSessionOptions);
    return session.name ?? null;
  } catch (error) {
    console.error('[PLAYER-SESSION] Error reading player session:', error);
    return null;
  }
}
