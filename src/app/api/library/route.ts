import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { getProfileFromRequest } from '@/lib/identity-server'

/**
 * PostgREST `.or()` takes a comma-separated filter EXPRESSION, so raw user input spliced into
 * it is injection: a `q` containing `,` or `)` adds filter terms of the attacker's choosing
 * (audit finding M3). Strip every character with meaning in that grammar — plus the `%`/`*`
 * wildcards, so a search can't degrade into a full-table scan. Searching is best-effort text
 * matching, so dropping punctuation costs nothing real.
 */
function sanitizeSearchTerm(raw: string): string {
  return raw
    .replace(/[,.()*%\\:"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

const DEFAULT_PAGE_SIZE = 12
const MAX_PAGE_SIZE = 100

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const gameType = searchParams.get('game_type')
  const tag = searchParams.get('tag')
  const collection = searchParams.get('collection') // slug or uuid; filters to that collection's datasets
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(searchParams.get('page_size') ?? String(DEFAULT_PAGE_SIZE), 10))
  )

  const supabase = getSupabaseAnon()

  const search = sanitizeSearchTerm(searchParams.get('q') ?? '')

  // Collection filter: resolve the collection to its member pack ids first, then constrain the
  // main query with `.in('id', …)`. Keeps the answer-bearing questions out of the response and
  // avoids brittle PostgREST embedded filters. RLS limits both tables to active/approved rows.
  let collectionPackIds: string[] | null = null
  if (collection) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(collection)
    let collectionId: string | null = isUuid ? collection : null
    if (!collectionId) {
      const { data: coll } = await supabase
        .from('content_collections')
        .select('id')
        .eq('slug', collection)
        .maybeSingle()
      collectionId = coll?.id ?? null
    }
    if (!collectionId) {
      return NextResponse.json({ packs: [], total: 0, page, pages: 1 })
    }
    const { data: members, error: memberErr } = await supabase
      .from('question_pack_collections')
      .select('pack_id')
      .eq('collection_id', collectionId)
    if (memberErr) return NextResponse.json({ error: internalErrorMessage('library', memberErr) }, { status: 500 })
    collectionPackIds = (members ?? []).map((m) => m.pack_id as string)
    if (collectionPackIds.length === 0) {
      return NextResponse.json({ packs: [], total: 0, page, pages: 1 })
    }
  }

  let query = supabase
    .from('question_packs')
    // Embed active-collection membership so the create picker can offer a client-side collection
    // chip filter without extra round-trips. RLS limits the join/collections to active rows.
    .select(
      'id, title, game_type, author_name, description, question_count, approved_at, tags, price_coins, question_pack_collections(content_collections(slug, name))',
      { count: 'exact' }
    )
    .eq('status', 'approved')
    .order('approved_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (gameType) query = query.eq('game_type', gameType)
  if (tag) query = query.contains('tags', [tag])
  if (collectionPackIds) query = query.in('id', collectionPackIds)
  if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,author_name.ilike.%${search}%`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: internalErrorMessage('library', error) }, { status: 500 })

  // Flatten the embedded membership into a simple `collections: [{slug,name}]` per pack.
  const packs = (data ?? []).map((row) => {
    const { question_pack_collections, ...rest } = row as Record<string, unknown>
    const links = (question_pack_collections ?? []) as { content_collections?: { slug: string; name: string } | null }[]
    const collections = links.map((l) => l.content_collections).filter(Boolean) as { slug: string; name: string }[]
    return { ...rest, collections }
  })

  // Owned lookup for paid packs so the picker's coin badge shows "Owned"
  // instead of nudging a repeat purchase (reviewer round 5 finding #2).
  // Signed-out callers get owned:false on every row. Only paid packs need
  // the flag; grandfathered free packs (price_coins=0) always show
  // without a badge anyway, so the query stays tight.
  const paidPackIds = packs
    .filter((p) => Number((p as { price_coins?: number }).price_coins ?? 0) > 0)
    .map((p) => (p as unknown as { id: string }).id)
  let ownedSet = new Set<string>()
  if (paidPackIds.length > 0) {
    const profileId = await getProfileFromRequest(req).catch(() => null)
    if (profileId) {
      const admin = getSupabaseAdmin()
      const { data: owned } = await admin
        .from('profile_owned_packs')
        .select('pack_id')
        .eq('profile_id', profileId)
        .in('pack_id', paidPackIds)
      ownedSet = new Set((owned ?? []).map((r) => r.pack_id as string))
    }
  }
  const packsWithOwned = packs.map((p) => ({ ...p, owned: ownedSet.has((p as unknown as { id: string }).id) }))

  return NextResponse.json({
    packs: packsWithOwned,
    total: count ?? 0,
    page,
    pages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  })
}

export async function POST(req: NextRequest) {
  // Unauthenticated public write into the shared library (audit finding M3). Moderation
  // (`status: 'pending'`) gates what becomes visible; this gates the volume.
  const limited = await enforceRateLimit(req, RATE_LIMITS.librarySubmit)
  if (limited) return limited

  const body = await req.json()
  const { title, game_type, author_name, description, questions, tags, collection_ids } = body

  if (!title || !game_type || !author_name || !Array.isArray(questions)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (title.length > 100) return NextResponse.json({ error: 'Title too long' }, { status: 400 })
  if (author_name.length > 60) return NextResponse.json({ error: 'Author name too long' }, { status: 400 })
  if (description && description.length > 500)
    return NextResponse.json({ error: 'Description too long' }, { status: 400 })

  const validTags = ['easy', 'intermediate', 'advanced', 'family-friendly', '18+', 'party', 'spicy']
  const cleanTags = Array.isArray(tags)
    ? tags.filter((t: unknown) => typeof t === 'string' && validTags.includes(t))
    : []

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('question_packs')
    .insert({
      title,
      game_type,
      author_name,
      description: description ?? null,
      questions,
      question_count: questions.length,
      status: 'pending',
      tags: cleanTags,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: internalErrorMessage('library', error) }, { status: 500 })

  // Optional collection membership suggested at submit time. Validate the ids against real
  // collections (drop anything unknown) so a public submitter can't write arbitrary rows. The pack
  // is `pending`, so it stays invisible in the collection until an admin approves it.
  if (Array.isArray(collection_ids) && collection_ids.length > 0) {
    const requested = collection_ids.filter((c: unknown): c is string => typeof c === 'string').slice(0, 20)
    if (requested.length > 0) {
      const { data: valid } = await supabase.from('content_collections').select('id').in('id', requested)
      const rows = (valid ?? []).map((c) => ({ collection_id: c.id as string, pack_id: data.id, sort_order: 0 }))
      if (rows.length > 0) {
        // Best-effort: a membership failure shouldn't fail the whole submission.
        await supabase.from('question_pack_collections').insert(rows)
      }
    }
  }

  return NextResponse.json({ success: true, id: data.id })
}
