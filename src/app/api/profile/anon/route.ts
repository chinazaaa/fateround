import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getIdentityFromRequest } from '@/lib/identity-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { randomDisplayName } from '@/lib/random-name'
import { z } from 'zod'

/**
 * Ensure a `profiles` row exists for the caller's identity.
 *
 * Called by `ensureServerIdentity()` right after an anonymous sign-in. The auth user and the
 * profile row are created by two different systems, so this is an idempotent UPSERT rather than
 * a create — a caller whose profile write failed last time can simply call again.
 *
 * ── PHASE 2 (coins) ──────────────────────────────────────────────────────────────────────
 * Also acts as the sign-up completion hook. When the caller is NON-anonymous (email flow
 * completed) we call `grant_welcome()` for the flat 100-coin bonus, and — if a `deviceId` was
 * carried on the body — `migrate_guest_grants()` to fold pending guest earnings into the
 * profile. Both RPCs are idempotent via partial unique indexes, so this route stays safe to
 * call on every session hydration.
 *
 * The client cannot write `profiles` directly (no INSERT policy — see the Slice 2 migration), so
 * this route is the only way the row comes into existence, and it derives the id from the
 * verified JWT rather than the body. There is nothing here a caller can forge or aim at someone
 * else's profile.
 */
const bodySchema = z
  .object({
    deviceId: z.string().min(4).max(128).optional(),
  })
  .partial()

export async function POST(req: NextRequest) {
  try {
    const identity = await getIdentityFromRequest(req)
    // No valid token: not an error worth surfacing, just nothing to do. The caller is a guest
    // and must carry on playing normally.
    if (!identity) return NextResponse.json({ profileId: null }, { status: 200 })

    // Body is optional — every legacy caller sends nothing.
    let deviceId: string | undefined
    try {
      const contentLength = req.headers.get('content-length')
      if (contentLength && Number(contentLength) > 0) {
        const raw = await req.json().catch(() => null)
        const parsed = bodySchema.safeParse(raw)
        if (parsed.success) deviceId = parsed.data.deviceId
      }
    } catch {
      // Best-effort parse; fall through with no deviceId.
    }

    const country = req.headers.get('cf-ipcountry') ?? null

    const admin = getSupabaseAdmin()

    const { error } = await admin
      .from('profiles')
      .upsert(
        { id: identity.profileId, is_anonymous: identity.isAnonymous },
        { onConflict: 'id', ignoreDuplicates: false }
      )

    if (error) {
      return NextResponse.json({ error: internalErrorMessage('profile/anon', error) }, { status: 500 })
    }

    // Give brand-new profiles a friendly random name so leaderboards aren't a wall of "Guest".
    await admin.from('profiles').update({ handle: randomDisplayName() }).eq('id', identity.profileId).is('handle', null)

    if (country) {
      await admin.from('profiles').update({ country }).eq('id', identity.profileId).is('country', null)
    }

    // ── Phase 2: welcome + guest migration ────────────────────────────────
    // Only fire for accounts that are past the anonymous stage. Guests get
    // NEITHER a welcome grant NOR a coin balance (see plan §"Not shown to
    // guests"). Both RPCs are idempotent — safe to call every time.
    let welcomeGrant: number | null = null
    let migrationGrant: number | null = null
    if (!identity.isAnonymous) {
      try {
        const { data: welcomeData } = await admin.rpc('grant_welcome', { p_profile_id: identity.profileId })
        welcomeGrant = welcomeData == null ? null : Number(welcomeData)
      } catch {
        welcomeGrant = null
      }
      if (deviceId) {
        try {
          const { data: migrateData } = await admin.rpc('migrate_guest_grants', {
            p_profile_id: identity.profileId,
            p_device_id: deviceId,
          })
          migrationGrant = migrateData == null ? null : Number(migrateData)
        } catch {
          migrationGrant = null
        }
      }
    }

    return NextResponse.json(
      {
        profileId: identity.profileId,
        isAnonymous: identity.isAnonymous,
        welcomeGrant,
        migrationGrant,
      },
      { status: 200 }
    )
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('profile/anon', err) }, { status: 500 })
  }
}
