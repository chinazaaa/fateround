'use client'

import React from 'react'
import type { TrollRunPlayerState, TrollRunSession } from '@/types'
import { buildTrollRunChampionshipStandings, buildTrollRunStandings, selectTrollRunRoundStates } from '@/lib/troll-run'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { ExitIcon } from '@/components/host/host-icons'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { Glyph } from '@/components/icons/Glyph'
import { ChampionIcon, Flag02Icon, SkullIcon } from '@hugeicons/core-free-icons'

export interface TrollRunScoreboardProps {
  session: TrollRunSession
  playerStates: TrollRunPlayerState[]
  playerNames: Map<string, string>
  isHost?: boolean
  onNextRound?: () => void
  loading?: boolean
  gameCode?: string
  hostToken?: string
  onEndGameEarly?: () => void
  myPlayerId?: string | null
  onPlayAgain?: () => void
  onReturnToLobby?: () => void
  playingAgain?: boolean
}

export function TrollRunScoreboard({
  session,
  playerStates,
  playerNames,
  isHost,
  onNextRound,
  loading = false,
  gameCode,
  hostToken,
  onEndGameEarly,
  myPlayerId,
  onPlayAgain,
  onReturnToLobby,
  playingAgain = false,
}: TrollRunScoreboardProps) {
  const isFinalRound = session.current_round >= session.total_rounds || session.phase === 'finished'

  // On the championship results, aggregate across all rounds for true tournament metrics.
  // On intermediate round screens, show round-specific stats.
  const championshipStandings = isFinalRound ? buildTrollRunChampionshipStandings(playerStates, playerNames) : []
  const roundStates = selectTrollRunRoundStates(playerStates, session.current_round)
  const roundStandings = !isFinalRound ? buildTrollRunStandings(roundStates, playerNames) : []

  const winner = isFinalRound ? championshipStandings[0] : roundStandings[0]
  const totalPossibleLevels = session.total_rounds * (session.levels_per_round || 10)

  return (
    <div className="glass-card-strong w-full max-w-xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-1">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]">
          <Glyph icon={isFinalRound ? ChampionIcon : Flag02Icon} size={28} />
        </span>
        <h2 className="text-2xl font-black tracking-tight text-[var(--foreground)]">
          {isFinalRound ? 'Final Championship Standings' : `Round ${session.current_round} Results`}
        </h2>
        {isFinalRound && winner && (
          <p className="text-sm font-bold text-[var(--primary)]">{winner.name} wins the Championship!</p>
        )}
        <p className="text-muted text-xs">
          World: <span className="text-[var(--primary)] capitalize font-bold">{session.current_world}</span> · Round{' '}
          <span className="tabular-nums">
            {session.current_round} of {session.total_rounds}
          </span>
        </p>
      </div>

      {/* Standings Table */}
      <div className="space-y-2">
        {isFinalRound
          ? championshipStandings.map((standing, index) => {
              const isLeader = index === 0

              return (
                <div
                  key={standing.playerId}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3 transition-all"
                  style={
                    isLeader
                      ? {
                          background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                          borderColor: 'color-mix(in srgb, var(--primary) 38%, var(--border))',
                        }
                      : { background: 'var(--surface-inset-bg)', borderColor: 'var(--border)' }
                  }
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`w-7 shrink-0 text-center font-mono text-sm font-black tabular-nums ${
                        isLeader ? 'text-[var(--primary)]' : 'text-muted'
                      }`}
                    >
                      #{standing.rank}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-[var(--foreground)]">
                        <span className="truncate">{standing.name}</span>
                        {standing.rank === 1 ? (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-400">
                            🏆 Champion
                          </span>
                        ) : standing.rank === 2 ? (
                          <span className="rounded bg-slate-400/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-300">
                            🥈 2nd Place
                          </span>
                        ) : standing.rank === 3 ? (
                          <span className="rounded bg-amber-700/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-600">
                            🥉 3rd Place
                          </span>
                        ) : null}
                      </div>
                      <div className="text-muted mt-0.5 flex flex-wrap gap-3 text-[11px]">
                        <span className="flex items-center gap-1">
                          <Glyph icon={Flag02Icon} size={11} />
                          Cleared:{' '}
                          <strong className="tabular-nums text-[var(--foreground)]">
                            {standing.totalLevelsCleared} / {totalPossibleLevels}
                          </strong>
                        </span>
                        <span className="flex items-center gap-1">
                          <Glyph icon={SkullIcon} size={11} className="text-rose-400" />
                          Deaths: <strong className="tabular-nums text-rose-400">{standing.totalDeaths}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="font-mono text-base font-black tabular-nums text-[var(--primary)]">
                      {standing.totalScore} pts
                    </div>
                    <div className="text-muted font-mono text-[10px] tabular-nums">
                      {standing.roundsFinishedCount} / {session.total_rounds} rounds
                    </div>
                  </div>
                </div>
              )
            })
          : roundStandings.map((standing, index) => {
              const isLeader = index === 0

              return (
                <div
                  key={standing.playerId}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3 transition-all"
                  style={
                    isLeader
                      ? {
                          background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                          borderColor: 'color-mix(in srgb, var(--primary) 38%, var(--border))',
                        }
                      : { background: 'var(--surface-inset-bg)', borderColor: 'var(--border)' }
                  }
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`w-7 shrink-0 text-center font-mono text-sm font-black tabular-nums ${
                        isLeader ? 'text-[var(--primary)]' : 'text-muted'
                      }`}
                    >
                      #{index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-[var(--foreground)]">
                        <span className="truncate">{standing.name}</span>
                        {standing.finishPosition ? (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                            Finished #{standing.finishPosition}
                          </span>
                        ) : (
                          <span className="text-muted rounded bg-[var(--surface-inset-bg)] px-1.5 py-0.5 font-mono text-[10px] font-semibold">
                            Ran out of time
                          </span>
                        )}
                      </div>
                      <div className="text-muted mt-0.5 flex gap-3 text-[11px]">
                        <span className="flex items-center gap-1">
                          <Glyph icon={Flag02Icon} size={11} />
                          Cleared:{' '}
                          <strong className="tabular-nums text-[var(--foreground)]">
                            {standing.levelsCleared} / {session.levels_per_round || 10}
                          </strong>
                        </span>
                        <span className="flex items-center gap-1">
                          <Glyph icon={SkullIcon} size={11} className="text-rose-400" />
                          Deaths: <strong className="tabular-nums text-rose-400">{standing.deaths}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="font-mono text-base font-black tabular-nums text-[var(--primary)]">
                      {standing.totalScore} pts
                    </div>
                    <div className="text-muted font-mono text-[10px] tabular-nums">
                      +{standing.roundScore} this round
                    </div>
                  </div>
                </div>
              )
            })}
      </div>

      {/* Win Celebration Post */}
      {isFinalRound && myPlayerId && winner?.playerId === myPlayerId && gameCode && (
        <div className="pt-1">
          <PostWinToCommunity gameType="troll_run" gameCode={gameCode} winnerName={winner.name} roundKey={session.id} />
        </div>
      )}

      {/* Host Actions */}
      {isHost && isFinalRound && (
        <div className="pt-2 space-y-2.5">
          {onPlayAgain && (
            <button
              type="button"
              onClick={onPlayAgain}
              disabled={playingAgain || loading}
              className="btn-primary w-full"
            >
              {playingAgain ? 'Starting…' : 'Play again · same settings'}
            </button>
          )}
          {onReturnToLobby && (
            <button
              type="button"
              onClick={onReturnToLobby}
              disabled={playingAgain || loading}
              className="btn-secondary w-full text-xs"
            >
              Return to lobby
            </button>
          )}
        </div>
      )}

      {isHost && !isFinalRound && (
        <div className="pt-2 space-y-2">
          <button
            type="button"
            onClick={onNextRound}
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 font-black text-slate-950 tracking-wide text-sm transition shadow-lg disabled:opacity-50"
          >
            {loading ? 'Starting next round…' : `Start Round ${session.current_round + 1}`}
          </button>
          {gameCode && hostToken && onEndGameEarly && (
            <HostEndGameButton
              gameCode={gameCode}
              hostToken={hostToken}
              onEnded={onEndGameEarly}
              label="End match early"
              icon={<ExitIcon size={12} />}
              confirmTitle="End this Troll Run race early?"
              confirmMessage="The match will end immediately and all players will see the final championship standings."
              className="w-full py-2 text-xs font-bold text-rose-400/80 hover:text-rose-300 transition text-center"
            />
          )}
        </div>
      )}

      {!isHost && (
        <div className="text-muted text-center text-xs italic">
          {isFinalRound
            ? 'Waiting for host to start a new match or return to lobby…'
            : 'Waiting for host to begin next round…'}
        </div>
      )}
    </div>
  )
}
