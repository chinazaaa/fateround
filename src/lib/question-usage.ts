import type { SupabaseClient } from '@supabase/supabase-js'
import { countValues } from '@/lib/question-picker'
import { wyrQuestionKey } from '@/lib/would-you-rather-questions'

export async function fetchMltQuestionUsage(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data } = await supabase.from('rounds').select('mlt_question').not('mlt_question', 'is', null)
  return countValues((data ?? []).map((row) => row.mlt_question))
}

export async function fetchWyrQuestionUsage(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data } = await supabase.from('rounds').select('wyr_option_a, wyr_option_b').not('wyr_option_a', 'is', null)

  return countValues(
    (data ?? []).map((row) =>
      row.wyr_option_a && row.wyr_option_b ? wyrQuestionKey(row.wyr_option_a, row.wyr_option_b) : null
    )
  )
}
