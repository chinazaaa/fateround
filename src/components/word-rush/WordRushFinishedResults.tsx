'use client'

import { useMemo, useRef, type ReactNode } from 'react'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { WordRushPlayerAnswerDetails, WordRushTeamMemberBreakdown } from '@/components/word-rush/WordRushAnswerDetails'
import {
  computeWordRushPlayerScores,
  computeWordRushTeamScores,
  clampWordRushMode,
  clampWordRushTeams,
  teamLabel,
} from '@/lib/word-rush'
import type { Game, Player, WordRushAnswer, WordRushPlayer, WordRushSession } from '@/types'

export function WordRushFinishedResults({
  game,
  session,
  players,
  teamRows,
  answers,
  highlightPlayerId,
  playAgainButton,
  returnToLobbyButton,
  lobbyNote,
}: {
  game: Game
  session: WordRushSession | null
  players: Player[]
  teamRows: WordRushPlayer[]
  answers: WordRushAnswer[]
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
  returnToLobbyButton?: ReactNode
  lobbyNote?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)
  const mode = clampWordRushMode(game.word_rush_mode ?? session?.mode)
  const numTeams = clampWordRushTeams(game.word_rush_num_teams ?? session?.num_teams)

  const playerLeaderboard = useMemo(() => computeWordRushPlayerScores(players, teamRows), [players, teamRows])
  const teamLeaderboard = useMemo(() => computeWordRushTeamScores(answers, numTeams), [answers, numTeams])

  if (mode === 'individual') {
    const myRow = highlightPlayerId ? playerLeaderboard.find((r) => r.id === highlightPlayerId) : undefined
    const topScore = playerLeaderboard[0]?.score ?? 0
    const iWon = Boolean(
      myRow && playerLeaderboard[0] && myRow.score === topScore && topScore > 0 && playerLeaderboard.length > 1
    )

    return (
      <div className="space-y-4">
        <div ref={captureRef} className="space-y-4">
          <ShareResultsCaptureHeader game={game} />
          <FinishedWinnerHero winnerName={playerLeaderboard[0]?.name} game={game} />
          <PaginatedLeaderboard
            title="Final leaderboard"
            rows={playerLeaderboard.map((row, i) => ({
              id: row.id,
              name: row.name,
              score: row.score,
              rank: i + 1,
              expandDetails: (
                <WordRushPlayerAnswerDetails answers={answers.filter((answer) => answer.player_id === row.id)} />
              ),
            }))}
            highlightId={highlightPlayerId ?? undefined}
            scoreLabel={(score) => `${score} ${score === 1 ? 'pt' : 'pts'}`}
            emphasizeLeader
          />
        </div>
        {iWon && myRow && (
          <PostWinToCommunity
            gameType="word_rush"
            gameCode={game.id}
            winnerName={myRow.name}
            roundKey={game.session_started_at ?? undefined}
          />
        )}
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
              primary
            />
          }
        />
      </div>
    )
  }

  const winnerTeam = teamLeaderboard[0]
  const myTeam = teamRows.find((r) => r.player_id === highlightPlayerId)?.team
  const topScore = winnerTeam?.score ?? 0
  const iWon = Boolean(myTeam && winnerTeam && myTeam === winnerTeam.team && topScore > 0)

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="space-y-4">
        <ShareResultsCaptureHeader game={game} />
        <FinishedWinnerHero winnerName={winnerTeam ? teamLabel(winnerTeam.team) : undefined} game={game} />
        <PaginatedLeaderboard
          title="Final standings"
          rows={teamLeaderboard.map((row, i) => ({
            id: String(row.team),
            name: teamLabel(row.team),
            score: row.score,
            rank: i + 1,
            expandDetails: (
              <WordRushTeamMemberBreakdown
                team={row.team}
                players={players}
                teamRows={teamRows}
                answers={answers}
              />
            ),
          }))}
          scoreLabel={(score) => `${score} words`}
          emphasizeLeader
        />
      </div>
      {iWon && (
        <PostWinToCommunity
          gameType="word_rush"
          gameCode={game.id}
          winnerName={teamLabel(winnerTeam!.team)}
          roundKey={game.session_started_at ?? undefined}
        />
      )}
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
            primary
          />
        }
      />
    </div>
  )
}
