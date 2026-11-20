import type { SupabaseClient } from '@supabase/supabase-js'
import type { GameType } from '@/types'
import { buildGameFacts, hasGameFacts } from './game-facts'
import { resolveFinishers, resolveWinners } from './outcome'

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
export async function recordRoundFacts(
  supabase: SupabaseClient,
  gameId: string,
  finishedAt: string,
  // The post-finish bookkeeping lease token (`games.finish_bookkeeping.owner`). With it the write goes through
  // `upsert_round_facts_fenced`, which rejects it ('lost_lease') once another runner owns the lease, so a step that
  // stalled past its lease cannot overwrite the takeover's row with facts derived from a replayed round.
  leaseOwner?: string
): Promise<'done' | 'lost_lease'> {
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('game_type, timer_seconds, question_source, theme')
    .eq('id', gameId)
    .maybeSingle()
  // Thrown (not returned) so a tracked finish can tell a failed snapshot from "nothing to snapshot" and
  // retry it; every untracked caller already catches and logs, so their behaviour is unchanged.
  if (gameError) throw new Error(`round_facts: game read failed: ${gameError.message}`)
  if (!game) return 'done'

  const gameType = game.game_type as GameType
  // Nothing to snapshot for a game with no builder — and no reason to load its players.
  if (!hasGameFacts(gameType)) return 'done'

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, spectator')
    .eq('game_id', gameId)
  if (playersError) throw new Error(`round_facts: players read failed: ${playersError.message}`)
  // A player who went out in a shed-your-hand game is flagged spectator but genuinely finished —
  // rescue them via finish_order so the winner's facts are snapshotted. See resolveFinishers.
  const finishers = new Set(await resolveFinishers(supabase, gameId, gameType))
  const seated = (players ?? []).filter((p) => !p.spectator || finishers.has(p.id as string)).map((p) => p.id as string)
  if (!seated.length) return 'done'

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
  if (!facts.size) return 'done'

  const rows = [...facts.entries()]
    // A player who left mid-game may still appear in the round's rows; only seated players have
    // a `players` row to reference, and the FK would reject anyone else.
    .filter(([playerId, values]) => seated.includes(playerId) && Object.keys(values).length > 0)
    .map(([playerId, values]) => ({ game_id: gameId, player_id: playerId, finished_at: finishedAt, facts: values }))

  if (!rows.length) return 'done'
  if (leaseOwner) {
    const { data, error } = await supabase.rpc('upsert_round_facts_fenced', {
      p_game_id: gameId,
      p_owner: leaseOwner,
      p_finished_at: finishedAt,
      p_rows: rows.map(({ player_id, facts: values }) => ({ player_id, facts: values })),
    })
    if (error) throw new Error(`round_facts: fenced upsert failed: ${error.message}`)
    return data === 'not_owner' ? 'lost_lease' : 'done'
  }
  const { error: upsertError } = await supabase
    .from('round_facts')
    .upsert(rows, { onConflict: 'game_id,player_id,finished_at' })
  if (upsertError) throw new Error(`round_facts: upsert failed: ${upsertError.message}`)
  return 'done'
}
