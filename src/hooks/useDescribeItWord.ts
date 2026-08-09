'use client'

import { useEffect, useState } from 'react'
import { fetchDescribeItWord } from '@/lib/describe-it-client'
import type { DescribeItSession } from '@/types'

/**
 * The secret word for the local player, but only while they are the describer.
 *
 * `describe_it_sessions.current_word` is no longer readable with the anon key (migration
 * 20260807130000) — it used to ride along in every guesser's session read and was merely hidden
 * in the UI. The describer now pulls it from POST /api/describe-it/my-word, which resolves them
 * from their secret token.
 *
 * REFETCH KEY: the word rotates on a correct guess and on a skip *without* the turn index
 * changing, so `turn_index` alone is not enough. Every write that sets `current_word` also
 * appends to `used_words` (buildTurn, processDescribeItGuess, processDescribeItSkip in
 * src/lib/describe-it.ts), so its length is an exact per-word counter. Combined with the
 * session id, describer and phase, that covers guess, skip, turn change and describer change.
 *
 * Returns null while loading, when the caller is not the describer, or on failure — the panel
 * shows a neutral placeholder rather than an empty word box.
 */
export function useDescribeItWord(
  gameCode: string,
  session: DescribeItSession | null,
  myPlayerId: string | null,
  auth: { resumeToken?: string | null; hostToken?: string | null }
): string | null {
  // Stored WITH the key it was fetched for, so a word from the previous key can never render:
  // the moment the session says the word rotated, the stale one stops matching and the panel
  // falls back to the placeholder until the new fetch lands.
  const [fetched, setFetched] = useState<{ key: string; word: string | null } | null>(null)

  const isDescriber = !!myPlayerId && session?.describer_player_id === myPlayerId
  const active = isDescriber && session?.phase === 'turn' && session?.status !== 'finished'
  const resumeToken = auth.resumeToken ?? null
  const hostToken = auth.hostToken ?? null
  // Changes exactly when the word could have changed (see REFETCH KEY above).
  const wordKey = active
    ? [session?.id, session?.turn_index, session?.describer_player_id, session?.word_seq ?? 0].join(':')
    : ''

  useEffect(() => {
    if (!active) return
    let cancelled = false
    void fetchDescribeItWord(gameCode, { resumeToken, hostToken }).then((next) => {
      if (!cancelled) setFetched({ key: wordKey, word: next })
    })
    return () => {
      cancelled = true
    }
  }, [active, gameCode, resumeToken, hostToken, wordKey])

  return active && fetched?.key === wordKey ? fetched.word : null
}
