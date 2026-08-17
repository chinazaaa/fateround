'use client'

import { useEffect, useState } from 'react'
import { fetchQuickDrawWord, QUICK_DRAW_WORD_RETRY_DELAYS_MS } from '@/lib/quick-draw-client'
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
 * RETRY: the refetch key only moves when the *word* moves, so a single failed read would otherwise
 * strand the drawer on the placeholder for the whole word while the timer runs — one 429 from the
 * shared handsFetch bucket, one cold-start 500 or one dropped request. Transport failures are
 * therefore retried with backoff for as long as the turn lasts, and are never stored as
 * `{ word: null }`: a failed read must not be mistaken for "you are not the drawer".
 *
 * Returns null while loading or when the caller is not the drawer — the canvas shows a neutral
 * placeholder rather than an empty prompt.
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
  const resumeToken = auth.resumeToken ?? null
  const hostToken = auth.hostToken ?? null
  // Without a secret the route can only ever answer `{ word: null }`, so firing it before the
  // token loads just burns a rate-limit token. The `resumeToken`/`hostToken` deps re-run the
  // effect the moment one arrives. (Mirrors the mobile hook, which has resume tokens only.)
  const active =
    isDrawer && session?.phase === 'turn' && session?.status !== 'finished' && (!!resumeToken || !!hostToken)
  // Changes exactly when the word could have changed (see REFETCH KEY above).
  const wordKey = active
    ? [session?.id, session?.turn_index, session?.drawer_player_id, session?.word_seq ?? 0].join(':')
    : ''

  useEffect(() => {
    if (!active) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const attempt = async (n: number) => {
      const res = await fetchQuickDrawWord(gameCode, { resumeToken, hostToken })
      if (cancelled) return
      if (res.ok) {
        setFetched({ key: wordKey, word: res.word })
        return
      }
      // A settled 4xx (unknown code, wrong game type) will answer the same way forever.
      if (!res.retryable) {
        setFetched({ key: wordKey, word: null })
        return
      }
      const delay = QUICK_DRAW_WORD_RETRY_DELAYS_MS[Math.min(n, QUICK_DRAW_WORD_RETRY_DELAYS_MS.length - 1)]
      timer = setTimeout(() => void attempt(n + 1), delay)
    }
    void attempt(0)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [active, gameCode, resumeToken, hostToken, wordKey])

  return active && fetched?.key === wordKey ? fetched.word : null
}
