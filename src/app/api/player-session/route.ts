import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { playerSessionOptions } from '@/lib/playerSession';

const AVATARS = ["🦊", "🐻", "🐼", "🐸", "🐵", "🐶", "🐱", "🦁", "🐯", "🐨", "🐰", "🦄", "🐙", "🐧", "🐢", "🐦", "🐝", "🐬", "🦋", "🐞"];
function getRandomAvatar() {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

type PlayerSessionData = { name?: string; email?: string };

// GET: who does this browser's session cookie say we are (if anyone), plus
// their current score looked up directly (not from the top-10 leaderboard,
// which would incorrectly show 0 for anyone outside the top 10).
export async function GET(request: NextRequest) {
  const session = await getIronSession<PlayerSessionData>(request.cookies as any, playerSessionOptions);
  if (!session.name) {
    return NextResponse.json({ name: null });
  }
  const user = await prisma.leaderboardUser.findUnique({ where: { name: session.name } });
  return NextResponse.json({
    name: session.name,
    avatar: user?.avatar ?? '',
    score: user?.score ?? 0,
  });
}

// POST: redeem an admin-issued invite code for this browser. This is the only
// place a player's identity is ever established — every other endpoint trusts
// the resulting session cookie, never a client-supplied name. The display name
// is never typed by the player; it's derived server-side from the email the
// code was issued to, so there's no free-text name to squat or pollute the
// leaderboard with.
export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!code) {
    return NextResponse.json({ error: 'Enter your invite code' }, { status: 400 });
  }

  const invited = await prisma.invitedPlayer.findUnique({ where: { code } });
  if (!invited) {
    return NextResponse.json({ error: 'Invalid code. Please check and try again.' }, { status: 401 });
  }

  // Redeeming the same code again (new device, cleared cookies, page refresh
  // before the GET sync ran) resumes the same identity and score rather than
  // erroring — the name is deterministic per email, so this is always safe.
  const existingUser = await prisma.leaderboardUser.findUnique({ where: { name: invited.name } });
  let avatar = existingUser?.avatar ?? getRandomAvatar();
  let score = existingUser?.score ?? 0;
  if (!existingUser) {
    try {
      await prisma.leaderboardUser.create({ data: { name: invited.name, avatar, score: 0, email: invited.email } });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        // Lost a race with a concurrent redemption of the same code — the row
        // now exists, just use what it actually ended up with.
        const row = await prisma.leaderboardUser.findUnique({ where: { name: invited.name } });
        avatar = row?.avatar ?? avatar;
        score = row?.score ?? score;
      } else {
        throw error;
      }
    }
  }

  const res = NextResponse.json({ success: true, name: invited.name, avatar, score });
  const session = await getIronSession<PlayerSessionData>(request, res, playerSessionOptions);
  session.name = invited.name;
  session.email = invited.email;
  await session.save();
  return res;
}
