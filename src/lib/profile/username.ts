/**
 * Username rules for the public profile slug (/u/<username>).
 *
 * Shared by the claim modal (client) and the claim API (server) so the two never disagree about
 * what's allowed — a value the modal accepts but the API rejects is the annoying kind of bug.
 *
 * Canonical form is lowercase [a-z0-9_], 3–20 chars. `handle` (the display name) is unaffected;
 * this is only the URL-safe slug. The DB carries a matching CHECK constraint + unique index.
 */

export const USERNAME_MIN = 3
export const USERNAME_MAX = 20

/**
 * Route segments and things that must never become someone's public URL — either because they
 * collide with a real path under /u or elsewhere, or because they'd be impersonation bait.
 */
const RESERVED = new Set([
  'me',
  'admin',
  'api',
  'app',
  'auth',
  'about',
  'blog',
  'contact',
  'create',
  'edit',
  'faq',
  'game',
  'games',
  'guest',
  'help',
  'host',
  'join',
  'leaderboard',
  'leaderboards',
  'login',
  'logout',
  'new',
  'null',
  'privacy',
  'profile',
  'profiles',
  'root',
  'settings',
  'signin',
  'signup',
  'support',
  'system',
  'terms',
  'trophies',
  'undefined',
  'user',
  'users',
  'fateround',
])

/** Lowercase + trim. Does NOT strip invalid characters — validation reports those instead. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

export type UsernameCheck = { ok: true; value: string } | { ok: false; error: string; reason: 'invalid' | 'reserved' }

/**
 * Validate a raw input into a canonical username, or an error the UI can show verbatim.
 * `reserved` is split out from `invalid` so the message can be specific ("that one's taken by us").
 */
export function validateUsername(raw: string): UsernameCheck {
  const value = normalizeUsername(raw)
  if (value.length < USERNAME_MIN)
    return { ok: false, reason: 'invalid', error: `At least ${USERNAME_MIN} characters.` }
  if (value.length > USERNAME_MAX) return { ok: false, reason: 'invalid', error: `At most ${USERNAME_MAX} characters.` }
  if (!/^[a-z0-9_]+$/.test(value))
    return { ok: false, reason: 'invalid', error: 'Only letters, numbers and underscores.' }
  if (RESERVED.has(value)) return { ok: false, reason: 'reserved', error: 'That username isn’t available.' }
  return { ok: true, value }
}
