'use client'

import { useState } from 'react'
import { computeDescribeItScores, teamForTurn, type DescribeItTeamScore } from '@/lib/describe-it'
import type { DescribeItGuess, DescribeItSession, DescribeItWord, Player } from '@/types'
import { DescribeItCard, DescribeItScoreboard, TeamBadge } from '@/components/describe-it/DescribeItChrome'

function GuessFeed({
  guesses,
  players,
  turnIndex,
}: {
  guesses: DescribeItGuess[]
  players: Player[]
  turnIndex: number
}) {
  const nameById = new Map(players.map((p) => [p.id, p.name]))
  const recent = guesses
    .filter((g) => g.turn_index === turnIndex)
    .slice(-7)
    .reverse()
  if (recent.length === 0) {
    return <p className="text-faint text-xs text-center py-2">Guesses appear here…</p>
  }
  return (
    <div className="space-y-1 max-h-40 overflow-y-auto">
      {recent.map((g) => (
        <div key={g.id} className="flex items-center gap-1.5 text-sm">
          <span className="text-faint shrink-0 truncate max-w-[40%]">{nameById.get(g.player_id) ?? 'Player'}:</span>
          <span className={g.correct ? 'font-black text-emerald-400' : 'text-[var(--foreground)]'}>{g.text}</span>
          {g.correct && <span>✅</span>}
        </div>
      ))}
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
  teamRows: { player_id: string; team: number }[]
  words: DescribeItWord[]
  guesses: DescribeItGuess[]
  myPlayerId: string | null
  secondsLeft: number
  breakLeft: number
  urgent: boolean
  onClue?: (clue: string) => void
  onGuess?: (text: string) => void
  onSkip?: () => void
  acting?: boolean
}) {
  const scores: DescribeItTeamScore[] = computeDescribeItScores(words, session.num_teams)
  const activeTeam = session.active_team
  const myTeam = teamRows.find((r) => r.player_id === myPlayerId)?.team ?? null
  const isDescriber = !!myPlayerId && session.describer_player_id === myPlayerId
  const onActiveTeam = myTeam === activeTeam
  const describerName = players.find((p) => p.id === session.describer_player_id)?.name ?? 'Someone'
  const clues = session.current_clues?.length
    ? session.current_clues
    : session.current_clue
      ? [session.current_clue]
      : []

  return (
    <div className="space-y-4">
      {myTeam != null && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-faint">
          You&apos;re on <TeamBadge team={myTeam} />
          {isDescriber && session.phase === 'turn' && onActiveTeam ? <span>· you&apos;re describing 🗣️</span> : null}
        </p>
      )}

      <DescribeItScoreboard
        scores={scores}
        activeTeam={activeTeam}
        myTeam={myTeam}
        round={session.current_round}
        totalRounds={session.total_rounds}
      />

      {session.phase === 'break' && (
        <DescribeItCard className="p-5 text-center space-y-2">
          <p className="text-3xl">⏭️</p>
          <p className="text-base font-bold">{session.status_message}</p>
          <p className="flex items-center justify-center gap-1.5 text-faint text-sm">
            Next up: <TeamBadge team={teamForTurn(session.turn_index + 1, session.num_teams)} /> in {breakLeft}s
          </p>
        </DescribeItCard>
      )}

      {session.phase === 'turn' && (
        <>
          <DescribeItCard className={`p-3 flex items-center justify-between ${urgent ? 'animate-pulse' : ''}`}>
            <span className="flex items-center gap-1.5 text-sm font-bold">
              <TeamBadge team={activeTeam} /> is up
            </span>
            <span className={`text-2xl font-black tabular-nums ${urgent ? 'text-amber-400' : ''}`}>
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
            </span>
          </DescribeItCard>

          {isDescriber ? (
            <DescribeItCard className="p-4 space-y-3 text-center">
              <p className="label-caps text-[var(--primary)]">Describe this — don&apos;t say it!</p>
              <p className="text-3xl sm:text-4xl font-black tracking-tight break-words">{session.current_word}</p>
              {onClue && (
                <ClueOrGuessInput placeholder="Type a clue…" buttonLabel="Send" onSubmit={onClue} disabled={!!acting} />
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
              {onSkip && (
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
                🗣️ <span className="font-bold">{describerName}</span> describing for <TeamBadge team={activeTeam} />
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
              {onActiveTeam && onGuess ? (
                <ClueOrGuessInput
                  placeholder="Type your guess…"
                  buttonLabel="Guess"
                  onSubmit={onGuess}
                  disabled={!!acting}
                />
              ) : (
                <p className="text-center text-faint text-xs">{myTeam ? 'Waiting for your team’s turn' : 'Watching'}</p>
              )}
            </DescribeItCard>
          )}

          <DescribeItCard className="p-3">
            <GuessFeed guesses={guesses} players={players} turnIndex={session.turn_index} />
          </DescribeItCard>
        </>
      )}
    </div>
  )
}
