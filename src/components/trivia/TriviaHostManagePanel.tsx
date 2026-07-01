'use client'

import { useEffect, useMemo, useState } from 'react'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { FinalResultsShareBlock } from '@/components/FinalResultsShareBlock'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { LiveLeaderboardLayout } from '@/components/LiveLeaderboardLayout'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { ExitIcon } from '@/components/host/host-icons'
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
  /** Which slice to render: gameplay ('watch'), controls/settings ('manage'), results ('finished'). */
  section?: 'watch' | 'manage' | 'finished' | 'all'
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
  section = 'all',
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
  const betweenRounds = betweenRoundsProp ?? (game.status === 'active' && !activeRound && lastFinishedRound != null)
  const metadata = activeRound ? parseTriviaMetadata(activeRound.trivia_metadata) : null
  const roundAnswers = useMemo(
    () => roundAnswersProp ?? (currentRound ? answers.filter((a) => a.round_id === currentRound.id) : []),
    [roundAnswersProp, answers, currentRound]
  )
  const leaderboard = useMemo(() => tallyTriviaPlayerScores(answers, players), [answers, players])
  // A host who plays and finishes top can post their win too.
  const hostRow = leaderboard.find((row) => row.id === highlightPlayerId)
  const hostWon =
    !!hostRow && leaderboard[0] != null && hostRow.score === leaderboard[0].score && leaderboard[0].score > 0
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
      totalQuestions={game.rounds_count ?? undefined}
    />
  )

  const showManage = section === 'manage' || section === 'all'
  const showWatch = section === 'watch' || section === 'all'
  const showFinished = section === 'finished' || section === 'all'

  return (
    <div className="space-y-5">
      {/* ── Manage: settings, players, run controls ──────────────────────── */}
      {showManage && (game.status === 'waiting' || game.status === 'active') && onGameUpdate && (
        <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={onGameUpdate} />
      )}

      {showManage && canManagePlayers && (
        <HostLobbyPlayersSection
          players={players}
          removingPlayerId={removingPlayerId}
          onRemovePlayer={onRemovePlayer}
          highlightPlayerId={highlightPlayerId}
          alwaysShowReady={game.status === 'waiting'}
        />
      )}

      {showManage && game.status === 'waiting' && (
        <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))] bg-[var(--card-strong)]/95 p-6 sm:p-8 space-y-5">
          <div>
            <p className="label-caps">Game settings</p>
            <p className="text-muted text-sm sm:text-base mt-2 leading-relaxed">{settingsSummary}</p>
          </div>
          <button type="button" onClick={onEditSettings} className="btn-secondary w-full py-3 text-base">
            Edit settings
          </button>
          <HostLobbyWaitingFooter
            gameCode={gameCode}
            hostToken={hostToken}
            onStart={onStartGame}
            onEnded={onReload}
            canStart={players.length >= TRIVIA_MIN_PLAYERS}
            starting={starting}
            startDisabledHint={
              players.length >= TRIVIA_MIN_PLAYERS
                ? null
                : `Need at least ${TRIVIA_MIN_PLAYERS} players to start (${players.length}/${TRIVIA_MIN_PLAYERS})`
            }
          />
        </div>
      )}

      {showManage && game.status === 'active' && (
        <div className="glass-card-strong p-5 sm:p-6 space-y-3">
          <p className="label-caps">Game controls</p>
          {activeRound && (
            <button
              type="button"
              onClick={onEndRound}
              disabled={advancing}
              className="btn-secondary w-full py-3 text-base"
            >
              {advancing ? 'Ending…' : 'End round early'}
            </button>
          )}
          <HostEndGameButton
            gameCode={gameCode}
            hostToken={hostToken}
            onEnded={onReload}
            label="End game"
            icon={<ExitIcon size={16} />}
            className="btn-danger-soft"
          />
        </div>
      )}

      {/* ── Watch: live gameplay (no controls) ───────────────────────────── */}
      {showWatch && activeRound && metadata && (
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
          </div>
        </LiveLeaderboardLayout>
      )}

      {showWatch && betweenRounds && lastFinishedRound && (
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
                            <span
                              className={
                                a.is_correct ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-muted'
                              }
                            >
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
          </div>
        </LiveLeaderboardLayout>
      )}

      {showWatch && game.status === 'active' && !activeRound && !betweenRounds && liveLeaderboard}

      {/* ── Finished: results ────────────────────────────────────────────── */}
      {showFinished && game.status === 'finished' && (
        <>
          <FinalResultsShareBlock
            game={game}
            participants={[]}
            votes={[]}
            rounds={rounds}
            players={players}
            triviaAnswers={answers}
            showCreateNewGame
            playAgainButton={
              <button
                type="button"
                onClick={onPlayAgain}
                disabled={playingAgain}
                className="btn-primary w-full py-3.5 text-base"
              >
                {playingAgain ? 'Resetting…' : 'Play again'}
              </button>
            }
          >
            <div className="glass-card-strong p-8 text-center space-y-2">
              <p className="text-4xl">🏆</p>
              <p className="text-2xl font-black">{leaderboard[0]?.name ?? 'Someone'} wins!</p>
              <p className="text-muted text-base">{leaderboard[0]?.score ?? 0} points total</p>
            </div>
            <PaginatedLeaderboard
              title="Final leaderboard"
              rows={leaderboard.map((row, i) => ({ ...row, rank: i + 1 }))}
              scoreLabel={(n) => `${n} pts`}
              totalQuestions={game.rounds_count ?? undefined}
            />
          </FinalResultsShareBlock>
          {hostWon && (
            <PostWinToCommunity
              gameType="trivia"
              gameCode={gameCode}
              winnerName={hostRow?.name ?? ''}
              roundKey={game.session_started_at ?? undefined}
            />
          )}
        </>
      )}
    </div>
  )
}
