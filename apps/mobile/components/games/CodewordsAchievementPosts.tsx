import type { CodewordsGuess, CodewordsPlayerRole, CodewordsTeam, Player } from '@fateround/shared'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import {
  pickBestCodewordsSpymaster,
  tallyCodewordsOperativeStats,
  tallyCodewordsSpymasterStats,
} from '@/components/games/codewords-stats'

/**
 * Auto-posts the Codewords role achievements — Best Operative and Best Spymaster —
 * for the local player when they earned one. Mirrors web CodewordsAchievementPosts:
 * the round must have a winning team, more than one person must have played, and the
 * awardee needs a real positive contribution. Each award is its own leaderboard
 * entry, so a spymaster and an operative can both post.
 */
export function CodewordsAchievementPosts({
  guesses,
  roles,
  players,
  winner,
  myPlayerId,
  gameCode,
  roundKey,
}: {
  guesses: CodewordsGuess[]
  roles: CodewordsPlayerRole[]
  players: Player[]
  winner: CodewordsTeam | null
  myPlayerId: string
  gameCode: string
  roundKey?: string | null
}) {
  if (!winner) return null
  if (players.filter((p) => p.spectator !== true).length <= 1) return null

  const operativeStats = tallyCodewordsOperativeStats(guesses, roles, players)
  const spymasterStats = tallyCodewordsSpymasterStats(guesses, roles, players)
  const bestOperative = operativeStats[0] ?? null
  const bestSpymaster = pickBestCodewordsSpymaster(spymasterStats, winner)

  return (
    <>
      {bestOperative && bestOperative.correct > 0 && bestOperative.playerId === myPlayerId ? (
        <PostWinToCommunity
          gameType="codewords_operative"
          gameCode={gameCode}
          winnerName={bestOperative.name}
          roundKey={roundKey}
        />
      ) : null}
      {bestSpymaster && bestSpymaster.wordsFound > 0 && bestSpymaster.playerId === myPlayerId ? (
        <PostWinToCommunity
          gameType="codewords_spymaster"
          gameCode={gameCode}
          winnerName={bestSpymaster.name}
          roundKey={roundKey}
        />
      ) : null}
    </>
  )
}
