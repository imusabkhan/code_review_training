// Shared across submit-challenge (enforcement) and challenge-attempts (display) —
// these must never drift apart, or the UI will show a different attempt count
// than the server actually enforces.
export const MAX_CHALLENGE_ATTEMPTS = 4;
