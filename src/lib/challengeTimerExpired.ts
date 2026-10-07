import { prisma } from '@/lib/prisma';

// Authoritative "is this challenge's timer actually expired" check, used by
// submit-challenge and submit-flag to enforce the deadline server-side — not
// just via a disabled button, which anyone could bypass with a direct request.
//
// - No row at all: a timer was never started for this challenge — open/untimed,
//   never expired. (Matches the rest of the app treating "No Timer" as an
//   unrestricted practice state, not a blocked one.)
// - Paused: frozen, not expired — admin deliberately put it on hold.
// - Running: expired once wall-clock time has passed startTime + duration.
export async function isChallengeTimerExpired(challengeId: string): Promise<boolean> {
  const timer = await prisma.challengeTimer.findUnique({ where: { id: challengeId } });
  if (!timer || timer.isPaused || !timer.isRunning) return false;
  return Date.now() >= timer.startTime.getTime() + timer.duration;
}
