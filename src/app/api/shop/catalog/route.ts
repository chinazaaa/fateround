import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getProfileFromRequest } from '@/lib/identity-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { ANIMATIONS, CARD_TEMPLATES, FRAMES, NAME_COLORS, STREAK_FREEZE, type ShopKind } from '@/lib/coins/shop-catalog'

/**
 * Full shop catalog + the caller's owned/equipped state.
 *
 * Merges the code-side curated palette (frames, name colors, animations,
 * card templates, streak freeze) with DB-backed themes / editions /
 * premium library packs. Owned lookup is a single fan-out per profile —
 * six small selects — because the shop page filters and toggles
 * client-side and refetching on every filter change would be jarring.
 *
 * Guests get the catalog with `owned: false` on everything so the shop
 * page renders in a "browse but sign in to buy" preview. (The plan
 * doc's stricter rule — hide the shop entirely from guests — is
 * enforced at the /shop page level; this endpoint stays useful for
 * the balance-preview modal and for tests.)
 */
export async function GET(req: NextRequest) {
  try {
    const profileId = await getProfileFromRequest(req)
    const admin = getSupabaseAdmin()

    const [
      themes,
      editions,
      packs,
      profile,
      ownedThemes,
      ownedEditions,
      ownedFrames,
      ownedColors,
      ownedAnimations,
      ownedTemplates,
      ownedPacks,
    ] = await Promise.all([
      admin
        .from('game_themes')
        .select('game_type, slug, name, price_coins, art, sort_order')
        .eq('is_active', true)
        .order('sort_order'),
      admin
        .from('game_editions')
        .select('game_type, slug, name, price_coins, content, sort_order')
        .eq('is_active', true)
        .order('sort_order'),
      admin
        .from('question_packs')
        .select('id, title, game_type, price_coins')
        .eq('status', 'approved')
        .gt('price_coins', 0),
      profileId
        ? admin
            .from('profiles')
            .select(
              'coins, equipped_frame, equipped_name_color, equipped_animation, equipped_card_template, streak_freezes'
            )
            .eq('id', profileId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as const),
      profileId
        ? admin.from('profile_owned_themes').select('theme_slug').eq('profile_id', profileId)
        : Promise.resolve({ data: [], error: null } as const),
      profileId
        ? admin.from('profile_owned_editions').select('edition_slug').eq('profile_id', profileId)
        : Promise.resolve({ data: [], error: null } as const),
      profileId
        ? admin.from('profile_owned_frames').select('frame_slug').eq('profile_id', profileId)
        : Promise.resolve({ data: [], error: null } as const),
      profileId
        ? admin.from('profile_owned_name_colors').select('color_slug').eq('profile_id', profileId)
        : Promise.resolve({ data: [], error: null } as const),
      profileId
        ? admin.from('profile_owned_animations').select('animation_slug').eq('profile_id', profileId)
        : Promise.resolve({ data: [], error: null } as const),
      profileId
        ? admin.from('profile_owned_card_templates').select('template_slug').eq('profile_id', profileId)
        : Promise.resolve({ data: [], error: null } as const),
      profileId
        ? admin.from('profile_owned_packs').select('pack_id').eq('profile_id', profileId)
        : Promise.resolve({ data: [], error: null } as const),
    ])

    for (const [label, res] of Object.entries({
      themes,
      editions,
      packs,
      profile,
      ownedThemes,
      ownedEditions,
      ownedFrames,
      ownedColors,
      ownedAnimations,
      ownedTemplates,
      ownedPacks,
    })) {
      if (res && 'error' in res && res.error) {
        return NextResponse.json({ error: internalErrorMessage(`shop/catalog:${label}`, res.error) }, { status: 500 })
      }
    }

    const themeSet = new Set((ownedThemes.data ?? []).map((r) => r.theme_slug as string))
    const editionSet = new Set((ownedEditions.data ?? []).map((r) => r.edition_slug as string))
    const frameSet = new Set((ownedFrames.data ?? []).map((r) => r.frame_slug as string))
    const colorSet = new Set((ownedColors.data ?? []).map((r) => r.color_slug as string))
    const animSet = new Set((ownedAnimations.data ?? []).map((r) => r.animation_slug as string))
    const tplSet = new Set((ownedTemplates.data ?? []).map((r) => r.template_slug as string))
    const packSet = new Set((ownedPacks.data ?? []).map((r) => r.pack_id as string))

    type ShopItem = {
      kind: ShopKind
      slug: string
      name: string
      price: number
      owned: boolean
      /** For themes/editions this scopes the tile to a game type. */
      gameType?: string
      /** Free-form preview payload consumed by the shop tile. */
      preview?: Record<string, unknown>
    }

    const items: ShopItem[] = [
      ...(themes.data ?? []).map((t) => ({
        kind: 'theme' as const,
        slug: t.slug as string,
        name: t.name as string,
        price: Number(t.price_coins ?? 0),
        gameType: t.game_type as string,
        owned: themeSet.has(t.slug as string),
        preview: (t.art as Record<string, unknown>) ?? {},
      })),
      ...(editions.data ?? []).map((e) => ({
        kind: 'edition' as const,
        slug: e.slug as string,
        name: e.name as string,
        price: Number(e.price_coins ?? 0),
        gameType: e.game_type as string,
        owned: editionSet.has(e.slug as string),
      })),
      ...FRAMES.map((f) => ({ kind: f.kind, slug: f.slug, name: f.name, price: f.price, owned: frameSet.has(f.slug) })),
      ...NAME_COLORS.map((c) => ({
        kind: c.kind,
        slug: c.slug,
        name: c.name,
        price: c.price,
        owned: colorSet.has(c.slug),
      })),
      ...ANIMATIONS.map((a) => ({
        kind: a.kind,
        slug: a.slug,
        name: a.name,
        price: a.price,
        owned: animSet.has(a.slug),
      })),
      ...CARD_TEMPLATES.map((t) => ({
        kind: t.kind,
        slug: t.slug,
        name: t.name,
        price: t.price,
        owned: tplSet.has(t.slug),
      })),
      // Streak freeze is a consumable — never "owned" (re-purchasable). The
      // tile shows the current inventory instead of an owned badge.
      {
        kind: STREAK_FREEZE.kind,
        slug: STREAK_FREEZE.slug,
        name: STREAK_FREEZE.name,
        price: STREAK_FREEZE.price,
        owned: false,
      },
      ...(packs.data ?? []).map((p) => ({
        kind: 'library_pack' as const,
        slug: p.id as string,
        name: p.title as string,
        price: Number(p.price_coins ?? 0),
        gameType: p.game_type as string,
        owned: packSet.has(p.id as string),
      })),
    ]

    const profileData = profile.data as {
      coins?: number
      equipped_frame?: string | null
      equipped_name_color?: string | null
      equipped_animation?: string | null
      equipped_card_template?: string | null
      streak_freezes?: number
    } | null

    return NextResponse.json({
      items,
      profile: profileData
        ? {
            coins: Number(profileData.coins ?? 0),
            equipped_frame: profileData.equipped_frame ?? null,
            equipped_name_color: profileData.equipped_name_color ?? null,
            equipped_animation: profileData.equipped_animation ?? null,
            equipped_card_template: profileData.equipped_card_template ?? null,
            streak_freezes: Number(profileData.streak_freezes ?? 0),
          }
        : null,
    })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('shop/catalog', err) }, { status: 500 })
  }
}
