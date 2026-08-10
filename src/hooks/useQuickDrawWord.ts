'use client'

import { useEffect, useState } from 'react'
import { fetchQuickDrawWord } from '@/lib/quick-draw-client'
import type { QuickDrawGuessSession } from '@/types'

/**
 * The secret prompt for the local player, but only while they are the drawer.
 *
 * `quick_draw_guess_sessions.current_word` is no longer readable with the anon key (migration
 * 20260807140000) — it used to ride along in every guesser's session read (and again as the last
 * entry of `used_words`) and was merely hidden in the UI. The drawer now pulls it from
 * POST /api/quick-draw/my-word, which resolves them from their secret token.
 *
 * REFETCH KEY: the word rotates on a correct guess and on a skip *without* the turn index
 * changing, so `turn_index` alone is not enough. `word_seq` is the session's public per-word
 * counter (`cardinality(used_words)`, added by the same migration), so it ticks exactly once per
 * word. Combined with the session id, drawer and turn index, that covers guess, skip, turn change
 * and drawer change.
 *
 * Returns null while loading, when the caller is not the drawer, or on failure — the canvas shows
 * a neutral placeholder rather than an empty prompt.
 */
export function useQuickDrawWord(
  gameCode: string,
  session: QuickDrawGuessSession | null,
  myPlayerId: string | null,
  auth: { resumeToken?: string | null; hostToken?: string | null }
): string | null {
  // Stored WITH the key it was fetched for, so a word from the previous key can never render:
  // the moment the session says the word rotated, the stale one stops matching and the canvas
  // falls back to the placeholder until the new fetch lands.
  const [fetched, setFetched] = useState<{ key: string; word: string | null } | null>(null)

  const isDrawer = !!myPlayerId && session?.drawer_player_id === myPlayerId
  const active = isDrawer && session?.phase === 'turn' && session?.status !== 'finished'
  const resumeToken = auth.resumeToken ?? null
  const hostToken = auth.hostToken ?? null
  // Changes exactly when the word could have changed (see REFETCH KEY above).
  const wordKey = active
    ? [session?.id, session?.turn_index, session?.drawer_player_id, session?.word_seq ?? 0].join(':')
    : ''

  useEffect(() => {
    if (!active) return
    let cancelled = false
    void fetchQuickDrawWord(gameCode, { resumeToken, hostToken }).then((next) => {
      if (!cancelled) setFetched({ key: wordKey, word: next })
    })
    return () => {
      cancelled = true
    }
  }, [active, gameCode, resumeToken, hostToken, wordKey])

  return active && fetched?.key === wordKey ? fetched.word : null
}
