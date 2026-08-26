import { supabase } from '@/lib/supabase'
import { DESCRIBE_IT_SESSION_SELECT, DESCRIBE_IT_SESSION_SELECT_NO_WORD_SEQ } from '@/lib/supabase-selects'
import type { DescribeItSession } from '@/types'

/** PostgREST surfaces Postgres SQLSTATEs verbatim. 42703 = undefined_column. */
const UNDEFINED_COLUMN = '42703'

/** Narrowed to what callers use. Declared explicitly rather than inferred: supabase-js resolves
 *  `.select(<string>)` through very deep conditional types, and letting that flow through a
 *  second call site tips tsc into TS2589. */
export type DescribeItSessionResult = { data: DescribeItSession | null; error: { code?: string } | null }

/**
 * Read the Describe It session, tolerating a database that does not have `word_seq` yet.
 *
 * WHY: `word_seq` is added by migration 20260807115000. An explicit PostgREST select that names
 * a column the database does not have fails the ENTIRE row with 42703 — so a web deploy that
 * lands before the migration is applied would not merely lose the per-word counter, it would
 * stop host and players receiving ANY session state mid-game (flagged in review on PR #866).
 * Retrying once without `word_seq` turns that from an outage into a graceful degrade.
 *
 * In the degraded state the describer's `useDescribeItWord` key can no longer tick per word, so
 * the hook's steady-state poll (not the key) is what picks up a rotation — a few seconds of
 * staleness instead of a dead game. It self-heals the moment the migration is applied; no
 * redeploy needed.
 *
 * This only ever REMOVES a column from the select, so it can never widen what anon can read,
 * and it is never a fallback for 42501 (a revoked column): if the secret columns are ever named
 * again by mistake, that read must keep failing loudly rather than being retried into success.
 */
export async function readDescribeItSession(gameCode: string): Promise<DescribeItSessionResult> {
  const read = async (columns: string): Promise<DescribeItSessionResult> => {
    const { data, error } = await supabase
      .from('describe_it_sessions')
      .select(columns)
      .eq('game_id', gameCode)
      .maybeSingle()
    return { data: (data as DescribeItSession | null) ?? null, error }
  }
  const res = await read(DESCRIBE_IT_SESSION_SELECT)
  if (res.error?.code !== UNDEFINED_COLUMN) return res
  return await read(DESCRIBE_IT_SESSION_SELECT_NO_WORD_SEQ)
}
