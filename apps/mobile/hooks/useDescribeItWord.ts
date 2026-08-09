import { useEffect, useState } from 'react'
import type { DescribeItSession } from '@fateround/shared'
import { postDescribeItWord } from '@/lib/game-api'

/**
 * The secret word for the local player, but only while they are the describer.
 *
 * `describe_it_sessions.current_word` is no longer readable with the anon key (migration
 * 20260807130000) — it used to ride along in every guesser's session read and was merely hidden
 * in the UI. The describer now pulls it from POST /api/describe-it/my-word, which resolves them
 * from their secret resume token. Mirrors src/hooks/useDescribeItWord.ts on web.
 *
 * REFETCH KEY: the word rotates on a correct guess and on a skip *without* the turn index
 * changing, so `turn_index` alone is not enough. Every write that sets `current_word` also
 * appends to `used_words` — which is itself revoked as a shadow copy of the word — so the
 * public generated column `word_seq` (its cardinality) is the per-word counter.
 *
 * Returns null while loading, when the caller is not the describer, or on failure — the panel
 * shows a neutral placeholder rather than an empty word box.
 */
export function useDescribeItWord(
  gameCode: string,
  session: DescribeItSession | null,
  myPlayerId: string | null,
  resumeToken: string | null
): string | null {
  // Stored WITH the key it was fetched for, so a word from the previous key can never render:
  // the moment the session says the word rotated, the stale one stops matching and the panel
  // falls back to the placeholder until the new fetch lands.
  const [fetched, setFetched] = useState<{ key: string; word: string | null } | null>(null)

  const isDescriber = !!myPlayerId && session?.describer_player_id === myPlayerId
  const active = isDescriber && session?.phase === 'turn' && session?.status !== 'finished' && !!resumeToken
  const wordKey = active
    ? [session?.id, session?.turn_index, session?.describer_player_id, session?.word_seq ?? 0].join(':')
    : ''

  useEffect(() => {
    if (!active) return
    let cancelled = false
    postDescribeItWord(gameCode, { resumeToken })
      .then((res) => {
        if (!cancelled) setFetched({ key: wordKey, word: res.word ?? null })
      })
      .catch(() => {
        if (!cancelled) setFetched({ key: wordKey, word: null })
      })
    return () => {
      cancelled = true
    }
  }, [active, gameCode, resumeToken, wordKey])

  return active && fetched?.key === wordKey ? fetched.word : null
}
