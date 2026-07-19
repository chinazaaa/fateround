import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { platformGameDefs } from '@/lib/platform-content'

// Seed each supported game's hardcoded builtin batches into platform_content, idempotently
// (keyed on game_type + variant + builtin_key). Safe to run repeatedly — existing seeded rows are
// left untouched so admin edits to them are never clobbered.
export async function POST(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  let inserted = 0
  let skipped = 0

  for (const def of platformGameDefs()) {
    for (const batch of def.builtins) {
      // `.is()` only handles null; a real variant value ('lie'/'guess') must use `.eq()`.
      let existingQuery = supabase
        .from('platform_content')
        .select('id')
        .eq('game_type', def.gameType)
        .eq('builtin_key', batch.key)
      existingQuery = def.variant == null ? existingQuery.is('variant', null) : existingQuery.eq('variant', def.variant)
      const { data: existing } = await existingQuery.maybeSingle()
      if (existing) {
        skipped++
        continue
      }
      const { error } = await supabase.from('platform_content').insert({
        game_type: def.gameType,
        variant: def.variant ?? null,
        label: batch.label,
        entries: batch.entries,
        entry_count: batch.entries.length,
        builtin_key: batch.key,
      })
      if (error)
        return NextResponse.json(
          { error: internalErrorMessage('admin/platform-content/import', error) },
          { status: 500 }
        )
      inserted++
    }
  }

  return NextResponse.json({ inserted, skipped })
}
