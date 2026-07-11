import type { AyoSession, AyoSide, Participant, Player, TriviaAnswer, Vote } from '@fateround/shared'
import type { LudoStanding } from '@fateround/shared/ludo'
import type { SnakeLadderStanding } from '@fateround/shared/snake-and-ladder'
import { formatMonopolyMoney } from '@fateround/shared/monopoly-board'
import type { FinishedLeaderboardRow } from '@/components/game/GameChrome'
import type { AyoVariant } from '@/lib/ayo-sow'
import type { MonopolyStanding } from '@/lib/monopoly-standings'

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function toLeaderboardRows(
  entries: Array<{ name: string; score: number | string }>,
  highlightFirst = true
): FinishedLeaderboardRow[] {
  return entries.map((row, index) => ({
    name: row.name,
    score: row.score,
    highlight: highlightFirst && index === 0,
  }))
}

export function tallyTriviaScores(answers: TriviaAnswer[], players: Player[]): FinishedLeaderboardRow[] {
  const totals = new Map<string, number>()
  for (const player of players) totals.set(player.id, 0)
  for (const answer of answers) {
    totals.set(answer.player_id, (totals.get(answer.player_id) ?? 0) + answer.points)
  }
  const rows = players
    .map((player) => ({ name: player.name, score: totals.get(player.id) ?? 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return toLeaderboardRows(rows)
}

export function scoreListLeaderboard(
  scores: Array<{ name: string; score: number | string }>
): FinishedLeaderboardRow[] {
  return toLeaderboardRows(
    [...scores].sort((a, b) => {
      const an = typeof a.score === 'number' ? a.score : Number(a.score)
      const bn = typeof b.score === 'number' ? b.score : Number(b.score)
      if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return bn - an
      return a.name.localeCompare(b.name)
    })
  )
}

export function triviaLeaderboard(
  scores: Array<{ id: string; name: string; score: number; correctCount: number }>,
  totalRounds: number | null | undefined,
  myPlayerId?: string | null
): FinishedLeaderboardRow[] {
  return scores.map((row, index) => ({
    name: row.name,
    score: row.score,
    scoreSuffix: 'pts',
    detail: totalRounds ? `${row.correctCount}/${totalRounds}` : undefined,
    you: !!myPlayerId && row.id === myPlayerId,
    highlight: index === 0,
  }))
}

/**
 * Card games (Whot / Crazy Eights): winner is out of cards, everyone else is
 * ranked by the penalty points left in hand (lower is better).
 */
export function cardHandLeaderboard(
  entries: Array<{ id: string; name: string; points: number; cardCount: number }>,
  winnerId: string | null | undefined,
  myPlayerId?: string | null
): FinishedLeaderboardRow[] {
  const ordered = [...entries].sort((a, b) => {
    if (a.id === winnerId) return -1
    if (b.id === winnerId) return 1
    return a.points - b.points || a.cardCount - b.cardCount
  })
  return ordered.map((entry, index) => {
    const isWinner = entry.id === winnerId
    return {
      name: entry.name,
      score: isWinner ? 'Winner' : entry.points,
      scoreSuffix: isWinner ? undefined : 'pts',
      detail: isWinner ? undefined : `${entry.cardCount} card${entry.cardCount === 1 ? '' : 's'}`,
      you: !!myPlayerId && entry.id === myPlayerId,
      highlight: index === 0,
    }
  })
}

export function winnerLeaderboard(
  winnerPlayerId: string | null | undefined,
  players: Player[],
  myPlayerId?: string | null
): FinishedLeaderboardRow[] {
  if (!winnerPlayerId) return []
  const winner = players.find((p) => p.id === winnerPlayerId)
  if (!winner) return []
  const others = players.filter((p) => p.id !== winnerPlayerId && !p.spectator)
  const rows: FinishedLeaderboardRow[] = [
    { name: winner.name, score: 'Winner', you: winner.id === myPlayerId, highlight: winner.id === myPlayerId },
  ]
  for (const p of others) {
    // No score for non-winners — the rank badge already orders them, so leaving
    // this blank avoids an ugly "—" next to their name.
    rows.push({ name: p.name, score: '', you: p.id === myPlayerId, highlight: p.id === myPlayerId })
  }
  return rows
}

/**
 * Ayo finish standings: each player's houses won (traditional) or captured
 * seeds (oware), winner highlighted, with an "Ọta champion" tag on a ≥3 streak.
 * Mirrors the web final-results block.
 */
export function ayoLeaderboard(
  session: AyoSession,
  players: Player[],
  variant: AyoVariant,
  myPlayerId?: string | null
): FinishedLeaderboardRow[] {
  const seedsOnSide = (side: AyoSide) => {
    const start = side === 'a' ? 0 : 6
    const size = side === 'a' ? session.a_row_size : session.b_row_size
    let sum = 0
    for (let i = start; i < start + size; i += 1) sum += session.pits[i] ?? 0
    return sum
  }
  const scoreFor = (side: AyoSide) =>
    variant === 'oware'
      ? (side === 'a' ? session.captured_a : session.captured_b) + seedsOnSide(side)
      : side === 'a'
        ? session.houses_a
        : session.houses_b

  const sides: { side: AyoSide; pid: string; streak: number }[] = [
    { side: 'a', pid: session.player_a_id, streak: session.a_win_streak },
    { side: 'b', pid: session.player_b_id, streak: session.b_win_streak },
  ]
  return sides
    .map(({ side, pid, streak }) => ({
      pid,
      streak,
      name: players.find((p) => p.id === pid)?.name ?? 'Player',
      score: scoreFor(side),
    }))
    .sort((a, b) => b.score - a.score)
    .map((row) => ({
      name: row.name,
      score: row.score,
      scoreSuffix: variant === 'oware' ? 'seeds' : 'houses',
      detail: row.streak >= 3 ? 'Ọta champion' : undefined,
      you: !!myPlayerId && row.pid === myPlayerId,
      highlight: row.pid === session.winner_player_id,
    }))
}

/** Ludo finish standings: pieces home out of 4, per color, winner first. */
export function ludoLeaderboard(
  standings: LudoStanding[],
  myPlayerId?: string | null
): FinishedLeaderboardRow[] {
  return standings.map((row) => ({
    name: row.name,
    score: `${row.finishedCount}/4`,
    scoreSuffix: 'home',
    detail: titleCase(row.color),
    you: !!myPlayerId && row.playerId === myPlayerId,
    highlight: row.rank === 1,
  }))
}

/** Snake & Ladder finish standings: board square reached, per color, winner first. */
export function snakeLadderLeaderboard(
  standings: SnakeLadderStanding[],
  myPlayerId?: string | null
): FinishedLeaderboardRow[] {
  return standings.map((row) => ({
    name: row.name,
    score: row.position >= 100 ? 'Home' : row.position === 0 ? 'Start' : `Sq ${row.position}`,
    detail: titleCase(row.color),
    you: !!myPlayerId && row.playerId === myPlayerId,
    highlight: row.rank === 1,
  }))
}

/** Monopoly finish standings: total net worth, with property count + cash detail. */
export function monopolyLeaderboard(
  standings: MonopolyStanding[],
  myPlayerId?: string | null
): FinishedLeaderboardRow[] {
  return standings.map((row) => ({
    name: row.name,
    score: formatMonopolyMoney(row.netWorth),
    detail: `${row.propertyCount} propert${row.propertyCount === 1 ? 'y' : 'ies'} · Cash ${formatMonopolyMoney(row.cash)}`,
    you: !!myPlayerId && row.playerId === myPlayerId,
    highlight: row.rank === 1,
  }))
}

/** Mahjong finish standings: each player's total score with this hand's delta. */
export function mahjongLeaderboard(
  players: Player[],
  scores: Record<string, number> | null | undefined,
  payments: { player_id: string; delta: number }[] | null | undefined,
  winnerPlayerIds: string[] | null | undefined,
  myPlayerId?: string | null
): FinishedLeaderboardRow[] {
  const winners = new Set(winnerPlayerIds ?? [])
  return players
    .map((player) => {
      const total = scores?.[player.id]
      const delta = payments?.find((pay) => pay.player_id === player.id)?.delta ?? null
      const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`
      const value =
        total != null
          ? `${total} pts${delta != null ? ` (${signed(delta)})` : ''}`
          : delta != null
            ? `${signed(delta)} pts`
            : winners.has(player.id)
              ? 'Winner'
              : 'Player'
      return { player, sortKey: total ?? Number.NEGATIVE_INFINITY, value, isWinner: winners.has(player.id) }
    })
    .sort((a, b) => b.sortKey - a.sortKey)
    .map((row) => ({
      name: row.player.name,
      score: row.value,
      you: !!myPlayerId && row.player.id === myPlayerId,
      highlight: row.isWinner,
    }))
}

/** Generic per-player points standings (highest first) with "(you)" + optional detail. */
export function pointsLeaderboard(
  entries: Array<{ id: string; name: string; points: number; detail?: string }>,
  myPlayerId?: string | null
): FinishedLeaderboardRow[] {
  return [...entries]
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
    .map((entry, index) => ({
      name: entry.name,
      score: entry.points,
      scoreSuffix: 'pts',
      detail: entry.detail,
      you: !!myPlayerId && entry.id === myPlayerId,
      highlight: index === 0,
    }))
}

export function mltVoteLeaderboard(votes: Vote[], participants: Participant[]): FinishedLeaderboardRow[] {
  const counts = new Map<string, number>()
  for (const p of participants) counts.set(p.id, 0)
  for (const vote of votes) {
    const targetId = vote.target_participant_id
    if (targetId) counts.set(targetId, (counts.get(targetId) ?? 0) + 1)
  }
  const rows = participants
    .map((p) => ({ name: p.name, score: counts.get(p.id) ?? 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return toLeaderboardRows(rows, rows[0]?.score !== 0)
}
