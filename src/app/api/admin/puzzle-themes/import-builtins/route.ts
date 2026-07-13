import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { CROSSWORD_THEMES } from '@/lib/crossword-puzzles'
import { WORD_SEARCH_THEMES } from '@/lib/word-search-puzzles'
import { WORD_SCRAMBLE_THEMES } from '@/lib/word-scramble-puzzles'
import type { PuzzleThemeGameType } from '@/lib/puzzle-themes'

// Server-only: reads the built-in theme registries (which carry the full word banks) and mirrors
// them into puzzle_themes so admins can manage them alongside their own themes. builtin_key = the
// registry id, giving each seed a stable identity independent of a (possibly renamed) display name.

type Seed = {
  game_type: PuzzleThemeGameType
  builtin_key: string
  name: string
  entries: Record<string, string>[]
  sort_order: number
}

function builtinSeeds(): Seed[] {
  const seeds: Seed[] = []
  CROSSWORD_THEMES.forEach((t, i) =>
    seeds.push({
      game_type: 'crossword',
      builtin_key: t.id,
      name: t.label,
      sort_order: i,
      entries: t.entries.map((e) => ({ answer: e.answer, clue: e.clue })),
    })
  )
  WORD_SEARCH_THEMES.forEach((t, i) =>
    seeds.push({
      game_type: 'word_search',
      builtin_key: t.id,
      name: t.label,
      sort_order: i,
      entries: t.words.map((w) => ({ word: w })),
    })
  )
  WORD_SCRAMBLE_THEMES.forEach((t, i) =>
    seeds.push({
      game_type: 'word_scramble',
      builtin_key: t.id,
      name: t.label,
      sort_order: i,
      // The scramble custom-pool shape uses `hint`; the built-in registry calls it `clue`.
      entries: t.entries.map((e) => {
        const entry: Record<string, string> = { word: e.word }
        if (e.clue) entry.hint = e.clue
        return entry
      }),
    })
  )
  return seeds
}

export async function POST(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const seeds = builtinSeeds()

  // Insert-only: skip any built-in already present so an admin's edits to a seeded theme survive
  // a re-import. Deleting a built-in and re-importing re-adds the pristine version.
  const { data: existing, error: readErr } = await supabase
    .from('puzzle_themes')
    .select('game_type, builtin_key')
    .not('builtin_key', 'is', null)
  if (readErr) return NextResponse.json({ error: internalErrorMessage('import-builtins', readErr) }, { status: 500 })

  const have = new Set((existing ?? []).map((r) => `${r.game_type}:${r.builtin_key}`))
  const toInsert = seeds
    .filter((s) => !have.has(`${s.game_type}:${s.builtin_key}`))
    .map((s) => ({
      game_type: s.game_type,
      name: s.name,
      difficulty: null,
      entries: s.entries,
      entry_count: s.entries.length,
      is_builtin: true,
      builtin_key: s.builtin_key,
      sort_order: s.sort_order,
    }))

  let inserted = 0
  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from('puzzle_themes').insert(toInsert)
    if (insErr) return NextResponse.json({ error: internalErrorMessage('import-builtins', insErr) }, { status: 500 })
    inserted = toInsert.length
  }

  return NextResponse.json({ inserted, skipped: seeds.length - inserted, total: seeds.length })
}
