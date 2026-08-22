'use client'

import type { WordleRoomProgressRow, WordleRoomStandingRow } from '@/lib/wordle-room'

/**
 * What a VIEWER watches in a live Wordle room.
 *
 * WHY THIS EXISTS. A viewer used to get their own board — empty, and disabled, because
 * `boardDisabled` includes `isViewer`. The only real content, the standings, sat in a sidebar
 * that stacks below the fold on a phone. So the main thing on a spectator's screen was a grid
 * they could never type into and that would never fill in. "People who are viewing should feel
 * like they're viewing something."
 *
 * ── WHAT IT CAN HONESTLY SHOW ─────────────────────────────────────────────────
 * Not anyone's letters. Everyone in a Wordle room races the SAME words, so showing one
 * player's guesses would hand the answers to every viewer — and a viewer can be promoted to
 * player mid-game from the banner above this, so they'd carry that straight into the race.
 * Even a letterless colour grid leaks green POSITIONS, which is real help. Deliberately not
 * rendered; the guesses table is server-only (RLS, no policies) so it isn't reachable anyway.
 *
 * What IS honest, and turns out to be the tense part: how far along everyone is, and how close
 * they are to burning a word. `wordle_room_progress` already reaches the client for the
 * standings, and carries `current_word_guesses` — so "on word 3, attempt 5 of 6" is available
 * without a new endpoint, and reveals nothing about the answers.
 */
export function WordleRoomSpectatorBoard({
  standings,
  progressRows,
  wordCount,
  maxAttempts,
}: {
  standings: WordleRoomStandingRow[]
  progressRows: WordleRoomProgressRow[]
  wordCount: number
  maxAttempts: number
}) {
  const progressById = new Map(progressRows.map((row) => [row.player_id, row]))

  if (standings.length === 0) {
    return (
      <div className="glass-card p-6 text-center">
        <p className="text-body text-sm font-semibold">Waiting for the race to start…</p>
        <p className="text-faint mt-1 text-xs">You&apos;ll see everyone&apos;s progress here as they play.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="label-caps text-xs">Live race</p>
        <p className="text-faint text-[11px]">{wordCount} words</p>
      </div>

      {standings.map((row, i) => {
        const progress = progressById.get(row.player_id)
        const attempts = progress?.current_word_guesses ?? 0
        // "Racing" only while they still have a word in front of them.
        const racing = !row.finished && row.word_index < wordCount
        // The last attempt is where a word is won or lost — worth making visible.
        const onLastChance = racing && attempts >= maxAttempts - 1

        return (
          <div key={row.player_id} className="glass-card !p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-body truncate text-sm font-bold">
                {i + 1}. {row.name}
              </span>
              <span className="text-body shrink-0 text-sm font-black tabular-nums">{row.total_points} pts</span>
            </div>

            {/* One pip per word: filled = solved, ringed = the word they're on now. */}
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {Array.from({ length: wordCount }, (_, w) => {
                const solved = w < row.words_solved
                const current = racing && w === row.word_index
                return (
                  <span
                    key={w}
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      background: solved ? 'var(--wl-correct)' : current ? 'var(--primary)' : 'var(--surface-sunken)',
                      boxShadow: current ? '0 0 0 2px color-mix(in srgb, var(--primary) 35%, transparent)' : undefined,
                    }}
                  />
                )
              })}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
              <span className={onLastChance ? 'font-bold text-[var(--kill)]' : 'text-muted'}>
                {row.finished
                  ? `Finished · ${row.words_solved}/${wordCount} solved`
                  : racing
                    ? `Word ${row.word_index + 1} · attempt ${Math.min(attempts + 1, maxAttempts)} of ${maxAttempts}`
                    : 'Waiting…'}
              </span>
              {row.hints_used_count > 0 ? (
                <span className="text-faint shrink-0">
                  {row.hints_used_count} hint{row.hints_used_count > 1 ? 's' : ''}
                </span>
              ) : null}
            </div>
          </div>
        )
      })}

      <p className="text-faint pt-1 text-center text-[11px]">Guesses stay hidden — everyone races the same words.</p>
    </div>
  )
}
