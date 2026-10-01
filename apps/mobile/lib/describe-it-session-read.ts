import type { DescribeItSession } from '@fateround/shared'
import { getSupabase } from '@/lib/supabase'
import { DESCRIBE_IT_SESSION_SELECT, DESCRIBE_IT_SESSION_SELECT_NO_WORD_SEQ } from '@/lib/supabase-selects'

/** PostgREST surfaces Postgres SQLSTATEs verbatim. 42703 = undefined_column. */
const UNDEFINED_COLUMN = '42703'

/** Narrowed to what callers use — see the web twin for why it is declared, not inferred. */
export type DescribeItSessionResult = { data: DescribeItSession | null; error: { code?: string } | null }

/**
 * Read the Describe It session, tolerating a database that does not have `word_seq` yet.
 * Mirrors src/lib/describe-it-session-read.ts on web — see that file for the full rationale.
 *
 * This matters MORE here. A web deploy can be rolled back in a minute; an installed app binary
 * cannot. Without this fallback, any build shipped after this PR would be dead in Describe It
 * against a database where migration 20260807115000 has not been applied yet (a rollback of the
 * migration, a self-hosted/staging database, or a store release that reaches users before the
 * migration runs). With it, such a build simply refetches the word on the poll instead of on the
 * counter.
 *
 * The reverse direction — an OLD binary, shipped before this PR, still naming `current_word` and
 * `used_words` against a database where 20260807130000 HAS been applied — cannot be fixed from
 * here; that client is already in users' hands. It is handled by release ordering: see the
 * ROLLOUT ORDER section in supabase/migrations/20260807130000_sec_describe_it_hide_word.sql.
 */
export async function readDescribeItSession(gameCode: string): Promise<DescribeItSessionResult> {
  const read = async (columns: string): Promise<DescribeItSessionResult> => {
    const { data, error } = await getSupabase()
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
