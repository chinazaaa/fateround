import type { Player, Round, Vote } from '@fateround/shared'
import type { FinishedLeaderboardRow } from '@/components/game/GameChrome'

/**
 * Who Said This scoring — ported from web `src/lib/who-said-this.ts` (`tallyWstPlayerScores`).
 * Ranks by speed-weighted points ("fastest correct wins"): each correct answer earns points
 * scaled by how quickly it came in (stored per-vote on `vote.points`), summed across rounds.
 * Ties break on correct count, then average response time, then name. Choice rounds (deck +
 * players-submit) carry per-vote `points`/`response_ms`; legacy name-list rounds fall back to a
 * flat point per correct guess.
 */

export type WstScore = {
  playerId: string
  name: string
  /** Speed-weighted points (fastest correct wins). */
  points: number
  correctGuesses: number
}

function correctParticipantId(round: Round, players: Player[]): string | null {
  if (round.quote_author_participant_id) return round.quote_author_participant_id
  if (!round.submitter_player_id) return null
  return players.find((p) => p.id === round.submitter_player_id)?.participant_id ?? null
}

export function tallyWstScores(rounds: Round[], votes: Vote[], players: Player[]): WstScore[] {
  const active = players.filter((p) => p.spectator !== true)
  const points = new Map<string, number>()
  const correct = new Map<string, number>()
  const totalMs = new Map<string, number>()
  const answered = new Map<string, number>()
  for (const p of active) {
    points.set(p.id, 0)
    correct.set(p.id, 0)
    totalMs.set(p.id, 0)
    answered.set(p.id, 0)
  }

  for (const round of rounds) {
    const roundVotes = votes.filter((v) => v.round_id === round.id)
    const anime = round.anime_metadata
    if (anime) {
      for (const v of roundVotes) {
        if (!points.has(v.player_id)) continue
        answered.set(v.player_id, (answered.get(v.player_id) ?? 0) + 1)
        if (typeof v.response_ms === 'number') {
          totalMs.set(v.player_id, (totalMs.get(v.player_id) ?? 0) + v.response_ms)
        }
        if (v.anime_choice === anime.correct_character) {
          correct.set(v.player_id, (correct.get(v.player_id) ?? 0) + 1)
          // Prefer stored speed points; fall back to a flat point for legacy rows without them.
          points.set(v.player_id, (points.get(v.player_id) ?? 0) + (v.points ?? 1))
        }
      }
    } else {
      const correctId = correctParticipantId(round, players)
      if (!correctId) continue
      for (const v of roundVotes) {
        if (!points.has(v.player_id)) continue
        if (v.target_participant_id === correctId) {
          correct.set(v.player_id, (correct.get(v.player_id) ?? 0) + 1)
          points.set(v.player_id, (points.get(v.player_id) ?? 0) + 1)
        }
      }
    }
  }

  return active
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      points: points.get(p.id) ?? 0,
      correctGuesses: correct.get(p.id) ?? 0,
      avgMs: (answered.get(p.id) ?? 0) > 0 ? (totalMs.get(p.id) ?? 0) / (answered.get(p.id) ?? 1) : Infinity,
    }))
    .sort(
      (a, b) =>
        b.points - a.points || b.correctGuesses - a.correctGuesses || a.avgMs - b.avgMs || a.name.localeCompare(b.name)
    )
    .map(({ playerId, name, points: pts, correctGuesses }) => ({ playerId, name, points: pts, correctGuesses }))
}

export function wstLeaderboard(scores: WstScore[], myPlayerId?: string | null): FinishedLeaderboardRow[] {
  // Speed-weighted points are shown as a bare number (not "N correct" / "N pts") to match web.
  return scores.map((s, index) => ({
    name: s.name,
    score: s.points,
    scoreSuffix: '',
    you: !!myPlayerId && s.playerId === myPlayerId,
    highlight: index === 0 && s.points > 0,
  }))
}
