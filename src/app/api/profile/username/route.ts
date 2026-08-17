import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { getProfileFromRequest } from '@/lib/identity-server'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { validateUsername } from '@/lib/profile/username'

/**
 * Claim / check the public username — the unique slug behind /u/<username>.
 *
 * Unlike `handle` (a free, non-unique display name), a username is reserved: one profile owns it.
 * Both verbs require the caller's own auth.uid() — you can only claim for yourself, and even the
 * availability check is behind auth so the endpoint isn't an open enumeration oracle. All writes
 * go through the service role; the unique index on `profiles(lower(username))` is the real
 * arbiter, so a race that slips past the pre-check still fails closed at the DB (23505 → taken).
 */

/** GET ?value=<name> — is this username free for the caller to take? */
export async function GET(req: NextRequest) {
  try {
    const profileId = await getProfileFromRequest(req)
    if (!profileId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const raw = new URL(req.url).searchParams.get('value') ?? ''
    const check = validateUsername(raw)
    if (!check.ok) return NextResponse.json({ available: false, reason: check.reason, error: check.error })

    const { data, error } = await getSupabaseAdmin()
      .from('profiles')
      .select('id')
      .eq('username', check.value)
      .maybeSingle()
    if (error) return NextResponse.json({ error: internalErrorMessage('profile/username', error) }, { status: 500 })

    if (!data) return NextResponse.json({ available: true, value: check.value })
    // Already yours reads as available so the modal doesn't block "save" on your current name.
    if (data.id === profileId) return NextResponse.json({ available: true, value: check.value, mine: true })
    return NextResponse.json({ available: false, reason: 'taken', error: 'That username is taken.' })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('profile/username', err) }, { status: 500 })
  }
}

const patchSchema = z.object({ username: z.string() })

/** POST { username } — reserve it for the caller. */
export async function POST(req: NextRequest) {
  try {
    const profileId = await getProfileFromRequest(req)
    if (!profileId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const { data: body, error: bodyError } = await parseJsonBody(req, patchSchema)
    if (bodyError) return bodyError

    const check = validateUsername(body.username)
    if (!check.ok) return NextResponse.json({ error: check.error, reason: check.reason }, { status: 400 })

    const admin = getSupabaseAdmin()
    // Claim-once. A username is permanent because it's a shared public URL: releasing an old slug
    // on rename would hand every already-shared /u/<old> link to whoever claims it next. Setting
    // the same value again is a harmless no-op; a genuine change is refused.
    const { data: self } = await admin.from('profiles').select('username').eq('id', profileId).maybeSingle()
    if (self?.username && self.username !== check.value)
      return NextResponse.json(
        { error: 'Your username is already set and can’t be changed.', reason: 'immutable' },
        { status: 409 }
      )

    // Pre-check for a friendly message; the unique index is what actually guarantees it.
    const { data: existing } = await admin.from('profiles').select('id').eq('username', check.value).maybeSingle()
    if (existing && existing.id !== profileId)
      return NextResponse.json({ error: 'That username is taken.', reason: 'taken' }, { status: 409 })

    const { error } = await admin.from('profiles').update({ username: check.value }).eq('id', profileId)
    if (error) {
      // 23505 = a racing claim landed the same name first. Report it as taken, not a 500.
      if ((error as { code?: string }).code === '23505')
        return NextResponse.json({ error: 'That username was just taken.', reason: 'taken' }, { status: 409 })
      return NextResponse.json({ error: internalErrorMessage('profile/username', error) }, { status: 500 })
    }

    return NextResponse.json({ username: check.value })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('profile/username', err) }, { status: 500 })
  }
}
