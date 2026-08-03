'use client'

import { useRef, type ReactNode } from 'react'
import type { Game, Player, AyoSession } from '@/types'
import { ayoHouseScores, ayoResultDetail, ayoScores, isAyoChampion, parseAyoVariant } from '@/lib/ayo'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { FinishedWinnerHero } from '@/components/FinishedWinner'

export function AyoFinalResultsShareBlock({
  game,
  players,
  session,
  winnerName,
  highlightPlayerId,
  playAgainButton,
  returnToLobbyButton,
  lobbyNote,
}: {
  game: Game
  players: Player[]
  session: AyoSession | null
  winnerName?: string | null
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
  returnToLobbyButton?: ReactNode
  lobbyNote?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)

  const playerA = players.find((p) => p.id === session?.player_a_id)
  const playerB = players.find((p) => p.id === session?.player_b_id)
  const winnerPlayerId = session?.winner_player_id ?? null
  const displayWinner =
    winnerName ?? (winnerPlayerId ? players.find((p) => p.id === winnerPlayerId)?.name : null) ?? null
  const variant = parseAyoVariant(game.ayo_variant)
  const isDraw = session?.is_draw === true
  const endedEarly = game.status === 'finished' && !displayWinner && !isDraw
  const resultDetail = ayoResultDetail(session?.result_reason, variant)
  const scores = session ? ayoScores(session, variant) : { a: 0, b: 0 }
  const houses = session ? ayoHouseScores(session) : { a: 0, b: 0 }
  const standings = session
    ? [
        {
          player: playerA,
          score: variant === 'traditional' ? houses.a : scores.a,
          label: variant === 'traditional' ? 'houses' : 'seeds',
          winStreak: session.a_win_streak,
        },
        {
          player: playerB,
          score: variant === 'traditional' ? houses.b : scores.b,
          label: variant === 'traditional' ? 'houses' : 'seeds',
          winStreak: session.b_win_streak,
        },
      ].sort((a, b) => b.score - a.score)
    : []

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-5">
        <ShareResultsCaptureHeader game={game} />
        {isDraw ? (
          <FinishedWinnerHero
            game={game}
            emoji="🤝"
            headline="It's a draw!"
            subtitle={
              resultDetail ? (
                <span className="capitalize">{resultDetail}</span>
              ) : variant === 'traditional' ? (
                'Equal houses'
              ) : (
                '24 seeds each'
              )
            }
          />
        ) : endedEarly ? (
          <FinishedWinnerHero game={game} emoji="🏁" headline="Game ended early" />
        ) : (
          <FinishedWinnerHero
            winnerName={displayWinner ? `${displayWinner} · Ọta` : null}
            game={game}
            subtitle={
              resultDetail ? (
                <span className="capitalize">{resultDetail}</span>
              ) : (
                <span className="italic text-amber-300/90">Mo ki ota, mo ki ope o</span>
              )
            }
          />
        )}
        {session && (
          <div className="space-y-2 text-sm px-1">
            {standings.map(({ player, score, label, winStreak }) => (
              <div key={player?.id ?? `${score}-${label}`} className="flex items-center justify-between gap-3">
                <span className="font-bold truncate">
                  🌰 {player?.name ?? 'Player'}
                  {player?.id === highlightPlayerId ? ' (you)' : ''}
                  {isAyoChampion(winStreak) ? ' · Ọta champion' : ''}
                </span>
                <span className="tabular-nums font-black">
                  {score} {label}
                </span>
              </div>
            ))}
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
            ticTacToeWinnerName={displayWinner ?? undefined}
            ticTacToeIsDraw={isDraw}
            ticTacToeEndedEarly={endedEarly}
            primary
          />
        }
      />
    </div>
  )
}
