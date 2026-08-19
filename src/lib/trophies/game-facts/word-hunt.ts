import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Word Hunt per-game facts, derived at finish from `word_hunt_submissions`.
 *
 * Each found word is persisted with word text, path, points_awarded, and submitted_at.
 */

type SubmissionRow = {
  player_id: string
  word: string
  points_awarded: number
  submitted_at: string
}

export async function wordHuntFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const [{ data: subsData }, { data: roundData }] = await Promise.all([
    supabase
      .from('word_hunt_submissions')
      .select('player_id, word, points_awarded, submitted_at')
      .eq('game_id', gameId),
    supabase
      .from('rounds')
      .select('started_at')
      .eq('game_id', gameId)
      .order('round_number', { ascending: true })
      .limit(1),
  ])

  const subs = (subsData ?? []) as SubmissionRow[]
  if (!subs.length) return out

  const roundStart = roundData?.[0]?.started_at ? new Date(roundData[0].started_at).getTime() : null

  // Group by player
  const byPlayer = new Map<string, SubmissionRow[]>()
  for (const s of subs) {
    const list = byPlayer.get(s.player_id) ?? []
    list.push(s)
    byPlayer.set(s.player_id, list)
  }

  const seats = ctx.seated.length

  for (const [playerId, rows] of byPlayer) {
    const facts: Record<string, number> = {}
    const wordCount = rows.length
    const totalPoints = rows.reduce((sum, r) => sum + r.points_awarded, 0)

    // Lifetime tallies
    if (wordCount > 0) facts.word_hunt_words_found = wordCount

    // Per-game flags
    if (wordCount >= 10) facts.word_hunt_ten_words_games = 1
    if (wordCount >= 20) facts.word_hunt_twenty_words_games = 1
    if (wordCount >= 30) facts.word_hunt_thirty_words_games = 1
    if (totalPoints >= 1000) facts.word_hunt_thousand_games = 1
    if (totalPoints >= 5000) facts.word_hunt_five_thousand_games = 1

    // Word length achievements
    const maxLen = Math.max(0, ...rows.map((r) => r.word.length))
    if (rows.some((r) => r.word.length >= 4)) facts.word_hunt_four_letter_finds = 1
    if (rows.some((r) => r.word.length >= 5)) facts.word_hunt_five_letter_finds = 1
    if (rows.some((r) => r.word.length >= 6)) facts.word_hunt_six_letter_finds = 1
    if (maxLen >= 7) facts.word_hunt_seven_letter_finds = 1

    // Fast start: 3+ words in first 15 seconds
    if (roundStart) {
      const early = rows.filter((r) => new Date(r.submitted_at).getTime() - roundStart <= 15_000)
      if (early.length >= 3) facts.word_hunt_fast_start_games = 1
    }

    // Big room
    if (seats >= 10) facts.word_hunt_big_room_games = 1

    if (Object.keys(facts).length) out.set(playerId, facts)
  }

  return out
}
