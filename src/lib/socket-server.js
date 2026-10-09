import { createServer } from 'http';
import { Server } from 'socket.io';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});

// Set to track unique user IDs
const activeUsers = new Set();

// Timer state per challenge
const challengeTimers = {};

// Fixed-code reveal state per challenge (manual admin override — the automatic
// reveal-on-timer-expiry is computed independently per client from timer state)
const challengeFixRevealed = {};

// Helper to broadcast timer state
function broadcastTimerUpdate(challengeId) {
  const timer = challengeTimers[challengeId];
  if (timer) {
    io.emit('timer:update', { challengeId, ...timer });
  }
}

io.on('connection', (socket) => {
  let userId = null;
  let isAdmin = false;

  // Helper to emit user count to all clients
  function emitUserCount() {
    io.emit('userCount', activeUsers.size);
  }

  // Expect the client to send their userId and admin flag immediately after connecting
  socket.on('register', (id, adminFlag) => {
    userId = id;
    isAdmin = !!adminFlag;
    socket.data = { userId: id, isAdmin };
    if (!isAdmin) {
      if (!activeUsers.has(id)) {
        activeUsers.add(id);
        emitUserCount();
      }
    }
  });

  socket.on('disconnect', () => {
    const id = socket.data?.userId;
    const wasAdmin = socket.data?.isAdmin;
    if (id && !wasAdmin) {
      // Check if any other sockets with the same userId are still connected
      const stillConnected = Array.from(io.sockets.sockets.values()).some(
        (s) => s !== socket && s.data?.userId === id && !s.data?.isAdmin
      );
      if (!stillConnected) {
        activeUsers.delete(id);
        emitUserCount();
      }
    }
  });

  // Admin starts timer for a challenge
  socket.on('admin:startTimer', ({ challengeId, duration }) => {
    const now = Date.now();
    challengeTimers[challengeId] = {
      startTime: now,
      duration,
      isRunning: true,
      isPaused: false,
      pausedAt: undefined,
      remaining: undefined,
    };
    broadcastTimerUpdate(challengeId);
  });

  // Admin pauses timer
  socket.on('admin:pauseTimer', ({ challengeId }) => {
    const timer = challengeTimers[challengeId];
    if (timer && timer.isRunning && !timer.isPaused) {
      timer.isPaused = true;
      timer.pausedAt = Date.now();
      timer.remaining = (timer.startTime + timer.duration) - timer.pausedAt;
      timer.isRunning = false;
      broadcastTimerUpdate(challengeId);
    }
  });

  // Admin resumes timer
  socket.on('admin:resumeTimer', ({ challengeId }) => {
    const timer = challengeTimers[challengeId];
    if (timer && timer.isPaused && timer.remaining && timer.remaining > 0) {
      timer.isPaused = false;
      timer.isRunning = true;
      timer.startTime = Date.now();
      timer.duration = timer.remaining;
      timer.pausedAt = undefined;
      timer.remaining = undefined;
      broadcastTimerUpdate(challengeId);
    }
  });

  // Admin resets timer — broadcast the cleared state directly rather than via
  // broadcastTimerUpdate(), which only emits when a timer still exists in memory;
  // by the time we'd call it here it's already deleted, so every OTHER connected
  // client (not just the admin who clicked it) would otherwise never learn the
  // timer was reset.
  socket.on('admin:resetTimer', ({ challengeId }) => {
    delete challengeTimers[challengeId];
    io.emit('timer:update', { challengeId, startTime: 0, duration: 0, isRunning: false, isPaused: false });
  });

  // Admin locks/unlocks a challenge — relayed live so a player sitting on the
  // next-lab button (or the challenge grid) sees it open the instant the admin
  // unlocks it, with no back-and-refresh needed. Persistence is handled
  // separately by POST /api/challenge-locks; this is purely the live broadcast.
  socket.on('admin:setLock', ({ challengeId, locked }) => {
    io.emit('lock:update', { challengeId, locked });
  });

  // Admin manually reveals/hides the fixed-code panel (e.g. for a challenge with
  // no timer running, or to show it ahead of/again after the timer finishing)
  socket.on('admin:revealFix', ({ challengeId }) => {
    challengeFixRevealed[challengeId] = true;
    io.emit('fix:reveal', { challengeId });
  });
  socket.on('admin:hideFix', ({ challengeId }) => {
    delete challengeFixRevealed[challengeId];
    io.emit('fix:hide', { challengeId });
  });

  // Admin does a full reset (paired with POST /api/admin-reset clearing the DB) —
  // wipes every in-memory timer and fix-reveal, for every challenge, and tells
  // every connected client so stale state from a demo/mock run never bleeds into
  // the real session.
  socket.on('admin:resetAll', () => {
    const timerIds = Object.keys(challengeTimers);
    const revealIds = Object.keys(challengeFixRevealed);
    timerIds.forEach((id) => delete challengeTimers[id]);
    revealIds.forEach((id) => delete challengeFixRevealed[id]);
    const allIds = new Set([...timerIds, ...revealIds]);
    allIds.forEach((challengeId) => {
      io.emit('timer:update', { challengeId, startTime: 0, duration: 0, isRunning: false, isPaused: false });
      io.emit('fix:hide', { challengeId });
    });
  });

  // On user connect, send current timer state for all running timers
  Object.entries(challengeTimers).forEach(([challengeId, timer]) => {
    if (timer.isRunning || timer.isPaused) {
      socket.emit('timer:update', { challengeId, ...timer });
    }
  });
  // ...and current fixed-code reveal state
  Object.keys(challengeFixRevealed).forEach((challengeId) => {
    socket.emit('fix:reveal', { challengeId });
  });
});

// Try different ports if 4001 is busy
const tryPort = (port) => {
  return new Promise((resolve, reject) => {
    const server = httpServer.listen(port, () => {
      const actualPort = server.address()?.port;
      server.close(() => resolve(actualPort));
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} is busy, trying ${port + 1}...`);
        resolve(tryPort(port + 1));
      } else {
        reject(err);
      }
    });
  });
};

const startServer = async () => {
  try {
    const port = await tryPort(4001);
    httpServer.listen(port, () => {
      console.log(`Socket.IO server running on port ${port}`);
      // Update environment variable for the client
      process.env.NEXT_PUBLIC_SOCKET_URL = `http://localhost:${port}`;
    });
  } catch (error) {
    console.error('Failed to start socket server:', error);
    process.exit(1);
  }
};

startServer();
