'use client'

import { useMemo, useRef, type ReactNode } from 'react'
import { MEDALS } from '@/lib/medals'
import type { Game, Player, RummyPlayerHand, RummySession } from '@/types'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import { buildRummyStandings } from '@/lib/rummy'

// Mirrors CrazyEightsFinalResultsShareBlock — captured-block hero + medalled standings +
// host actions (Play again / Reopen lobby / Share). Reuses the shared `ShareResults`
// (`whotStandings` shape doubles as the generic "card-game standings" input).
export function RummyFinalResultsShareBlock({
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
  hands: RummyPlayerHand[]
  session: RummySession | null
  winnerName?: string | null
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
  returnToLobbyButton?: ReactNode
  lobbyNote?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)

  const standings = useMemo(
    () => buildRummyStandings(hands, players, session?.turn_order ?? [], session?.winner_player_id ?? null),
    [hands, players, session?.turn_order, session?.winner_player_id]
  )

  const winnerPlayerId = session?.winner_player_id ?? null
  const displayWinner = winnerName ?? standings.find((row) => row.rank === 1)?.name ?? null

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
                  ? 'First to lay down their hand wins'
                  : 'Closest to going out wins'
                : undefined
          }
        />
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
                      {row.cardCount === 0 ? 'Went out' : `${row.cardCount} card${row.cardCount === 1 ? '' : 's'} left`}
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
