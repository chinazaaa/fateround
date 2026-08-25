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

/**
 * One player's line, laid out the same way at every width: who they are and what they scored on the
 * top row, the run's detail on a second row beneath it.
 *
 * The detail used to hang off the name inside the left-hand column, which left it a third of a phone
 * screen wide — narrow enough that "Cleared:" and "10 / 50" broke onto separate lines and the row
 * read as a list of stray words. Giving it the full width instead means each stat stays whole and
 * simply wraps as a unit when there is no room for all of them side by side.
 */
function StandingRow({
  rank,
  isLeader,
  name,
  badge,
  stats,
  score,
  scoreDetail,
}: {
  rank: number
  isLeader: boolean
  name: string
  badge: React.ReactNode
  stats: React.ReactNode
  score: number
  scoreDetail: string
}) {
  return (
    <div
      className="rounded-xl border p-2.5 transition-all sm:p-3"
      style={
        isLeader
          ? {
              background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
              borderColor: 'color-mix(in srgb, var(--primary) 38%, var(--border))',
            }
          : { background: 'var(--surface-inset-bg)', borderColor: 'var(--border)' }
      }
    >
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span
            className={`w-6 shrink-0 text-center font-mono text-sm font-black tabular-nums sm:w-7 ${
              isLeader ? 'text-[var(--primary)]' : 'text-muted'
            }`}
          >
            #{rank}
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-[var(--foreground)]">
            <span className="truncate">{name}</span>
            {badge}
          </div>
        </div>

        <div className="shrink-0 font-mono text-base font-black tabular-nums text-[var(--primary)]">{score} pts</div>
      </div>

      <div className="text-muted mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-8 text-[11px] sm:pl-10">
        {stats}
        <span className="font-mono tabular-nums">{scoreDetail}</span>
      </div>
    </div>
  )
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
    <div className="glass-card-strong mx-auto w-full max-w-xl space-y-5 p-4 sm:space-y-6 sm:p-6">
      {/* Header */}
      <div className="text-center space-y-1">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]">
          <Glyph icon={isFinalRound ? ChampionIcon : Flag02Icon} size={28} />
        </span>
        <h2 className="text-xl font-black tracking-tight text-[var(--foreground)] sm:text-2xl">
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
          ? championshipStandings.map((standing, index) => (
              <StandingRow
                key={standing.playerId ? `champ-${standing.playerId}` : `champ-pos-${index}`}
                rank={standing.rank}
                isLeader={index === 0}
                name={standing.name}
                badge={
                  standing.rank === 1 ? (
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
                  ) : null
                }
                stats={
                  <>
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <Glyph icon={Flag02Icon} size={11} />
                      Cleared:{' '}
                      <strong className="tabular-nums text-[var(--foreground)]">
                        {standing.totalLevelsCleared} / {totalPossibleLevels}
                      </strong>
                    </span>
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <Glyph icon={SkullIcon} size={11} className="text-rose-400" />
                      Deaths: <strong className="tabular-nums text-rose-400">{standing.totalDeaths}</strong>
                    </span>
                  </>
                }
                score={standing.totalScore}
                scoreDetail={`${standing.roundsFinishedCount} / ${session.total_rounds} rounds`}
              />
            ))
          : roundStandings.map((standing, index) => (
              <StandingRow
                key={standing.playerId ? `round-${standing.playerId}` : `round-pos-${index}`}
                rank={index + 1}
                isLeader={index === 0}
                name={standing.name}
                badge={
                  standing.finishPosition ? (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                      Finished #{standing.finishPosition}
                    </span>
                  ) : (
                    <span className="text-muted rounded bg-[var(--surface-inset-bg)] px-1.5 py-0.5 font-mono text-[10px] font-semibold">
                      Ran out of time
                    </span>
                  )
                }
                stats={
                  <>
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <Glyph icon={Flag02Icon} size={11} />
                      Cleared:{' '}
                      <strong className="tabular-nums text-[var(--foreground)]">
                        {standing.levelsCleared} / {session.levels_per_round || 10}
                      </strong>
                    </span>
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <Glyph icon={SkullIcon} size={11} className="text-rose-400" />
                      Deaths: <strong className="tabular-nums text-rose-400">{standing.deaths}</strong>
                    </span>
                  </>
                }
                score={standing.totalScore}
                scoreDetail={`+${standing.roundScore} this round`}
              />
            ))}
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
          {gameCode && hostToken && (
            <HostEndGameButton
              gameCode={gameCode}
              hostToken={hostToken}
              onEnded={onEndGameEarly}
              label="End match early"
              icon={<ExitIcon size={14} />}
              confirmTitle="End this Troll Run race early?"
              confirmMessage="The match will end immediately and all players will see the final championship standings."
              className="btn-ghost flex w-full items-center justify-center gap-1.5 py-2.5 text-xs font-bold !text-rose-400 hover:!text-rose-300 hover:bg-rose-500/10 rounded-xl transition"
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
