import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'
import { parseWordleRoomSolutionWords, wordleRoomMaxAttemptsForWord } from '@/lib/wordle-room'

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
  submitted_at: string
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

  const [{ data: progressData }, { data: guessesData }, { data: solutionRow }] = await Promise.all([
    supabase
      .from('wordle_room_progress')
      .select('player_id, words_solved, finished, hints_used')
      .eq('game_id', gameId)
      .eq('round_id', roundId),
    supabase
      .from('wordle_room_guesses')
      .select('player_id, word_index, is_correct, submitted_at')
      .eq('game_id', gameId)
      .eq('round_id', roundId)
      .order('submitted_at', { ascending: true }),
    supabase.from('wordle_room_solutions').select('words').eq('round_id', roundId).maybeSingle(),
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
  // Per-word max attempts (scales with word length in the engine). Falls back to 6 when the
  // solutions row is missing so the last-gasp trophy still fires sensibly on legacy rounds.
  const { words: solutionWords } = parseWordleRoomSolutionWords(solutionRow?.words)
  const maxAttemptsAt = (idx: number) => {
    const w = solutionWords[idx]
    return w ? wordleRoomMaxAttemptsForWord(w) : 6
  }

  // Aggregate per-word max-guess so we can flag "solved a hard-fought word in the final guess"
  // etc. Also count total guesses per player for pace flags.
  const guessesByPlayerWord = new Map<string, number>()
  const wonWordsByPlayer = new Map<string, Set<number>>()
  for (const g of guesses) {
    const key = `${g.player_id}|${g.word_index}`
    guessesByPlayerWord.set(key, (guessesByPlayerWord.get(key) ?? 0) + 1)
    if (g.is_correct) {
      const set = wonWordsByPlayer.get(g.player_id) ?? new Set<number>()
      set.add(g.word_index)
      wonWordsByPlayer.set(g.player_id, set)
    }
  }

  for (const row of progress) {
    const facts: Record<string, number> = {}
    const hintsUsed = Array.isArray(row.hints_used) ? row.hints_used.length : 0
    const firstGuess = firstGuessSolvesByPlayer.get(row.player_id) ?? 0
    const wonWords = wonWordsByPlayer.get(row.player_id) ?? new Set<number>()

    // Lifetime tallies (summable across games).
    if (row.words_solved > 0) facts.wordle_room_words_solved_total = row.words_solved
    if (firstGuess > 0) facts.wordle_room_first_guess_solves = firstGuess

    // Per-game flags — 0/1 per game.
    if (row.finished) facts.wordle_room_finished_games = 1
    if (row.finished && hintsUsed === 0) facts.wordle_room_no_hint_finished_games = 1
    if (row.finished && bigRoom) facts.wordle_room_big_room_wins = 1
    if (isNaija) facts.wordle_room_naija_games = 1
    if (row.finished && hintsUsed === 0 && wordCount >= 20) facts.wordle_room_marathon_wins = 1

    // Perfect race: finished, no hints, ALL words in the sequence solved, and every solve
    // was a first-guess. Requiring words_solved === wordCount closes the loophole where a
    // player who solved 1 of 5 words on the first try (and lost the other 4) would have
    // qualified — a real "perfect race" means the entire sequence.
    if (row.finished && hintsUsed === 0 && wordCount > 0 && row.words_solved === wordCount && firstGuess >= wordCount) {
      facts.wordle_room_perfect_race_wins = 1
    }

    // Two-guess wins: any word won on guess 2 (as an intermediate step between "Perfect solve"
    // and "Perfectionist"). Guess count for a solved word == guesses submitted for it.
    let twoGuessSolves = 0
    let lastGaspSolves = 0
    let anySecondHalfSolves = false
    for (const w of wonWords) {
      const used = guessesByPlayerWord.get(`${row.player_id}|${w}`) ?? 0
      if (used === 2) twoGuessSolves++
      // Last-gasp: solved on the very last allowed attempt for THAT word. Attempts scale
      // with word length in the engine (length + 1), so read the actual max from the
      // solutions row instead of a fixed 6 — a 4-letter Naija word only gets 5 attempts.
      if (used >= maxAttemptsAt(w)) lastGaspSolves++
      if (wordCount >= 10 && w >= Math.ceil(wordCount / 2)) anySecondHalfSolves = true
    }
    if (twoGuessSolves > 0) facts.wordle_room_two_guess_solves = twoGuessSolves
    if (lastGaspSolves > 0) facts.wordle_room_last_gasp_solves = lastGaspSolves

    // Endurance: finished a race of 10 or more words.
    if (row.finished && wordCount >= 10) facts.wordle_room_ten_word_finishes = 1
    // Fifteen-word race finish.
    if (row.finished && wordCount >= 15) facts.wordle_room_fifteen_word_finishes = 1

    // Second half strong: won at least one word in the back half of a >=10-word race. A cheap
    // "kept going" signal — didn't tap out early.
    if (row.finished && anySecondHalfSolves) facts.wordle_room_second_half_finishes = 1

    // Volume-per-game flags: solved N in one race.
    if (row.words_solved >= 5) facts.wordle_room_five_solved_games = 1
    if (row.words_solved >= 10) facts.wordle_room_ten_solved_games = 1
    if (row.words_solved >= 15) facts.wordle_room_fifteen_solved_games = 1
    if (row.words_solved >= 20) facts.wordle_room_twenty_solved_games = 1

    // Hint discipline: won without hints even in a big race (10+ players).
    if (row.finished && hintsUsed === 0 && bigRoom) facts.wordle_room_clean_big_wins = 1

    // Race winner — top of the standings for this room. Winners resolved by the room-points
    // ranker (points-primary), so this is only 1 for the player id(s) in ctx.winners.
    if (ctx.winners.includes(row.player_id) && row.finished) facts.wordle_room_race_wins = 1

    if (Object.keys(facts).length) out.set(row.player_id, facts)
  }

  return out
}
