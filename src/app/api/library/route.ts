import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { gameTypeEnum } from '@/lib/validation/shared'

const DEFAULT_PAGE_SIZE = 12
const MAX_PAGE_SIZE = 100

// Neutralize PostgREST filter-grammar structural characters so a `?q=` value
// can't break out of the ilike pattern and inject extra .or() conditions.
// Strips , . ( ) : * plus quotes/backslash, then collapses whitespace.
function sanitizeSearchTerm(raw: string): string {
  return raw
    .replace(/[,.():*"'\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const validTags = ['easy', 'intermediate', 'advanced', 'family-friendly', '18+', 'party', 'spicy'] as const

const createPackSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(100, 'Title too long'),
  game_type: gameTypeEnum,
  author_name: z.string().trim().min(1, 'Author name is required').max(60, 'Author name too long'),
  description: z.string().trim().max(500, 'Description too long').optional().nullable(),
  // Question shapes vary per game type; keep elements loosely typed but bounded,
  // and cap the array so a single request can't insert an unbounded payload.
  questions: z
    .array(z.union([z.string().max(4000), z.record(z.string(), z.unknown())]))
    .min(1, 'At least one question is required')
    .max(500, 'Too many questions'),
  tags: z.array(z.enum(validTags)).max(validTags.length).optional(),
})

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

  const rawSearch = searchParams.get('q')?.trim()
  const search = rawSearch ? sanitizeSearchTerm(rawSearch) : undefined

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
  const limited = await enforceRateLimit(req, RATE_LIMITS.join)
  if (limited) return limited

  const { data: body, error: bodyError } = await parseJsonBody(req, createPackSchema)
  if (bodyError) return bodyError

  const { title, game_type, author_name, description, questions, tags } = body

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
      tags: tags ?? [],
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: internalErrorMessage('library', error) }, { status: 500 })

  return NextResponse.json({ success: true, id: data.id })
}
