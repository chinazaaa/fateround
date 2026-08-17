'use client'

import { useRef, type ReactNode } from 'react'
import { MEDALS } from '@/lib/medals'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import type { Game, Player } from '@/types'
import type { WordleRoomStandingRow } from '@/lib/wordle-room'

export function WordleRoomResults({
  game,
  players,
  standings,
  highlightPlayerId,
  playAgainButton,
  returnToLobbyButton,
  lobbyNote,
  showCreateNewGame = true,
}: {
  game: Game
  players: Player[]
  standings: WordleRoomStandingRow[]
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
  returnToLobbyButton?: ReactNode
  lobbyNote?: ReactNode
  showCreateNewGame?: boolean
}) {
  const captureRef = useRef<HTMLDivElement>(null)
  // A player only "wins" when they actually solved at least one word — a room where
  // nobody solved anything is a "Race over!" draw (matches WordleRoomPlayerView).
  const winner = standings.find((row) => row.words_solved > 0) ?? null

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-5">
        <ShareResultsCaptureHeader game={game} />
        <FinishedWinnerHero
          winnerName={winner?.name}
          game={game}
          headline={winner ? undefined : 'Race over!'}
          subtitle={winner ? `${winner.words_solved} word${winner.words_solved === 1 ? '' : 's'} solved` : undefined}
        />
        <div className="space-y-2 pt-2">
          {standings.map((row, i) => {
            const rank = i + 1
            const isWinner = rank === 1
            const isMe = row.player_id === highlightPlayerId
            return (
              <div
                key={row.player_id}
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
                  {MEDALS[rank - 1] ?? rank}
                </span>
                <div className="min-w-0">
                  <p className={`font-bold truncate ${isWinner ? 'text-[17px]' : 'text-[15px]'}`}>
                    {row.name}
                    {isMe ? <span className="label-teal font-semibold"> (you)</span> : null}
                  </p>
                  <p className="text-xs text-muted">
                    {row.words_solved} word{row.words_solved === 1 ? '' : 's'} · {row.total_guesses} guess
                    {row.total_guesses === 1 ? '' : 'es'}
                  </p>
                </div>
                <p
                  className={`ml-auto shrink-0 text-sm font-black tabular-nums ${
                    isWinner ? 'gradient-title' : 'text-muted'
                  }`}
                >
                  {row.finished ? 'Done' : '—'}
                </p>
              </div>
            )
          })}
        </div>
      </div>
      <HostGameFinishedActions
        variant="winner"
        gameCode={game.id}
        playAgainButton={playAgainButton}
        returnToLobbyButton={returnToLobbyButton}
        lobbyNote={lobbyNote}
        showCreateNewGame={showCreateNewGame}
        shareButton={
          <ShareResults
            captureRef={captureRef}
            game={game}
            participants={[]}
            votes={[]}
            rounds={[]}
            players={players}
            wordleRoomStandings={standings.map((row) => ({
              name: row.name,
              wordsSolved: row.words_solved,
              guesses: row.total_guesses,
            }))}
            wordleRoomWinnerName={winner?.name}
            primary
          />
        }
      />
    </div>
  )
}
