import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import { isNamePlaceAnimalThingGame, parseGameType } from '@/lib/game-types'
import {
  buildNpatNextRound,
  clampNpatMarkingTimer,
  clampNpatTimer,
  computeRoundScores,
  ensureBlankAnswers,
  ensureDefaultMarks,
  NPAT_LETTER_PICK_SECONDS,
  NPAT_REVEAL_SECONDS,
  npatSessionShouldEnd,
  parseNpatMetadata,
  randomUnusedLetter,
} from '@/lib/npat'
import type { Game, NpatMetadata, Round } from '@/types'

export type NpatAdvanceCode =
  | 'round_active'
  | 'phase_advanced'
  | 'ended_round'
  | 'synced_pointer'
  | 'advanced_next'
  | 'advanced_finish'
  | 'already_done'
  | 'game_not_found'
  | 'not_npat'
  | 'not_active'
  | 'reveal_pending'
  | 'not_finished'

export type NpatAdvanceResult = {
  ok: boolean
  code: NpatAdvanceCode
  nextRound?: number
}

async function countPlayers(supabase: SupabaseClient, gameId: string): Promise<string[]> {
  const { data } = await supabase.from('players').select('id').eq('game_id', gameId)
  return (data ?? []).map((p) => p.id)
}

async function countRoundAnswers(supabase: SupabaseClient, roundId: string): Promise<number> {
  const { count } = await supabase
    .from('npat_answers')
    .select('id', { count: 'exact', head: true })
    .eq('round_id', roundId)
    .not('submitted_at', 'is', null)
  return count ?? 0
}

async function countRoundMarks(supabase: SupabaseClient, roundId: string): Promise<number> {
  const { count } = await supabase
    .from('npat_marks')
    .select('id', { count: 'exact', head: true })
    .eq('round_id', roundId)
    .not('marked_at', 'is', null)
  return count ?? 0
}

function phaseExpired(metadata: NpatMetadata, game: Game): boolean {
  if (!metadata.phase_started_at) return false
  const start = new Date(metadata.phase_started_at).getTime()
  const now = Date.now()
  if (metadata.phase === 'letter_pick') return now >= start + NPAT_LETTER_PICK_SECONDS * 1000
  if (metadata.phase === 'writing') {
    return now >= start + clampNpatTimer(game.timer_seconds) * 1000
  }
  if (metadata.phase === 'marking') {
    return now >= start + clampNpatMarkingTimer(game.operative_timer_seconds) * 1000
  }
  return false
}

function revealPending(round: Round): boolean {
  if (!round.ended_at) return false
  return Date.now() < new Date(round.ended_at).getTime() + NPAT_REVEAL_SECONDS * 1000
}

function usedLettersAfterRound(metadata: NpatMetadata): number {
  return metadata.used_letters.length + (metadata.letter ? 1 : 0)
}

async function updateRoundMetadata(
  supabase: SupabaseClient,
  roundId: string,
  metadata: NpatMetadata
): Promise<boolean> {
  const { error } = await supabase.from('rounds').update({ npat_metadata: metadata }).eq('id', roundId)
  return !error
}

async function pickLetterAndStartWriting(
  supabase: SupabaseClient,
  round: Round,
  letter: string
): Promise<boolean> {
  const metadata = parseNpatMetadata(round.npat_metadata)
  if (!metadata || metadata.phase !== 'letter_pick') return false
  const now = new Date().toISOString()
  return updateRoundMetadata(supabase, round.id, {
    ...metadata,
    letter: letter.toUpperCase().slice(0, 1),
    phase: 'writing',
    phase_started_at: now,
  })
}

async function startMarkingPhase(
  supabase: SupabaseClient,
  gameId: string,
  round: Round,
  playerIds: string[]
): Promise<boolean> {
  const metadata = parseNpatMetadata(round.npat_metadata)
  if (!metadata || metadata.phase !== 'writing') return false
  await ensureBlankAnswers(supabase, gameId, round.id, playerIds)
  await ensureDefaultMarks(supabase, gameId, round, playerIds)
  const now = new Date().toISOString()
  return updateRoundMetadata(supabase, round.id, {
    ...metadata,
    phase: 'marking',
    phase_started_at: now,
  })
}

async function computeAndFinishRound(
  supabase: SupabaseClient,
  gameId: string,
  round: Round
): Promise<boolean> {
  const metadata = parseNpatMetadata(round.npat_metadata)
  if (!metadata || metadata.phase !== 'marking' || metadata.scores_computed) return false

  const [{ data: answers }, { data: marks }] = await Promise.all([
    supabase.from('npat_answers').select('*').eq('round_id', round.id),
    supabase.from('npat_marks').select('*').eq('round_id', round.id),
  ])

  const scores = computeRoundScores(answers ?? [], marks ?? [])
  for (const row of scores) {
    await supabase
      .from('npat_answers')
      .update({
        score_name: row.score_name,
        score_animal: row.score_animal,
        score_place: row.score_place,
        score_thing: row.score_thing,
      })
      .eq('round_id', round.id)
      .eq('player_id', row.player_id)
  }

  const now = new Date().toISOString()
  await updateRoundMetadata(supabase, round.id, {
    ...metadata,
    phase: 'reveal',
    phase_started_at: now,
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
  const { data: round } = await supabase.from('rounds').select('npat_metadata').eq('id', roundId).maybeSingle()
  const metadata = parseNpatMetadata(round?.npat_metadata)
  if (!metadata) return false

  const { data, error } = await supabase
    .from('rounds')
    .update({
      status: 'active',
      started_at: now,
      ended_at: null,
      npat_metadata: { ...metadata, phase: 'letter_pick', phase_started_at: now },
    })
    .eq('id', roundId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  return !error && !!data
}

async function advanceActiveRoundPhase(
  supabase: SupabaseClient,
  game: Game,
  round: Round,
  playerIds: string[]
): Promise<NpatAdvanceCode> {
  const metadata = parseNpatMetadata(round.npat_metadata)
  if (!metadata) return 'round_active'

  if (metadata.phase === 'letter_pick') {
    const letterChosen = metadata.letter != null
    if (!letterChosen && phaseExpired(metadata, game)) {
      await pickLetterAndStartWriting(supabase, round, randomUnusedLetter(metadata.used_letters))
      return 'phase_advanced'
    }
    return 'round_active'
  }

  if (metadata.phase === 'writing') {
    const submitted = await countRoundAnswers(supabase, round.id)
    const allIn = playerIds.length > 0 && submitted >= playerIds.length
    if (allIn || phaseExpired(metadata, game)) {
      const ok = await startMarkingPhase(supabase, game.id, round, playerIds)
      return ok ? 'phase_advanced' : 'round_active'
    }
    return 'round_active'
  }

  if (metadata.phase === 'marking') {
    const marked = await countRoundMarks(supabase, round.id)
    const allMarked = playerIds.length > 0 && marked >= playerIds.length
    if (allMarked || phaseExpired(metadata, game)) {
      const ok = await computeAndFinishRound(supabase, game.id, round)
      return ok ? 'ended_round' : 'round_active'
    }
    return 'round_active'
  }

  return 'round_active'
}

async function startNextLetterCycle(
  supabase: SupabaseClient,
  game: Game,
  finishedRound: Round,
  playerIds: string[]
): Promise<NpatAdvanceResult> {
  const code = game.id
  const metadata = parseNpatMetadata(finishedRound.npat_metadata)
  if (!metadata) return { ok: false, code: 'not_finished' }

  const usedCount = usedLettersAfterRound(metadata)
  if (npatSessionShouldEnd(game, usedCount)) {
    await markGameFinished(supabase, code)
    return { ok: true, code: 'advanced_finish' }
  }

  const nextRoundNumber = finishedRound.round_number + 1
  const nextRow = buildNpatNextRound({
    gameId: code,
    roundNumber: nextRoundNumber,
    previousMetadata: metadata,
    playerIds,
    now: new Date().toISOString(),
  })

  if (!nextRow) {
    await markGameFinished(supabase, code)
    return { ok: true, code: 'advanced_finish' }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('rounds')
    .insert(nextRow)
    .select('id')
    .maybeSingle()

  if (insertError || !inserted) return { ok: false, code: 'not_finished' }

  const activated = await activateRound(supabase, inserted.id)
  if (!activated) return { ok: false, code: 'not_finished' }

  await syncGamePointer(supabase, code, nextRoundNumber)
  await supabase.from('games').update({ rounds_count: nextRoundNumber }).eq('id', code)

  return { ok: true, code: 'advanced_next', nextRound: nextRoundNumber }
}

export async function syncNpatGameState(
  supabase: SupabaseClient,
  gameId: string,
  opts?: { force?: boolean }
): Promise<NpatAdvanceResult> {
  const code = gameId.toUpperCase()
  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return { ok: false, code: 'game_not_found' }
  if (!isNamePlaceAnimalThingGame(parseGameType(game.game_type))) return { ok: false, code: 'not_npat' }
  if (game.status === 'finished') return { ok: true, code: 'already_done' }
  if (game.status !== 'active') return { ok: false, code: 'not_active' }

  const { data: rounds } = await supabase.from('rounds').select('*').eq('game_id', code).order('round_number')
  const roundList = rounds ?? []
  const activeRound = roundList.find((r) => r.status === 'active') ?? null
  const pointerRound = roundList.find((r) => r.round_number === game.current_round_number) ?? null
  const playerIds = await countPlayers(supabase, code)

  if (pointerRound && pointerRound.status === 'finished' && revealPending(pointerRound) && !opts?.force) {
    return { ok: true, code: 'reveal_pending' }
  }

  if (activeRound) {
    const phaseCode = await advanceActiveRoundPhase(supabase, game, activeRound, playerIds)
    if (phaseCode === 'ended_round') return { ok: true, code: 'ended_round' }
    if (phaseCode === 'phase_advanced') return { ok: true, code: 'phase_advanced' }
    return { ok: true, code: 'round_active' }
  }

  const lastFinished = [...roundList].reverse().find((r) => r.status === 'finished') ?? null
  if (lastFinished && revealPending(lastFinished) && !opts?.force) {
    return { ok: true, code: 'reveal_pending' }
  }

  if (pointerRound && pointerRound.status === 'finished') {
    return startNextLetterCycle(supabase, game, pointerRound, playerIds)
  }

  if (pointerRound && pointerRound.status === 'pending') {
    const activated = await activateRound(supabase, pointerRound.id)
    if (activated) return { ok: true, code: 'synced_pointer' }
  }

  return { ok: true, code: 'not_finished' }
}
