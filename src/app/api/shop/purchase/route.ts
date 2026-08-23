import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { getProfileFromRequest } from '@/lib/identity-server'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Purchase a shop item. Server-authoritative: delegates to purchase_item()
 * which spends via spend_coins() and writes the profile_owned_* row in one
 * transaction (see supabase/migrations/…_coins_shop_phase3.sql).
 *
 * Response mirrors the RPC envelope so the client can distinguish
 * insufficient_funds (soft failure, show "X more needed") from
 * already_owned (idempotent success) from ok.
 */
const bodySchema = z.object({
  kind: z.enum([
    'edition',
    'theme',
    'frame',
    'name_color',
    'animation',
    'card_template',
    'library_pack',
    'streak_freeze',
  ]),
  slug: z.string().min(1).max(100),
  price: z.number().int().nonnegative().max(10000),
})

export async function POST(req: NextRequest) {
  try {
    const profileId = await getProfileFromRequest(req)
    if (!profileId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const { data: body, error: bodyError } = await parseJsonBody(req, bodySchema)
    if (bodyError) return bodyError

    const { data, error } = await getSupabaseAdmin().rpc('purchase_item', {
      p_profile_id: profileId,
      p_kind: body.kind,
      p_slug: body.slug,
      p_price_coins: body.price,
    })
    if (error) return NextResponse.json({ error: internalErrorMessage('shop/purchase', error) }, { status: 500 })

    return NextResponse.json(data ?? { outcome: 'server_error' })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('shop/purchase', err) }, { status: 500 })
  }
}
