import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { getProfileFromRequest } from '@/lib/identity-server'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { codeSidePrice } from '@/lib/coins/shop-catalog'

/**
 * Purchase a shop item. Server-authoritative on BOTH the identity of the
 * buyer and the price: the client sends only kind + slug, the price is
 * resolved server-side (from the code-side catalog for cosmetics; from
 * the DB catalog table by the RPC for themes/editions/library packs).
 *
 * Reviewer flagged that the earlier version accepted a client-supplied
 * price and only bounded it at 10k — a malicious client could POST
 * price:1 for a 200-coin frame and walk out with it. Never again.
 *
 * Response mirrors the RPC envelope so the client can distinguish
 * insufficient_funds (soft failure, 402, show "X more needed") from
 * already_owned (idempotent success, 200) from ok (200).
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
})

export async function POST(req: NextRequest) {
  try {
    const profileId = await getProfileFromRequest(req)
    if (!profileId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const { data: body, error: bodyError } = await parseJsonBody(req, bodySchema)
    if (bodyError) return bodyError

    // Server-side price resolution. For code-side kinds we look up here;
    // for DB-backed kinds we fetch from the catalog table so a stale
    // client (or one that never saw the price at all) still pays right.
    let serverPrice: number | null = null
    if (
      body.kind === 'frame' ||
      body.kind === 'name_color' ||
      body.kind === 'animation' ||
      body.kind === 'card_template' ||
      body.kind === 'streak_freeze'
    ) {
      serverPrice = codeSidePrice(body.kind, body.slug)
    } else {
      // DB lookups: distinguish "unknown item" (row not found → 404) from
      // "catalog read blew up" (transient DB error → 500). The old
      // shorthand collapsed both into 404, hiding real infra failures
      // behind a user-facing "Unknown item" and starving on-call of the
      // signal (reviewer round 6 finding #10).
      const admin = getSupabaseAdmin()
      let lookupErr: unknown = null
      if (body.kind === 'theme') {
        const { data, error } = await admin
          .from('game_themes')
          .select('price_coins')
          .eq('slug', body.slug)
          .eq('is_active', true)
          .maybeSingle()
        lookupErr = error
        serverPrice = data ? Number(data.price_coins) : null
      } else if (body.kind === 'edition') {
        const { data, error } = await admin
          .from('game_editions')
          .select('price_coins')
          .eq('slug', body.slug)
          .eq('is_active', true)
          .maybeSingle()
        lookupErr = error
        serverPrice = data ? Number(data.price_coins) : null
      } else if (body.kind === 'library_pack') {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.slug)
        if (!isUuid) return NextResponse.json({ error: 'Invalid pack id' }, { status: 400 })
        const { data, error } = await admin
          .from('question_packs')
          .select('price_coins')
          .eq('id', body.slug)
          .eq('status', 'approved')
          .maybeSingle()
        lookupErr = error
        serverPrice = data ? Number(data.price_coins) : null
      }
      if (lookupErr)
        return NextResponse.json({ error: internalErrorMessage('shop/purchase:lookup', lookupErr) }, { status: 500 })
    }

    if (serverPrice === null) return NextResponse.json({ error: 'Unknown item' }, { status: 404 })

    const { data, error } = await getSupabaseAdmin().rpc('purchase_item', {
      p_profile_id: profileId,
      p_kind: body.kind,
      p_slug: body.slug,
      p_price_coins: serverPrice,
    })
    if (error) return NextResponse.json({ error: internalErrorMessage('shop/purchase', error) }, { status: 500 })

    // Map RPC outcome → HTTP status so callers that only inspect the code
    // (a future mobile client, an SDK, an integration test) get the right
    // signal without having to unwrap the JSON envelope. 402 = Payment
    // Required is the natural fit for insufficient funds.
    const outcome = (data as { outcome?: string } | null)?.outcome
    const status = outcome === 'insufficient_funds' ? 402 : 200
    return NextResponse.json(data ?? { outcome: 'server_error' }, { status })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('shop/purchase', err) }, { status: 500 })
  }
}
