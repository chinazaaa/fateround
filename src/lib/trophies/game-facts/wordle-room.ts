import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Multiplayer Wordle per-game facts, derived at finish from `wordle_room_progress`
 * (per-player totals + hints purchased) and `wordle_room_guesses` (individual solves —
 * needed to count first-guess wins).
 *
 * Emits 0/1 per-game flags plus lifetime tallies. Every counter is scoped to
 * `wordle_room` (both variants of the game_type live under the same identifier).
 */

type ProgressRow = {
  player_id: string
  words_solved: number
  finished: boolean
  hints_used: unknown
}

type GuessRow = {
  player_id: string
  word_index: number
  is_correct: boolean
}

type WordleRoomMeta = { category?: string; word_count?: number }

export async function wordleRoomFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const { data: roundData } = await supabase
    .from('rounds')
    .select('id, wordle_room_metadata')
    .eq('game_id', gameId)
    .eq('round_number', 1)
    .maybeSingle()
  const roundId = roundData?.id as string | undefined
  if (!roundId) return out

  const [{ data: progressData }, { data: guessesData }] = await Promise.all([
    supabase
      .from('wordle_room_progress')
      .select('player_id, words_solved, finished, hints_used')
      .eq('game_id', gameId)
      .eq('round_id', roundId),
    supabase
      .from('wordle_room_guesses')
      .select('player_id, word_index, is_correct')
      .eq('game_id', gameId)
      .eq('round_id', roundId),
  ])

  const progress = (progressData ?? []) as ProgressRow[]
  if (!progress.length) return out
  const guesses = (guessesData ?? []) as GuessRow[]

  // First-guess solves per player. A player's first guess on a word is where their guess row
  // count for that word_index is 1 and it was correct — count those to award "perfect solve"
  // trophies. Group by (player, word) and inspect the ordered guesses.
  const byPlayerWord = new Map<string, GuessRow[]>()
  for (const g of guesses) {
    const key = `${g.player_id}|${g.word_index}`
    const list = byPlayerWord.get(key) ?? []
    list.push(g)
    byPlayerWord.set(key, list)
  }
  const firstGuessSolvesByPlayer = new Map<string, number>()
  for (const [key, list] of byPlayerWord) {
    const [pid] = key.split('|') as [string]
    // Preserving insert order == submitted order (query is unordered but stable-enough per word
    // since we don't need cross-word ordering — only whether the first row for this word solved).
    if (list.length >= 1 && list[0]!.is_correct) {
      firstGuessSolvesByPlayer.set(pid, (firstGuessSolvesByPlayer.get(pid) ?? 0) + 1)
    }
  }

  const meta = (roundData?.wordle_room_metadata ?? {}) as WordleRoomMeta
  const isNaija = meta.category === 'naija_slang'
  const wordCount = typeof meta.word_count === 'number' ? meta.word_count : 0
  const bigRoom = ctx.seated.length >= 10

  for (const row of progress) {
    const facts: Record<string, number> = {}
    const hintsUsed = Array.isArray(row.hints_used) ? row.hints_used.length : 0
    const firstGuess = firstGuessSolvesByPlayer.get(row.player_id) ?? 0

    // Lifetime tallies (summable across games).
    if (row.words_solved > 0) facts.wordle_room_words_solved_total = row.words_solved
    if (firstGuess > 0) facts.wordle_room_first_guess_solves = firstGuess

    // Per-game flags.
    if (row.finished) facts.wordle_room_finished_games = 1
    if (row.finished && hintsUsed === 0) facts.wordle_room_no_hint_finished_games = 1
    if (row.finished && bigRoom) facts.wordle_room_big_room_wins = 1
    if (isNaija) facts.wordle_room_naija_games = 1
    // Full 20-word race finished without any hints — the "marathon" gold trigger.
    if (row.finished && hintsUsed === 0 && wordCount >= 20) facts.wordle_room_marathon_wins = 1

    if (Object.keys(facts).length) out.set(row.player_id, facts)
  }

  return out
}
