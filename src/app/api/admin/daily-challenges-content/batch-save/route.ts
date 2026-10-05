import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/parse-body'

export const dynamic = 'force-dynamic'

const VALID_GAME_TYPES = [
  'crossword',
  'mini_crossword',
  'word_search',
  'word_scramble',
  'trivia',
  'word_grouping',
  'chess_mate',
  'codenames_codeword',
  'ludo_puzzle',
  'wordle',
] as const

const batchSchema = z.object({
  entries: z
    .array(
      z.object({
        game_type: z.enum(VALID_GAME_TYPES),
        challenge_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        content: z.unknown(),
      })
    )
    .min(1)
    .max(600),
})

export async function POST(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Service role unavailable' }, { status: 503 })

  const { data: body, error: parseError } = await parseJsonBody(req, batchSchema)
  if (parseError) return parseError

  const supabase = getSupabaseAdmin()

  // Upsert: insert with ON CONFLICT update so re-generating overwrites
  let saved = 0
  let skipped = 0
  const errors: string[] = []
  const failedEntries: string[] = []

  // Process in chunks of 50 to avoid Supabase payload limits
  const chunks: (typeof body.entries)[] = []
  for (let i = 0; i < body.entries.length; i += 50) {
    chunks.push(body.entries.slice(i, i + 50))
  }

  const upsertRows = (rows: typeof body.entries) =>
    supabase
      .from('daily_challenge_content')
      .upsert(
        rows.map((e) => ({
          game_type: e.game_type,
          challenge_date: e.challenge_date,
          content: e.content,
        })),
        { onConflict: 'game_type,challenge_date', ignoreDuplicates: true }
      )
      .select('id')

  for (const chunk of chunks) {
    const { data, error } = await upsertRows(chunk)

    if (!error) {
      saved += data?.length ?? chunk.length
      continue
    }

    // A chunked upsert is one statement, so a single bad row (e.g. a game_type the
    // table's check constraint doesn't allow yet) rejects the other 49 with it. Retry
    // the chunk row by row so the good entries still land and the error names the rows
    // that actually failed.
    errors.push(internalErrorMessage('batch-save/upsert', error))
    for (const entry of chunk) {
      const { data: rowData, error: rowError } = await upsertRows([entry])
      if (rowError) {
        failedEntries.push(`${entry.game_type} ${entry.challenge_date}`)
        skipped += 1
      } else {
        saved += rowData?.length ?? 1
      }
    }
  }

  if (errors.length === 0) {
    return NextResponse.json({ saved, skipped })
  }

  // Keep the raw DB error server-side (internalErrorMessage logged it) but tell the
  // admin which entries were rejected — otherwise the UI can only say "Save failed".
  const failureSummary =
    failedEntries.length > 0
      ? `${failedEntries.length} entr${failedEntries.length === 1 ? 'y' : 'ies'} rejected by the database (${failedEntries
          .slice(0, 5)
          .join(', ')}${failedEntries.length > 5 ? ', …' : ''}). Check the server logs for the cause.`
      : errors[0]

  if (saved === 0) {
    return NextResponse.json({ error: failureSummary, saved, skipped, errors }, { status: 500 })
  }

  return NextResponse.json({ saved, skipped, errors, warning: failureSummary })
}
