// Derives a display name from the local-part of an email, e.g.
// "aaniq.tejani@beyond.one" -> "Aaniq Tejani". Splits on '.', '_', or '-'
// since those are the separators people actually use in work emails.
export function deriveNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const parts = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
  return parts.length > 0 ? parts.join(' ') : local;
}

// Excludes visually-ambiguous characters (0/O, 1/I/L) since these codes get
// read aloud or typed from a slide during a live session.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

// Splits a pasted blob of emails (one per line, or comma/semicolon/space
// separated) into a deduped, lowercased, trimmed list of syntactically valid
// addresses.
export function parseEmailList(raw: string): string[] {
  const seen = new Set<string>();
  for (const token of raw.split(/[\s,;]+/)) {
    const email = token.trim().toLowerCase();
    if (email && isValidEmail(email)) seen.add(email);
  }
  return Array.from(seen);
}
