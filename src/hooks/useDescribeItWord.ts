'use client'

import { useEffect, useState } from 'react'
import { fetchDescribeItWord } from '@/lib/describe-it-client'
import type { DescribeItSession } from '@/types'

/** Steady-state re-check while describing. Only ONE client per game runs this (the describer,
 *  during `phase === 'turn'`), so at ~12 calls/min it is a rounding error against
 *  RATE_LIMITS.handsFetch (1200 / 5 min). */
const POLL_MS = 5_000

/** Backoff after a failed fetch: recover fast, then stop hammering. Capped, and retried for as
 *  long as the caller is describing — a turn is bounded, so this cannot run away. */
const RETRY_BACKOFF_MS = [500, 1_000, 2_000, 4_000] as const

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
 * appends to `used_words` — itself revoked, as a shadow copy of the word — so the public
 * generated column `word_seq` (that array's cardinality) is the per-word counter. Combined with
 * the session id, describer and phase, that covers guess, skip, turn change and describer change.
 *
 * FAILURE IS NOT AN ANSWER: a fetch that fails is never stored. `null` from the route is real
 * state ("you are not the describer"); a 429 (`RATE_LIMITS.handsFetch` is keyed per IP and shared
 * with /api/whot/hands, so players behind one NAT can trip it), a 500 or an offline blip is not.
 * Recording a failure under the current key used to satisfy the key check and pin the panel to
 * `…` for the rest of the turn, with no skip available in individual mode to recover
 * (review on PR #866). Now only successes are stored, and the effect retries with backoff.
 *
 * The poll also means `word_seq` is an optimisation rather than a correctness requirement: if
 * the migration adding it has not been applied yet, `readDescribeItSession` drops it from the
 * select and the key stops ticking — the word then lands on the next poll instead of instantly.
 *
 * Returns null while loading, while a fetch is being retried, and when the caller is not the
 * describer — the panel shows a neutral placeholder rather than an empty word box.
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
    let timer: ReturnType<typeof setTimeout> | undefined
    let failures = 0

    const run = async () => {
      const res = await fetchDescribeItWord(gameCode, { resumeToken, hostToken })
      if (cancelled) return
      if (res.ok) {
        failures = 0
        setFetched({ key: wordKey, word: res.word })
      } else {
        // Deliberately no setFetched: a failed read must never be mistaken for game state.
        failures += 1
      }
      const delay = res.ok ? POLL_MS : RETRY_BACKOFF_MS[Math.min(failures - 1, RETRY_BACKOFF_MS.length - 1)]
      timer = setTimeout(() => void run(), delay)
    }
    void run()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [active, gameCode, resumeToken, hostToken, wordKey])

  return active && fetched?.key === wordKey ? fetched.word : null
}
