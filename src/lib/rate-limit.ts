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
  // Backstop against grinding an 8-digit code. Supabase enforces its own per-token
  // attempt limit too; this only stops a scripted flood from one IP.
  authVerifyCode: { bucket: 'auth-verify-code', max: 30, windowSeconds: 900 },
  // Every GIF search spends third-party Klipy quota, and the endpoint is unauthenticated
  // (audit finding M2). Typing in the picker is debounced client-side, so a real user makes
  // a handful of calls per minute — a whole room browsing at once still clears this.
  klipy: { bucket: 'klipy', max: 300, windowSeconds: 300 },
  // Public write into the shared question-pack library (audit finding M3). Submitting a pack
  // is a deliberate, occasional action, so this is deliberately much tighter than gameplay.
  librarySubmit: { bucket: 'library-submit', max: 20, windowSeconds: 3600 },
  // Outbound proxy to the Anthropic API — we now supply the key, so every generation
  // costs us money. THREE buckets guard it (see the ai-questions route for order).
  //
  // The two per-IP buckets shape individual behaviour: a short burst limit stops
  // scripted floods, a per-day cap sizes one caller's share. Real hosts generate a
  // deck or two per event, so these are abuse backstops rather than UX gates.
  aiQuestions: { bucket: 'ai-questions', max: 10, windowSeconds: 300 },
  aiQuestionsDaily: { bucket: 'ai-questions-daily', max: 15, windowSeconds: 86_400 },
  // …but per-IP limits CANNOT bound total spend, and that asymmetry cuts both ways:
  // a school or church hall behind one NAT shares a single 15/day allowance between
  // forty people, while one attacker on mobile data resets theirs by cycling IPs.
  // Neither case is capped by the buckets above.
  //
  // So this bucket is keyed to a CONSTANT, not an IP — one global counter for the
  // whole app per day. It is the only hard ceiling on the Anthropic bill until real
  // accounts and entitlements exist (revenue-model-v3.md §8), and unlike the others
  // it fails CLOSED: see enforceGlobalLimit.
  //
  // Sizing: worst case is max × 4096 output tokens (the route's max_tokens). At 200
  // that is ~820k output tokens/day — low tens of dollars at the very worst, and far
  // less in practice since most decks are a fraction of that ceiling. Tune per
  // environment with AI_QUESTIONS_GLOBAL_DAILY_MAX without a deploy.
  //
  // This is a backstop, not a budget: set a spend alert on the Anthropic account too.
  aiQuestionsGlobalDaily: {
    bucket: 'ai-questions-global-daily',
    max: Number(process.env.AI_QUESTIONS_GLOBAL_DAILY_MAX) || 200,
    windowSeconds: 86_400,
  },
  // Multipart upload into storage. A host sets their event logo once or twice, so this
  // is deliberately tight — it only has to clear a host fiddling with a few images.
  tournamentLogoUpload: { bucket: 'tournament-logo-upload', max: 30, windowSeconds: 300 },
  // Returns whole-session snapshots, so it's worth a flood backstop alongside the token
  // check added for audit finding M4.
  gameSnapshots: { bucket: 'game-snapshots', max: 300, windowSeconds: 300 },
  // Guards the Codewords key card: without a cap, a wrong-token caller could grind this
  // endpoint. Sized for real play — every player re-fetches the board on each board change.
  codewordsBoard: { bucket: 'codewords-board', max: 600, windowSeconds: 300 },
  // Card-hand fetches. Every player re-fetches on every play, so in a 6-player game a single
  // round is ~36 calls; this has to clear a long session without ever throttling real play.
  handsFetch: { bucket: 'hands-fetch', max: 1200, windowSeconds: 300 },
  // Host-token reclaim by verified profile. A host who cleared storage or opened the game on a
  // new signed-in device calls this once. Sized to absorb reconnect storms without stalling a
  // real recovery — it never gates gameplay, only hands back the token the profile already owns.
  hostReclaim: { bucket: 'host-reclaim', max: 60, windowSeconds: 300 },
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

/**
 * Reserve one hit against an APP-WIDE counter for `rule` — no IP in the key, so
 * every caller shares one budget. Returns a ready-to-return response when the
 * app is over the cap, or `null` to proceed.
 *
 * For guarding a metered third-party spend, where per-IP limits are structurally
 * unable to bound the total: an attacker cycling IPs gets a fresh per-IP
 * allowance every time, but the same global counter every time.
 *
 * **Fails CLOSED**, which is the opposite of `enforceRateLimit`. That difference
 * is deliberate. Failing open is right for gameplay, where the cost of a DB blip
 * is a blocked player; here the cost is an uncapped bill on someone else's API,
 * and a DB outage is exactly when nobody is watching the dashboard. A 503 is
 * recoverable; an unbounded spend is not. Callers should treat it as
 * "temporarily unavailable", not as an error worth retrying hard.
 */
export async function enforceGlobalLimit(rule: RateLimitRule): Promise<NextResponse | null> {
  const unavailable = () =>
    NextResponse.json({ error: 'This feature is temporarily unavailable — please try again later.' }, { status: 503 })

  try {
    // Constant key: one row for the whole app, deliberately not per-IP. Not
    // hashed — there's no address in it to protect.
    const { data, error } = await getSupabaseAdmin().rpc('api_rate_limit_touch', {
      p_key: `${rule.bucket}:global`,
      p_window_seconds: rule.windowSeconds,
    })
    if (error) return unavailable() // fail closed

    const row = Array.isArray(data) ? data[0] : data
    const count = row?.attempt_count as number | undefined
    // No row back means the reservation didn't actually happen, so we can't
    // prove we're under the cap. Treat it like an outage rather than assuming
    // zero usage — assuming zero is how a broken counter turns into an
    // unbounded bill.
    if (typeof count !== 'number') return unavailable() // fail closed
    if (count > rule.max) {
      const start = row?.window_started_at ? new Date(row.window_started_at as string).getTime() : Date.now()
      const remainingMs = rule.windowSeconds * 1000 - (Date.now() - start)
      const retryAfterSec = Math.max(1, Math.ceil(remainingMs / 1000))
      return NextResponse.json(
        { error: "This feature has hit today's usage limit. It resets within 24 hours." },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
      )
    }
    return null
  } catch {
    return unavailable() // fail closed
  }
}
