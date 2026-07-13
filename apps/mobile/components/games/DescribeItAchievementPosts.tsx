import { useMemo } from 'react'
import type { DescribeItGuess, Player } from '@fateround/shared'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'

type DescribeItPlayerScore = { id: string; name: string; score: number }

// Local mirror of the web `describerForIndividualTurn` — the describer for an
// individual-mode turn rotates through the fixed roster snapshot.
function describerForIndividualTurn(roster: string[], turnIndex: number): string | null {
  if (roster.length === 0) return null
  return roster[turnIndex % roster.length] ?? null
}

// Local mirror of the web `describeItRoleLeaderboards` (src/lib/describe-it.ts).
// Credits guesser points to whoever landed the correct guess, and describer
// points to whoever was describing on that turn. Ranks both independently.
function describeItRoleLeaderboards(
  guesses: Array<Pick<DescribeItGuess, 'player_id' | 'turn_index' | 'points' | 'created_at'>>,
  roster: string[],
  players: Array<{ id: string; name: string; spectator?: boolean | null }>
): { guessers: DescribeItPlayerScore[]; describers: DescribeItPlayerScore[] } {
  const active = players.filter((p) => p.spectator !== true)
  const nameById = new Map(active.map((p) => [p.id, p.name]))
  const guesserPoints = new Map<string, number>()
  const describerPoints = new Map<string, number>()
  // Latest scoring-guess time per role — earlier finisher wins a points tie (speed before
  // name). Mirrors web src/lib/describe-it.ts describeItRoleLeaderboards.
  const guesserLast = new Map<string, number>()
  const describerLast = new Map<string, number>()

  for (const g of guesses) {
    const points = g.points ?? 0
    if (points <= 0) continue
    const when = g.created_at ? new Date(g.created_at).getTime() : null
    if (nameById.has(g.player_id)) {
      guesserPoints.set(g.player_id, (guesserPoints.get(g.player_id) ?? 0) + points)
      if (when != null && when > (guesserLast.get(g.player_id) ?? -Infinity)) guesserLast.set(g.player_id, when)
    }
    const describerId = describerForIndividualTurn(roster, g.turn_index)
    if (describerId && nameById.has(describerId)) {
      describerPoints.set(describerId, (describerPoints.get(describerId) ?? 0) + points)
      if (when != null && when > (describerLast.get(describerId) ?? -Infinity)) describerLast.set(describerId, when)
    }
  }

  const rank = (totals: Map<string, number>, last: Map<string, number>): DescribeItPlayerScore[] =>
    active
      .map((p) => ({ id: p.id, name: p.name, score: totals.get(p.id) ?? 0 }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          (last.get(a.id) ?? Infinity) - (last.get(b.id) ?? Infinity) ||
          a.name.localeCompare(b.name)
      )

  return { guessers: rank(guesserPoints, guesserLast), describers: rank(describerPoints, describerLast) }
}

/**
 * Auto-posts the Describe It role achievements — Best Describer and Best Guesser —
 * for the local player, when they earned one. Individual mode only (team mode has
 * no per-player scoring). The two awards are independent, so the same player can
 * hold both in one match. Mirrors web DescribeItAchievementPosts.
 */
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
  const { guessers, describers } = useMemo(
    () => describeItRoleLeaderboards(guesses, roster, players),
    [guesses, roster, players]
  )

  if (!isIndividual) return null
  if (players.filter((p) => p.spectator !== true).length <= 1) return null

  const bestGuesser = guessers[0] ?? null
  const bestDescriber = describers[0] ?? null

  return (
    <>
      {bestDescriber && bestDescriber.score > 0 && bestDescriber.id === myPlayerId ? (
        <PostWinToCommunity
          gameType="describe_it_describer"
          gameCode={gameCode}
          winnerName={bestDescriber.name}
          roundKey={roundKey}
        />
      ) : null}
      {bestGuesser && bestGuesser.score > 0 && bestGuesser.id === myPlayerId ? (
        <PostWinToCommunity
          gameType="describe_it_guesser"
          gameCode={gameCode}
          winnerName={bestGuesser.name}
          roundKey={roundKey}
        />
      ) : null}
    </>
  )
}
