'use client'

import { useEffect, useMemo, useState } from 'react'
import { PlayerInviteCard } from '@/components/PlayerInviteCard'
import { CreateNewGameButton } from '@/components/ui/CreateNewGameButton'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { HostPlayerManageList } from '@/components/host/HostPlayerManageList'
import { FinalResultsShareBlock } from '@/components/FinalResultsShareBlock'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { LiveLeaderboardLayout } from '@/components/LiveLeaderboardLayout'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import {
  formatTriviaChoiceLabel,
  parseTriviaMetadata,
  revealCountdownSeconds,
  tallyTriviaPlayerScores,
  triviaCategoryFromGame,
  TRIVIA_MIN_PLAYERS,
  TRIVIA_REVEAL_SECONDS,
} from '@/lib/trivia'
import { triviaCategoryLabel } from '@/lib/trivia-questions'
import { parseQuestionSource, parseStoredTriviaQuestions } from '@/lib/custom-questions'
import type { Game, Player, Round, TriviaAnswer } from '@/types'

const CHOICE_BADGE =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-white font-black mr-3'
const COUNTDOWN_TEXT = 'text-[var(--primary-strong)] dark:text-rose-300 font-bold text-lg sm:text-xl'

interface TriviaHostManagePanelProps {
  game: Game
  gameCode: string
  hostToken: string
  playerLink: string
  players: Player[]
  rounds: Round[]
  answers: TriviaAnswer[]
  starting: boolean
  advancing: boolean
  playingAgain: boolean
  onStartGame: () => void
  onEndRound: () => void
  onPlayAgain: () => void
  onEditSettings: () => void
  onReload?: () => void | Promise<unknown>
  onGameUpdate?: (game: Game) => void
  onRemovePlayer?: (playerId: string, playerName: string) => void
  removingPlayerId?: string | null
  highlightPlayerId?: string | null
  activeRound?: Round | null
  betweenRounds?: boolean
  lastFinishedRound?: Round | null
  roundAnswers?: TriviaAnswer[]
  allAnswered?: boolean
  isLastRound?: boolean
}

export function TriviaHostManagePanel({
  game,
  gameCode,
  hostToken,
  playerLink,
  players,
  rounds,
  answers,
  starting,
  advancing,
  playingAgain,
  onStartGame,
  onEndRound,
  onPlayAgain,
  onEditSettings,
  onReload,
  onGameUpdate,
  onRemovePlayer,
  removingPlayerId,
  highlightPlayerId,
  activeRound: activeRoundProp,
  betweenRounds: betweenRoundsProp,
  lastFinishedRound: lastFinishedRoundProp,
  roundAnswers: roundAnswersProp,
  allAnswered: allAnsweredProp,
  isLastRound: isLastRoundProp,
}: TriviaHostManagePanelProps) {
  const [revealCountdown, setRevealCountdown] = useState(TRIVIA_REVEAL_SECONDS)

  const currentRound = useMemo(
    () => rounds.find((r) => r.round_number === game.current_round_number) ?? null,
    [rounds, game.current_round_number]
  )
  const activeRound = activeRoundProp ?? (currentRound?.status === 'active' ? currentRound : null)
  const lastFinishedRound = useMemo(() => {
    if (lastFinishedRoundProp !== undefined) return lastFinishedRoundProp
    const finished = rounds.filter((r) => r.status === 'finished')
    return finished.length ? finished[finished.length - 1] : null
  }, [lastFinishedRoundProp, rounds])
  const betweenRounds =
    betweenRoundsProp ?? (game.status === 'active' && !activeRound && lastFinishedRound != null)
  const metadata = activeRound ? parseTriviaMetadata(activeRound.trivia_metadata) : null
  const roundAnswers = useMemo(
    () => roundAnswersProp ?? (currentRound ? answers.filter((a) => a.round_id === currentRound.id) : []),
    [roundAnswersProp, answers, currentRound]
  )
  const leaderboard = useMemo(() => tallyTriviaPlayerScores(answers, players), [answers, players])
  const isLastRound = isLastRoundProp ?? (game.current_round_number ?? 0) >= (game.rounds_count ?? 0)
  const category = triviaCategoryLabel(triviaCategoryFromGame(game))
  const questionSource = parseQuestionSource(game.question_source, 'trivia')
  const customQuestionCount = parseStoredTriviaQuestions(game.custom_questions).length
  const settingsSummary =
    questionSource === 'platform'
      ? `Platform · ${category} · ${game.rounds_count} rounds · ${game.timer_seconds}s per question`
      : `Custom · ${customQuestionCount} question${customQuestionCount === 1 ? '' : 's'} · ${game.rounds_count} rounds · ${game.timer_seconds}s per question`
  const allAnswered = allAnsweredProp ?? (!!activeRound && players.length > 0 && roundAnswers.length >= players.length)

  useEffect(() => {
    if (!betweenRounds || !lastFinishedRound?.ended_at) return
    const tick = () => setRevealCountdown(revealCountdownSeconds(lastFinishedRound.ended_at))
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [betweenRounds, lastFinishedRound?.ended_at, lastFinishedRound?.id])

  const revealComplete = betweenRounds && revealCountdown <= 0
  const canManagePlayers = game.status === 'waiting' || game.status === 'active'

  const liveLeaderboard = (
    <PaginatedLeaderboard
      title="Live leaderboard"
      rows={leaderboard.map((row, i) => ({ ...row, rank: i + 1 }))}
      scoreLabel={(n) => `${n} pts`}
    />
  )

  return (
    <div className="space-y-5">
      {game.status === 'active' && onGameUpdate && (
        <HostLateJoinSettingsCard
          gameCode={gameCode}
          hostToken={hostToken}
          game={game}
          onGameUpdate={onGameUpdate}
        />
      )}

      <PlayerInviteCard url={playerLink} gameCode={gameCode} title="Player link" />

      {canManagePlayers && (
        <div className="glass-card-strong p-5 sm:p-6 space-y-3">
          <p className="label-caps">
            Players — {players.length}
          </p>
          <HostPlayerManageList
            players={players}
            removingPlayerId={removingPlayerId}
            onRemovePlayer={onRemovePlayer}
            highlightPlayerId={highlightPlayerId}
          />
        </div>
      )}

      {game.status === 'waiting' && (
        <div className="glass-card-strong p-6 sm:p-8 space-y-5">
          <div>
            <p className="text-xl sm:text-2xl font-bold text-body">
              Lobby — {players.length} player{players.length !== 1 ? 's' : ''}
            </p>
            <p className="text-muted text-sm sm:text-base mt-1">{settingsSummary}</p>
          </div>
          <button
            type="button"
            onClick={onEditSettings}
            className="btn-secondary w-full py-3 text-base"
          >
            Edit settings
          </button>
          <button
            type="button"
            onClick={onStartGame}
            disabled={starting || players.length < TRIVIA_MIN_PLAYERS}
            className="btn-primary w-full py-4 text-base sm:text-lg"
          >
            {starting ? 'Starting…' : `Start trivia (${players.length}/${TRIVIA_MIN_PLAYERS}+ players)`}
          </button>
        </div>
      )}

      {activeRound && metadata && (
        <LiveLeaderboardLayout sidebar={liveLeaderboard}>
          <div className="glass-card-strong p-6 sm:p-8 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm sm:text-base text-muted">
              <span>
                Round {activeRound.round_number} of {game.rounds_count}
              </span>
              <span className="font-semibold text-body">
                {roundAnswers.length}/{players.length} answered
                {allAnswered ? ' — revealing…' : ''}
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-body leading-snug">{metadata.question}</p>
            <div className="grid gap-3">
              {metadata.choices.map((choice, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-[var(--border-strong)] px-5 py-4 text-base sm:text-lg text-body flex items-center"
                >
                  <span className={CHOICE_BADGE}>{formatTriviaChoiceLabel(i)}</span>
                  {choice}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={onEndRound}
              disabled={advancing}
              className="btn-secondary w-full py-3.5 text-base"
            >
              {advancing ? 'Ending…' : 'End round early'}
            </button>
            <HostEndGameButton gameCode={gameCode} hostToken={hostToken} onEnded={onReload} className="btn-secondary w-full py-3 text-base" />
          </div>
        </LiveLeaderboardLayout>
      )}

      {betweenRounds && lastFinishedRound && (
        <LiveLeaderboardLayout sidebar={liveLeaderboard}>
          <div className="glass-card-strong p-6 sm:p-8 space-y-5">
            <p className="label-caps">Round {lastFinishedRound.round_number} results</p>
            {(() => {
              const meta = parseTriviaMetadata(lastFinishedRound.trivia_metadata)
              const ra = answers.filter((a) => a.round_id === lastFinishedRound.id)
              if (!meta) return null
              return (
                <>
                  <p className="text-base sm:text-lg text-body">
                    Correct:{' '}
                    <span className="font-semibold">
                      {formatTriviaChoiceLabel(meta.correct_index)}. {meta.choices[meta.correct_index]}
                    </span>
                  </p>
                  <ul className="space-y-2 text-base">
                    {ra
                      .sort((a, b) => b.points - a.points || a.response_ms - b.response_ms)
                      .map((a) => {
                        const player = players.find((p) => p.id === a.player_id)
                        return (
                          <li
                            key={a.id}
                            className="flex justify-between gap-3 rounded-xl border border-[var(--border-strong)] px-4 py-3"
                          >
                            <span className={a.is_correct ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-muted'}>
                              {player?.name ?? 'Player'} — {a.is_correct ? '✓' : '✗'}
                            </span>
                            <span className="text-muted shrink-0 font-semibold">+{a.points} pts</span>
                          </li>
                        )
                      })}
                  </ul>
                </>
              )
            })()}
            <p className={`text-center ${COUNTDOWN_TEXT} py-2`}>
              {revealComplete
                ? isLastRound
                  ? 'Showing final results…'
                  : 'Starting next question…'
                : isLastRound
                  ? `Showing final leaderboard — ending in ${revealCountdown}s…`
                  : `Next question in ${revealCountdown}s…`}
            </p>
            <HostEndGameButton gameCode={gameCode} hostToken={hostToken} onEnded={onReload} className="btn-secondary w-full py-3 text-base" />
          </div>
        </LiveLeaderboardLayout>
      )}

      {game.status === 'active' && !activeRound && !betweenRounds && liveLeaderboard}

      {game.status === 'finished' && (
        <>
          <FinalResultsShareBlock
            game={game}
            participants={[]}
            votes={[]}
            rounds={rounds}
            players={players}
            triviaAnswers={answers}
            showCreateNewGame={false}
          >
            <PaginatedLeaderboard
              title="Final leaderboard"
              rows={leaderboard.map((row, i) => ({ ...row, rank: i + 1 }))}
              scoreLabel={(n) => `${n} pts`}
            />
            <div className="glass-card-strong p-8 text-center space-y-2">
              <p className="text-4xl">🏆</p>
              <p className="text-2xl font-black">{leaderboard[0]?.name ?? 'Someone'} wins!</p>
              <p className="text-muted text-base">{leaderboard[0]?.score ?? 0} points total</p>
            </div>
          </FinalResultsShareBlock>
          <button type="button" onClick={onPlayAgain} disabled={playingAgain} className="btn-secondary w-full py-3.5 text-base">
            {playingAgain ? 'Resetting…' : 'Play again'}
          </button>
          <CreateNewGameButton className="btn-primary w-full py-3.5 text-base" />
        </>
      )}
    </div>
  )
}
