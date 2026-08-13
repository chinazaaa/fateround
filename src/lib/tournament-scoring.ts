import type { SupabaseClient } from '@supabase/supabase-js'
import { tallyTriviaPlayerScores } from './trivia'
import { splitKnockoutField, resolveGroupSize, rankKnockoutScores } from './tournament-bracket'
import type { TriviaAnswer, Player } from '@/types'
import type { EliminationConfig } from '@/types/elimination'

export function computePlacementPoints(
  placements: Record<string, number>,
  pointsArray: number[]
): Record<string, number> {
  const fallback = pointsArray[pointsArray.length - 1] ?? 0
  const result: Record<string, number> = {}
  for (const [playerId, rank] of Object.entries(placements)) {
    result[playerId] = pointsArray[rank - 1] ?? fallback
  }
  return result
}

async function computeTriviaPlacements(
  supabase: SupabaseClient,
  gameId: string,
  playerMap: Map<string, string>
): Promise<Record<string, number>> {
  const [answersRes, playersRes] = await Promise.all([
    supabase.from('trivia_answers').select('*').eq('game_id', gameId),
    supabase.from('players').select('*').eq('game_id', gameId),
  ])

  const answers = (answersRes.data ?? []) as TriviaAnswer[]
  const players = (playersRes.data ?? []) as Player[]

  const scores = tallyTriviaPlayerScores(answers, players)

  const placements: Record<string, number> = {}
  let rank = 1
  for (let i = 0; i < scores.length; i++) {
    if (i > 0 && scores[i].score < scores[i - 1].score) {
      rank = i + 1
    }
    const tournamentPlayerId = playerMap.get(scores[i].id)
    if (tournamentPlayerId) {
      placements[tournamentPlayerId] = rank
    }
  }

  return placements
}

async function computeNpatPlacements(
  supabase: SupabaseClient,
  gameId: string,
  playerMap: Map<string, string>
): Promise<Record<string, number>> {
  const { data: answers } = await supabase
    .from('npat_answers')
    .select('player_id, score_name, score_animal, score_place, score_thing, score_food')
    .eq('game_id', gameId)

  if (!answers?.length) return {}

  const totals = new Map<string, number>()
  for (const a of answers) {
    const score =
      (a.score_name ?? 0) + (a.score_animal ?? 0) + (a.score_place ?? 0) + (a.score_thing ?? 0) + (a.score_food ?? 0)
    const existing = totals.get(a.player_id) ?? 0
    totals.set(a.player_id, existing + score)
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])

  const placements: Record<string, number> = {}
  let rank = 1
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i][1] < sorted[i - 1][1]) rank = i + 1
    const tournamentPlayerId = playerMap.get(sorted[i][0])
    if (tournamentPlayerId) placements[tournamentPlayerId] = rank
  }
  return placements
}

async function computeTwoTruthsPlacements(
  supabase: SupabaseClient,
  gameId: string,
  playerMap: Map<string, string>
): Promise<Record<string, number>> {
  const { data: guesses } = await supabase.from('ttl_guesses').select('player_id, is_correct').eq('game_id', gameId)

  if (!guesses?.length) return {}

  const totals = new Map<string, number>()
  for (const g of guesses) {
    const existing = totals.get(g.player_id) ?? 0
    totals.set(g.player_id, existing + (g.is_correct ? 1 : 0))
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])

  const placements: Record<string, number> = {}
  let rank = 1
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i][1] < sorted[i - 1][1]) rank = i + 1
    const tournamentPlayerId = playerMap.get(sorted[i][0])
    if (tournamentPlayerId) placements[tournamentPlayerId] = rank
  }
  return placements
}

/**
 * Knockout advancement: rank the surviving field by this round's placements and
 * eliminate the bottom half, so the top half (ceil(n/2)) advance — 16 → 8 → 4 →
 * 2 → 1. Players who were still in but didn't play/answer this round rank last
 * (a no-show forfeits). When one player remains, the tournament is finished.
 *
 * `placements` maps tournament_player id → rank (1 = best) for players who were
 * in this round's game. Called only after the round row was atomically claimed,
 * so it runs once per round.
 */
async function applyKnockoutCut(
  supabase: SupabaseClient,
  tournamentId: string,
  placements: Record<string, number>
): Promise<void> {
  const { data: field } = await supabase
    .from('tournament_players')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('is_eliminated', false)

  const ids = (field ?? []).map((p) => p.id)
  const n = ids.length
  if (n <= 1) return

  // Best rank first; anyone not in this round's placements (a no-show) ranks last.
  const rankOf = (id: string) => placements[id] ?? Number.POSITIVE_INFINITY
  const ranked = [...ids].sort((a, b) => rankOf(a) - rankOf(b))

  const { eliminated } = splitKnockoutField(ranked)
  if (eliminated.length > 0) {
    await supabase
      .from('tournament_players')
      .update({ is_eliminated: true, eliminated_at: new Date().toISOString() })
      .in('id', eliminated)
  }

  if (n - eliminated.length <= 1) {
    await supabase.from('tournaments').update({ status: 'finished' }).eq('id', tournamentId)
  }
}

/**
 * Resolve a finished Scrabble knockout room. Unlike the head-to-head group bracket
 * (where each room's single winner advances), knockout ranks the *whole field* by
 * Scrabble score and cuts the bottom half — so it doesn't matter which room a
 * player was in. Each room stores its members' final scores when it finishes; once
 * every room in the round is finished, the field-wide cut runs (once, guarded).
 *
 * Called from markGameFinished, so every Scrabble finish path funnels through here.
 * A no-op for games that aren't a Scrabble knockout room, and idempotent per room
 * via the active→finished CAS.
 */
export async function resolveKnockoutGroupRoom(supabase: SupabaseClient, gameId: string): Promise<void> {
  const { data: room } = await supabase
    .from('tournament_games')
    .select('id, tournament_id, round_number, member_ids, status, is_bye')
    .eq('game_id', gameId)
    .maybeSingle()
  if (!room || room.is_bye || room.status === 'finished') return

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('format, status, game_type, game_config')
    .eq('id', room.tournament_id)
    .maybeSingle()
  if (!tournament || tournament.format !== 'knockout' || tournament.status === 'finished') return
  // Only the room-based (Scrabble) knockout resolves here; trivia knockout is a
  // single game scored through awardTournamentPlacements.
  if (resolveGroupSize(tournament.game_config, tournament.game_type) <= 2) return

  // Score this room: map each seated game player to its tournament roster slot by
  // name (unique per tournament), restricted to this room's members, and read the
  // final penalised Scrabble score. Store tp_id → score in `placements`.
  const memberIds = ((room.member_ids ?? []) as string[]).filter((id) => Boolean(id))
  const [gamePlayersRes, statesRes, tpsRes] = await Promise.all([
    supabase.from('players').select('id, name').eq('game_id', gameId),
    supabase.from('scrabble_player_state').select('player_id, score').eq('game_id', gameId),
    supabase
      .from('tournament_players')
      .select('id, player_name')
      .in('id', memberIds.length ? memberIds : ['__none__']),
  ])
  // If any of the three score-loading queries failed, bail *before* the CAS. The
  // room stays unfinished so a retry (or the round-start reconcile) can recompute:
  // committing here on a transient error would store empty/partial scores, and
  // since a score-less player ranks at the top of the cut (never eliminated), that
  // would let a legitimately low-scoring player survive — with no path to redo it.
  if (gamePlayersRes.error || statesRes.error || tpsRes.error) {
    console.error(`resolveKnockoutGroupRoom: failed to load scoring data for room ${room.id}`)
    return
  }
  const scoreByPlayerId = new Map((statesRes.data ?? []).map((s) => [s.player_id as string, Number(s.score ?? 0)]))
  const tpByName = new Map((tpsRes.data ?? []).map((t) => [t.player_name.toLowerCase(), t.id as string]))
  const placements: Record<string, number> = {}
  for (const gp of gamePlayersRes.data ?? []) {
    const tpId = tpByName.get((gp.name as string).toLowerCase())
    if (tpId) placements[tpId] = scoreByPlayerId.get(gp.id as string) ?? 0
  }

  // Claim the room finished (CAS): only the request that flips it from active stores
  // scores and goes on to try the round-wide cut, so scores can't be written twice.
  const { data: claimed, error: claimError } = await supabase
    .from('tournament_games')
    .update({ status: 'finished', placements })
    .eq('id', room.id)
    .neq('status', 'finished')
    .select('id')
  if (claimError || !claimed?.length) return

  await applyKnockoutGroupCut(supabase, room.tournament_id, room.round_number)
}

/**
 * The field-wide knockout cut for a room-based (Scrabble) round. A barrier: it only
 * fires once every room in `roundNumber` is finished. It merges every room's stored
 * scores into one ranking, then eliminates the bottom half (splitKnockoutField),
 * finishing the tournament when one player remains.
 *
 * Race guard: several rooms can finish at once and each calls this. `tournaments`
 * .last_knockout_cut_round is CAS-bumped to this round; only the caller that
 * actually advances it performs the elimination, so the cut runs exactly once.
 *
 * Exported so the round-start route can also nudge it after an all-walkover round
 * (every room resolved with no game to finish, so no markGameFinished fires) — it's
 * a no-op unless that round is fully finished and not yet cut.
 */
export async function applyKnockoutGroupCut(
  supabase: SupabaseClient,
  tournamentId: string,
  roundNumber: number | null
): Promise<void> {
  if (roundNumber == null) return

  const { data: roundRooms } = await supabase
    .from('tournament_games')
    .select('placements, status, is_bye')
    .eq('tournament_id', tournamentId)
    .eq('round_number', roundNumber)
  // Barrier: wait until no room in the round is still pending/active.
  if (!roundRooms?.length || roundRooms.some((r) => r.status !== 'finished')) return

  // Single-execution guard: only the caller that advances last_knockout_cut_round to
  // this round proceeds. A concurrent/duplicate call updates zero rows and bails.
  const { data: guard } = await supabase
    .from('tournaments')
    .update({ last_knockout_cut_round: roundNumber })
    .eq('id', tournamentId)
    .or(`last_knockout_cut_round.is.null,last_knockout_cut_round.lt.${roundNumber}`)
    .select('id')
  if (!guard?.length) return

  // Merge every room's scores into one field-wide map (tp_id → score).
  const scoreByTp = new Map<string, number>()
  for (const r of roundRooms) {
    const roomPlacements = (r.placements ?? {}) as Record<string, number>
    for (const [tpId, score] of Object.entries(roomPlacements)) scoreByTp.set(tpId, Number(score))
  }

  // Order the field deterministically (earliest joiner first, id as final
  // tiebreak) so a tie *at the cut boundary* always resolves the same way. Without
  // an explicit order the DB could return equal-scored players in any order across
  // retries/query plans, eliminating a different player each time; rankKnockoutScores
  // keeps this order on ties, so seniority decides who advances.
  const { data: field } = await supabase
    .from('tournament_players')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('is_eliminated', false)
    .order('joined_at', { ascending: true })
    .order('id', { ascending: true })
  const ids = (field ?? []).map((p) => p.id as string)
  if (ids.length <= 1) return

  // Rank the surviving field best-first (a score-less advancer — bye/walkover — sits
  // at the top), then cut the bottom half.
  const { eliminated } = splitKnockoutField(rankKnockoutScores(ids, scoreByTp))
  if (eliminated.length > 0) {
    await supabase
      .from('tournament_players')
      .update({ is_eliminated: true, eliminated_at: new Date().toISOString() })
      .in('id', eliminated)
  }

  if (ids.length - eliminated.length <= 1) {
    await supabase.from('tournaments').update({ status: 'finished' }).eq('id', tournamentId)
  }
}

/**
 * Add each player's earned points (and +1 game played) in a single statement.
 * `points` maps tournament_player id → points earned this game; games_played is
 * bumped for every entry, matching the pre-batch loop (which counted a game even
 * for a zero-point placement). No-op on an empty map. W9: replaced one
 * `increment_tournament_points` RPC per player.
 */
export async function incrementTournamentPointsBatch(
  supabase: SupabaseClient,
  points: Record<string, number>
): Promise<void> {
  const pointUpdates = Object.entries(points).map(([player_id, pts]) => ({ player_id, points: pts }))
  if (pointUpdates.length === 0) return
  const { error } = await supabase.rpc('increment_tournament_points_batch', { p_updates: pointUpdates })
  if (error) console.error('[tournament-scoring] Failed to increment points', error)
}

/**
 * Decrement one life from each given tournament_player, eliminating any that hit
 * zero — in a single statement. No-op on an empty list. W9: replaced a SELECT +
 * UPDATE per bottom-N player.
 */
export async function applyTournamentLifeLoss(supabase: SupabaseClient, playerIds: string[]): Promise<void> {
  if (playerIds.length === 0) return
  const { error } = await supabase.rpc('apply_tournament_life_loss', { p_player_ids: playerIds })
  if (error) console.error('[tournament-scoring] Failed to apply life loss', error)
}

export async function awardTournamentPlacements(supabase: SupabaseClient, gameId: string): Promise<void> {
  const { data: game } = await supabase.from('games').select('tournament_id, game_type').eq('id', gameId).maybeSingle()

  if (!game?.tournament_id) return

  const tournamentId = game.tournament_id

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('placement_points, elimination_config, format')
    .eq('id', tournamentId)
    .maybeSingle()

  if (!tournament) return

  const { data: gamePlayers } = await supabase.from('players').select('id, name').eq('game_id', gameId)

  const { data: tournamentPlayers } = await supabase
    .from('tournament_players')
    .select('id, player_name')
    .eq('tournament_id', tournamentId)

  if (!gamePlayers?.length || !tournamentPlayers?.length) {
    await supabase
      .from('tournament_games')
      .update({ status: 'finished', placements: {} })
      .eq('tournament_id', tournamentId)
      .eq('game_id', gameId)
    return
  }

  const playerMap = new Map<string, string>()
  for (const gp of gamePlayers) {
    const tp = tournamentPlayers.find((t) => t.player_name.toLowerCase() === gp.name.toLowerCase())
    if (tp) playerMap.set(gp.id, tp.id)
  }

  let placements: Record<string, number> = {}

  const gameType = game.game_type?.toLowerCase() ?? ''
  if (gameType === 'trivia') {
    placements = await computeTriviaPlacements(supabase, gameId, playerMap)
  } else if (gameType === 'i_call_on') {
    placements = await computeNpatPlacements(supabase, gameId, playerMap)
  } else if (gameType === 'two_truths') {
    placements = await computeTwoTruthsPlacements(supabase, gameId, playerMap)
  }

  if (Object.keys(placements).length === 0) {
    await supabase
      .from('tournament_games')
      .update({ status: 'finished', placements: {} })
      .eq('tournament_id', tournamentId)
      .eq('game_id', gameId)
    return
  }

  const points = computePlacementPoints(placements, tournament.placement_points as number[])

  // Claim this game atomically: only the first call to flip it from a non-finished
  // state to 'finished' proceeds with scoring/lives. This is reachable from both the
  // manual finish-game route and the auto-advance path (which players can trigger by
  // polling), so without this guard points/lives could be applied more than once.
  const { data: claimed } = await supabase
    .from('tournament_games')
    .update({ status: 'finished', placements })
    .eq('tournament_id', tournamentId)
    .eq('game_id', gameId)
    .neq('status', 'finished')
    .select('id')

  if (!claimed || claimed.length === 0) return

  // Knockout: cut the bottom half of the field this round instead of awarding
  // points/lives — the top half advance until one champion remains.
  if (tournament.format === 'knockout') {
    await applyKnockoutCut(supabase, tournamentId, placements)
    return
  }

  await incrementTournamentPointsBatch(supabase, points)

  // Tournament lives: decrement lives for bottom-N players
  if (tournament.elimination_config) {
    const elimConfig = tournament.elimination_config as EliminationConfig
    if (elimConfig.mode === 'lives') {
      const sortedByPlacement = Object.entries(placements).sort((a, b) => b[1] - a[1])
      const eliminateCount = elimConfig.eliminateCount ?? 1
      const cutoffPlacement = sortedByPlacement[Math.min(eliminateCount, sortedByPlacement.length) - 1]?.[1]
      const belowCutoff = sortedByPlacement.filter(([, p]) => p > cutoffPlacement)
      const atCutoff = sortedByPlacement.filter(([, p]) => p === cutoffPlacement)
      const bottomN =
        belowCutoff.length >= eliminateCount
          ? belowCutoff.slice(0, eliminateCount)
          : atCutoff.length > 1
            ? belowCutoff
            : sortedByPlacement.slice(0, eliminateCount)

      // Decrement lives (and eliminate on zero) for the whole bottom-N in one
      // statement — was a SELECT + UPDATE per player.
      await applyTournamentLifeLoss(
        supabase,
        bottomN.map(([tpId]) => tpId)
      )

      // Check if only 1 player remains — finish tournament early
      const { count: remaining } = await supabase
        .from('tournament_players')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .eq('is_eliminated', false)

      if (remaining != null && remaining <= 1) {
        await supabase.from('tournaments').update({ status: 'finished' }).eq('id', tournamentId)
        return
      }
    }
  }

  const { data: tournamentState } = await supabase
    .from('tournaments')
    .select('target_game_count')
    .eq('id', tournamentId)
    .maybeSingle()

  if (tournamentState?.target_game_count) {
    const { count } = await supabase
      .from('tournament_games')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .eq('status', 'finished')

    if (count && count >= tournamentState.target_game_count) {
      await supabase.from('tournaments').update({ status: 'finished' }).eq('id', tournamentId)
    }
  }
}
