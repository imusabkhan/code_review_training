
import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle, XCircle, AlertTriangle, ArrowLeft, ArrowRight, Lightbulb, Lock, Unlock, ChevronLeft, ChevronRight } from "lucide-react"
import type { PlayerChallenge, ChallengeSummary } from "@/types/challenge"
import { MAX_CHALLENGE_ATTEMPTS } from "@/lib/constants"
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { io, Socket } from 'socket.io-client'

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4001';


function UserBar({ name, avatar, score }: { name: string; avatar: string; score: number }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-white/80 shadow rounded-full px-4 py-2 border border-gray-200">
      <span className="text-2xl select-none" aria-label="avatar">{avatar}</span>
      <span className="font-medium text-gray-800">{name}</span>
      <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">Score: {score}</span>
    </div>
  );
}

function CodeModal({ open, onSubmit, submitting, claimError }: { open: boolean; onSubmit: (code: string) => void; submitting?: boolean; claimError?: string }) {
  const [input, setInput] = useState("");
  const [branding, setBranding] = useState<{ title: string | null; logoUrl: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/session-settings")
      .then((res) => res.json())
      .then((data) => setBranding({ title: data.title ?? null, logoUrl: data.logoUrl ?? null }))
      .catch(() => setBranding({ title: null, logoUrl: null }));
  }, []);

  const handleContinue = () => {
    if (input.trim() && !submitting) onSubmit(input.trim());
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-xs flex flex-col items-center gap-4">
        {branding?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" className="h-14 max-w-full object-contain" />
        )}
        <h2 className="text-xl font-bold text-center">{branding?.title || "Welcome!"}</h2>
        <p className="text-gray-600 text-sm mb-2">Enter your invite code to get started:</p>
        <input
          className="border rounded px-3 py-2 w-full text-center tracking-widest font-mono uppercase focus:outline-none focus:ring"
          placeholder="CODE"
          maxLength={12}
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => {
            if (e.key === 'Enter' && input.trim() && !submitting) {
              onSubmit(input.trim());
            }
          }}
        />
        {claimError && <div className="text-xs text-red-600 text-center">{claimError}</div>}
        <Button className="w-full mt-2" onClick={handleContinue} disabled={!input.trim() || submitting}>
          {submitting ? "Joining..." : "Continue"}
        </Button>
      </div>
    </div>
  );
}

// --- Timer Hook ---
function useChallengeTimer(selectedChallenge: PlayerChallenge | null) {
  const [timer, setTimer] = useState<{ startTime: number; duration: number; isRunning: boolean; isPaused: boolean } | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!selectedChallenge) return;
    if (!socketRef.current) {
      socketRef.current = io(SOCKET_URL, { transports: ['websocket'] });
    }
    const socket = socketRef.current;
    const handleTimerUpdate = (data: { challengeId: string; startTime: number; duration: number; isRunning: boolean; isPaused: boolean; remaining?: number }) => {
      if (data.challengeId === selectedChallenge.id) {
        setTimer({ startTime: data.startTime, duration: data.duration, isRunning: data.isRunning, isPaused: !!data.isPaused });
        // If paused, set timeLeft to remaining
        if (data.isPaused && typeof data.remaining === 'number') {
          setTimeLeft(Math.max(0, Math.floor(data.remaining / 1000)));
        }
      }
    };
    socket.on('timer:update', handleTimerUpdate);
    return () => {
      socket.off('timer:update', handleTimerUpdate);
    };
  }, [selectedChallenge]);

  useEffect(() => {
    if (!timer) {
      setTimeLeft(0);
      return;
    }
    if (timer.isPaused) {
      // Don't tick when paused
      return;
    }
    if (!timer.isRunning) {
      setTimeLeft(0);
      return;
    }
    // Compute immediately, not just on the first interval tick — otherwise, the
    // instant a reconnect (e.g. a page refresh mid-timer) delivers the real,
    // already-running timer, timeLeft is still its stale initial 0 for up to
    // 250ms. With isRunning true and timeLeft 0, that reads as "Time's Up" for
    // a flash before correcting itself.
    const tick = () => {
      const now = Date.now();
      const end = timer.startTime + timer.duration;
      setTimeLeft(Math.max(0, Math.floor((end - now) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [timer]);

  return { timer, timeLeft };
}

// --- Timer Display ---
function TimerDisplay({ timeLeft }: { timeLeft: number }) {
  const min = Math.floor(timeLeft / 60);
  const sec = timeLeft % 60;
  // Last 10 seconds get the "ticker" treatment — red + pulsing — for a bit of
  // pressure, timed to the countdown sound in the main challenge view.
  const isFinalCountdown = timeLeft <= 10;
  return (
    <span
      className={`inline-block px-3 py-1 rounded font-mono text-lg min-w-[70px] text-center ${
        isFinalCountdown ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-blue-100 text-blue-800'
      }`}
    >
      {min}:{sec.toString().padStart(2, '0')}
    </span>
  );
}

// --- AdminPanel with Timer Start ---
export function AdminPanel({ locks, onToggleLock, challenges = [] }: {
  locks: Record<string, boolean>,
  onToggleLock: (id: string) => void,
  challenges?: ChallengeSummary[]
}) {
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [timerDurations, setTimerDurations] = useState<Record<string, number>>({});
  const [timers, setTimers] = useState<Record<string, { startTime: number; duration: number; isRunning: boolean; isPaused: boolean; remaining?: number }>>({});
  const [timeLefts, setTimeLefts] = useState<Record<string, number>>({});
  const [fixRevealedMap, setFixRevealedMap] = useState<Record<string, boolean>>({});
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Debug logging
  console.log('AdminPanel received challenges:', challenges);
  console.log('AdminPanel challenges length:', challenges?.length);

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(SOCKET_URL, { transports: ['websocket'] });
    }
    const socket = socketRef.current;
    const handleTimerUpdate = (data: { challengeId: string; startTime: number; duration: number; isRunning: boolean; isPaused: boolean; remaining?: number }) => {
      setTimers(prev => ({
        ...prev,
        [data.challengeId]: {
          startTime: data.startTime,
          duration: data.duration,
          isRunning: data.isRunning,
          isPaused: data.isPaused,
          ...(typeof data.remaining === 'number' ? { remaining: data.remaining } : {})
        }
      }));
      // Mirror into the DB so submit-challenge/submit-flag (a separate process
      // from this socket server) can enforce "timer's expired" server-side —
      // see ChallengeTimer in schema.prisma.
      fetch('/api/admin/challenge-timer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).catch(() => {});
    };
    socket.on('timer:update', handleTimerUpdate);
    const handleFixReveal = (data: { challengeId: string }) => {
      setFixRevealedMap(prev => ({ ...prev, [data.challengeId]: true }));
    };
    const handleFixHide = (data: { challengeId: string }) => {
      setFixRevealedMap(prev => ({ ...prev, [data.challengeId]: false }));
    };
    socket.on('fix:reveal', handleFixReveal);
    socket.on('fix:hide', handleFixHide);
    return () => {
      socket.off('timer:update', handleTimerUpdate);
      socket.off('fix:reveal', handleFixReveal);
      socket.off('fix:hide', handleFixHide);
    };
  }, []);

  // Update ticking timers for admin
  useEffect(() => {
    // Compute immediately, not just on the first tick — otherwise a timer that
    // arrives already running (e.g. on reconnect) briefly reads as 0 remaining,
    // which displays as "Time's Up" until the first 250ms tick corrects it.
    const recompute = () => {
      setTimeLefts(prev => {
        const updated: Record<string, number> = { ...prev };
        Object.entries(timers).forEach(([challengeId, timer]) => {
          if (timer.isPaused && typeof (timer as any).remaining === 'number') {
            updated[challengeId] = Math.max(0, Math.floor((timer as any).remaining / 1000));
          } else if (timer.isRunning) {
            const now = Date.now();
            const end = timer.startTime + timer.duration;
            updated[challengeId] = Math.max(0, Math.floor((end - now) / 1000));
          } else {
            updated[challengeId] = 0;
          }
        });
        return updated;
      });
    };
    recompute();
    const interval = setInterval(recompute, 250);
    return () => clearInterval(interval);
  }, [timers]);

  const handleStartTimer = (challengeId: string) => {
    const durationMinutes = timerDurations[challengeId] || 5; // default 5 min
    socketRef.current?.emit('admin:startTimer', { challengeId, duration: durationMinutes * 60 * 1000 });
  };

  const handleDurationChange = (challengeId: string, value: string) => {
    const num = Math.max(1, Math.min(60, parseInt(value) || 0));
    setTimerDurations(prev => ({ ...prev, [challengeId]: num }));
  };

  const getTimeLeft = (challengeId: string) => {
    return timeLefts[challengeId] || 0;
  };

  const handleReset = async () => {
    if (!window.confirm('Are you sure you want to reset everything? This clears all participant scores/submissions AND every active timer and fix-reveal — perfect for wiping a demo/mock run before the real session. This cannot be undone.')) return;
    setResetting(true);
    setResetSuccess(false);
    const res = await fetch('/api/admin-reset', { method: 'POST' });
    // Clear every live timer and fix-reveal too — the DB reset above doesn't touch
    // the socket server's in-memory state, so without this a demo run's timers
    // would still be ticking (or fixes still revealed) when the real session starts.
    socketRef.current?.emit('admin:resetAll');
    setTimers({});
    setTimeLefts({});
    setFixRevealedMap({});
    setResetting(false);
    if (res.ok) setResetSuccess(true);
  };

  const handlePauseTimer = (challengeId: string) => {
    socketRef.current?.emit('admin:pauseTimer', { challengeId });
  };
  const handleResumeTimer = (challengeId: string) => {
    socketRef.current?.emit('admin:resumeTimer', { challengeId });
  };
  const handleResetTimer = (challengeId: string) => {
    socketRef.current?.emit('admin:resetTimer', { challengeId });
    // Clear local timer state for this challenge so Start Timer is shown again
    setTimers(prev => {
      const copy = { ...prev };
      delete copy[challengeId];
      return copy;
    });
    setTimeLefts(prev => {
      const copy = { ...prev };
      delete copy[challengeId];
      return copy;
    });
  };

  const handleRevealFix = (challengeId: string) => {
    socketRef.current?.emit('admin:revealFix', { challengeId });
  };
  const handleHideFix = (challengeId: string) => {
    socketRef.current?.emit('admin:hideFix', { challengeId });
  };

  const handleQuickReorder = async (challengeId: string, newOrder: number) => {
    if (Number.isNaN(newOrder)) return;
    setReorderingId(challengeId);
    try {
      await fetch(`/api/admin/challenges/${challengeId}/order`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newOrder }),
      });
    } finally {
      setReorderingId(null);
    }
  };

  // Call this when a challenge is locked
  useEffect(() => {
    Object.entries(locks).forEach(([challengeId, locked]) => {
      if (locked && timers[challengeId]) {
        handleResetTimer(challengeId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locks]);

  return (
    <div className="max-w-4xl mx-auto mt-10 bg-white rounded-lg shadow p-10">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Unlock className="h-5 w-5 text-green-600" /> Admin Challenge Unlocks</h2>
      <div className="mb-6">
        <Button variant="destructive" onClick={handleReset} disabled={resetting}>
          {resetting ? 'Resetting...' : 'Reset Everything'}
        </Button>
        {resetSuccess && <span className="ml-4 text-green-700 font-semibold">Lab fully reset — scores, submissions, timers, and reveals all cleared!</span>}
      </div>
      <div className="grid grid-cols-1 gap-4">
        {!challenges || challenges.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-500">Loading challenges...</div>
          </div>
        ) : (
          [...challenges].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id)).map((challenge) => {
            const isLocked = locks[challenge.id] !== false; // default locked
            const timeLeft = getTimeLeft(challenge.id);
            const timer = timers[challenge.id];
            return (
              <Card key={challenge.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {isLocked ? <Lock className="h-4 w-4 text-gray-400" /> : <Unlock className="h-4 w-4 text-green-500" />}
                    {challenge.title}
                    <span className="ml-auto flex items-center gap-1 text-xs font-normal text-gray-500" title="Position in the lab sequence">
                      Sequence
                      <input
                        type="number"
                        defaultValue={challenge.order ?? 0}
                        disabled={reorderingId === challenge.id}
                        onBlur={(e) => {
                          const newOrder = parseInt(e.target.value, 10);
                          if (newOrder !== (challenge.order ?? 0)) handleQuickReorder(challenge.id, newOrder);
                        }}
                        className="w-14 border rounded px-1.5 py-0.5 text-sm font-mono"
                      />
                      {reorderingId === challenge.id && <span className="text-gray-400">Saving…</span>}
                    </span>
                  </CardTitle>
                  <CardDescription>{challenge.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2 justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          variant={!isLocked ? "destructive" : "outline"}
                          className={isLocked ? "border-green-600 text-green-700 hover:bg-green-50 hover:text-green-900" : ""}
                          onClick={() => onToggleLock(challenge.id)}
                        >
                          {isLocked ? "Unlock" : "Lock"}
                        </Button>
                        {!isLocked && (!timer || (!timer.isRunning && !timer.isPaused)) && (
                          <input
                            type="number"
                            min={1}
                            max={60}
                            value={timerDurations[challenge.id] || 5}
                            onChange={e => handleDurationChange(challenge.id, e.target.value)}
                            className="border rounded px-2 py-1 w-20 text-sm"
                            placeholder="Minutes"
                          />
                        )}
                      </div>
                      {!isLocked && (
                        <div className="flex flex-wrap items-center gap-2">
                          {timer && timer.isRunning && !timer.isPaused ? (
                            <>
                              <Button variant="secondary" onClick={() => handlePauseTimer(challenge.id)}>
                                Pause Timer
                              </Button>
                              <Button variant="outline" onClick={() => handleResetTimer(challenge.id)}>
                                Reset Timer
                              </Button>
                            </>
                          ) : timer && timer.isPaused ? (
                            <>
                              <Button variant="default" onClick={() => handleResumeTimer(challenge.id)}>
                                Resume Timer
                              </Button>
                              <Button variant="outline" onClick={() => handleResetTimer(challenge.id)}>
                                Reset Timer
                              </Button>
                            </>
                          ) : (
                            <Button variant="default" onClick={() => handleStartTimer(challenge.id)}>
                              Start Timer
                            </Button>
                          )}
                          {/* Timer display for admin: show if running or paused and time left > 0 */}
                          {(timer && (timer.isRunning || timer.isPaused) && timeLeft > 0) && <TimerDisplay timeLeft={timeLeft} />}
                          {fixRevealedMap[challenge.id] ? (
                            <Button variant="outline" size="sm" onClick={() => handleHideFix(challenge.id)}>
                              Hide Fix (room-wide)
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => handleRevealFix(challenge.id)}>
                              Reveal Fix (room-wide)
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

function Leaderboard({ currentUser, refreshSignal }: { currentUser: { name: string; avatar: string; score: number }; refreshSignal?: number }) {
  const [users, setUsers] = useState<{ name: string; avatar: string; score: number }[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchLeaderboard = useCallback(() => {
    fetch('/api/leaderboard')
      .then(res => res.json())
      .then(setUsers);
  }, []);

  // Poll every 5 seconds for ambient updates from OTHER players
  useEffect(() => {
    fetchLeaderboard();
    intervalRef.current = setInterval(fetchLeaderboard, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchLeaderboard]);

  // Refetch immediately when the parent bumps this after OUR OWN score just
  // changed — otherwise the player could wait up to 5s to see their own new
  // score/rank after a correct submission, which reads as "nothing happened."
  useEffect(() => {
    if (refreshSignal === undefined || refreshSignal === 0) return;
    fetchLeaderboard();
  }, [refreshSignal, fetchLeaderboard]);

  // If current user is not in the top, show them at the bottom
  const inTop = users.some(u => u.name === currentUser.name);
  const displayUsers = inTop ? users : [...users, currentUser];

  // Medal icons for top 3
  const medalIcons = [
    <span key="gold" aria-label="1st" className="text-2xl mr-2">🥇</span>,
    <span key="silver" aria-label="2nd" className="text-2xl mr-2">🥈</span>,
    <span key="bronze" aria-label="3rd" className="text-2xl mr-2">🥉</span>,
  ];

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-md mx-auto mt-6 md:mt-0 md:ml-8 border border-gray-100">
      <h3 className="text-2xl font-extrabold mb-5 text-center flex items-center justify-center gap-2 tracking-tight">
        <span>🏆</span> Leaderboard
      </h3>
      <ul className="space-y-2">
        {displayUsers.map((user, idx) => {
          const isCurrent = user.name === currentUser.name;
          const isTop5 = idx < 5;
          let positionIcon = null;
          let positionClass = "";
          let badge = null;

          if (idx < 3) {
            positionIcon = medalIcons[idx];
            positionClass = [
              "bg-gradient-to-r from-yellow-100 to-yellow-50 border-yellow-300",
              "bg-gradient-to-r from-gray-200 to-gray-50 border-gray-300",
              "bg-gradient-to-r from-amber-200 to-amber-50 border-amber-300"
            ][idx];
          } else if (isTop5) {
            badge = (
              <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold border border-blue-200">Top 5</span>
            );
            positionClass = "bg-blue-50 border-blue-200";
          }

          return (
            <li
              key={user.name}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${positionClass} ${isCurrent && !isTop5 ? "ring-2 ring-blue-400 bg-blue-50 font-bold" : ""} ${isCurrent ? "shadow-md" : ""}`}
              style={{ boxShadow: isCurrent ? '0 2px 8px 0 rgba(59,130,246,0.08)' : undefined }}
            >
              <div className="flex items-center gap-3">
                {positionIcon}
                <span className="text-xl select-none" aria-label="avatar">{user.avatar}</span>
                <span className={`truncate max-w-[120px] text-base ${isCurrent ? "text-blue-900" : "text-gray-800"}`}>{user.name}</span>
                {badge}
                {isCurrent && !isTop5 && (
                  <span className="ml-2 px-2 py-0.5 bg-blue-200 text-blue-900 rounded-full text-xs font-semibold border border-blue-300">You</span>
                )}
              </div>
              <span className={`text-lg font-bold ${idx === 0 ? "text-yellow-600" : idx === 1 ? "text-gray-500" : idx === 2 ? "text-amber-700" : "text-blue-700"}`}>{user.score}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Resizable container for the challenge card
function ResizableCard({ children, defaultWidth = 0 }: { children: React.ReactNode, defaultWidth?: number }) {
  const [width, setWidth] = useState(defaultWidth); // Use defaultWidth as initial value
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const startDrag = useCallback((e: React.MouseEvent) => {
    setDragging(true);
    document.body.style.cursor = "ew-resize";
  }, []);

  const onDrag = useCallback((e: MouseEvent) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const minWidth = 320;
    const maxWidth = 900;
    let newWidth = e.clientX - rect.left;
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    setWidth(newWidth);
  }, [dragging]);

  const stopDrag = useCallback(() => {
    setDragging(false);
    document.body.style.cursor = "";
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent) => onDrag(e);
    const up = () => stopDrag();
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [dragging, onDrag, stopDrag]);

  return (
    <div
      ref={containerRef}
      className="relative bg-transparent"
      style={{ width: width ? width : undefined, minWidth: 320, maxWidth: 900 }}
    >
      <div>{children}</div>
      <div
        className="absolute top-0 right-0 h-full w-2 cursor-ew-resize z-20 flex items-center group"
        onMouseDown={startDrag}
        style={{ userSelect: "none" }}
      >
        <div className="w-1 h-16 bg-gray-300 rounded-full opacity-60 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}

// --- ChallengeTimer component ---
function ChallengeTimer({ timeLeft, timer }: { timeLeft: number; timer: { isRunning: boolean; isPaused: boolean } | null }) {
  if (timeLeft > 0) {
    return <TimerDisplay timeLeft={timeLeft} />;
  }

  // A timer that ran its course (and is blocking submissions) reads very
  // differently from a challenge that was never timed at all — don't collapse
  // both into "No Timer".
  if (timer && timer.isRunning && !timer.isPaused) {
    return (
      <span className="inline-block px-3 py-1 bg-red-100 text-red-700 rounded font-mono text-lg min-w-[70px] text-center">
        Time&apos;s Up
      </span>
    );
  }

  return (
    <span className="inline-block px-3 py-1 bg-gray-100 text-gray-600 rounded font-mono text-lg min-w-[70px] text-center">
      No Timer
    </span>
  );
}

// --- Fixed-code reveal ---
// Slides the code card from the vulnerable version to the fixed/secure version so
// a presenter never has to leave this screen. The lab timer finishing (or an admin
// broadcast) only UNLOCKS the next/explanation/fixed-code slides — it never forces
// navigation to them. Whoever's looking at the screen always advances with a
// deliberate click; nothing yanks the view out from under a mid-sentence presenter.
const CODE_PANEL_VULNERABLE = 0;
const CODE_PANEL_EXPLANATION = 1;
const CODE_PANEL_FIXED = 2;
const CODE_PANEL_COUNT = 3;

type RevealData = { vulnerableLines: number[]; explanations: Record<number, string>; fixedCode: string };

function useFixReveal(
  selectedChallenge: PlayerChallenge | null,
  timer: { startTime: number; duration: number; isRunning: boolean; isPaused: boolean } | null
) {
  const [panelIndex, setPanelIndex] = useState(0);
  // Whether the explanation/fixed-code slides are allowed to be viewed yet —
  // becomes true once the lab timer genuinely runs out, or the admin broadcasts a
  // reveal. The next arrow stays disabled until this flips; nobody can click ahead
  // and peek early.
  const [revealEligible, setRevealEligible] = useState(false);
  // Specifically "the timer genuinely ran out" — unlike revealEligible, this is
  // NEVER set by an admin's manual Reveal Fix broadcast (which can legitimately
  // happen on an untimed challenge). Used to block answer/flag submission; must
  // track the real deadline only, not "is the fix currently visible."
  const [timerExpired, setTimerExpired] = useState(false);
  const [revealData, setRevealData] = useState<RevealData | null>(null);
  const [revealLoading, setRevealLoading] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // Listen for admin-broadcast reveal/hide for this challenge
  useEffect(() => {
    if (!selectedChallenge) return;
    if (!socketRef.current) {
      socketRef.current = io(SOCKET_URL, { transports: ['websocket'] });
    }
    const socket = socketRef.current;
    const onReveal = (data: { challengeId: string }) => {
      if (data.challengeId === selectedChallenge.id) setRevealEligible(true);
    };
    const onHide = (data: { challengeId: string }) => {
      if (data.challengeId === selectedChallenge.id) {
        setRevealEligible(false);
        setPanelIndex(CODE_PANEL_VULNERABLE);
      }
    };
    socket.on('fix:reveal', onReveal);
    socket.on('fix:hide', onHide);
    return () => {
      socket.off('fix:reveal', onReveal);
      socket.off('fix:hide', onHide);
    };
  }, [selectedChallenge]);

  // Unlock the explanation/fixed-code slides the moment a running timer actually
  // hits zero. Deliberately NOT derived from the separately-ticking `timeLeft`
  // display value — that's only updated every 250ms by its own setInterval, so
  // right when a fresh timer starts it's still stale from before (often still 0),
  // which would unlock this immediately on start rather than at real expiry.
  // Scheduling a real setTimeout off the timer's own startTime+duration has no
  // such race.
  useEffect(() => {
    if (!timer || !timer.isRunning || timer.isPaused) {
      // No active deadline right now (never started, paused, or just reset) —
      // explicitly clear any prior expiry rather than leaving it stale.
      setTimerExpired(false);
      return;
    }
    const msRemaining = timer.startTime + timer.duration - Date.now();
    if (msRemaining <= 0) {
      setTimerExpired(true);
      setRevealEligible(true);
      return;
    }
    setTimerExpired(false); // freshly (re)started — not expired yet
    const t = setTimeout(() => {
      setTimerExpired(true);
      setRevealEligible(true);
    }, msRemaining);
    return () => clearTimeout(t);
  }, [timer?.startTime, timer?.duration, timer?.isRunning, timer?.isPaused]);

  // Reset when switching to a different challenge
  useEffect(() => {
    setPanelIndex(CODE_PANEL_VULNERABLE);
    setRevealEligible(false);
    setTimerExpired(false);
    setRevealData(null);
  }, [selectedChallenge?.id]);

  // Lazily fetch the explanation + fixed code only once it's actually unlocked
  useEffect(() => {
    if (!revealEligible || !selectedChallenge || revealData !== null || revealLoading) return;
    setRevealLoading(true);
    fetch(`/api/challenges/${selectedChallenge.id}/reveal`)
      .then((res) => res.json())
      .then((data) =>
        setRevealData({
          vulnerableLines: Array.isArray(data.vulnerableLines) ? data.vulnerableLines : [],
          explanations: data.explanations && typeof data.explanations === 'object' ? data.explanations : {},
          fixedCode: typeof data.fixedCode === 'string' ? data.fixedCode : '',
        })
      )
      .catch(() => setRevealData({ vulnerableLines: [], explanations: {}, fixedCode: '' }))
      .finally(() => setRevealLoading(false));
  }, [revealEligible, selectedChallenge, revealData, revealLoading]);

  const canGoPrev = panelIndex > 0;
  const canGoNext = revealEligible && panelIndex < CODE_PANEL_COUNT - 1;
  const goPrev = () => setPanelIndex((i) => Math.max(0, i - 1));
  const goNext = () => {
    if (!revealEligible) return;
    setPanelIndex((i) => Math.min(CODE_PANEL_COUNT - 1, i + 1));
  };

  return { panelIndex, revealData, revealLoading, timerExpired, canGoPrev, canGoNext, goPrev, goNext };
}

// Add a hook to get all running/paused timers for the challenge list
function useAllChallengeTimers() {
  const [timers, setTimers] = useState<Record<string, { startTime: number; duration: number; isRunning: boolean; isPaused: boolean; remaining?: number }>>({});
  const [timeLefts, setTimeLefts] = useState<Record<string, number>>({});
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(SOCKET_URL, { transports: ['websocket'] });
    }
    const socket = socketRef.current;
    const handleTimerUpdate = (data: { challengeId: string; startTime: number; duration: number; isRunning: boolean; isPaused: boolean; remaining?: number }) => {
      setTimers(prev => ({ ...prev, [data.challengeId]: data }));
    };
    socket.on('timer:update', handleTimerUpdate);
    return () => {
      socket.off('timer:update', handleTimerUpdate);
    };
  }, []);

  useEffect(() => {
    // Same immediate-compute-then-interval pattern as useChallengeTimer — without
    // it, a timer that arrives already running (e.g. synced to a client that just
    // reconnected) shows 0 remaining for up to 250ms, which a running timer with
    // no time left reads as "Time's Up" until the first tick corrects it.
    const recompute = () => {
      setTimeLefts(prev => {
        const updated: Record<string, number> = { ...prev };
        Object.entries(timers).forEach(([challengeId, timer]) => {
          if (timer.isPaused && typeof (timer as any).remaining === 'number') {
            updated[challengeId] = Math.max(0, Math.floor((timer as any).remaining / 1000));
          } else if (timer.isRunning) {
            const now = Date.now();
            const end = timer.startTime + timer.duration;
            updated[challengeId] = Math.max(0, Math.floor((end - now) / 1000));
          } else {
            updated[challengeId] = 0;
          }
        });
        return updated;
      });
    };
    recompute();
    const interval = setInterval(recompute, 250);
    return () => clearInterval(interval);
  }, [timers]);

  return { timers, timeLefts };
}

// Utility to generate dynamic lab URL
function getDynamicLabUrl(labPath: string) {
  if (typeof window === 'undefined') return '';

  // If it's already a full URL (starts with http:// or https://), return as is
  if (labPath.startsWith('http://') || labPath.startsWith('https://')) {
    return labPath;
  }

  // If it's a relative path, construct the full URL with current hostname and port 8888
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:8888${labPath}`;
}

export default function CodeReviewChallenge() {
  // User state — identity lives in a server-issued session cookie (see
  // /api/player-session), never in localStorage or anything client-trusted.
  const [user, setUser] = useState({ name: "", avatar: "", score: 0 });
  // Bumped whenever OUR OWN score just changed, so the Leaderboard widget can
  // refetch immediately instead of waiting for its 5s ambient poll.
  const [leaderboardRefreshSignal, setLeaderboardRefreshSignal] = useState(0);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [claimingCode, setClaimingCode] = useState(false);
  const [claimError, setClaimError] = useState("");

  // Challenge lock state (persisted via API)
  const [locks, setLocks] = useState<Record<string, boolean>>({});

  // Challenges state - dynamically fetched
  const [challenges, setChallenges] = useState<PlayerChallenge[]>([]);
  const [challengesLoading, setChallengesLoading] = useState(true);

  // Debug challenges state changes
  useEffect(() => {
    console.log('Challenges state changed:', {
      challengesLength: challenges.length,
      challengesLoading,
      challenges: challenges
    });
  }, [challenges, challengesLoading]);

  // Challenge state
  const [selectedChallenge, setSelectedChallenge] = useState<PlayerChallenge | null>(null)
  const [selectedLines, setSelectedLines] = useState<number[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [showHints, setShowHints] = useState(false)
  const [alreadySolved, setAlreadySolved] = useState(false);
  const [flagAlreadySolved, setFlagAlreadySolved] = useState(false);

  // Track if the last submission was correct
  const [lastSubmissionCorrect, setLastSubmissionCorrect] = useState<boolean | null>(null);
  // Result indicator shown inline in the Submit/Try Again row — shows instantly on click
  // (before the server even responds) so submitting never feels like it did nothing, then
  // flips to the actual result. Lives in that row specifically so it never shifts layout;
  // stays visible until the next attempt/challenge/reset instead of auto-dismissing.
  const [submitToast, setSubmitToast] = useState<{ status: 'checking' | 'correct' | 'incorrect' | 'blocked'; message?: string } | null>(null);
  // Per-line correct/incorrect feedback for the lines the user selected (server-authoritative)
  const [submissionFeedback, setSubmissionFeedback] = useState<{ line: number; status: string }[]>([]);
  // The answer key, only populated once the server reveals it after a correct submission
  const [revealedVulnerableLines, setRevealedVulnerableLines] = useState<number[]>([]);
  const [revealedExplanations, setRevealedExplanations] = useState<Record<number, string>>({});

  // Attempts for the CURRENTLY SELECTED challenge (what's actually displayed).
  const [attemptsUsed, setAttemptsUsed] = useState<number | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  // Prefetched attempts for every challenge this player has touched, fetched once
  // up front — lets handleSelectChallenge seed the two values above INSTANTLY and
  // correctly (no loading flash, no wrong-default flash) instead of waiting on a
  // per-challenge network round trip. A challenge with no entry here simply has 0
  // attempts used, which is already known without a query.
  const [attemptsMap, setAttemptsMap] = useState<Record<string, { attemptsUsed: number; attemptsRemaining: number }>>({});

  // Open Lab state
  const [openLabChallenge, setOpenLabChallenge] = useState<string | null>(null);
  const [flagInput, setFlagInput] = useState("");
  const [flagStatus, setFlagStatus] = useState<{ status: 'idle' | 'loading' | 'success' | 'error' | 'already'; message?: string }>({ status: 'idle' });

  // --- Flag submission state for challenge view ---
  const [flagChallengeLoading, setFlagChallengeLoading] = useState(false);
  const [flagChallengeStatus, setFlagChallengeStatus] = useState<{ status: 'idle' | 'loading' | 'success' | 'error' | 'already'; message?: string }>({ status: 'idle' });

  // Move this hook call here so it's always called, before any early returns
  const { timers: allTimers, timeLefts: allTimeLefts } = useAllChallengeTimers();
  const { timer: challengeTimer, timeLeft: challengeTimeLeft } = useChallengeTimer(selectedChallenge);
  const { panelIndex: codePanelIndex, revealData, revealLoading, timerExpired, canGoPrev: canGoPrevPanel, canGoNext: canGoNextPanel, goPrev: goPrevPanel, goNext: goNextPanel } = useFixReveal(selectedChallenge, challengeTimer);

  // Final-10-seconds countdown sound — plays once per timer run, right as the
  // clock crosses into single digits, for the "pressure" effect. Keyed off
  // timer.startTime (not just timeLeft<=10) so the 250ms tick interval doesn't
  // retrigger it on every tick while time sits in that window.
  const countdownAudioRef = useRef<HTMLAudioElement | null>(null);
  const countdownPlayedForRef = useRef<number | null>(null);
  useEffect(() => {
    if (!challengeTimer || !challengeTimer.isRunning || challengeTimer.isPaused) return;
    if (challengeTimeLeft <= 0 || challengeTimeLeft > 10) return;
    if (countdownPlayedForRef.current === challengeTimer.startTime) return;
    countdownPlayedForRef.current = challengeTimer.startTime;
    countdownAudioRef.current?.play().catch(() => {});
  }, [challengeTimeLeft, challengeTimer]);
  // A new timer run (or leaving the challenge) clears the "already played" guard.
  useEffect(() => {
    countdownPlayedForRef.current = null;
    countdownAudioRef.current?.pause();
    if (countdownAudioRef.current) countdownAudioRef.current.currentTime = 0;
  }, [selectedChallenge?.id, challengeTimer?.startTime]);

  const fetchAttemptsMap = useCallback(() => {
    fetch('/api/player-attempts')
      .then(res => res.json())
      .then(data => setAttemptsMap(data && typeof data === 'object' ? data : {}))
      .catch(() => {});
  }, []);

  // On mount: ask the server who this browser's session cookie says we are
  // (if anyone), and fetch locks/challenges. There is no client-side identity
  // to restore — the httpOnly session cookie is the only source of truth.
  useEffect(() => {
    fetch('/api/player-session')
      .then(res => res.json())
      .then(data => {
        if (data.name) {
          setUser({ name: data.name, avatar: data.avatar || "", score: data.score || 0 });
          fetchAttemptsMap();
        } else {
          setShowCodeModal(true);
        }
      })
      .catch(() => setShowCodeModal(true));

    // Fetch locks from API
    fetch('/api/challenge-locks')
      .then(res => res.json())
      .then(data => setLocks(data));

    // Fetch challenges from the public, answer-free API
    const fetchChallenges = async () => {
      try {
        setChallengesLoading(true);
        const res = await fetch('/api/challenges');
        if (res.ok) {
          const data = await res.json();
          setChallenges(data);
        } else {
          console.error('Failed to fetch challenges:', res.status);
        }
      } catch (error) {
        console.error('Error fetching challenges:', error);
      } finally {
        setChallengesLoading(false);
      }
    };

    fetchChallenges();
  }, [fetchAttemptsMap]); // fetchAttemptsMap is useCallback-stable — this still only runs once on mount

  // Keep lock state live — without this, a challenge the admin unlocks mid-session
  // stays "locked" for anyone already on the page until they go back and refresh,
  // which is exactly the friction we're trying to remove from the next-lab flow.
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    const handleLockUpdate = (data: { challengeId: string; locked: boolean }) => {
      setLocks((prev) => ({ ...prev, [data.challengeId]: data.locked }));
    };
    socket.on('lock:update', handleLockUpdate);
    return () => {
      socket.off('lock:update', handleLockUpdate);
      socket.disconnect();
    };
  }, []);

  const handleCodeSubmit = async (code: string) => {
    setClaimingCode(true);
    setClaimError("");
    try {
      const res = await fetch('/api/player-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setUser({ name: data.name, avatar: data.avatar, score: data.score || 0 });
        setShowCodeModal(false);
        fetchAttemptsMap();
      } else {
        setClaimError(data.error || 'Invalid code. Please check and try again.');
      }
    } catch {
      setClaimError('Could not reach the server. Try again.');
    } finally {
      setClaimingCode(false);
    }
  };

  // Locking/unlocking challenges is admin-only and lives entirely in
  // /admin/dashboard now (backed by real session auth) — this page only reads locks.

  const handleSelectChallenge = (challenge: PlayerChallenge) => {
    // By default, all challenges are locked unless explicitly unlocked
    const isLocked = locks[challenge.id] !== false;
    if (isLocked) return;
    setSelectedChallenge(challenge)
    setSelectedLines([])
    setSubmitted(false)
    setShowResults(false)
    setShowHints(false)
    setFlagInput("");
    setFlagChallengeStatus({ status: 'idle' });
    setSubmissionFeedback([]);
    setRevealedVulnerableLines([]);
    setRevealedExplanations({});
    // Seed instantly and correctly from the prefetched map — no network round trip,
    // no loading flash, no wrong-default flash. A challenge with no entry genuinely
    // has 0 attempts used, which doesn't need a fetch to know.
    const cached = attemptsMap[challenge.id];
    setAttemptsUsed(cached?.attemptsUsed ?? 0);
    setAttemptsRemaining(cached?.attemptsRemaining ?? MAX_CHALLENGE_ATTEMPTS);
  }

  // Check if user has already solved the selected challenge (challenge submission)
  useEffect(() => {
    const checkAlreadySolved = async () => {
      if (selectedChallenge && user.name) {
        const res = await fetch('/api/challenge-status', {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId: selectedChallenge.id,
          }),
        });
        const data = await res.json();
        setAlreadySolved(!!data.solved);
      } else {
        setAlreadySolved(false);
      }
    };
    checkAlreadySolved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChallenge, user.name]);

  // Check if user has already solved the flag for the selected challenge
  useEffect(() => {
    const checkFlagAlreadySolved = async () => {
      if (selectedChallenge && user.name) {
        const res = await fetch('/api/flag-status', {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId: selectedChallenge.id,
          }),
        });
        const data = await res.json();
        setFlagAlreadySolved(!!data.solved);
      } else {
        setFlagAlreadySolved(false);
      }
    };
    checkFlagAlreadySolved();
  }, [selectedChallenge, user.name]);

  // Quiet background re-check — handleSelectChallenge already seeded the correct
  // numbers instantly from the prefetched cache, so this just silently corrects
  // them in the rare case the cache was stale (e.g. the same player active in
  // another tab). No loading state here on purpose: it should never visibly
  // change what's already shown unless the cached value was actually wrong.
  useEffect(() => {
    const fetchAttempts = async () => {
      if (selectedChallenge && user.name) {
        const res = await fetch('/api/challenge-attempts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeId: selectedChallenge.id })
        });
        const data = await res.json();
        setAttemptsUsed(data.attemptsUsed);
        setAttemptsRemaining(data.attemptsRemaining);
        setAttemptsMap(prev => ({ ...prev, [selectedChallenge.id]: { attemptsUsed: data.attemptsUsed, attemptsRemaining: data.attemptsRemaining } }));
      } else {
        setAttemptsUsed(0);
        setAttemptsRemaining(MAX_CHALLENGE_ATTEMPTS);
      }
    };
    fetchAttempts();
  }, [selectedChallenge, user.name]);

  const handleSubmit = async () => {
    setSubmitted(true);
    setShowResults(true);
    if (selectedChallenge && selectedLines.length > 0) {
      setSubmitToast({ status: 'checking' }); // instant feedback — don't wait on the network for this

      // Send selectedLines array to backend
      const res = await fetch('/api/submit-challenge', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avatar: user.avatar,
          challengeId: selectedChallenge.id,
          selectedLines: selectedLines,
        }),
      });
      const data = await res.json();
      // Correctness is determined entirely by the server; the client never has the answer key.
      if (res.ok) {
        setLastSubmissionCorrect(!!data.correct);
        setAlreadySolved(!!data.correct);
        setSubmissionFeedback(Array.isArray(data.feedback) ? data.feedback : []);
        if (data.correct) {
          setRevealedVulnerableLines(Array.isArray(data.vulnerableLines) ? data.vulnerableLines : []);
          setRevealedExplanations(data.explanations || {});
          // Score is already in the response — no need to wait on anything else
          // to reflect it, both on our own badge and on the shared leaderboard.
          if (typeof data.score === 'number') setUser(u => ({ ...u, score: data.score }));
          setLeaderboardRefreshSignal(s => s + 1);
        }
        setSubmitToast({ status: data.correct ? 'correct' : 'incorrect' });
      } else if (res.status === 423) {
        // Locked or time's-up — not a wrong answer, don't label it like one
        // (and don't count it as a "Try Again"-able incorrect attempt either).
        setSubmitted(false);
        setShowResults(false);
        setSubmitToast({ status: 'blocked', message: typeof data.error === 'string' ? data.error : 'Submissions are closed for this challenge.' });
      } else {
        setLastSubmissionCorrect(false);
        setSubmissionFeedback([]);
        setSubmitToast({ status: 'incorrect' });
      }
      // Update attempts from backend response, and keep the prefetch cache in sync
      // so it's still correct if the player leaves and reopens this challenge later.
      if (typeof data.attemptsUsed === 'number') setAttemptsUsed(data.attemptsUsed);
      if (typeof data.attemptsRemaining === 'number') setAttemptsRemaining(data.attemptsRemaining);
      if (typeof data.attemptsUsed === 'number' && typeof data.attemptsRemaining === 'number') {
        setAttemptsMap(prev => ({ ...prev, [selectedChallenge.id]: { attemptsUsed: data.attemptsUsed, attemptsRemaining: data.attemptsRemaining } }));
      }
    }
  }

  const handleReset = () => {
    setSelectedLines([])
    setSubmitted(false)
    setShowResults(false)
    setShowHints(false)
    setSubmissionFeedback([])
    setSubmitToast(null)
  }

  const handleBackToChallenges = () => {
    setSelectedChallenge(null)
    setSelectedLines([])
    setSubmitted(false)
    setShowResults(false)
    setShowHints(false)
    setOpenLabChallenge(null)
    setFlagInput("");
    setFlagChallengeStatus({ status: 'idle' });
    setSubmissionFeedback([]);
    setRevealedVulnerableLines([]);
    setRevealedExplanations({});
    setSubmitToast(null);
  }

  const toggleLine = (lineNumber: number) => {
    if (submitted) return;
    const maxSelectable = selectedChallenge?.maxSelectableLines ?? 1;
    if (!selectedLines.includes(lineNumber) && selectedLines.length >= maxSelectable) {
      // Optionally, show a warning or ignore further selection
      return;
    }
    setSelectedLines((prev) =>
      prev.includes(lineNumber) ? prev.filter((l) => l !== lineNumber) : [...prev, lineNumber]
    );
  }

  const getLineStatus = (lineNumber: number) => {
    if (!showResults) return null;
    const feedback = submissionFeedback.find((f) => f.line === lineNumber);
    return feedback ? feedback.status : null;
  }

  // Helper to refresh solved states for both challenge and flag
  const refreshSolvedStates = useCallback(() => {
    // Check if user has already solved the selected challenge (challenge submission)
    if (selectedChallenge && user.name) {
      fetch('/api/challenge-status', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: selectedChallenge.id,
        }),
      })
        .then(res => res.json())
        .then(data => setAlreadySolved(!!data.solved));

      fetch('/api/flag-status', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: selectedChallenge.id,
        }),
      })
        .then(res => res.json())
        .then(data => setFlagAlreadySolved(!!data.solved));
    }
  }, [selectedChallenge, user.name]);

  // Show invite-code modal if needed
  if (showCodeModal) {
    return <CodeModal open={showCodeModal} onSubmit={handleCodeSubmit} submitting={claimingCode} claimError={claimError} />
  }

  // Show challenge selection if no challenge is selected
  if (!selectedChallenge) {
    return (
      <>
        <UserBar name={user.name} avatar={user.avatar} score={user.score} />
        <div className="min-h-screen bg-gray-50 p-4">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-center">Code Review Challenge</h1>
              <p className="text-gray-600 text-center">Choose a challenge to test your skills</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {challengesLoading ? (
                <div className="col-span-2 text-center py-8">
                  <div className="text-gray-500">Loading challenges...</div>
                </div>
              ) : challenges.length === 0 ? (
                <div className="col-span-2 text-center py-8">
                  <div className="text-gray-500 mb-4">No challenges found.</div>
                </div>
              ) : (
                challenges.map((challenge) => {
                  // By default, all challenges are locked unless explicitly unlocked
                  const locked = locks[challenge.id] !== false;
                  const timer = allTimers[challenge.id];
                  const timeLeft = allTimeLefts[challenge.id] || 0;
                  const isOpenLab = openLabChallenge === challenge.id;
                  // Special style for DEMO challenge
                  const demoCardClass = challenge.id === 'DEMO' ? 'bg-yellow-50 border-yellow-400 ring-2 ring-yellow-300' : '';
                  return (
                    <Card key={challenge.id} className={`relative transition-shadow ${demoCardClass} ${locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-lg'}`} onClick={() => handleSelectChallenge(challenge)}>
                      {/* Timer at bottom right if running or paused */}
                      {(timer && (timer.isRunning || timer.isPaused) && timeLeft > 0) && (
                        <div className="absolute bottom-3 right-3 z-10">
                          <TimerDisplay timeLeft={timeLeft} />
                        </div>
                      )}
                      {/* Timer ran out and is actively blocking submissions — distinct from never having a timer */}
                      {(timer && timer.isRunning && !timer.isPaused && timeLeft === 0) && (
                        <div className="absolute bottom-3 right-3 z-10">
                          <span className="inline-block px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-mono">
                            Time&apos;s Up
                          </span>
                        </div>
                      )}
                      {/* Show "No Timer" when no timer is running (also covers the rare case of a paused timer at exactly 0:00) */}
                      {(!timer || (!timer.isRunning && !timer.isPaused) || (timer.isPaused && timeLeft === 0)) && (
                        <div className="absolute bottom-3 right-3 z-10">
                          <span className="inline-block px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-mono">
                            No Timer
                          </span>
                        </div>
                      )}
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-orange-500" />
                          {challenge.title}
                          {locked && <Lock className="h-4 w-4 text-gray-400 ml-2" />}
                        </CardTitle>
                        <CardDescription className="mt-2">{challenge.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-2 items-start justify-between">
                        {locked && <span className="ml-2 text-xs text-gray-400">Locked</span>}
                        {!locked && !isOpenLab && (
                          <Button variant="default" onClick={() => { setOpenLabChallenge(challenge.id); setFlagInput(""); setFlagStatus({ status: 'idle' }); }}>
                            Open
                          </Button>
                        )}
                        {!locked && isOpenLab && (
                          <div className="w-full flex flex-col gap-2">
                            {flagStatus.status === 'success' && <div className="text-green-700 text-xs font-semibold">{flagStatus.message}</div>}
                            {flagStatus.status === 'already' && <div className="text-blue-700 text-xs font-semibold">{flagStatus.message}</div>}
                            {flagStatus.status === 'error' && <div className="text-red-600 text-xs font-semibold">{flagStatus.message}</div>}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </>
    )
  }

  // In the challenge view, add a check for locked
  const isLocked = locks[selectedChallenge.id] !== false;

  // The next challenge in sequence (challenges is already order-sorted by the
  // API) — lets a finished player move straight on without going back to the
  // grid. Locks is kept live (see the lock:update socket effect above), so
  // this reflects an admin unlock the instant it happens, no refresh needed.
  const currentIndex = challenges.findIndex((c) => c.id === selectedChallenge.id);
  const nextChallenge = currentIndex >= 0 ? challenges[currentIndex + 1] ?? null : null;
  const nextChallengeLocked = nextChallenge ? locks[nextChallenge.id] !== false : false;

  return (
    <>
      <UserBar name={user.name} avatar={user.avatar} score={user.score} />
      {/* Fixed to the viewport, not the page flow — visible the instant you solve
          something, with zero scrolling, no matter how long the page is or where
          you're scrolled to. Locks are live (see the lock:update socket effect),
          so "next lab" unlocks here the moment the admin opens it. */}
      {(alreadySolved || flagAlreadySolved) && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.1)]">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-center">
            {nextChallenge ? (
              nextChallengeLocked ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Lock className="h-4 w-4 shrink-0" />
                  Next lab — {nextChallenge.title} — isn't open yet. It'll unlock automatically as soon as your instructor opens it.
                </div>
              ) : (
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => handleSelectChallenge(nextChallenge)}
                >
                  Next Challenge: {nextChallenge.title}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )
            ) : (
              <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
                <CheckCircle className="h-4 w-4 shrink-0" />
                You've completed every available challenge!
              </div>
            )}
          </div>
        </div>
      )}
      <div className={`min-h-screen bg-gray-50 p-4 ${(alreadySolved || flagAlreadySolved) ? 'pb-24' : ''}`}>
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row md:items-start md:gap-6">
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Button variant="outline" onClick={handleBackToChallenges}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Challenges
                  </Button>
                </div>
                <div className="w-32"></div> {/* Spacer for centering */}
              </div>
              <ResizableCard defaultWidth={800}>
                <Card className="mt-10">
                  <CardHeader>
                    <div className="flex justify-between w-full items-center">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-orange-500" />
                          {selectedChallenge.title}
                        </CardTitle>
                        <CardDescription className="mt-2 text-sm">{selectedChallenge.description}</CardDescription>
                      </div>
                      <span className="flex bg-blue-100 text-blue-800 text-sm font-semibold px-2 py-1 w-28 rounded-full items-center">
                        Attempts: {attemptsRemaining === null ? '…' : attemptsRemaining}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div className="flex items-center gap-4">
                        {/* Timer display for all users and admin */}
                        <ChallengeTimer timeLeft={challengeTimeLeft} timer={challengeTimer} />
                        <audio ref={countdownAudioRef} src="/sounds/countdown-10s.mp3" preload="auto" />
                        {codePanelIndex === CODE_PANEL_EXPLANATION && (
                          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                            <AlertTriangle className="h-3.5 w-3.5" /> Exact Vulnerability
                          </span>
                        )}
                        {codePanelIndex === CODE_PANEL_FIXED && (
                          <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                            <CheckCircle className="h-3.5 w-3.5" /> Fixed / Secure Code
                          </span>
                        )}
                      </div>
                      {/* Fixed, always-visible spot for Show Hints — same place on every
                          challenge regardless of code length, instead of living below the
                          code block where it scrolled out of sight on longer snippets. */}
                      {codePanelIndex === CODE_PANEL_VULNERABLE && !submitted && selectedChallenge.hints && (
                        <Button variant="outline" size="sm" onClick={() => setShowHints(!showHints)}>
                          <Lightbulb className="h-4 w-4 mr-2" />
                          {showHints ? "Hide Hints" : "Show Hints"}
                        </Button>
                      )}
                    </div>
                    <div className="relative overflow-hidden rounded-lg group">
                      {/* Carousel nav arrows */}
                      {canGoPrevPanel && (
                        <button
                          type="button"
                          onClick={goPrevPanel}
                          aria-label="Previous"
                          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white opacity-70 hover:opacity-100 transition-opacity"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                      )}
                      {canGoNextPanel && (
                        <button
                          type="button"
                          onClick={goNextPanel}
                          aria-label="Next"
                          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white opacity-70 hover:opacity-100 transition-opacity"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      )}
                      {/* Slide position dots */}
                      {CODE_PANEL_COUNT > 1 && (
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex gap-1.5">
                          {Array.from({ length: CODE_PANEL_COUNT }).map((_, i) => (
                            <span
                              key={i}
                              className={`h-1.5 w-1.5 rounded-full transition-colors ${i === codePanelIndex ? 'bg-white' : 'bg-white/40'}`}
                            />
                          ))}
                        </div>
                      )}
                      <div
                        className="flex transition-transform duration-500 ease-in-out"
                        style={{ width: `${CODE_PANEL_COUNT * 100}%`, transform: `translateX(-${codePanelIndex * (100 / CODE_PANEL_COUNT)}%)` }}
                      >
                        {/* Panel 1: vulnerable code — no label, this is the challenge itself */}
                        <div className="shrink-0 bg-gray-900 rounded-lg p-4 overflow-x-auto overflow-y-auto" style={{ width: `${100 / CODE_PANEL_COUNT}%`, height: 480 }}>
                          <SyntaxHighlighter
                            language="javascript"
                            style={oneDark}
                            customStyle={{ background: 'transparent', fontSize: 14, margin: 0, padding: 0 }}
                            showLineNumbers
                            wrapLines
                            lineProps={(lineNumber: number) => {
                              const status = getLineStatus(lineNumber);
                              const isSelected = selectedLines.includes(lineNumber);
                              let className = "flex items-center cursor-pointer transition-colors ";
                              if (isSelected && !submitted) className += "bg-blue-900/50 hover:bg-blue-900/70 ";
                              if (submitted && status === "correct") className += "bg-green-900/50 ";
                              if (submitted && status === "incorrect") className += "bg-red-900/50 ";
                              return {
                                className,
                                onClick: () => toggleLine(lineNumber),
                                style: { cursor: 'pointer' },
                              };
                            }}
                            lineNumberStyle={{ minWidth: 32, color: '#888', textAlign: 'right', userSelect: 'none', marginRight: 16 }}
                          >
                            {selectedChallenge.code}
                          </SyntaxHighlighter>
                        </div>
                        {/* Panel 2: exact vulnerability — the real vulnerable lines highlighted,
                            read-only (no click-to-select, this isn't scored), with explanations
                            so the walkthrough can happen right here instead of switching to slides */}
                        <div className="shrink-0 bg-gray-900 rounded-lg p-4 overflow-x-auto overflow-y-auto" style={{ width: `${100 / CODE_PANEL_COUNT}%`, height: 480 }}>
                          {revealLoading ? (
                            <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
                          ) : (
                            <>
                              <SyntaxHighlighter
                                language="javascript"
                                style={oneDark}
                                customStyle={{ background: 'transparent', fontSize: 14, margin: 0, padding: 0 }}
                                showLineNumbers
                                wrapLines
                                lineProps={(lineNumber: number) => ({
                                  className: revealData?.vulnerableLines.includes(lineNumber) ? 'bg-red-900/50' : '',
                                })}
                                lineNumberStyle={{ minWidth: 32, color: '#888', textAlign: 'right', userSelect: 'none', marginRight: 16 }}
                              >
                                {selectedChallenge.code}
                              </SyntaxHighlighter>
                              <div className="mt-3 space-y-2">
                                {(revealData?.vulnerableLines ?? []).map((lineNumber) => (
                                  <div key={lineNumber} className="rounded border-l-4 border-red-400 bg-red-950/40 p-2">
                                    <p className="text-xs font-semibold text-red-300">Line {lineNumber}</p>
                                    <p className="text-xs text-red-200">{revealData?.explanations[lineNumber]}</p>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                        {/* Panel 3: fixed / secure code */}
                        <div className="shrink-0 bg-gray-900 rounded-lg p-4 overflow-x-auto overflow-y-auto" style={{ width: `${100 / CODE_PANEL_COUNT}%`, height: 480 }}>
                          {revealLoading ? (
                            <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
                          ) : revealData?.fixedCode ? (
                            <SyntaxHighlighter
                              language="javascript"
                              style={oneDark}
                              customStyle={{ background: 'transparent', fontSize: 14, margin: 0, padding: 0 }}
                              showLineNumbers
                              lineNumberStyle={{ minWidth: 32, color: '#888', textAlign: 'right', userSelect: 'none', marginRight: 16 }}
                            >
                              {revealData.fixedCode}
                            </SyntaxHighlighter>
                          ) : (
                            <div className="py-8 text-center text-sm text-gray-400">
                              No fixed-code example has been added for this challenge yet — add one from the admin dashboard.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Hint content renders right below the code it's about, directly under
                        the Show Hints toggle above — not buried past the submit row, the
                        flag form, and the solved-status card like before. */}
                    {showHints && selectedChallenge.hints && !submitted && (
                      <div className="mt-4 p-4 bg-blue-50 border-l-4 border-blue-400 rounded">
                        <h4 className="font-medium text-blue-800 mb-2">💡 Hints:</h4>
                        <ul className="text-sm text-blue-700 space-y-1">
                          {selectedChallenge.hints.map((hint, index) => (
                            <li key={index}>• {hint}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between">
                      {/* Result indicator lives right next to the Submit/Try Again button —
                          same row, so it's immediately in view without shifting anything. */}
                      <div className="flex items-center gap-2">
                        {!submitToast && timerExpired && !alreadySolved && (
                          <span className="flex items-center gap-2 rounded-full border-2 border-gray-300 bg-gray-100 px-3 py-1.5 text-sm font-bold text-gray-600">
                            <XCircle className="h-4 w-4 shrink-0" />
                            Time's up — submissions closed
                          </span>
                        )}
                        {submitToast?.status === 'checking' && (
                          <span className="flex items-center gap-2 text-sm font-semibold text-gray-600 animate-fade-in">
                            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                            Checking…
                          </span>
                        )}
                        {submitToast?.status === 'incorrect' && (
                          <span className="flex items-center gap-2 rounded-full border-2 border-red-400 bg-red-100 px-3 py-1.5 text-sm font-bold text-red-700 animate-fade-in">
                            <XCircle className="h-4 w-4 shrink-0" />
                            Not the vulnerable line{attemptsRemaining !== null && attemptsRemaining > 0 ? ` — ${attemptsRemaining} left` : ''}
                          </span>
                        )}
                        {submitToast?.status === 'correct' && (
                          <span className="flex items-center gap-2 rounded-full border-2 border-green-400 bg-green-100 px-3 py-1.5 text-sm font-bold text-green-700 animate-fade-in">
                            <CheckCircle className="h-4 w-4 shrink-0" />
                            Correct!
                          </span>
                        )}
                        {submitToast?.status === 'blocked' && (
                          <span className="flex items-center gap-2 rounded-full border-2 border-gray-300 bg-gray-100 px-3 py-1.5 text-sm font-bold text-gray-600 animate-fade-in">
                            <XCircle className="h-4 w-4 shrink-0" />
                            {submitToast.message}
                          </span>
                        )}
                      </div>

                      <div className="space-x-2">
                        {!submitted || lastSubmissionCorrect === true ? (
                          <div className="flex gap-2">
                            {(() => {
                              const labUrl = selectedChallenge.labUrl || '';
                              const fullUrl = getDynamicLabUrl(labUrl);
                              return (
                                <a
                                  href={fullUrl || '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <Button
                                    type="button"
                                    className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200"
                                    variant="outline"
                                    disabled={!labUrl}
                                    title={fullUrl || 'No URL set'}
                                  >
                                    Go to Lab
                                  </Button>
                                </a>
                              );
                            })()}
                            <Button onClick={handleSubmit} disabled={selectedLines.length === 0 || alreadySolved || attemptsRemaining === 0 || attemptsRemaining === null || isLocked || timerExpired}>
                              Submit Answer
                            </Button>
                          </div>
                        ) : (
                          <Button onClick={handleReset} variant="outline">
                            Try Again
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* --- Flag submission for challenge view --- */}
                    <div className="mt-5">
                      {/* Only show flag submission form if flag is not already solved */}
                      {!flagAlreadySolved && timerExpired && (
                        <div className="mb-2 text-sm font-semibold text-gray-600">
                          Time's up for this challenge — flag submissions are closed.
                        </div>
                      )}
                      {!flagAlreadySolved && (
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (!flagInput.trim() || flagAlreadySolved || isLocked || timerExpired) return;
                            setFlagChallengeLoading(true);
                            setFlagChallengeStatus({ status: 'loading' });
                            try {
                              const res = await fetch('/api/submit-flag', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ challengeId: selectedChallenge.id, flag: flagInput.trim() }),
                              });
                              const data = await res.json();
                              if (res.status === 423) {
                                setFlagChallengeStatus({ status: 'error', message: typeof data.error === 'string' ? data.error : 'Flag submissions are closed for this challenge.' });
                              } else if (data.success && data.correct) {
                                setFlagChallengeStatus({ status: 'success', message: data.alreadySolved ? 'Already solved!' : 'Correct flag! +5 points' });
                                setUser(u => ({ ...u, score: data.score }));
                                if (!data.alreadySolved) setLeaderboardRefreshSignal(s => s + 1);
                                refreshSolvedStates();
                              } else if (data.success && data.alreadySolved) {
                                setFlagChallengeStatus({ status: 'already', message: 'Already solved!' });
                                refreshSolvedStates();
                              } else {
                                setFlagChallengeStatus({ status: 'error', message: 'Incorrect flag. Try again.' });
                              }
                            } catch {
                              setFlagChallengeStatus({ status: 'error', message: 'Could not submit flag. Please try again.' });
                            } finally {
                              setFlagChallengeLoading(false);
                            }
                          }}
                          className="flex items-center gap-2 mb-6"
                        >
                          <input
                            type="text"
                            className="border rounded px-3 py-2 w-full focus:outline-none focus:ring"
                            placeholder="Flag here"
                            value={flagInput}
                            onChange={e => setFlagInput(e.target.value)}
                            disabled={flagChallengeLoading || flagAlreadySolved || isLocked || timerExpired}
                          />
                          <Button
                            type="submit"
                            className="ml-2 h-full bg-green-100 text-green-700 hover:bg-green-200 border-green-200"
                            variant="outline"
                            disabled={flagChallengeLoading || !flagInput.trim() || flagAlreadySolved || isLocked || timerExpired}
                          >
                            {flagChallengeLoading ? 'Submitting...' : 'Submit Flag'}
                          </Button>
                        </form>
                      )}
                      {/* Feedback message/status always shown if not idle */}
                      {flagChallengeStatus.status !== 'idle' && (
                        <div className="mt-3">
                          {flagChallengeStatus.status === 'success' && (
                            <div className="flex items-center gap-2 bg-green-100 border border-green-300 text-green-800 px-4 py-2 rounded shadow-sm animate-fade-in">
                              <CheckCircle className="h-5 w-5 text-green-500" />
                              <span className="font-semibold">{flagChallengeStatus.message}</span>
                            </div>
                          )}
                          {flagChallengeStatus.status === 'error' && (
                            <div className="flex items-center gap-2 bg-red-100 border border-red-300 text-red-800 px-4 py-2 rounded shadow-sm animate-fade-in">
                              <XCircle className="h-5 w-5 text-red-500" />
                              <span className="font-semibold">{flagChallengeStatus.message}</span>
                            </div>
                          )}
                          {flagChallengeStatus.status === 'loading' && (
                            <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 text-gray-800 px-4 py-2 rounded shadow-sm animate-fade-in">
                              <span className="font-semibold">Checking flag...</span>
                            </div>
                          )}
                        </div>
                      )}
                      {/* --- Enhanced 2-column solved status view --- */}
                      <div className="my-8">
                        <Card className="shadow-md border max-w-2xl mx-auto">
                          <CardContent className="py-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Challenge Submission Status */}
                              <div className="flex flex-col items-center justify-center text-center">
                                <div className="mb-2">
                                  {alreadySolved ? (
                                    <CheckCircle className="h-10 w-10 text-green-500 transition-transform duration-300 scale-110" />
                                  ) : (
                                    <XCircle className="h-10 w-10 text-red-400 transition-transform duration-300 scale-100" />
                                  )}
                                </div>
                                <span className={`text-base font-semibold mb-1 ${alreadySolved ? 'text-green-700' : 'text-red-700'}`}>Challenge Submission</span>
                                <span className={`text-xs font-medium mb-2 ${alreadySolved ? 'text-green-600' : 'text-red-500'}`}>{alreadySolved ? 'Solved' : 'Not Solved'}</span>
                                <span className="text-xs text-gray-500">Select the vulnerable line in the code above.</span>
                              </div>
                              {/* Flag Submission Status */}
                              <div className="flex flex-col items-center justify-center text-center">
                                <div className="mb-2">
                                  {flagAlreadySolved ? (
                                    <CheckCircle className="h-10 w-10 text-green-500 transition-transform duration-300 scale-110" />
                                  ) : (
                                    <XCircle className="h-10 w-10 text-red-400 transition-transform duration-300 scale-100" />
                                  )}
                                </div>
                                <span className={`text-base font-semibold mb-1 ${flagAlreadySolved ? 'text-green-700' : 'text-red-700'}`}>Flag Submission</span>
                                <span className={`text-xs font-medium mb-2 ${flagAlreadySolved ? 'text-green-600' : 'text-red-500'}`}>{flagAlreadySolved ? 'Solved' : 'Not Solved'}</span>
                                <span className="text-xs text-gray-500">Submit the flag you found in the lab.</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </ResizableCard>

              {showResults && lastSubmissionCorrect && (
                <Card className="mt-5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      Vulnerability Explanations
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        {revealedVulnerableLines.map((lineNumber) => (
                          <div key={lineNumber} className="p-3 bg-red-50 border-l-4 border-red-400 rounded">
                            <p className="font-medium text-red-800">Line {lineNumber}: Vulnerability Found</p>
                            <p className="text-sm text-red-700">{revealedExplanations[lineNumber]}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
            {/* Leaderboard on the right */}
            <div className="w-full mt-24 md:w-[400px] flex-shrink-0 md:self-start">
              <Leaderboard currentUser={user} refreshSignal={leaderboardRefreshSignal} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
