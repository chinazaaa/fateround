// Per-IP rate limiting for the public winner self-post endpoint.
//
// The weekly post code is intentionally short/memorable, so we cap how many
// attempts a single IP can make within a rolling window. DB-backed
// (community_post_win_attempts) because the endpoint runs on serverless
// instances that don't share memory.
//
// Concurrency: the increment happens in one atomic DB statement (the
// community_post_win_touch RPC) so simultaneous wrong guesses can't slip past
// the cap. We RESERVE a slot before checking the code and REFUND it (clear the
// row) on success, so a legitimate winner never accumulates a count.
//
// Privacy: only a keyed HMAC of the IP is stored (peppered with the server-only
// ADMIN_SESSION_SECRET), so a leaked ip_hash can't be cheaply enumerated back to
// an address the way a plain SHA-256 of an IPv4 could. Best-effort throughout: on
// any DB error we fail OPEN (allow) so a transient issue never locks out real
// winners — the short delay + weekly rotation remain as backstops.

import { getSupabaseAdmin } from '@/lib/supabase-admin'

// clientIp() falls back to this when no forwarding header is present. Every
// headerless request would otherwise share one DB row, so we skip rate limiting
// for it (fail open) rather than let one bad client throttle the whole bucket.
const UNKNOWN_IP = 'unknown'

const WINDOW_SECONDS = 15 * 60 // 15 minutes
const MAX_ATTEMPTS = 10 // attempts per IP per window before 429

// Best-effort client IP from proxy headers (Vercel sets x-forwarded-for).
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')?.trim() || UNKNOWN_IP
}

// Keyed hash so stored ip_hash values can't be reversed by offline enumeration.
// Peppered with a server-only secret (ADMIN_SESSION_SECRET, required in prod);
// if it's absent the caller's try/catch fails open, disabling only rate limiting.
async function hashIp(ip: string): Promise<string> {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`post-win:${ip}`))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Reserve one attempt for this IP (atomic increment). Returns whether the caller
// is now over the cap. Call this BEFORE verifying the code; clear on success.
export async function reservePostWinSlot(ip: string): Promise<{ allowed: boolean; retryAfterSec: number }> {
  if (ip === UNKNOWN_IP) return { allowed: true, retryAfterSec: 0 } // no shared bucket for headerless requests
  try {
    const ipHash = await hashIp(ip)
    const { data, error } = await getSupabaseAdmin().rpc('community_post_win_touch', {
      p_ip_hash: ipHash,
      p_window_seconds: WINDOW_SECONDS,
    })
    if (error) return { allowed: true, retryAfterSec: 0 } // fail open

    const row = Array.isArray(data) ? data[0] : data
    const count = (row?.attempt_count as number) ?? 0
    if (count > MAX_ATTEMPTS) {
      const start = row?.window_started_at ? new Date(row.window_started_at as string).getTime() : Date.now()
      const remainingMs = WINDOW_SECONDS * 1000 - (Date.now() - start)
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(remainingMs / 1000)) }
    }
    return { allowed: true, retryAfterSec: 0 }
  } catch {
    return { allowed: true, retryAfterSec: 0 } // fail open
  }
}

// Clear an IP's counter after a successful post so legit winners aren't throttled.
export async function clearPostWinAttempts(ip: string): Promise<void> {
  if (ip === UNKNOWN_IP) return // nothing reserved for the shared bucket
  try {
    const ipHash = await hashIp(ip)
    await getSupabaseAdmin().from('community_post_win_attempts').delete().eq('ip_hash', ipHash)
  } catch {
    /* best-effort */
  }
}
