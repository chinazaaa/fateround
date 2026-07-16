import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import { isLandmineGame, parseGameType } from '@/lib/game-types'
import {
  buildLandmineNextRound,
  clampLandmineMarkingTimer,
  clampLandmineWritingTimer,
  computeRoundResults,
  ensureBlankAnswers,
  ensureDefaultMarks,
  finalizeUnsubmittedAnswers,
  gameLandmineMode,
  gameLandmineCategoryTimer,
  LANDMINE_REVEAL_SECONDS,
  parseLandmineMetadata,
  pickMines,
} from '@/lib/landmine'
import type { Game, LandmineMetadata, Round } from '@/types'

export type LandmineAdvanceCode =
  | 'round_active'
  | 'phase_advanced'
  | 'synced_pointer'
  | 'advanced_next'
  | 'advanced_finish'
  | 'already_done'
  | 'game_not_found'
  | 'not_landmine'
  | 'not_active'
  | 'reveal_pending'
  | 'not_finished'

export type LandmineAdvanceResult = {
  ok: boolean
  code: LandmineAdvanceCode
  nextRound?: number
}

async function countActivePlayers(supabase: SupabaseClient, gameId: string): Promise<string[]> {
  const { data } = await supabase
    .from('players')
    .select('id')
    .eq('game_id', gameId)
    .eq('spectator', false)
    .eq('is_eliminated', false)
  return (data ?? []).map((p) => p.id)
}

async function countRoundAnswers(supabase: SupabaseClient, roundId: string, playerIds: string[]): Promise<number> {
  if (playerIds.length === 0) return 0
  const { count } = await supabase
    .from('landmine_answers')
    .select('id', { count: 'exact', head: true })
    .eq('round_id', roundId)
    .in('player_id', playerIds)
    .not('submitted_at', 'is', null)
  return count ?? 0
}

async function countRoundMarks(supabase: SupabaseClient, roundId: string, playerIds: string[]): Promise<number> {
  if (playerIds.length === 0) return 0
  const { count } = await supabase
    .from('landmine_marks')
    .select('id', { count: 'exact', head: true })
    .eq('round_id', roundId)
    .in('marker_player_id', playerIds)
    .not('marked_at', 'is', null)
  return count ?? 0
}

function writingTimer(game: Game): number {
  return clampLandmineWritingTimer(game.timer_seconds)
}
function markingTimer(game: Game): number {
  return clampLandmineMarkingTimer(game.operative_timer_seconds)
}

function phaseExpired(metadata: LandmineMetadata, game: Game): boolean {
  if (!metadata.phase_started_at) return false
  const start = new Date(metadata.phase_started_at).getTime()
  const now = Date.now()
  if (metadata.phase === 'category_pick') return now >= start + gameLandmineCategoryTimer(game) * 1000
  if (metadata.phase === 'writing') return now >= start + writingTimer(game) * 1000
  if (metadata.phase === 'marking') return now >= start + markingTimer(game) * 1000
  return false
}

function revealPending(round: Round): boolean {
  if (!round.ended_at) return false
  return Date.now() < new Date(round.ended_at).getTime() + LANDMINE_REVEAL_SECONDS * 1000
}

async function updateRoundMetadata(
  supabase: SupabaseClient,
  roundId: string,
  metadata: LandmineMetadata
): Promise<boolean> {
  const { error } = await supabase.from('rounds').update({ landmine_metadata: metadata }).eq('id', roundId)
  return !error
}

type CategoryRow = { id: string; name: string; entries: unknown }

function categoryEntryList(row: CategoryRow): string[] {
  if (!Array.isArray(row.entries)) return []
  return row.entries
    .map((e) => {
      if (typeof e === 'string') return e
      if (e && typeof e === 'object' && typeof (e as { answer?: unknown }).answer === 'string') {
        return (e as { answer: string }).answer
      }
      return ''
    })
    .map((s) => s.trim())
    .filter(Boolean)
}

async function randomCategory(supabase: SupabaseClient): Promise<CategoryRow | null> {
  const { data } = await supabase.from('landmine_categories').select('id, name, entries').eq('is_active', true)
  const rows = (data as CategoryRow[]) ?? []
  if (rows.length === 0) return null
  return rows[Math.floor(Math.random() * rows.length)]
}

/**
 * The caller (or an auto-pick on timeout) picks a category. We secretly draw the mine(s)
 * from the pool, store them in the RLS-protected landmine_round_mines, set the (public)
 * category on the round metadata, and open the writing phase. Conditioned on the round
 * still being in category_pick so a stale poll can't reopen a category mid-round.
 */
export async function applyCategoryPick(
  supabase: SupabaseClient,
  gameId: string,
  round: Round,
  category: CategoryRow,
  playerIds: string[]
): Promise<boolean> {
  const metadata = parseLandmineMetadata(round.landmine_metadata)
  if (!metadata || metadata.phase !== 'category_pick') return false

  const mines = pickMines(categoryEntryList(category), metadata.mine_count)
  const now = new Date().toISOString()

  const { data: updated, error } = await supabase
    .from('rounds')
    .update({
      landmine_metadata: {
        ...metadata,
        category: category.name,
        phase: 'writing',
        phase_started_at: now,
      } satisfies LandmineMetadata,
    })
    .eq('id', round.id)
    .eq('landmine_metadata->>phase', 'category_pick')
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('Failed to pick Landmine category:', error.message)
    return false
  }
  if (!updated) return false

  // Store the secret mine(s) for this round (server-only table).
  await supabase.from('landmine_round_mines').upsert({ round_id: round.id, words: mines }, { onConflict: 'round_id' })
  await ensureBlankAnswers(supabase, gameId, round.id, playerIds)
  return true
}

async function autoPickCategory(
  supabase: SupabaseClient,
  gameId: string,
  round: Round,
  playerIds: string[]
): Promise<boolean> {
  const category = await randomCategory(supabase)
  if (!category) return false
  return applyCategoryPick(supabase, gameId, round, category, playerIds)
}

async function startMarkingPhase(
  supabase: SupabaseClient,
  gameId: string,
  round: Round,
  playerIds: string[]
): Promise<boolean> {
  const metadata = parseLandmineMetadata(round.landmine_metadata)
  if (!metadata || metadata.phase !== 'writing') return false
  await finalizeUnsubmittedAnswers(supabase, gameId, round.id, playerIds)
  await ensureDefaultMarks(supabase, gameId, round, playerIds)
  const now = new Date().toISOString()
  return updateRoundMetadata(supabase, round.id, { ...metadata, phase: 'marking', phase_started_at: now })
}

async function getRoundMines(supabase: SupabaseClient, roundId: string): Promise<string[]> {
  const { data } = await supabase.from('landmine_round_mines').select('words').eq('round_id', roundId).maybeSingle()
  const words = (data as { words?: unknown } | null)?.words
  return Array.isArray(words) ? words.filter((w): w is string => typeof w === 'string') : []
}

/**
 * Reveal: compute per-player results, persist points/outcome, reveal the mine into the
 * (now public) metadata, eliminate mine-hitters in elimination mode, and finish the round.
 */
async function computeAndFinishRound(supabase: SupabaseClient, game: Game, round: Round): Promise<boolean> {
  const metadata = parseLandmineMetadata(round.landmine_metadata)
  if (!metadata || metadata.scores_computed) return false
  if (metadata.phase !== 'marking') return false

  const [{ data: answers }, { data: marks }, mines] = await Promise.all([
    supabase.from('landmine_answers').select('*').eq('round_id', round.id),
    supabase.from('landmine_marks').select('*').eq('round_id', round.id),
    getRoundMines(supabase, round.id),
  ])

  const results = computeRoundResults(answers ?? [], marks ?? [], mines, {
    originalityBonus: game.landmine_originality_bonus !== false,
  })

  for (const row of results) {
    await supabase
      .from('landmine_answers')
      .update({ points: row.points, outcome: row.outcome, mine_hit: row.mine_hit, is_original: row.is_original })
      .eq('round_id', round.id)
      .eq('player_id', row.player_id)
  }

  // Elimination mode: knock out everyone who hit the mine.
  if (gameLandmineMode(game) === 'elimination') {
    const hitters = results.filter((r) => r.mine_hit).map((r) => r.player_id)
    if (hitters.length > 0) {
      await supabase.from('players').update({ is_eliminated: true }).in('id', hitters)
    }
  }

  const now = new Date().toISOString()
  await updateRoundMetadata(supabase, round.id, {
    ...metadata,
    phase: 'reveal',
    phase_started_at: now,
    revealed_mines: mines,
    scores_computed: true,
  })

  const { error } = await supabase
    .from('rounds')
    .update({ status: 'finished', ended_at: now })
    .eq('id', round.id)
    .eq('status', 'active')
  return !error
}

async function syncGamePointer(supabase: SupabaseClient, gameId: string, roundNumber: number): Promise<boolean> {
  const { error } = await supabase.from('games').update({ current_round_number: roundNumber }).eq('id', gameId)
  return !error
}

async function activateRound(supabase: SupabaseClient, roundId: string): Promise<boolean> {
  const now = new Date().toISOString()
  const { data: round } = await supabase
    .from('rounds')
    .select('submitter_player_id, landmine_metadata, status')
    .eq('id', roundId)
    .maybeSingle()
  if (!round) return false
  if (round.status === 'active') return true
  if (round.status !== 'pending') return false

  const metadata = parseLandmineMetadata(round.landmine_metadata)
  if (!metadata) return false

  const { data, error } = await supabase
    .from('rounds')
    .update({
      status: 'active',
      started_at: now,
      ended_at: null,
      landmine_metadata: { ...metadata, phase: 'category_pick', phase_started_at: now },
    })
    .eq('id', roundId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  return !error && !!data
}

async function findExistingNextRound(
  supabase: SupabaseClient,
  gameId: string,
  nextRoundNumber: number
): Promise<{ active: Round | null; pending: Round | null }> {
  const { data } = await supabase.from('rounds').select('*').eq('game_id', gameId).eq('round_number', nextRoundNumber)
  const rows = (data ?? []) as Round[]
  return {
    active: rows.find((r) => r.status === 'active') ?? null,
    pending: rows.find((r) => r.status === 'pending') ?? null,
  }
}

async function activateNextRound(
  supabase: SupabaseClient,
  gameId: string,
  roundNumber: number,
  roundId: string
): Promise<LandmineAdvanceResult | null> {
  const activated = await activateRound(supabase, roundId)
  if (!activated) return null
  await syncGamePointer(supabase, gameId, roundNumber)
  return { ok: true, code: 'advanced_next', nextRound: roundNumber }
}

async function advanceActiveRoundPhase(
  supabase: SupabaseClient,
  game: Game,
  round: Round,
  playerIds: string[]
): Promise<LandmineAdvanceCode> {
  const metadata = parseLandmineMetadata(round.landmine_metadata)
  if (!metadata) return 'round_active'

  if (metadata.phase === 'category_pick') {
    if (metadata.category == null && phaseExpired(metadata, game)) {
      const ok = await autoPickCategory(supabase, game.id, round, playerIds)
      return ok ? 'phase_advanced' : 'round_active'
    }
    return 'round_active'
  }

  if (metadata.phase === 'writing') {
    const submitted = await countRoundAnswers(supabase, round.id, playerIds)
    const allIn = playerIds.length > 0 && submitted >= playerIds.length
    if (allIn || phaseExpired(metadata, game)) {
      const ok = await startMarkingPhase(supabase, game.id, round, playerIds)
      return ok ? 'phase_advanced' : 'round_active'
    }
    return 'round_active'
  }

  if (metadata.phase === 'marking') {
    const marked = await countRoundMarks(supabase, round.id, playerIds)
    const allMarked = playerIds.length > 0 && marked >= playerIds.length
    if (allMarked || phaseExpired(metadata, game)) {
      const ok = await computeAndFinishRound(supabase, game, round)
      return ok ? 'phase_advanced' : 'round_active'
    }
    return 'round_active'
  }

  return 'round_active'
}

/** True when the game should end after this round (mode-driven). */
async function shouldFinishSession(
  supabase: SupabaseClient,
  game: Game,
  finishedRound: Round,
  activePlayerIds: string[]
): Promise<boolean> {
  if (gameLandmineMode(game) === 'elimination') {
    // Last player standing (or nobody left).
    return activePlayerIds.length <= 1
  }
  // Zero Points: fixed round count.
  return finishedRound.round_number >= (game.rounds_count ?? 1)
}

async function startNextRound(
  supabase: SupabaseClient,
  game: Game,
  finishedRound: Round,
  playerIds: string[]
): Promise<LandmineAdvanceResult> {
  const code = game.id
  const metadata = parseLandmineMetadata(finishedRound.landmine_metadata)
  if (!metadata) return { ok: false, code: 'not_finished' }

  const { data: freshGame } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  const liveGame = (freshGame ?? game) as Game
  const activePlayerIds = await countActivePlayers(supabase, code)

  if (await shouldFinishSession(supabase, liveGame, finishedRound, activePlayerIds)) {
    const { error: finishError } = await markGameFinished(supabase, code)
    if (finishError) console.error('Failed to mark Landmine game finished:', finishError)
    return { ok: true, code: 'advanced_finish' }
  }

  const nextRoundNumber = finishedRound.round_number + 1
  const nextRow = buildLandmineNextRound({
    gameId: code,
    roundNumber: nextRoundNumber,
    previousMetadata: metadata,
    previousCallerId: finishedRound.submitter_player_id ?? null,
    playerIds: activePlayerIds,
    mineCount: metadata.mine_count,
    now: new Date().toISOString(),
  })
  if (!nextRow) {
    const { error: finishError } = await markGameFinished(supabase, code)
    if (finishError) console.error('Failed to mark Landmine game finished:', finishError)
    return { ok: true, code: 'advanced_finish' }
  }

  const existing = await findExistingNextRound(supabase, code, nextRoundNumber)
  if (existing.active) {
    await syncGamePointer(supabase, code, nextRoundNumber)
    return { ok: true, code: 'advanced_next', nextRound: nextRoundNumber }
  }
  if (existing.pending) {
    const advanced = await activateNextRound(supabase, code, nextRoundNumber, existing.pending.id)
    if (advanced) return advanced
    return { ok: false, code: 'not_finished' }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('rounds')
    .insert(nextRow)
    .select('id')
    .maybeSingle()
  if (insertError || !inserted) {
    const retry = await findExistingNextRound(supabase, code, nextRoundNumber)
    if (retry.pending) {
      const advanced = await activateNextRound(supabase, code, nextRoundNumber, retry.pending.id)
      if (advanced) return advanced
    }
    if (retry.active) {
      await syncGamePointer(supabase, code, nextRoundNumber)
      return { ok: true, code: 'advanced_next', nextRound: nextRoundNumber }
    }
    return { ok: false, code: 'not_finished' }
  }

  const advanced = await activateNextRound(supabase, code, nextRoundNumber, inserted.id)
  if (advanced) return advanced
  return { ok: false, code: 'not_finished' }
}

export async function syncLandmineGameState(supabase: SupabaseClient, gameId: string): Promise<LandmineAdvanceResult> {
  const code = gameId.toUpperCase()
  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return { ok: false, code: 'game_not_found' }
  if (!isLandmineGame(parseGameType(game.game_type))) return { ok: false, code: 'not_landmine' }
  if (game.status === 'finished') return { ok: true, code: 'already_done' }
  if (game.status !== 'active') return { ok: false, code: 'not_active' }

  const { data: rounds } = await supabase.from('rounds').select('*').eq('game_id', code).order('round_number')
  const roundList = (rounds ?? []) as Round[]
  const activeRound = roundList.find((r) => r.status === 'active') ?? null
  const pointerRound = roundList.find((r) => r.round_number === game.current_round_number) ?? null
  const playerIds = await countActivePlayers(supabase, code)

  if (pointerRound && pointerRound.status === 'finished' && revealPending(pointerRound)) {
    return { ok: true, code: 'reveal_pending' }
  }

  if (activeRound) {
    const phaseCode = await advanceActiveRoundPhase(supabase, game as Game, activeRound, playerIds)
    if (phaseCode === 'phase_advanced') return { ok: true, code: 'phase_advanced' }
    return { ok: true, code: 'round_active' }
  }

  const lastFinished = [...roundList].reverse().find((r) => r.status === 'finished') ?? null
  if (lastFinished && revealPending(lastFinished)) {
    return { ok: true, code: 'reveal_pending' }
  }

  const pendingAhead = roundList.filter((r) => r.status === 'pending').sort((a, b) => a.round_number - b.round_number)
  const orphanedPending =
    lastFinished != null
      ? (pendingAhead.find((r) => r.round_number === lastFinished.round_number + 1) ??
        pendingAhead.find((r) => r.round_number > lastFinished.round_number))
      : pendingAhead[0]

  if (!activeRound && orphanedPending) {
    const advanced = await activateNextRound(supabase, code, orphanedPending.round_number, orphanedPending.id)
    if (advanced) return { ok: true, code: 'synced_pointer', nextRound: orphanedPending.round_number }
  }

  const cycleAnchor = pointerRound?.status === 'finished' ? pointerRound : lastFinished
  if (cycleAnchor && !revealPending(cycleAnchor)) {
    if (game.current_round_number !== cycleAnchor.round_number) {
      await syncGamePointer(supabase, code, cycleAnchor.round_number)
    }
    return startNextRound(supabase, game as Game, cycleAnchor, playerIds)
  }

  if (pointerRound && pointerRound.status === 'pending') {
    const activated = await activateRound(supabase, pointerRound.id)
    if (activated) {
      await syncGamePointer(supabase, code, pointerRound.round_number)
      return { ok: true, code: 'synced_pointer', nextRound: pointerRound.round_number }
    }
  }

  return { ok: true, code: 'not_finished' }
}
