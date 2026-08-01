import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

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
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(searchParams.get('page_size') ?? String(DEFAULT_PAGE_SIZE), 10))
  )

  const supabase = getSupabaseAnon()

  const search = sanitizeSearchTerm(searchParams.get('q') ?? '')

  let query = supabase
    .from('question_packs')
    .select('id, title, game_type, author_name, description, question_count, approved_at, tags', { count: 'exact' })
    .eq('status', 'approved')
    .order('approved_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (gameType) query = query.eq('game_type', gameType)
  if (tag) query = query.contains('tags', [tag])
  if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,author_name.ilike.%${search}%`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: internalErrorMessage('library', error) }, { status: 500 })

  return NextResponse.json({
    packs: data,
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
  const { title, game_type, author_name, description, questions, tags } = body

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

  return NextResponse.json({ success: true, id: data.id })
}
