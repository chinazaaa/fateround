import type { SupabaseClient } from '@supabase/supabase-js'
import { countValues } from '@/lib/question-picker'
import { wyrQuestionKey } from '@/lib/would-you-rather-questions'

export async function fetchMltQuestionUsage(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data } = await supabase.from('rounds').select('mlt_question').not('mlt_question', 'is', null)
  return countValues((data ?? []).map((row) => row.mlt_question))
}

export async function fetchNhieQuestionUsage(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data } = await supabase
    .from('rounds')
    .select('mlt_question, games!inner(game_type)')
    .not('mlt_question', 'is', null)
    .eq('games.game_type', 'never_have_i_ever')
  return countValues((data ?? []).map((row) => row.mlt_question))
}

export async function fetchPanQuestionUsage(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data } = await supabase
    .from('games')
    .select('custom_questions')
    .eq('game_type', 'pick_a_number')
    .not('custom_questions', 'is', null)

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const pool = row.custom_questions
    if (!Array.isArray(pool)) continue
    for (const q of pool) {
      const text = String(q ?? '').trim()
      if (!text) continue
      counts.set(text, (counts.get(text) ?? 0) + 1)
    }
  }
  return counts
}

export async function fetchWyrQuestionUsage(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data } = await supabase.from('rounds').select('wyr_option_a, wyr_option_b').not('wyr_option_a', 'is', null)

  return countValues(
    (data ?? []).map((row) =>
      row.wyr_option_a && row.wyr_option_b ? wyrQuestionKey(row.wyr_option_a, row.wyr_option_b) : null
    )
  )
}
