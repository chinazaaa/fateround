import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import { isQuiplashGame, parseGameType } from '@/lib/game-types'
import {
  QUIPLASH_DEFAULT_SUBMIT_TIMER,
  QUIPLASH_REVEAL_SECONDS,
  createQuiplashBattlesForRound,
  countVotesForBattle,
  eligibleVotersForBattle,
  effectiveQuiplashVoteTimer,
  soloRoundPoints,
} from '@/lib/quiplash'
import type { Game, QuiplashAnswer, QuiplashBattle, QuiplashSession, QuiplashVote } from '@/types'

export type QuiplashAdvanceCode =
  | 'writing'
  | 'voting'
  | 'reveal'
  | 'ended_round'
  | 'advanced_next'
  | 'advanced_finish'
  | 'already_done'
  | 'game_not_found'
  | 'not_quiplash'
  | 'not_active'
  | 'reveal_pending'
  | 'not_finished'

export type QuiplashAdvanceResult = {
  ok: boolean
  code: QuiplashAdvanceCode
  nextRound?: number
}

async function countParticipants(supabase: SupabaseClient, gameId: string): Promise<number> {
  const { count } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .not('spectator', 'is', true)
    .eq('is_eliminated', false)
  return count ?? 0
}

function deadlinePassed(deadlineAt: string | null | undefined): boolean {
  if (!deadlineAt) return false
  return Date.now() >= new Date(deadlineAt).getTime()
}

function revealPending(endedAt: string | null | undefined): boolean {
  if (!endedAt) return false
  const deadline = new Date(endedAt).getTime() + QUIPLASH_REVEAL_SECONDS * 1000
  return Date.now() < deadline
}

async function loadSession(supabase: SupabaseClient, gameId: string): Promise<QuiplashSession | null> {
  const { data } = await supabase.from('quiplash_sessions').select('*').eq('game_id', gameId).maybeSingle()
  return (data as QuiplashSession | null) ?? null
}

async function loadActiveRound(supabase: SupabaseClient, gameId: string) {
  const { data } = await supabase.from('rounds').select('*').eq('game_id', gameId).eq('status', 'active').maybeSingle()
  return data
}

async function loadRoundAnswers(supabase: SupabaseClient, roundId: string): Promise<QuiplashAnswer[]> {
  const { data } = await supabase.from('quiplash_answers').select('*').eq('round_id', roundId)
  return (data ?? []) as QuiplashAnswer[]
}

async function loadRoundBattles(supabase: SupabaseClient, roundId: string): Promise<QuiplashBattle[]> {
  const { data } = await supabase.from('quiplash_battles').select('*').eq('round_id', roundId).order('battle_number')
  return (data ?? []) as QuiplashBattle[]
}

async function loadBattleVotes(supabase: SupabaseClient, battleId: string): Promise<QuiplashVote[]> {
  const { data } = await supabase.from('quiplash_votes').select('*').eq('battle_id', battleId)
  return (data ?? []) as QuiplashVote[]
}

async function activateBattle(
  supabase: SupabaseClient,
  battle: QuiplashBattle,
  voteTimerSeconds: number
): Promise<boolean> {
  const now = new Date().toISOString()
  const deadline = new Date(Date.now() + voteTimerSeconds * 1000).toISOString()
  const { error: battleError } = await supabase
    .from('quiplash_battles')
    .update({ status: 'active', started_at: now })
    .eq('id', battle.id)
    .eq('status', 'pending')
  if (battleError) return false

  const { error: sessionError } = await supabase
    .from('quiplash_sessions')
    .update({
      phase: 'voting',
      battle_index: battle.battle_number - 1,
      active_battle_id: battle.id,
      turn_deadline_at: deadline,
      updated_at: now,
    })
    .eq('game_id', battle.game_id)
  return !sessionError
}

async function finishBattle(supabase: SupabaseClient, battle: QuiplashBattle, votes: QuiplashVote[]): Promise<void> {
  const { votesA, votesB, winnerId, points } = countVotesForBattle(battle, votes)
  const now = new Date().toISOString()
  await supabase
    .from('quiplash_battles')
    .update({
      status: 'finished',
      winner_answer_id: winnerId,
      points_awarded: points,
      ended_at: now,
    })
    .eq('id', battle.id)

  const revealDeadline = new Date(Date.now() + QUIPLASH_REVEAL_SECONDS * 1000).toISOString()
  await supabase
    .from('quiplash_sessions')
    .update({
      phase: 'reveal',
      turn_deadline_at: revealDeadline,
      updated_at: now,
    })
    .eq('game_id', battle.game_id)

  void votesA
  void votesB
}

async function activateBattleWithAutoFinish(
  supabase: SupabaseClient,
  battle: QuiplashBattle,
  voteTimerSeconds: number,
  participantCount: number,
  roundId: string
): Promise<'voting' | 'reveal'> {
  const answers = await loadRoundAnswers(supabase, roundId)
  const votersNeeded = eligibleVotersForBattle(battle, answers, participantCount)
  if (votersNeeded === 0) {
    const now = new Date().toISOString()
    await supabase
      .from('quiplash_battles')
      .update({ status: 'active', started_at: now })
      .eq('id', battle.id)
      .eq('status', 'pending')
    await finishBattle(supabase, battle, [])
    return 'reveal'
  }
  await activateBattle(supabase, battle, voteTimerSeconds)
  return 'voting'
}

async function handleSoloSubmitterRound(
  supabase: SupabaseClient,
  game: Game,
  roundId: string,
  soleAnswer: QuiplashAnswer,
  participantCount: number
): Promise<QuiplashAdvanceResult> {
  const now = new Date().toISOString()
  const points = soloRoundPoints(participantCount)
  const { data: battle, error } = await supabase
    .from('quiplash_battles')
    .insert({
      game_id: game.id,
      round_id: roundId,
      battle_number: 1,
      answer_a_id: soleAnswer.id,
      answer_b_id: soleAnswer.id,
      status: 'finished',
      winner_answer_id: soleAnswer.id,
      points_awarded: points,
      started_at: now,
      ended_at: now,
    })
    .select('*')
    .single()
  if (error || !battle) return { ok: false, code: 'not_finished' }

  const revealDeadline = new Date(Date.now() + QUIPLASH_REVEAL_SECONDS * 1000).toISOString()
  await supabase
    .from('quiplash_sessions')
    .update({
      phase: 'reveal',
      battle_index: 0,
      active_battle_id: battle.id,
      turn_deadline_at: revealDeadline,
      updated_at: now,
    })
    .eq('game_id', game.id)

  return { ok: true, code: 'reveal' }
}

async function startWritingPhase(supabase: SupabaseClient, game: Game, roundId: string): Promise<void> {
  const submitTimer = game.timer_seconds ?? QUIPLASH_DEFAULT_SUBMIT_TIMER
  const deadline = new Date(Date.now() + submitTimer * 1000).toISOString()
  const now = new Date().toISOString()
  await supabase
    .from('quiplash_sessions')
    .update({
      phase: 'writing',
      battle_index: 0,
      active_battle_id: null,
      turn_deadline_at: deadline,
      updated_at: now,
    })
    .eq('game_id', game.id)

  await supabase
    .from('rounds')
    .update({ status: 'active', started_at: now, ended_at: null })
    .eq('id', roundId)
    .eq('status', 'pending')
}

async function endRoundAndAdvance(
  supabase: SupabaseClient,
  game: Game,
  roundNumber: number
): Promise<QuiplashAdvanceResult> {
  const now = new Date().toISOString()
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('game_id', game.id)
    .eq('round_number', roundNumber)
    .maybeSingle()

  if (round) {
    await supabase.from('rounds').update({ status: 'finished', ended_at: now }).eq('id', round.id)
  }

  const isLast = roundNumber >= game.rounds_count
  if (isLast) {
    await supabase
      .from('quiplash_sessions')
      .update({ phase: 'finished', turn_deadline_at: null, updated_at: now })
      .eq('game_id', game.id)
    const { error } = await markGameFinished(supabase, game.id)
    if (error) console.error('Failed to mark quiplash game finished:', error)
    return { ok: true, code: 'advanced_finish' }
  }

  const nextRoundNumber = roundNumber + 1
  const { data: nextRound } = await supabase
    .from('rounds')
    .select('id')
    .eq('game_id', game.id)
    .eq('round_number', nextRoundNumber)
    .maybeSingle()

  if (!nextRound) return { ok: false, code: 'not_finished' }

  await supabase.from('games').update({ current_round_number: nextRoundNumber }).eq('id', game.id)
  await startWritingPhase(supabase, game, nextRound.id)
  return { ok: true, code: 'advanced_next', nextRound: nextRoundNumber }
}

async function transitionWritingToBattles(
  supabase: SupabaseClient,
  game: Game,
  roundId: string,
  voteTimerSeconds: number,
  participantCount: number
): Promise<QuiplashAdvanceResult> {
  const answers = await loadRoundAnswers(supabase, roundId)
  if (answers.length === 0) {
    return endRoundAndAdvance(supabase, game, game.current_round_number)
  }
  if (answers.length === 1) {
    return handleSoloSubmitterRound(supabase, game, roundId, answers[0]!, participantCount)
  }

  const { battles } = await createQuiplashBattlesForRound(supabase, game.id, roundId, answers)
  const firstBattle = battles.find((b) => b.battle_number === 1)
  if (!firstBattle) {
    return endRoundAndAdvance(supabase, game, game.current_round_number)
  }

  const phase = await activateBattleWithAutoFinish(supabase, firstBattle, voteTimerSeconds, participantCount, roundId)
  return { ok: true, code: phase }
}

export async function syncQuiplashGameState(
  supabase: SupabaseClient,
  gameId: string,
  opts?: { force?: boolean }
): Promise<QuiplashAdvanceResult> {
  const { data: game } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle()
  if (!game) return { ok: false, code: 'game_not_found' }
  if (!isQuiplashGame(parseGameType(game.game_type))) return { ok: false, code: 'not_quiplash' }
  if (game.status === 'finished') return { ok: true, code: 'already_done' }
  if (game.status !== 'active') return { ok: false, code: 'not_active' }

  const session = await loadSession(supabase, gameId)
  if (!session) return { ok: false, code: 'not_finished' }

  const activeRound = await loadActiveRound(supabase, gameId)
  if (!activeRound) {
    if (session.phase === 'finished') return { ok: true, code: 'already_done' }
    return { ok: true, code: 'not_finished' }
  }

  const participantCount = await countParticipants(supabase, gameId)
  const voteTimer = effectiveQuiplashVoteTimer(game.operative_timer_seconds, participantCount)

  if (session.phase === 'writing') {
    const answers = await loadRoundAnswers(supabase, activeRound.id)
    const allSubmitted = answers.length >= participantCount
    const timerDone = deadlinePassed(session.turn_deadline_at)

    if (!allSubmitted && !timerDone && !opts?.force) {
      return { ok: true, code: 'writing' }
    }

    return transitionWritingToBattles(supabase, game, activeRound.id, voteTimer, participantCount)
  }

  if (session.phase === 'voting') {
    const battleId = session.active_battle_id
    if (!battleId) return { ok: true, code: 'not_finished' }

    const { data: battle } = await supabase.from('quiplash_battles').select('*').eq('id', battleId).maybeSingle()
    if (!battle || battle.status !== 'active') return { ok: true, code: 'not_finished' }

    const votes = await loadBattleVotes(supabase, battleId)
    const answers = await loadRoundAnswers(supabase, activeRound.id)
    const votersNeeded = eligibleVotersForBattle(battle as QuiplashBattle, answers, participantCount)
    const allVoted = votersNeeded === 0 || votes.length >= votersNeeded
    const timerDone = deadlinePassed(session.turn_deadline_at)

    if (!allVoted && !timerDone && !opts?.force) {
      return { ok: true, code: 'voting' }
    }

    await finishBattle(supabase, battle as QuiplashBattle, votes)
    return { ok: true, code: 'reveal' }
  }

  if (session.phase === 'reveal') {
    if (!deadlinePassed(session.turn_deadline_at) && !opts?.force) {
      return { ok: true, code: 'reveal_pending' }
    }

    const battles = await loadRoundBattles(supabase, activeRound.id)
    const nextBattle = battles.find((b) => b.status === 'pending')
    if (nextBattle) {
      const phase = await activateBattleWithAutoFinish(
        supabase,
        nextBattle,
        voteTimer,
        participantCount,
        activeRound.id
      )
      return { ok: true, code: phase }
    }

    if (activeRound.ended_at && revealPending(activeRound.ended_at) && !opts?.force) {
      return { ok: true, code: 'reveal_pending' }
    }

    return endRoundAndAdvance(supabase, game, activeRound.round_number)
  }

  return { ok: true, code: 'not_finished' }
}
