'use client'

import { useState } from 'react'
import {
  computeDescribeItScores,
  describeItTotalTurns,
  teamForTurn,
  totalDescribeItTurns,
  type DescribeItTeamScore,
} from '@/lib/describe-it'
import type { DescribeItGuess, DescribeItSession, DescribeItWord, Player } from '@/types'
import { DescribeItCard, DescribeItScoreboard, TeamBadge } from '@/components/describe-it/DescribeItChrome'

function GuessFeed({
  guesses,
  players,
  turnIndex,
  myPlayerId,
  hideOthersText,
}: {
  guesses: DescribeItGuess[]
  players: Player[]
  turnIndex: number
  myPlayerId: string | null
  /** Individual mode: never show another player's guess text, so nobody can copy it. */
  hideOthersText?: boolean
}) {
  const nameById = new Map(players.map((p) => [p.id, p.name]))
  // `guesses` arrives newest-first, so the most recent for this turn are at the front.
  const recent = guesses.filter((g) => g.turn_index === turnIndex).slice(0, 7)
  if (recent.length === 0) {
    return <p className="text-faint text-xs text-center py-2">Guesses appear here…</p>
  }
  return (
    <div className="space-y-1 max-h-40 overflow-y-auto">
      {recent.map((g) => {
        const mask = hideOthersText && g.player_id !== myPlayerId
        return (
          <div key={g.id} className="flex items-center gap-1.5 text-sm">
            <span className="text-faint shrink-0 truncate max-w-[45%]">{nameById.get(g.player_id) ?? 'Player'}:</span>
            {mask ? (
              g.correct ? (
                <span className="font-bold text-emerald-400">guessed it ✅</span>
              ) : (
                <span className="text-faint italic">guessing…</span>
              )
            ) : (
              <>
                <span className={g.correct ? 'font-black text-emerald-400' : 'text-[var(--foreground)]'}>{g.text}</span>
                {g.correct && <span>✅</span>}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ClueOrGuessInput({
  placeholder,
  buttonLabel,
  onSubmit,
  disabled,
}: {
  placeholder: string
  buttonLabel: string
  onSubmit: (text: string) => void
  disabled?: boolean
}) {
  const [value, setValue] = useState('')
  const submit = () => {
    const text = value.trim()
    if (!text || disabled) return
    onSubmit(text)
    setValue('')
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={80}
        className="input-field flex-1"
        autoComplete="off"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="btn-primary btn-fit shrink-0 px-4 py-2.5 text-sm whitespace-nowrap"
      >
        {buttonLabel}
      </button>
    </div>
  )
}

export function DescribeItPlayPanel({
  session,
  players,
  teamRows,
  words,
  guesses,
  myPlayerId,
  myWord,
  secondsLeft,
  breakLeft,
  urgent,
  onClue,
  onGuess,
  onSkip,
  acting,
}: {
  session: DescribeItSession
  players: Player[]
  teamRows: { player_id: string; team: number; score?: number }[]
  words: DescribeItWord[]
  guesses: DescribeItGuess[]
  myPlayerId: string | null
  /**
   * The secret word, fetched through /api/describe-it/my-word by the parent view when the local
   * player is the describer. It is NOT on `session` any more: `current_word` is revoked from anon
   * (migration 20260807130000) precisely because shipping it to every guesser and only *hiding*
   * it in the UI was not a control at all. null = not loaded yet (or not ours to see).
   */
  myWord?: string | null
  secondsLeft: number
  breakLeft: number
  urgent: boolean
  onClue?: (clue: string) => void
  onGuess?: (text: string) => void
  onSkip?: () => void
  acting?: boolean
}) {
  const isIndividual = session.mode === 'individual'
  const activeTeam = session.active_team
  const myTeam = teamRows.find((r) => r.player_id === myPlayerId)?.team ?? null
  const isDescriber = !!myPlayerId && session.describer_player_id === myPlayerId
  const onActiveTeam = myTeam === activeTeam
  // Gate on the LIVE roster (describe_it_players/teamRows), not the frozen session.roster.
  // Late joiners are seeded into describe_it_players but never into session.roster, so
  // checking the snapshot hid the guess input from them — they could only watch. This mirrors
  // the server's live-roster check in processIndividualGuess.
  const inRoster = !!myPlayerId && teamRows.some((r) => r.player_id === myPlayerId)
  const myGuessedThisTurn = guesses.some(
    (g) => g.turn_index === session.turn_index && g.player_id === myPlayerId && g.correct
  )
  const describerName = players.find((p) => p.id === session.describer_player_id)?.name ?? 'Someone'
  const clues = session.current_clues?.length
    ? session.current_clues
    : session.current_clue
      ? [session.current_clue]
      : []

  const teamScores: DescribeItTeamScore[] = isIndividual ? [] : computeDescribeItScores(words, session.num_teams)
  // Individual mode: anyone in the roster who isn't the describer may guess.
  const canGuess = isIndividual ? inRoster && !isDescriber : onActiveTeam

  // Team mode keeps the inline team scoreboard. Individual mode's per-player leaderboard
  // now lives in the roster side-drawer (fed via useGameScores/useGameStats), so there's
  // no inline scoreboard here — the current describer is shown in the play area below.
  const scoreboardEl = isIndividual ? null : (
    <DescribeItScoreboard
      scores={teamScores}
      activeTeam={activeTeam}
      myTeam={myTeam}
      round={session.current_round}
      totalRounds={session.total_rounds}
    />
  )

  const inner = (
    <div className="space-y-4 min-w-0">
      {isIndividual
        ? isDescriber &&
          session.phase === 'turn' && <p className="text-center text-xs text-faint">You&apos;re describing 🗣️</p>
        : myTeam != null && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-faint">
              You&apos;re on <TeamBadge team={myTeam} />
              {isDescriber && session.phase === 'turn' && onActiveTeam ? (
                <span>· you&apos;re describing 🗣️</span>
              ) : null}
            </p>
          )}

      {/* Team mode keeps the scoreboard inline; individual mode shows it in a side column. */}
      {!isIndividual && scoreboardEl}

      {session.phase === 'break' && (
        <DescribeItCard className="p-5 text-center space-y-2">
          <p className="text-3xl">⏭️</p>
          <p className="text-base font-bold">{session.status_message}</p>
          {session.turn_index + 1 <
          describeItTotalTurns(session.mode, session.num_teams, session.roster.length, session.total_rounds) ? (
            isIndividual ? (
              <p className="text-faint text-sm">Next describer in {breakLeft}s</p>
            ) : (
              <p className="flex items-center justify-center gap-1.5 text-faint text-sm">
                Next up: <TeamBadge team={teamForTurn(session.turn_index + 1, session.num_teams)} /> in {breakLeft}s
              </p>
            )
          ) : (
            <p className="text-faint text-sm">Final results in {breakLeft}s</p>
          )}
        </DescribeItCard>
      )}

      {session.phase === 'turn' && (
        <>
          <DescribeItCard className={`p-3 flex items-center justify-between ${urgent ? 'animate-pulse' : ''}`}>
            <span className="flex items-center gap-1.5 text-sm font-bold">
              {isIndividual ? (
                <>
                  🗣️ <span className="truncate">{describerName}</span>
                </>
              ) : (
                <>
                  <TeamBadge team={activeTeam} /> is up
                </>
              )}
            </span>
            <span className={`text-2xl font-black tabular-nums ${urgent ? 'text-amber-400' : ''}`}>
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
            </span>
          </DescribeItCard>

          {isDescriber ? (
            <DescribeItCard className="p-4 space-y-3 text-center">
              <p className="label-caps text-[var(--primary)]">Describe this — don&apos;t say it!</p>
              {myWord ? (
                <p className="text-3xl sm:text-4xl font-black tracking-tight break-words">{myWord}</p>
              ) : (
                // Neutral placeholder rather than an empty box while the route round-trips.
                <p className="text-3xl sm:text-4xl font-black tracking-tight text-faint animate-pulse">…</p>
              )}
              {onClue && (
                <ClueOrGuessInput placeholder="Type a clue…" buttonLabel="Send" onSubmit={onClue} disabled={!!acting} />
              )}
              {isIndividual && clues.length === 0 && (
                <p className="text-faint text-[11px]">The guessers&apos; timer starts when you send your first clue.</p>
              )}
              {clues.length > 0 && (
                <div className="text-left space-y-1">
                  <p className="text-faint text-[11px] font-semibold uppercase tracking-wide">
                    Clues you&apos;ve given
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {clues.map((c, i) => (
                      <span key={i} className="rounded-md bg-[var(--surface-inset-bg)] px-2 py-0.5 text-xs">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {!isIndividual && onSkip && (
                <button
                  type="button"
                  onClick={onSkip}
                  disabled={!!acting}
                  className="text-sm font-semibold text-muted hover:text-[var(--foreground)] underline"
                >
                  Skip this word
                </button>
              )}
            </DescribeItCard>
          ) : (
            <DescribeItCard className="p-4 space-y-3">
              <p className="flex items-center justify-center gap-1.5 text-sm text-faint">
                🗣️ <span className="font-bold">{describerName}</span>
                {isIndividual ? (
                  <span>is describing — guess it!</span>
                ) : (
                  <>
                    describing for <TeamBadge team={activeTeam} />
                  </>
                )}
              </p>
              <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] px-4 py-4 text-center min-h-[3.5rem] flex flex-col items-center justify-center gap-1">
                {clues.length > 0 ? (
                  clues.map((c, i) => (
                    <p key={i} className={i === clues.length - 1 ? 'text-xl font-bold' : 'text-sm text-faint'}>
                      “{c}”
                    </p>
                  ))
                ) : (
                  <p className="text-faint text-sm animate-pulse">Waiting for a clue…</p>
                )}
              </div>
              {isIndividual && myGuessedThisTurn ? (
                <p className="text-center text-emerald-400 text-sm font-bold">✅ You got it! Waiting for the others…</p>
              ) : canGuess && isIndividual && clues.length === 0 ? (
                // Individual mode: the guessing timer only starts on the first clue.
                <p className="text-center text-faint text-xs">Guessing opens with the first clue…</p>
              ) : canGuess && onGuess ? (
                <ClueOrGuessInput
                  placeholder="Type your guess…"
                  buttonLabel="Guess"
                  onSubmit={onGuess}
                  disabled={!!acting}
                />
              ) : (
                <p className="text-center text-faint text-xs">
                  {isIndividual ? 'Watching' : myTeam ? 'Waiting for your team’s turn' : 'Watching'}
                </p>
              )}
            </DescribeItCard>
          )}

          <DescribeItCard className="p-3">
            <GuessFeed
              guesses={guesses}
              players={players}
              turnIndex={session.turn_index}
              myPlayerId={myPlayerId}
              hideOthersText={isIndividual}
            />
          </DescribeItCard>
        </>
      )}
    </div>
  )

  // Individual mode's leaderboard now lives in the roster side-drawer, so both modes
  // render the same single-column play area (no side column).
  return inner
}
