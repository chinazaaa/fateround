'use client'

import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { describeItRoleLeaderboards } from '@/lib/describe-it'
import type { DescribeItGuess, Player } from '@/types'

// Auto-posts the Describe It role achievements — Best Describer and Best Guesser —
// for the current player, when they earned one. Shared by the player and host
// (host-plays) end screens so both compute the winners identically.
//
// Individual mode only: team mode has no per-player scoring to rank. Contested-win
// gates mirror the other games — more than one player and a real positive score.
// The two awards are independent leaderboard entries, so the same player can hold
// both (best describer AND best guesser) in one match.
export function DescribeItAchievementPosts({
  guesses,
  roster,
  players,
  isIndividual,
  myPlayerId,
  gameCode,
  roundKey,
}: {
  guesses: DescribeItGuess[]
  roster: string[]
  players: Player[]
  isIndividual: boolean
  myPlayerId: string
  gameCode: string
  roundKey?: string | null
}) {
  if (!isIndividual) return null
  if (players.filter((p) => p.spectator !== true).length <= 1) return null

  const { guessers, describers } = describeItRoleLeaderboards(guesses, roster, players)
  const bestGuesser = guessers[0] ?? null
  const bestDescriber = describers[0] ?? null

  return (
    <>
      {bestDescriber && bestDescriber.score > 0 && bestDescriber.id === myPlayerId && (
        <PostWinToCommunity
          gameType="describe_it_describer"
          gameCode={gameCode}
          winnerName={bestDescriber.name}
          roundKey={roundKey}
        />
      )}
      {bestGuesser && bestGuesser.score > 0 && bestGuesser.id === myPlayerId && (
        <PostWinToCommunity
          gameType="describe_it_guesser"
          gameCode={gameCode}
          winnerName={bestGuesser.name}
          roundKey={roundKey}
        />
      )}
    </>
  )
}
