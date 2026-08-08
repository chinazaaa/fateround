'use client'

import { useMemo, useRef, type ReactNode } from 'react'
import { MEDALS } from '@/lib/medals'
import type { Game, Player, UnoPlayerHand, UnoSession } from '@/types'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import { buildUnoStandings } from '@/lib/uno'

export function UnoFinalResultsShareBlock({
  game,
  players,
  hands,
  session,
  winnerName,
  highlightPlayerId,
  playAgainButton,
  returnToLobbyButton,
  lobbyNote,
}: {
  game: Game
  players: Player[]
  hands: UnoPlayerHand[]
  session: UnoSession | null
  winnerName?: string | null
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
  returnToLobbyButton?: ReactNode
  lobbyNote?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)

  const standings = useMemo(
    () =>
      buildUnoStandings(
        hands,
        players,
        session?.turn_order ?? [],
        session?.finish_order ?? [],
        game.uno_team_mode === true,
        session?.left_player_ids ?? [],
        // No Mercy — knocked-out seats always rank behind live players in the standings.
        session?.eliminated_player_ids ?? []
      ),
    [
      hands,
      players,
      session?.turn_order,
      session?.finish_order,
      game.uno_team_mode,
      session?.left_player_ids,
      session?.eliminated_player_ids,
    ]
  )

  const teamMode = game.uno_team_mode === true
  const winnerPlayerId = session?.winner_player_id ?? null
  // Team-Up: the top two standings are the winning team — show both as the winner.
  const displayWinner = teamMode
    ? [standings[0]?.name, standings[1]?.name].filter(Boolean).join(' & ') || null
    : (winnerName ?? standings.find((row) => row.rank === 1)?.name ?? null)

  const winnerStanding =
    (winnerPlayerId ? standings.find((row) => row.playerId === winnerPlayerId) : null) ??
    standings.find((row) => row.rank === 1) ??
    null
  const winnerEmptyHand = winnerStanding?.cardCount === 0

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-5">
        <ShareResultsCaptureHeader game={game} />
        <FinishedWinnerHero
          winnerName={displayWinner}
          game={game}
          subtitle={
            session?.phase === 'finished' && session.status_message
              ? session.status_message
              : standings.length > 1
                ? winnerEmptyHand
                  ? 'First to empty their hand wins'
                  : 'Lowest hand total wins · Wild = 50'
                : undefined
          }
        />
        {game.uno_series_scoring ? (
          <UnoSeriesScoreboard game={game} players={players} highlightPlayerId={highlightPlayerId} />
        ) : null}
        {standings.length > 0 && (
          <div className="space-y-2">
            {standings.map((row) => {
              const isWinner = winnerPlayerId ? row.playerId === winnerPlayerId : row.rank === 1
              const isMe = row.playerId === highlightPlayerId
              return (
                <div
                  key={row.playerId}
                  className={
                    isWinner
                      ? 'flex items-center gap-3 rounded-xl px-4 py-3 border border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_8%,var(--surface))]'
                      : 'flex items-center gap-3 rounded-xl px-4 py-3 border border-[var(--border)] bg-[var(--surface-inset-bg)]'
                  }
                >
                  <span
                    className={`w-7 shrink-0 text-center font-black tabular-nums ${
                      isWinner ? 'text-lg gradient-title' : 'text-base text-faint'
                    }`}
                  >
                    {MEDALS[row.rank - 1] ?? row.rank}
                  </span>
                  <div className="min-w-0">
                    <p className={`font-bold truncate ${isWinner ? 'text-[17px]' : 'text-[15px]'}`}>
                      {row.name}
                      {isMe ? <span className="label-teal font-semibold"> (you)</span> : null}
                    </p>
                    <p className="text-[11px] text-muted">
                      {row.cardCount === 0
                        ? 'Out of cards'
                        : `${row.cardCount} card${row.cardCount === 1 ? '' : 's'} left`}
                    </p>
                  </div>
                  <p
                    className={`ml-auto shrink-0 text-sm font-black tabular-nums ${
                      isWinner ? 'gradient-title' : 'text-muted'
                    }`}
                  >
                    {row.cardCount === 0 ? '—' : row.handSum}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <HostGameFinishedActions
        variant="winner"
        gameCode={game.id}
        playAgainButton={playAgainButton}
        returnToLobbyButton={returnToLobbyButton}
        lobbyNote={lobbyNote}
        shareButton={
          <ShareResults
            captureRef={captureRef}
            game={game}
            participants={[]}
            votes={[]}
            rounds={[]}
            players={players}
            whotStandings={standings}
            whotWinnerName={displayWinner ?? undefined}
            primary
          />
        }
      />
    </div>
  )
}

/**
 * Series running-total scoreboard. Shown when the host enabled series scoring — displays
 * every player's cumulative points across hands, marks the series winner if reached, and
 * shows the target so the room knows how much further to go.
 */
function UnoSeriesScoreboard({
  game,
  players,
  highlightPlayerId,
}: {
  game: Game
  players: Player[]
  highlightPlayerId?: string | null
}) {
  const scores = (game.uno_series_scores ?? {}) as Record<string, number>
  const target = Number(game.uno_series_target ?? 1000)
  const winnerId = game.uno_series_winner_id ?? null
  const rows = players
    .map((p) => ({ id: p.id, name: p.name, points: Number(scores[p.id] ?? 0) }))
    .sort((a, b) => b.points - a.points)
  if (rows.length === 0) return null
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset-bg)] p-4">
      <div className="flex items-baseline justify-between mb-2">
        <p className="label-caps text-[10px]">Series scoreboard</p>
        <p className="text-[11px] text-muted">{winnerId ? 'Series won!' : `First to ${target}`}</p>
      </div>
      <div className="space-y-1.5">
        {rows.map((row) => {
          const isWinner = winnerId === row.id
          const isMe = highlightPlayerId === row.id
          const pct = Math.min(100, Math.round((row.points / target) * 100))
          return (
            <div key={row.id} className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className={`text-sm font-semibold ${isWinner ? 'gradient-title' : ''}`}>
                  {row.name}
                  {isMe ? <span className="label-teal font-semibold"> (you)</span> : null}
                </span>
                <div className="mt-0.5 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                  <div className="h-full bg-[var(--primary)]" style={{ width: `${pct}%` }} />
                </div>
              </span>
              <span className="shrink-0 text-sm font-black tabular-nums">{row.points}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
