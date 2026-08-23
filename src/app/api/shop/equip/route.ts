import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { getProfileFromRequest } from '@/lib/identity-server'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Equip an owned cosmetic (or unequip by passing null).
 *
 * Only the four equipped_* slots are writable here — frame, name_color,
 * animation, card_template. Themes and editions are HOST-scoped (chosen
 * at room-create time, not equipped on the profile), so they're not
 * routed through this endpoint.
 *
 * The endpoint verifies ownership before writing so a stale slug from a
 * grandfathered demo profile can't self-equip a cosmetic the profile
 * never bought.
 */
const bodySchema = z.object({
  slot: z.enum(['frame', 'name_color', 'animation', 'card_template']),
  slug: z.string().min(1).max(100).nullable(),
})

const OWNED_TABLE: Record<string, { table: string; column: string; profileColumn: string }> = {
  frame: { table: 'profile_owned_frames', column: 'frame_slug', profileColumn: 'equipped_frame' },
  name_color: { table: 'profile_owned_name_colors', column: 'color_slug', profileColumn: 'equipped_name_color' },
  animation: { table: 'profile_owned_animations', column: 'animation_slug', profileColumn: 'equipped_animation' },
  card_template: {
    table: 'profile_owned_card_templates',
    column: 'template_slug',
    profileColumn: 'equipped_card_template',
  },
}

export async function POST(req: NextRequest) {
  try {
    const profileId = await getProfileFromRequest(req)
    if (!profileId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const { data: body, error: bodyError } = await parseJsonBody(req, bodySchema)
    if (bodyError) return bodyError

    const { slot, slug } = body
    const meta = OWNED_TABLE[slot]
    const admin = getSupabaseAdmin()

    if (slug !== null) {
      const { data: owned, error } = await admin
        .from(meta.table)
        .select(meta.column)
        .eq('profile_id', profileId)
        .eq(meta.column, slug)
        .maybeSingle()
      if (error) return NextResponse.json({ error: internalErrorMessage('shop/equip', error) }, { status: 500 })
      if (!owned) return NextResponse.json({ error: 'Not owned' }, { status: 403 })
    }

    const { error: updateErr } = await admin
      .from('profiles')
      .update({ [meta.profileColumn]: slug })
      .eq('id', profileId)
    if (updateErr) return NextResponse.json({ error: internalErrorMessage('shop/equip', updateErr) }, { status: 500 })

    return NextResponse.json({ ok: true, slot, slug })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('shop/equip', err) }, { status: 500 })
  }
}
