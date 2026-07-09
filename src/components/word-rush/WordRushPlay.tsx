'use client'

import { useState } from 'react'
import type { WordRushAnswer, WordRushSession, Player } from '@/types'
import {
  WordRushCard,
  WordRushPlayerScoreboard,
  WordRushPromptDisplay,
  WordRushScoreboard,
  WordRushTeamBadge,
} from '@/components/word-rush/WordRushChrome'
import { computeWordRushPlayerScores, computeWordRushTeamScores, teamLabel } from '@/lib/word-rush'

function AnswerInput({
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

function PromptSetterInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (start: string, end: string) => void
  disabled?: boolean
}) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const submit = () => {
    if (!start.trim() || !end.trim() || disabled) return
    onSubmit(start.trim(), end.trim())
    setStart('')
    setEnd('')
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-faint text-center">Enter the next letter pair — timer keeps running</p>
      <div className="flex items-center justify-center gap-3">
        <input
          type="text"
          value={start}
          onChange={(e) => setStart(e.target.value.slice(0, 1))}
          maxLength={1}
          className="input-field w-16 text-center text-2xl font-black uppercase"
          placeholder="M"
          disabled={disabled}
        />
        <span className="text-faint">→</span>
        <input
          type="text"
          value={end}
          onChange={(e) => setEnd(e.target.value.slice(0, 1))}
          maxLength={1}
          className="input-field w-16 text-center text-2xl font-black uppercase"
          placeholder="Y"
          disabled={disabled}
        />
      </div>
      <button type="button" onClick={submit} disabled={disabled || !start || !end} className="btn-primary w-full">
        Set letters
      </button>
    </div>
  )
}

export function WordRushPlayPanel({
  session,
  players,
  teamRows,
  answers,
  myPlayerId,
  secondsLeft,
  intermissionLeft,
  urgent,
  onSubmit,
  onPrompt,
  acting,
  readOnly,
}: {
  session: WordRushSession
  players: Player[]
  teamRows: { player_id: string; team: number; score?: number }[]
  answers: WordRushAnswer[]
  myPlayerId: string | null
  secondsLeft: number
  intermissionLeft: number
  urgent: boolean
  onSubmit?: (text: string) => void
  onPrompt?: (start: string, end: string) => void
  acting?: boolean
  readOnly?: boolean
}) {
  const isTeam = session.mode === 'team'
  const myTeam = teamRows.find((r) => r.player_id === myPlayerId)?.team ?? null
  const onActiveTeam = isTeam && myTeam === session.active_team
  const isPromptSetter = !!myPlayerId && session.prompt_setter_player_id === myPlayerId
  const teamScores = computeWordRushTeamScores(answers, session.num_teams)
  const playerScores = computeWordRushPlayerScores(
    players,
    teamRows.map((r) => ({ player_id: r.player_id, score: r.score ?? 0 }))
  )

  const currentTurnAnswers = answers.filter((a) =>
    isTeam ? a.team_turn_index === session.turn_index : a.turn_index === session.turn_index
  )
  const recentCorrect = currentTurnAnswers
    .filter((a) => a.correct)
    .slice(-5)
    .reverse()
  const nameById = new Map(players.map((p) => [p.id, p.name]))
  const myAnswerThisRound = myPlayerId ? currentTurnAnswers.find((a) => a.player_id === myPlayerId) : undefined
  const individualScoreLabel = (score: number) => `${score} ${score === 1 ? 'pt' : 'pts'}`

  if (session.phase === 'intermission') {
    return (
      <div className="space-y-4">
        <WordRushCard className="text-center space-y-2">
          <p className="text-lg font-bold">{session.status_message}</p>
          <p className="text-faint text-sm">Next up in {intermissionLeft}s…</p>
        </WordRushCard>
        {isTeam ? (
          <WordRushScoreboard scores={teamScores} />
        ) : (
          <WordRushPlayerScoreboard scores={playerScores} scoreLabel={individualScoreLabel} />
        )}
      </div>
    )
  }

  if (session.phase === 'finished') {
    return isTeam ? (
      <WordRushScoreboard scores={teamScores} />
    ) : (
      <WordRushPlayerScoreboard scores={playerScores} scoreLabel={individualScoreLabel} />
    )
  }

  const timerClass = urgent ? 'text-red-400 animate-pulse' : 'text-[var(--foreground)]'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        {isTeam ? (
          <WordRushTeamBadge team={session.active_team} />
        ) : (
          <p className="font-bold">Round {session.current_round}</p>
        )}
        <p className={`text-2xl font-black tabular-nums ${timerClass}`}>{Math.max(0, secondsLeft)}s</p>
      </div>

      {isTeam ? (
        <WordRushScoreboard scores={teamScores} />
      ) : (
        <WordRushPlayerScoreboard scores={playerScores} scoreLabel={individualScoreLabel} />
      )}

      <WordRushCard className="space-y-4">
        {session.status_message && <p className="text-center text-sm text-faint">{session.status_message}</p>}

        {session.phase === 'awaiting_prompt' ? (
          isPromptSetter && !readOnly ? (
            <PromptSetterInput onSubmit={(s, e) => onPrompt?.(s, e)} disabled={acting} />
          ) : (
            <p className="text-center text-faint py-6">
              Waiting for {players.find((p) => p.id === session.prompt_setter_player_id)?.name ?? 'prompt setter'}…
            </p>
          )
        ) : (
          <>
            <WordRushPromptDisplay startLetter={session.start_letter} endLetter={session.end_letter} />
            {!readOnly &&
              !myAnswerThisRound &&
              ((!isTeam && !isPromptSetter) || (isTeam && onActiveTeam && !isPromptSetter)) && (
                <AnswerInput
                  placeholder="Type a word…"
                  buttonLabel="Submit"
                  onSubmit={(t) => onSubmit?.(t)}
                  disabled={acting}
                />
              )}
            {!readOnly && myAnswerThisRound && (
              <p className="text-center text-sm">
                {myAnswerThisRound.correct ? (
                  <span className="text-emerald-400 font-semibold">Correct — locked in for this round ✓</span>
                ) : (
                  <span className="text-muted">Submitted — not a valid word for this pair</span>
                )}
              </p>
            )}
            {readOnly && (
              <p className="text-center text-faint text-sm">
                {isTeam ? `Watching — ${teamLabel(session.active_team)} is playing` : 'Watching — round in progress'}
              </p>
            )}
            {!isTeam && isPromptSetter && (
              <p className="text-center text-faint text-sm">You set the letters this round — others are guessing</p>
            )}
          </>
        )}
      </WordRushCard>

      {recentCorrect.length > 0 && (
        <WordRushCard>
          <p className="text-xs text-faint mb-2">Recent correct</p>
          <div className="space-y-1">
            {recentCorrect.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <span className="font-bold text-emerald-400">{a.text}</span>
                <span className="text-faint">— {nameById.get(a.player_id) ?? 'Player'} ✅</span>
              </div>
            ))}
          </div>
        </WordRushCard>
      )}
    </div>
  )
}
