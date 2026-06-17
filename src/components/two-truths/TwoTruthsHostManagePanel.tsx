'use client'

import { useMemo } from 'react'
import { TwoTruthsSubmitterBadge } from '@/components/two-truths/TwoTruthsSubmitterBadge'
import { PlayerInviteCard } from '@/components/PlayerInviteCard'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { LiveLeaderboardLayout } from '@/components/LiveLeaderboardLayout'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { HostPlayerManageList } from '@/components/host/HostPlayerManageList'
import { TwoTruthsShareBlock } from '@/components/two-truths/TwoTruthsShareBlock'
import {
  formatTtlChoiceLabel,
  lobbyReadyForTwoTruths,
  parseTtlMetadata,
  playerDisplayName,
  revealCountdownSeconds,
  tallyTtlScores,
  TTL_MIN_PLAYERS,
  TTL_TIMER_OPTIONS,
} from '@/lib/two-truths'
import type { Game, Player, Round, TtlGuess, TtlStatement } from '@/types'

export function TwoTruthsHostManagePanel({
  game,
  gameCode,
  hostToken,
  playerLink,
  players,
  statements,
  rounds,
  guesses,
  starting,
  playingAgain,
  onStartGame,
  onPlayAgain,
  onReload,
  timerSeconds,
  onTimerChange,
  savingTimer,
  onSaveTimer,
  onRemovePlayer,
  removingPlayerId,
  onGameUpdate,
}: {
  game: Game
  gameCode: string
  hostToken: string
  playerLink: string
  players: Player[]
  statements: TtlStatement[]
  rounds: Round[]
  guesses: TtlGuess[]
  starting: boolean
  playingAgain: boolean
  onStartGame: () => void
  onPlayAgain: () => void
  onReload?: () => void | Promise<unknown>
  timerSeconds: number
  onTimerChange: (seconds: number) => void
  savingTimer: boolean
  onSaveTimer: () => void
  onRemovePlayer?: (playerId: string, playerName: string) => void | Promise<void | boolean>
  removingPlayerId?: string | null
  onGameUpdate: (game: Game) => void
}) {
  const inLobby = game.status === 'waiting'
  const playerIds = players.map((p) => p.id)
  const ready = lobbyReadyForTwoTruths(playerIds, statements)
  const submittedIds = new Set(statements.map((s) => s.player_id))
  const leaderboard = useMemo(() => tallyTtlScores(guesses, players, rounds), [guesses, players, rounds])

  const currentRound = rounds.find((r) => r.round_number === game.current_round_number) ?? null
  const activeRound = currentRound?.status === 'active' ? currentRound : null
  const metadata = activeRound ? parseTtlMetadata(activeRound.ttl_metadata) : null
  const lastFinished = [...rounds].reverse().find((r) => r.status === 'finished') ?? null
  const revealRemaining = lastFinished?.ended_at ? revealCountdownSeconds(lastFinished.ended_at) : 0

  const liveLeaderboard = (
    <PaginatedLeaderboard
      title="Leaderboard"
      rows={leaderboard.map((row, i) => ({ id: row.id, name: row.name, score: row.score, rank: i + 1 }))}
      scoreLabel={(score) => `${score} pts`}
    />
  )

  const showActiveRoundPanel = game.status === 'active' && activeRound && metadata
  const showRevealPanel =
    game.status === 'active' && !activeRound && lastFinished && revealRemaining > 0

  return (
    <div className="space-y-5">
      <PlayerInviteCard url={playerLink} gameCode={gameCode} title="Share link" />

      {inLobby && (
        <div className="glass-card p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="label-caps">Lobby ({players.length} players)</p>
              <p className="text-faint text-xs mt-1 leading-relaxed">
                Players submit two truths and a lie. You can start once {TTL_MIN_PLAYERS}+ have submitted — others will be skipped.
              </p>
            </div>
            <span
              className={[
                'text-xs font-semibold rounded-full px-2.5 py-1',
                ready.ok
                  ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                  : 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
              ].join(' ')}
            >
              {ready.ok ? 'Ready' : 'Not ready'}
            </span>
          </div>

          <ul className="space-y-1 text-sm">
            {players.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span className="font-semibold truncate">{p.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={submittedIds.has(p.id) ? 'text-emerald-600 dark:text-emerald-300 text-xs' : 'text-amber-600 dark:text-amber-300 text-xs'}>
                    {submittedIds.has(p.id) ? '✓ Submitted' : 'Waiting…'}
                  </span>
                  {onRemovePlayer && (
                    <button
                      type="button"
                      onClick={() => onRemovePlayer(p.id, p.name)}
                      disabled={removingPlayerId === p.id}
                      className="text-faint hover:text-red-500 transition-colors text-xs px-1"
                      title="Remove player"
                    >
                      {removingPlayerId === p.id ? '…' : '✕'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {!ready.ok && (
            <p className="text-amber-700 dark:text-amber-200 text-sm">{ready.error}</p>
          )}
          {ready.ok && submittedIds.size < players.length && (
            <p className="text-faint text-sm">
              {players.length - submittedIds.size} player{players.length - submittedIds.size === 1 ? '' : 's'} {' '} haven&apos;t submitted — they&apos;ll be skipped.
            </p>
          )}

          <div className="space-y-2">
            <p className="label-caps">Guess timer (per round)</p>
            <select
              value={timerSeconds}
              onChange={(e) => onTimerChange(Number(e.target.value))}
              disabled={!inLobby}
              className="input-field w-full"
            >
              {TTL_TIMER_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s} seconds
                </option>
              ))}
            </select>
            {inLobby && (
              <button type="button" onClick={onSaveTimer} disabled={savingTimer} className="btn-secondary w-full">
                {savingTimer ? 'Saving…' : 'Save timer'}
              </button>
            )}
          </div>

          <HostAllowViewersField
            embedded
            gameCode={gameCode}
            hostToken={hostToken}
            game={game}
            onGameUpdate={onGameUpdate}
          />

          <button
            type="button"
            onClick={onStartGame}
            disabled={starting || !ready.ok}
            className="btn-primary w-full"
          >
            {starting ? 'Starting…' : `Start game (${submittedIds.size} submitted)`}
          </button>
        </div>
      )}

      {game.status === 'active' && (
        <>
          <HostLateJoinSettingsCard
            gameCode={gameCode}
            hostToken={hostToken}
            game={game}
            onGameUpdate={onGameUpdate}
          />
          <div className="glass-card p-5 space-y-3">
          <p className="label-caps">Players — {players.length}</p>
          {onRemovePlayer ? (
            <HostPlayerManageList
              players={players}
              removingPlayerId={removingPlayerId}
              onRemovePlayer={onRemovePlayer}
              hint="Remove to kick someone out of the game"
            />
          ) : (
            <ul className="space-y-1 text-sm">
              {players.map((p) => (
                <li key={p.id} className="font-semibold truncate">
                  {p.name}
                </li>
              ))}
            </ul>
          )}
          </div>
        </>
      )}

      {(showActiveRoundPanel || showRevealPanel) && (
        <LiveLeaderboardLayout sidebar={liveLeaderboard}>
          {showActiveRoundPanel && (
            <div className="glass-card p-5 space-y-3">
              <p className="label-caps">Round {activeRound!.round_number}</p>
              <div className="flex justify-center">
                <TwoTruthsSubmitterBadge submitterId={activeRound!.submitter_player_id} players={players} />
              </div>
              <p className="text-center text-sm font-semibold text-muted">
                {playerDisplayName(activeRound!.submitter_player_id, players)}&apos;s statements
              </p>
              <div className="space-y-2">
                {metadata!.statements.map((statement, index) => (
                  <div key={index} className="rounded-xl border border-[var(--border-strong)] px-3 py-2 text-sm">
                    <span className="font-bold mr-2">{formatTtlChoiceLabel(index)}.</span>
                    {statement}
                  </div>
                ))}
              </div>
            </div>
          )}

          {showRevealPanel && (() => {
            const finishedMeta = parseTtlMetadata(lastFinished!.ttl_metadata)
            if (!finishedMeta) return null
            return (
              <div className="glass-card p-5 space-y-3">
                <p className="label-caps text-center">Round {lastFinished!.round_number} reveal</p>
                <div className="flex justify-center">
                  <TwoTruthsSubmitterBadge submitterId={lastFinished!.submitter_player_id} players={players} />
                </div>
                <div className="space-y-2">
                  {finishedMeta.statements.map((statement, index) => {
                    const isLie = index === finishedMeta.lie_index
                    return (
                      <div
                        key={index}
                        className={[
                          'rounded-xl border px-3 py-2 text-sm',
                          isLie
                            ? 'border-violet-500/60 bg-violet-500/10'
                            : 'border-[var(--border-strong)]',
                        ].join(' ')}
                      >
                        <span className="font-bold mr-2">{formatTtlChoiceLabel(index)}.</span>
                        {statement}
                        {isLie && (
                          <span className="block text-violet-600 dark:text-violet-300 text-xs font-bold mt-1">🤥 The lie</span>
                        )}
                      </div>
                    )
                  })}
                </div>
                <p className="text-center text-sm text-muted">Next round in {revealRemaining}s…</p>
              </div>
            )
          })()}
        </LiveLeaderboardLayout>
      )}

      {game.status === 'finished' && (
        <div className="space-y-4">
          <TwoTruthsShareBlock gameTitle={game.title}>
            <div className="glass-card p-6 text-center space-y-2">
              <p className="text-4xl">🏆</p>
              <p className="text-xl font-black">Game finished</p>
            </div>
            <PaginatedLeaderboard
              title="Final leaderboard"
              rows={leaderboard.map((row, i) => ({ id: row.id, name: row.name, score: row.score, rank: i + 1 }))}
              scoreLabel={(score) => `${score} pts`}
            />
          </TwoTruthsShareBlock>
          <button type="button" onClick={onPlayAgain} disabled={playingAgain} className="btn-secondary w-full">
            {playingAgain ? 'Resetting…' : 'Return to lobby'}
          </button>
        </div>
      )}

      {game.status === 'active' && (
        <>
          <HostEndGameButton gameCode={gameCode} hostToken={hostToken} onEnded={onReload} className="btn-secondary w-full" />
          <button type="button" onClick={onPlayAgain} disabled={playingAgain} className="btn-secondary w-full">
            {playingAgain ? 'Resetting…' : 'End & return to lobby'}
          </button>
        </>
      )}
    </div>
  )
}
