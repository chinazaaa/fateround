'use client'

import { useEffect, useRef, useState } from 'react'
import {
  quickDrawGuessIndividualLeaderboard,
  quickDrawGuessTotalTurns,
  computeQuickDrawGuessTeamScores,
} from '@/lib/quick-draw-guess'
import { teamForTurn } from '@/lib/describe-it'
import type {
  QuickDrawDrawingStrokeData,
  QuickDrawGuessGuess,
  QuickDrawGuessSession,
  QuickDrawGuessWord,
  Player,
} from '@/types'
import {
  DescribeItCard,
  DescribeItPlayerScoreboard,
  DescribeItScoreboard,
  TeamBadge,
} from '@/components/describe-it/DescribeItChrome'
import { LiveDrawingCanvas } from '@/components/quick-draw/DrawingCanvas'

function GuessFeed({
  guesses,
  players,
  turnIndex,
  myPlayerId,
  hideOthersText,
}: {
  guesses: QuickDrawGuessGuess[]
  players: Player[]
  turnIndex: number
  myPlayerId: string | null
  hideOthersText?: boolean
}) {
  const nameById = new Map(players.map((p) => [p.id, p.name]))
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

function GuessInput({ onSubmit, disabled }: { onSubmit: (text: string) => void; disabled?: boolean }) {
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
        placeholder="Type your guess…"
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
        Guess
      </button>
    </div>
  )
}

export function QuickDrawGuessPlayPanel({
  gameCode,
  session,
  players,
  teamRows,
  words,
  guesses,
  myPlayerId,
  myResumeToken,
  secondsLeft,
  breakLeft,
  urgent,
  onGuess,
  onSkip,
  acting,
}: {
  gameCode: string
  session: QuickDrawGuessSession
  players: Player[]
  teamRows: { player_id: string; team: number; score?: number }[]
  words: QuickDrawGuessWord[]
  guesses: QuickDrawGuessGuess[]
  myPlayerId: string | null
  myResumeToken: string | null
  secondsLeft: number
  breakLeft: number
  urgent: boolean
  onGuess?: (text: string) => void
  onSkip?: () => void
  acting?: boolean
}) {
  const isIndividual = session.mode === 'individual'
  const activeTeam = session.active_team
  const myTeam = teamRows.find((r) => r.player_id === myPlayerId)?.team ?? null
  const isDrawer = !!myPlayerId && session.drawer_player_id === myPlayerId
  const onActiveTeam = myTeam === activeTeam
  // Individual mode: gate on the live guess roster (teamRows), not session.roster — late
  // joiners are seeded into quick_draw_guess_players but never into the frozen snapshot.
  const inRoster = isIndividual
    ? !!myPlayerId && teamRows.some((r) => r.player_id === myPlayerId)
    : !!myPlayerId && session.roster.includes(myPlayerId)
  const myGuessedThisTurn = guesses.some(
    (g) => g.turn_index === session.turn_index && g.player_id === myPlayerId && g.correct
  )
  const drawerName = players.find((p) => p.id === session.drawer_player_id)?.name ?? 'Someone'
  const canGuess = isIndividual ? inRoster && !isDrawer : onActiveTeam && !isDrawer

  const strokeData = (session.current_stroke_data ?? {
    width: 400,
    height: 280,
    strokes: [],
  }) as QuickDrawDrawingStrokeData
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const syncStrokes = (data: QuickDrawDrawingStrokeData) => {
    if (!myResumeToken || !isDrawer) return
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      void fetch('/api/quick-draw/guess-strokes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, strokeData: data }),
      })
    }, 400)
  }

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    }
  }, [])

  const teamScores = isIndividual ? [] : computeQuickDrawGuessTeamScores(words, session.num_teams)
  const leaderboard = isIndividual ? quickDrawGuessIndividualLeaderboard(teamRows, players) : []

  const scoreboardEl = isIndividual ? (
    <DescribeItPlayerScoreboard
      leaderboard={leaderboard}
      describerId={session.drawer_player_id}
      myPlayerId={myPlayerId}
      round={session.current_round}
      totalRounds={session.total_rounds}
    />
  ) : (
    <DescribeItScoreboard
      scores={teamScores}
      activeTeam={activeTeam}
      myTeam={myTeam}
      round={session.current_round}
      totalRounds={session.total_rounds}
    />
  )

  return (
    <div className="space-y-4 min-w-0">
      {session.phase === 'turn' && (
        <div
          className={`text-center text-sm font-bold tabular-nums ${urgent ? 'text-red-400 animate-pulse' : 'text-faint'}`}
        >
          {secondsLeft}s left
        </div>
      )}

      {isIndividual
        ? isDrawer &&
          session.phase === 'turn' && <p className="text-center text-xs text-faint">You&apos;re drawing 🎨</p>
        : myTeam != null && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-faint">
              You&apos;re on <TeamBadge team={myTeam} />
              {isDrawer && session.phase === 'turn' && onActiveTeam ? <span>· you&apos;re drawing 🎨</span> : null}
            </p>
          )}

      {!isIndividual && scoreboardEl}

      {session.phase === 'break' && (
        <DescribeItCard className="p-5 text-center space-y-2">
          <p className="text-3xl">⏭️</p>
          <p className="text-base font-bold">{session.status_message}</p>
          {session.turn_index + 1 <
          quickDrawGuessTotalTurns(session.mode, session.num_teams, session.roster.length, session.total_rounds) ? (
            isIndividual ? (
              <p className="text-faint text-sm">Next drawer in {breakLeft}s</p>
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
          {isDrawer ? (
            <LiveDrawingCanvas
              prompt={session.current_word ?? ''}
              readOnly={false}
              onStrokeChange={syncStrokes}
              onSkip={!isIndividual ? onSkip : undefined}
              skipDisabled={acting}
              resetKey={`${session.turn_index}-${session.current_word}`}
            />
          ) : (
            <div className="space-y-3">
              <p className="text-center text-sm text-faint">
                {isIndividual ? (
                  <>
                    <span className="font-medium text-bright">{drawerName}</span> is drawing — guess the word!
                  </>
                ) : onActiveTeam ? (
                  <>Your teammate is drawing — guess the word!</>
                ) : (
                  <>
                    <TeamBadge team={activeTeam} /> is drawing…
                  </>
                )}
              </p>
              <LiveDrawingCanvas
                strokeData={strokeData}
                readOnly
                resetKey={`${session.turn_index}-${session.current_word}-${strokeData.strokes?.length ?? 0}`}
              />
            </div>
          )}

          {canGuess && !myGuessedThisTurn && (
            <GuessInput onSubmit={(text) => onGuess?.(text)} disabled={acting || !onGuess} />
          )}

          {canGuess && myGuessedThisTurn && (
            <p className="text-center text-sm text-emerald-400 font-medium">You got it! ✅</p>
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

      {isIndividual && scoreboardEl}
    </div>
  )
}
