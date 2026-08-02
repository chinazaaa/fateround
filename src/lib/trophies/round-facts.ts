import type { SupabaseClient } from '@supabase/supabase-js'
import type { GameType } from '@/types'
import { buildGameFacts, hasGameFacts } from './game-facts'
import { resolveWinners } from './outcome'

/**
 * Snapshot one finished round's trophy facts, at finish.
 *
 * WHY THIS RUNS HERE AND NOT AT ATTRIBUTION. Facts used to be derived when the client posted
 * attribution, after the finished screen mounted. But "play again" clears the game's session
 * tables and Chess's rematch blanks `pgn`, so a host who replayed quickly destroyed the evidence
 * before it was ever read — there is a finished chess game in production with an empty PGN.
 * Deriving at finish means attribution can arrive whenever it likes, or never.
 *
 * BEST-EFFORT, ALWAYS. A game finishing is the important thing. Every failure here is swallowed:
 * the fallback is that attribution derives facts live, exactly as it did before, so the worst
 * case is the old behaviour rather than a broken finish.
 *
 * Idempotent: keyed on (game_id, player_id, finished_at) and upserted, so a retried finish
 * rewrites the same row rather than duplicating or failing.
 */
export async function recordRoundFacts(supabase: SupabaseClient, gameId: string, finishedAt: string): Promise<void> {
  const { data: game } = await supabase
    .from('games')
    .select('game_type, timer_seconds, question_source, theme')
    .eq('id', gameId)
    .maybeSingle()
  if (!game) return

  const gameType = game.game_type as GameType
  // Nothing to snapshot for a game with no builder — and no reason to load its players.
  if (!hasGameFacts(gameType)) return

  const { data: players } = await supabase.from('players').select('id, spectator').eq('game_id', gameId)
  const seated = (players ?? []).filter((p) => !p.spectator).map((p) => p.id as string)
  if (!seated.length) return

  // `null` from resolveWinners means "cannot determine", which is NOT a draw. Builders are told
  // that an empty `winners` never implies anyone lost, so both collapse to [] safely here.
  const winners = (await resolveWinners(supabase, gameId, gameType)) ?? []

  const facts = await buildGameFacts(supabase, gameType, gameId, {
    timerSeconds: (game.timer_seconds as number) ?? null,
    questionSource: (game.question_source as string) ?? null,
    theme: (game.theme as string) ?? null,
    seated,
    winners,
  })
  if (!facts.size) return

  const rows = [...facts.entries()]
    // A player who left mid-game may still appear in the round's rows; only seated players have
    // a `players` row to reference, and the FK would reject anyone else.
    .filter(([playerId, values]) => seated.includes(playerId) && Object.keys(values).length > 0)
    .map(([playerId, values]) => ({ game_id: gameId, player_id: playerId, finished_at: finishedAt, facts: values }))

  if (!rows.length) return
  await supabase.from('round_facts').upsert(rows, { onConflict: 'game_id,player_id,finished_at' })
}
