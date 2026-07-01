// Per-IP rate limiting for the public winner self-post endpoint.
//
// The weekly post code is intentionally short/memorable, so we cap how many
// WRONG attempts a single IP can make within a rolling window. This is DB-backed
// (community_post_win_attempts) rather than in-memory because the endpoint runs
// on serverless instances that don't share memory. Best-effort: on any DB error
// we fail OPEN (allow) so a transient issue never locks out legitimate winners —
// the short delay + weekly rotation remain as backstops.

import { getSupabaseAdmin } from '@/lib/supabase-admin'

const TABLE = 'community_post_win_attempts'
const WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_FAILED_ATTEMPTS = 10 // wrong codes per IP per window before 429

// Best-effort client IP from proxy headers (Vercel sets x-forwarded-for).
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

// Check whether this IP may attempt now, WITHOUT recording. Call before verifying
// the code. Returns retryAfterSec when blocked.
export async function checkPostWinRateLimit(ip: string): Promise<{ allowed: boolean; retryAfterSec: number }> {
  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase.from(TABLE).select('count, window_started_at').eq('ip', ip).maybeSingle()
    if (!data) return { allowed: true, retryAfterSec: 0 }

    const elapsed = Date.now() - new Date(data.window_started_at as string).getTime()
    if (elapsed >= WINDOW_MS) return { allowed: true, retryAfterSec: 0 } // window expired
    if ((data.count as number) >= MAX_FAILED_ATTEMPTS) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 1000)) }
    }
    return { allowed: true, retryAfterSec: 0 }
  } catch {
    return { allowed: true, retryAfterSec: 0 } // fail open
  }
}

// Record a wrong-code attempt: increment within the active window, or start a
// fresh window. Best-effort (ignores errors).
export async function recordFailedPostWin(ip: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase.from(TABLE).select('count, window_started_at').eq('ip', ip).maybeSingle()

    const withinWindow = data && Date.now() - new Date(data.window_started_at as string).getTime() < WINDOW_MS
    if (withinWindow) {
      await supabase
        .from(TABLE)
        .update({ count: (data!.count as number) + 1 })
        .eq('ip', ip)
    } else {
      await supabase
        .from(TABLE)
        .upsert({ ip, count: 1, window_started_at: new Date().toISOString() }, { onConflict: 'ip' })
    }
  } catch {
    /* best-effort */
  }
}

// Clear an IP's counter after a successful post so legit winners aren't throttled.
export async function clearPostWinAttempts(ip: string): Promise<void> {
  try {
    await getSupabaseAdmin().from(TABLE).delete().eq('ip', ip)
  } catch {
    /* best-effort */
  }
}
