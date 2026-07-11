import type { Player, Round, Vote } from '@fateround/shared'
import type { FinishedLeaderboardRow } from '@/components/game/GameChrome'

/**
 * Who Said This "best guessers" scoring — ported from web `src/lib/who-said-this.ts`
 * (`tallyWstPlayerScores`). One point per correct guess of the quote's author
 * (or the correct character in the anime variant).
 */

export type WstScore = { playerId: string; name: string; correctGuesses: number }

function correctParticipantId(round: Round, players: Player[]): string | null {
  if (round.quote_author_participant_id) return round.quote_author_participant_id
  if (!round.submitter_player_id) return null
  return players.find((p) => p.id === round.submitter_player_id)?.participant_id ?? null
}

export function tallyWstScores(rounds: Round[], votes: Vote[], players: Player[]): WstScore[] {
  const active = players.filter((p) => p.spectator !== true)
  const scores = new Map<string, number>(active.map((p) => [p.id, 0]))

  for (const round of rounds) {
    const roundVotes = votes.filter((v) => v.round_id === round.id)
    const anime = round.anime_metadata
    if (anime) {
      for (const v of roundVotes) {
        if (v.anime_choice === anime.correct_character) scores.set(v.player_id, (scores.get(v.player_id) ?? 0) + 1)
      }
    } else {
      const correctId = correctParticipantId(round, players)
      if (!correctId) continue
      for (const v of roundVotes) {
        if (v.target_participant_id === correctId) scores.set(v.player_id, (scores.get(v.player_id) ?? 0) + 1)
      }
    }
  }

  return active
    .map((p) => ({ playerId: p.id, name: p.name, correctGuesses: scores.get(p.id) ?? 0 }))
    .sort((a, b) => b.correctGuesses - a.correctGuesses || a.name.localeCompare(b.name))
}

export function wstLeaderboard(scores: WstScore[], myPlayerId?: string | null): FinishedLeaderboardRow[] {
  return scores.map((s, index) => ({
    name: s.name,
    score: s.correctGuesses,
    scoreSuffix: 'correct',
    you: !!myPlayerId && s.playerId === myPlayerId,
    highlight: index === 0 && s.correctGuesses > 0,
  }))
}
