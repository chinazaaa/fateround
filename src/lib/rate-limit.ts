// Generic per-IP rate limiting for the public write endpoints (game create,
// player/room join). A coarse app-level BACKSTOP to the edge (Cloudflare) rules:
// the limits are generous enough that a real shared-IP venue/classroom won't trip
// them, but a runaway script hammering thousands of requests will. DB-backed
// (api_rate_limit_attempts) because these endpoints run on serverless instances
// that don't share memory; the increment is one atomic RPC (api_rate_limit_touch)
// so concurrent requests can't slip past the cap.
//
// Fail-open throughout: on any misconfiguration or DB error we ALLOW, so a
// transient issue never blocks legitimate play — Cloudflare remains the real gate.
//
// Privacy: only a keyed HMAC of the IP is stored (peppered with the server-only
// ADMIN_SESSION_SECRET), so a leaked key can't be enumerated back to an address.

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { clientIp } from '@/lib/community-rate-limit'

// clientIp() returns this when no forwarding header is present. Every headerless
// request would otherwise share one row, so we skip limiting for it (fail open)
// rather than let one bad client throttle the whole bucket.
const UNKNOWN_IP = 'unknown'

export type RateLimitRule = {
  /** Namespace so different endpoints don't share a counter, e.g. 'game-create'. */
  bucket: string
  /** Allowed requests per IP per window before a 429. */
  max: number
  /** Rolling window length in seconds. */
  windowSeconds: number
}

// Generous backstop limits — tuned to never hit a legitimate shared-IP scenario
// (a 40-player game behind one NAT, back-to-back rooms at a venue) while still
// stopping scripted floods. Edge rules do the fine-grained work.
export const RATE_LIMITS = {
  // One host creates one game; >40 creates from an IP in 5 min is a script.
  gameCreate: { bucket: 'game-create', max: 40, windowSeconds: 300 },
  // A full game joining behind one NAT is ~40 requests; 200/5min covers several
  // concurrent games plus reconnect storms.
  join: { bucket: 'join', max: 200, windowSeconds: 300 },
  // One call per player per finished game. A 40-player classroom behind one NAT
  // playing back-to-back rounds is the sizing case, hence the high ceiling.
  profileAttribute: { bucket: 'profile-attribute', max: 300, windowSeconds: 300 },
  // Sending an OTP costs a real email, so this is tighter than the gameplay buckets —
  // but still has to clear a few people signing up from the same room at once.
  authRequestCode: { bucket: 'auth-request-code', max: 20, windowSeconds: 900 },
  // Backstop against grinding a 6-digit code. Supabase enforces its own per-token
  // attempt limit too; this only stops a scripted flood from one IP.
  authVerifyCode: { bucket: 'auth-verify-code', max: 30, windowSeconds: 900 },
  // Every GIF search spends third-party Klipy quota, and the endpoint is unauthenticated
  // (audit finding M2). Typing in the picker is debounced client-side, so a real user makes
  // a handful of calls per minute — a whole room browsing at once still clears this.
  klipy: { bucket: 'klipy', max: 300, windowSeconds: 300 },
  // Public write into the shared question-pack library (audit finding M3). Submitting a pack
  // is a deliberate, occasional action, so this is deliberately much tighter than gameplay.
  librarySubmit: { bucket: 'library-submit', max: 20, windowSeconds: 3600 },
  // Unauthenticated outbound proxy to the Anthropic API (audit finding M7). The caller
  // supplies their own key so there is no cost to us, but it shouldn't be a free relay.
  aiQuestions: { bucket: 'ai-questions', max: 60, windowSeconds: 300 },
  // Returns whole-session snapshots, so it's worth a flood backstop alongside the token
  // check added for audit finding M4.
  gameSnapshots: { bucket: 'game-snapshots', max: 300, windowSeconds: 300 },
  // Guards the Codewords key card: without a cap, a wrong-token caller could grind this
  // endpoint. Sized for real play — every player re-fetches the board on each board change.
  codewordsBoard: { bucket: 'codewords-board', max: 600, windowSeconds: 300 },
} as const satisfies Record<string, RateLimitRule>

// Keyed hash so stored keys can't be reversed by offline enumeration. Peppered
// with a server-only secret (ADMIN_SESSION_SECRET, required in prod); if it's
// absent the caller's try/catch fails open, disabling only rate limiting. The
// bucket is mixed in so the same IP hashes differently per endpoint, and kept as
// a readable prefix on the stored key for debugging/retention.
async function hashKey(bucket: string, ip: string): Promise<string> {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${bucket}:${ip}`))
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `${bucket}:${hex}`
}

/**
 * Reserve one hit for this request's IP under `rule`. Returns a ready-to-return
 * 429 `NextResponse` (with a `Retry-After` header) when the IP is over the cap,
 * or `null` to proceed. Fails open (returns `null`) on headerless requests, a
 * missing secret, or any DB error.
 */
export async function enforceRateLimit(req: Request, rule: RateLimitRule): Promise<NextResponse | null> {
  const ip = clientIp(req)
  if (ip === UNKNOWN_IP) return null // no shared bucket for headerless requests
  try {
    const key = await hashKey(rule.bucket, ip)
    const { data, error } = await getSupabaseAdmin().rpc('api_rate_limit_touch', {
      p_key: key,
      p_window_seconds: rule.windowSeconds,
    })
    if (error) return null // fail open

    const row = Array.isArray(data) ? data[0] : data
    const count = (row?.attempt_count as number) ?? 0
    if (count > rule.max) {
      const start = row?.window_started_at ? new Date(row.window_started_at as string).getTime() : Date.now()
      const remainingMs = rule.windowSeconds * 1000 - (Date.now() - start)
      const retryAfterSec = Math.max(1, Math.ceil(remainingMs / 1000))
      return NextResponse.json(
        { error: 'Too many requests — please slow down and try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
      )
    }
    return null
  } catch {
    return null // fail open
  }
}
