'use client'

import { useMemo, useRef, type ReactNode } from 'react'
import { MEDALS } from '@/lib/medals'
import type { Game, GoFishPlayerHand, GoFishSession, Player } from '@/types'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import { buildGoFishStandings } from '@/lib/gofish'

/**
 * Final results block for Go Fish — mirrors WhotFinalResultsShareBlock so both
 * card games land on the same finished-screen shape (glass-card + winner hero +
 * primary-themed standings + shareable capture).
 */
export function GoFishFinalResultsShareBlock({
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
  hands: GoFishPlayerHand[]
  session: GoFishSession | null
  winnerName?: string | null
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
  returnToLobbyButton?: ReactNode
  lobbyNote?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)

  const standings = useMemo(
    () =>
      buildGoFishStandings(
        hands,
        // Spectators never got dealt a hand, so their books=0 / cards=0 row was
        // sneaking to rank-1 via the alphabetic tiebreak in the pure standings
        // sort — and when the server declined to name a winner (0 books game),
        // the null-fallback crowned that spectator row. Filter them out here.
        players.filter((p) => !p.spectator).map((p) => ({ id: p.id, name: p.name }))
      ),
    [hands, players]
  )

  const winnerPlayerId = session?.winner_player_id ?? null
  // When the server declined to pick a winner (no books completed by anyone, or a tie
  // at the top), don't fall back to standings[0] — "wins!" on 0 books would read as
  // an arbitrary handout. Passing null lets FinishedWinnerHero render its neutral
  // "Game over!" headline instead.
  const displayWinner = winnerPlayerId ? (winnerName ?? standings.find((row) => row.rank === 1)?.name ?? null) : null

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-5">
        <ShareResultsCaptureHeader game={game} />
        <FinishedWinnerHero
          winnerName={displayWinner}
          game={game}
          subtitle={
            !winnerPlayerId
              ? 'No books completed — no winner'
              : standings.length > 1
                ? 'Most books wins · four of a rank = one book'
                : undefined
          }
        />
        {standings.length > 0 && (
          <div className="space-y-2">
            {standings.map((row) => {
              // No winner (0 books game / server declined) → no row gets the winner
              // treatment. Falling back to rank-1 would visually crown whoever sorts
              // first in the standings, which is arbitrary and reads as unearned.
              const isWinner = winnerPlayerId != null && row.playerId === winnerPlayerId
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
                      {row.books === 1 ? '1 book' : `${row.books} books`}
                      {row.cardCount > 0 ? ` · ${row.cardCount} card${row.cardCount === 1 ? '' : 's'} in hand` : ''}
                    </p>
                  </div>
                  <p
                    className={`ml-auto shrink-0 text-sm font-black tabular-nums ${
                      isWinner ? 'gradient-title' : 'text-muted'
                    }`}
                  >
                    {row.books}
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
            gofishStandings={standings}
            gofishWinnerName={displayWinner ?? undefined}
            primary
          />
        }
      />
    </div>
  )
}
