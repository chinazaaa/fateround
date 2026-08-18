import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Two Truths and a Lie per-game facts, derived at finish from `ttl_statements` and `ttl_guesses`.
 *
 * Each player's 3 statements (2 truths, 1 lie) are persisted with the lie index. Each guess
 * records correctness and points. We derive guess accuracy, fooling ability, and streaks.
 *
 * Winnerless by design — no win-gated facts.
 */

type StatementRow = {
  player_id: string
  lie_index: number
}

type GuessRow = {
  round_id: string
  player_id: string
  is_correct: boolean
}

export async function twoTruthsFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const [{ data: statementsData }, { data: guessesData }] = await Promise.all([
    supabase.from('ttl_statements').select('player_id, lie_index').eq('game_id', gameId),
    supabase.from('ttl_guesses').select('round_id, player_id, is_correct').eq('game_id', gameId),
  ])

  const statements = (statementsData ?? []) as StatementRow[]
  const guesses = (guessesData ?? []) as GuessRow[]
  if (!statements.length && !guesses.length) return out

  const seats = ctx.seated.length

  // Build a map of round_id → subject player (the player whose statements are being guessed).
  // Each round corresponds to one subject's statements.
  // We need to join rounds to figure out who the subject is per round.
  // The round metadata contains the subject's player_id. Let's query it.
  const { data: roundsData } = await supabase.from('rounds').select('id, metadata').eq('game_id', gameId)

  const rounds = (roundsData ?? []) as { id: string; metadata: { subject_player_id?: string } | null }[]
  const subjectByRound = new Map<string, string>()
  for (const r of rounds) {
    const subjectId = r.metadata?.subject_player_id
    if (subjectId) subjectByRound.set(r.id, subjectId)
  }

  // Group guesses by round for fooling analysis
  const guessesByRound = new Map<string, GuessRow[]>()
  for (const g of guesses) {
    const list = guessesByRound.get(g.round_id) ?? []
    list.push(g)
    guessesByRound.set(g.round_id, list)
  }

  // Per-subject: how many times they fooled the group
  const fooledRoundsBySubject = new Map<string, number>()
  for (const [roundId, roundGuesses] of guessesByRound) {
    const subjectId = subjectByRound.get(roundId)
    if (!subjectId) continue
    // "Fooled" = at least one wrong guess
    const wrongGuesses = roundGuesses.filter((g) => !g.is_correct).length
    const allWrong = roundGuesses.length > 0 && roundGuesses.every((g) => !g.is_correct)

    if (wrongGuesses > 0) {
      fooledRoundsBySubject.set(subjectId, (fooledRoundsBySubject.get(subjectId) ?? 0) + 1)
    }
    // Master deceiver: NOBODY guessed correctly
    if (allWrong) {
      const existing = out.get(subjectId) ?? {}
      existing.ttl_master_deceiver_games = 1
      out.set(subjectId, existing)
    }
  }

  // Per-guesser analysis
  const guessesByPlayer = new Map<string, GuessRow[]>()
  for (const g of guesses) {
    const list = guessesByPlayer.get(g.player_id) ?? []
    list.push(g)
    guessesByPlayer.set(g.player_id, list)
  }

  // Total rounds in the game
  const totalRounds = rounds.length

  for (const [playerId, playerGuesses] of guessesByPlayer) {
    const facts = out.get(playerId) ?? {}
    const correctCount = playerGuesses.filter((g) => g.is_correct).length

    // Lifetime tally
    if (correctCount > 0) facts.ttl_correct_guesses = correctCount

    // Per-game flags
    if (correctCount >= 3) facts.ttl_three_correct_games = 1
    if (correctCount >= 5) facts.ttl_five_correct_games = 1

    // Sharp eye: first guess was correct
    if (playerGuesses.length > 0 && playerGuesses[0]!.is_correct) {
      facts.ttl_sharp_eye_games = 1
    }

    // Perfect read: guessed correctly every round they participated in
    if (playerGuesses.length > 0 && playerGuesses.every((g) => g.is_correct)) {
      facts.ttl_perfect_read_games = 1
    }

    if (Object.keys(facts).length) out.set(playerId, facts)
  }

  // Per-subject analysis
  for (const stmt of statements) {
    const facts = out.get(stmt.player_id) ?? {}
    facts.ttl_times_as_subject = 1

    const fooledCount = fooledRoundsBySubject.get(stmt.player_id) ?? 0
    if (fooledCount > 0) facts.ttl_fooled_someone_games = 1
    if (fooledCount >= 2) facts.ttl_unreadable_games = 1

    out.set(stmt.player_id, facts)
  }

  // Room-wide flags for everyone
  for (const id of ctx.seated) {
    const facts = out.get(id) ?? {}
    if (seats >= 6) facts.ttl_big_room_6_games = 1
    if (seats >= 10) facts.ttl_big_room_10_games = 1

    // Double threat: fooled group AND guessed every other round correctly
    const playerGuesses = guessesByPlayer.get(id) ?? []
    const fooledCount = fooledRoundsBySubject.get(id) ?? 0
    if (fooledCount > 0 && playerGuesses.length > 0 && playerGuesses.every((g) => g.is_correct)) {
      facts.ttl_double_threat_games = 1
    }

    if (Object.keys(facts).length) out.set(id, facts)
  }

  return out
}
