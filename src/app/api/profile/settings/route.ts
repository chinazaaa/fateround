import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { getProfileFromRequest } from '@/lib/identity-server'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const patchSchema = z.object({
  default_voice_on: z.boolean().optional(),
  preferred_theme: z.enum(['light', 'dark', 'system']).optional(),
})

export async function PATCH(req: NextRequest) {
  try {
    const profileId = await getProfileFromRequest(req)
    if (!profileId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const { data: body, error: bodyError } = await parseJsonBody(req, patchSchema)
    if (bodyError) return bodyError

    const updates: Record<string, unknown> = {}
    if (body.default_voice_on !== undefined) updates.default_voice_on = body.default_voice_on
    if (body.preferred_theme !== undefined) updates.preferred_theme = body.preferred_theme

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const { error } = await getSupabaseAdmin().from('profiles').update(updates).eq('id', profileId)

    if (error) {
      return NextResponse.json({ error: internalErrorMessage('profile/settings', error) }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('profile/settings', err) }, { status: 500 })
  }
}
