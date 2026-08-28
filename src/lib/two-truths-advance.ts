import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import { isTwoTruthsGame, parseGameType } from '@/lib/game-types'
import { applyEliminationRule } from './elimination'
import type { EliminationConfig } from '@/types/elimination'
import { TTL_DEFAULT_TIMER, TTL_REVEAL_SECONDS } from '@/lib/two-truths'
import type { Game, Round, TtlGuessResult } from '@/types'

export type TtlAdvanceCode =
  | 'round_active'
  | 'ended_round'
  | 'synced_pointer'
  | 'advanced_next'
  | 'advanced_finish'
  | 'already_done'
  | 'game_not_found'
  | 'not_two_truths'
  | 'not_active'
  | 'reveal_pending'
  | 'not_finished'

export type TtlAdvanceResult = {
  ok: boolean
  code: TtlAdvanceCode
  nextRound?: number
}

async function countPlayers(supabase: SupabaseClient, gameId: string): Promise<number> {
  // Only participants guess — non-submitters are marked spectators at start, so a round
  // ends once every participating guesser has answered (don't wait on watch-only viewers).
  const { count } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .not('spectator', 'is', true)
    .eq('is_eliminated', false)
  return count ?? 0
}

async function countRoundGuesses(supabase: SupabaseClient, roundId: string): Promise<number> {
  const { count } = await supabase
    .from('ttl_guesses')
    .select('id', { count: 'exact', head: true })
    .eq('round_id', roundId)
  return count ?? 0
}

function timerExpired(game: Game, round: Round): boolean {
  if (!round.started_at) return false
  const timerMs = (game.timer_seconds ?? TTL_DEFAULT_TIMER) * 1000
  return Date.now() >= new Date(round.started_at).getTime() + timerMs
}

function revealPending(round: Round): boolean {
  if (!round.ended_at) return false
  const deadline = new Date(round.ended_at).getTime() + TTL_REVEAL_SECONDS * 1000
  return Date.now() < deadline
}

async function shouldEndActiveRound(
  supabase: SupabaseClient,
  game: Game,
  round: Round,
  playerCount: number
): Promise<boolean> {
  if (timerExpired(game, round)) return true
  const submitterId = round.submitter_player_id
  const guesserCount = Math.max(0, playerCount - (submitterId ? 1 : 0))
  if (guesserCount === 0) return true
  const guessCount = await countRoundGuesses(supabase, round.id)
  return guessCount >= guesserCount
}

/**
 * Every guess made on a round, shaped for `ttl_metadata.guesses`.
 *
 * `ttl_guesses.guessed_index / is_correct / points` are revoked from the anon role: a round
 * only ends once every guesser has answered, so those columns let players 2..n read the lie
 * off player 1's row before choosing. Clients therefore get the results from the round
 * metadata, written at the reveal moment — never from the guess rows.
 *
 * Returns null (not []) when the read itself fails: an unreadable result set must never be
 * published as "nobody guessed". Callers treat null as "do not reveal yet, retry".
 */
async function roundGuessResults(supabase: SupabaseClient, roundId: string): Promise<TtlGuessResult[] | null> {
  const { data, error } = await supabase
    .from('ttl_guesses')
    .select('id, player_id, guessed_index, is_correct, points')
    .eq('round_id', roundId)
    .order('guessed_at')
  if (error) {
    console.error('Failed to read guesses for TTL reveal:', error.message)
    return null
  }
  return (data ?? []).map((g) => ({
    id: g.id as string,
    player_id: g.player_id as string,
    guessed_index: g.guessed_index as number,
    is_correct: g.is_correct as boolean,
    points: g.points as number,
  }))
}

/**
 * Outcome of building a round's revealed metadata.
 *
 * The three cases are deliberately distinct, because they mean different things to the caller:
 *   - `ok`      — reveal it, folding `metadata` into the round.
 *   - `skip`    — this round has no TTL metadata object to fold into (not a TTL round, or the
 *                 metadata is malformed). Nothing to publish; the status flip may proceed.
 *   - `error`   — a read FAILED. Never flip the round on this: a transient error would finish
 *                 the round permanently with no lie and no results, with no way back.
 */
type TtlRevealOutcome = { status: 'ok'; metadata: Record<string, unknown> } | { status: 'skip' } | { status: 'error' }

/**
 * Build the round's REVEALED metadata: its statements, plus the lie (from the service-role-only
 * `ttl_round_lies` table) and everyone's guesses (from `ttl_guesses`).
 *
 * While a round is unrevealed its `ttl_metadata` deliberately carries neither — the metadata is
 * anon-readable (it's in ROUND_SELECT), so anything stored there is public from the moment the
 * round row exists.
 *
 * `knownMetadata` lets a caller that has already loaded `rounds.ttl_metadata` (i.e.
 * `revealFinishedTtlRounds`) skip the re-read; pass `undefined` to have it fetched here.
 */
async function revealedTtlMetadata(
  supabase: SupabaseClient,
  roundId: string,
  knownMetadata?: unknown
): Promise<TtlRevealOutcome> {
  let metadata = knownMetadata
  if (metadata === undefined) {
    const { data: round, error } = await supabase.from('rounds').select('ttl_metadata').eq('id', roundId).maybeSingle()
    if (error) {
      console.error('Failed to read round metadata for TTL reveal:', error.message)
      return { status: 'error' }
    }
    metadata = round?.ttl_metadata
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return { status: 'skip' }
  const revealed = { ...(metadata as Record<string, unknown>) }

  const { data: lieRow, error: lieError } = await supabase
    .from('ttl_round_lies')
    .select('lie_index')
    .eq('round_id', roundId)
    .maybeSingle()
  if (lieError) {
    console.error('Failed to read the hidden lie for TTL reveal:', lieError.message)
    return { status: 'error' }
  }
  if (lieRow && typeof lieRow.lie_index === 'number') {
    revealed.lie_index = lieRow.lie_index
  } else if (Array.isArray(revealed.statements) && typeof revealed.lie_index !== 'number') {
    // The row is genuinely absent, not unreadable — retrying cannot conjure it, and blocking
    // the transition forever would wedge the game on this round. Reveal what we have (the UI
    // highlights nothing rather than the wrong statement) and make the gap loud in the logs.
    console.error('TTL round revealed with no lie recorded in ttl_round_lies:', roundId)
  }

  const guesses = await roundGuessResults(supabase, roundId)
  if (!guesses) return { status: 'error' }
  revealed.guesses = guesses
  return { status: 'ok', metadata: revealed }
}

/**
 * Re-fold the guesses after the round has actually been closed.
 *
 * `endActiveRound` reads the guesses just BEFORE it flips the status, so a guess that lands in
 * that window would be scored by the server but missing from the published results. Once the
 * round is 'finished' the guess route refuses new rows, so a second read here is final. No-op
 * unless the count actually changed, to avoid a pointless realtime broadcast per round.
 */
async function reconcileRevealedGuesses(supabase: SupabaseClient, roundId: string): Promise<boolean> {
  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('ttl_metadata')
    .eq('id', roundId)
    .maybeSingle()
  if (roundError) return false
  const metadata = round?.ttl_metadata
  // Not a TTL round (or no metadata at all) — nothing to reconcile, and not a failure.
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return true
  const published = (metadata as Record<string, unknown>).guesses
  const results = await roundGuessResults(supabase, roundId)
  // Unreadable ≠ empty: leave the published results alone rather than blanking them — but report
  // it, so the round is retried instead of being left with a possibly-short guess list forever.
  if (!results) return false
  if (Array.isArray(published) && published.length === results.length) return true
  const { error: updateError } = await supabase
    .from('rounds')
    .update({ ttl_metadata: { ...(metadata as Record<string, unknown>), guesses: results } })
    .eq('id', roundId)
  return !updateError
}

/**
 * Fold the lie AND the guesses into every finished round of a game that is still missing them.
 *
 * The normal reveal happens inside `endActiveRound`, atomically with the status flip. This is
 * for paths that finish rounds generically without going through it — today that is the admin
 * kill-switch for stale games (`adminEndGame`), which bulk-updates active rounds to finished.
 * Without this, the last round of an admin-ended game would render with no lie highlighted and
 * no results, because both now live outside the anon-readable metadata (`ttl_round_lies` and
 * the redacted `ttl_guesses` columns).
 */
export async function revealFinishedTtlRounds(supabase: SupabaseClient, gameId: string): Promise<boolean> {
  const { data: rounds, error: roundsError } = await supabase
    .from('rounds')
    .select('id, ttl_metadata')
    .eq('game_id', gameId)
    .eq('status', 'finished')

  // A failed select yields no rows, which is indistinguishable from "nothing to reveal" once it
  // reaches `rounds ?? []` — the loop would not run and this would report success, letting the
  // caller finish the game and lock out every retry. Unreadable is not the same as empty.
  if (roundsError) return false

  let allRevealed = true
  for (const round of rounds ?? []) {
    const metadata = round.ttl_metadata as Record<string, unknown> | null
    // Not a TTL round — nothing to fold in.
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) continue
    if (!Array.isArray(metadata.statements)) continue
    // Has a lie AND a guess list — but "has a list" is not "has the WHOLE list". A guess that
    // landed between endActiveRound's read and its status flip is scored server-side yet missing
    // from the published array, and skipping on shape alone meant this backfill could never
    // repair it. Reconcile compares the published length against the real count and is a no-op
    // when they already agree, so this costs one read per already-revealed round.
    if (typeof metadata.lie_index === 'number' && Array.isArray(metadata.guesses)) {
      if (!(await reconcileRevealedGuesses(supabase, round.id))) allRevealed = false
      continue
    }

    // The metadata is already in hand from the select above — pass it in rather than making
    // `revealedTtlMetadata` re-read the same row.
    const revealed = await revealedTtlMetadata(supabase, round.id, metadata)
    // FAILS CLOSED, like endActiveRound. A read failure here used to be swallowed: the caller
    // finished the game anyway, and because adminEndGame rejects a game that is already finished,
    // the round was left permanently with no lie_index and no guesses. Report it instead so the
    // game stays endable and a retry can publish the reveal.
    if (revealed.status === 'error') {
      allRevealed = false
      continue
    }
    if (revealed.status === 'ok') {
      const { error } = await supabase.from('rounds').update({ ttl_metadata: revealed.metadata }).eq('id', round.id)
      if (error) allRevealed = false
    }
  }
  return allRevealed
}

/**
 * End the active round — which is also the REVEAL moment (the client shows the lie and
 * everyone's results once the round's screen is 'revealed'/'finished').
 *
 * The lie AND the guesses are folded into `ttl_metadata` in the SAME update that flips the
 * status, so there is never a window where either is readable before the round ends, nor one
 * where the round reads as revealed but has nothing to show. The `.eq('status', 'active')`
 * guard keeps that a single atomic, idempotent transition; the reconcile afterwards picks up
 * any guess that landed while the transition was in flight.
 *
 * FAILS CLOSED: if the lie or the guesses cannot be READ, the round is left active and this
 * returns false. The caller then reports `round_active`, so the next advance poll (every client
 * polls the deadline) retries — instead of finishing the round forever with no lie to show.
 */
async function endActiveRound(supabase: SupabaseClient, roundId: string): Promise<boolean> {
  const now = new Date().toISOString()
  const revealed = await revealedTtlMetadata(supabase, roundId)
  if (revealed.status === 'error') return false
  const update: Record<string, unknown> = { status: 'finished', ended_at: now }
  if (revealed.status === 'ok') update.ttl_metadata = revealed.metadata

  const { data, error } = await supabase
    .from('rounds')
    .update(update)
    .eq('id', roundId)
    .eq('status', 'active')
    .select('id')
    .maybeSingle()
  if (error || !data) return false

  // The boolean is deliberately ignored here: the round HAS ended, and returning false would
  // report `round_active` to a caller that then retries endActiveRound — which can only fail
  // from now on, because its `.eq('status', 'active')` guard no longer matches. A short guess
  // list is instead repaired by revealFinishedTtlRounds, which no longer skips a round just
  // because it already has a guesses array.
  if (revealed.status === 'ok') await reconcileRevealedGuesses(supabase, roundId)
  return true
}

async function syncGamePointer(supabase: SupabaseClient, gameId: string, roundNumber: number): Promise<boolean> {
  const { error } = await supabase.from('games').update({ current_round_number: roundNumber }).eq('id', gameId)
  return !error
}

async function activateRound(supabase: SupabaseClient, roundId: string): Promise<boolean> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('rounds')
    .update({ status: 'active', started_at: now, ended_at: null })
    .eq('id', roundId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  return !error && !!data
}

export async function syncTwoTruthsGameState(
  supabase: SupabaseClient,
  gameId: string,
  opts?: { force?: boolean }
): Promise<TtlAdvanceResult> {
  const { data: game } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle()
  if (!game) return { ok: false, code: 'game_not_found' }
  if (!isTwoTruthsGame(parseGameType(game.game_type))) return { ok: false, code: 'not_two_truths' }
  if (game.status === 'finished') return { ok: true, code: 'already_done' }
  if (game.status !== 'active') return { ok: false, code: 'not_active' }

  const { data: rounds } = await supabase.from('rounds').select('*').eq('game_id', gameId).order('round_number')

  const roundList = rounds ?? []
  const activeRound = roundList.find((r) => r.status === 'active') ?? null
  const pointerRound = roundList.find((r) => r.round_number === game.current_round_number) ?? null

  if (pointerRound && pointerRound.status === 'finished' && revealPending(pointerRound) && !opts?.force) {
    return { ok: true, code: 'reveal_pending' }
  }

  if (activeRound) {
    const playerCount = await countPlayers(supabase, gameId)
    if (await shouldEndActiveRound(supabase, game, activeRound, playerCount)) {
      const ended = await endActiveRound(supabase, activeRound.id)
      if (!ended) return { ok: true, code: 'round_active' }
      return { ok: true, code: 'ended_round' }
    }
    return { ok: true, code: 'round_active' }
  }

  const lastFinished = [...roundList].reverse().find((r) => r.status === 'finished') ?? null
  if (lastFinished && revealPending(lastFinished) && !opts?.force) {
    return { ok: true, code: 'reveal_pending' }
  }

  if (pointerRound && pointerRound.status === 'finished') {
    // Retry the reconcile on the advance path.
    //
    // endActiveRound reconciles once, immediately after flipping the status, and deliberately
    // ignores the result (returning false there would report round_active to a caller that then
    // retries endActiveRound, which can only fail once its `.eq('status','active')` guard stops
    // matching). But a transient failure there had nothing to pick it up: normal polls waited out
    // the reveal deadline and advanced, and revealFinishedTtlRounds only runs from adminEndGame.
    // A short `ttl_metadata.guesses` was therefore permanent in normal play, and unreadable —
    // guessed_index/is_correct/points are revoked from anon, so the published copy is all there is.
    //
    // This path runs on every poll until the next round activates, so a transient failure is
    // retried by the following poll. It is a no-op once the published count matches, which is the
    // usual case, so the steady-state cost is one comparison per advance.
    await reconcileRevealedGuesses(supabase, pointerRound.id)

    // Elimination hook: run before isLast so final-round eliminations are recorded
    const { data: gameForElim, error: elimConfigError } = await supabase
      .from('games')
      .select('elimination_config')
      .eq('id', gameId)
      .maybeSingle()
    if (elimConfigError) {
      console.error('Failed to load elimination config:', elimConfigError.message)
    }

    if (gameForElim?.elimination_config) {
      const elimConfig = gameForElim.elimination_config as EliminationConfig
      const result = await applyEliminationRule(supabase, gameId, 'two-truths', pointerRound.round_number, elimConfig)
      if (result.gameFinished) {
        const { error: finishError } = await markGameFinished(supabase, gameId)
        if (finishError) console.error('Failed to mark game finished after elimination:', finishError)
        return { ok: true, code: 'advanced_finish' }
      }
    }

    const isLast = pointerRound.round_number >= game.rounds_count
    if (isLast) {
      const { error: finishError } = await markGameFinished(supabase, gameId)
      if (finishError) console.error('Failed to mark game finished:', finishError)
      return { ok: true, code: 'advanced_finish' }
    }

    const nextRound = roundList.find((r) => r.round_number === pointerRound.round_number + 1)
    if (!nextRound) return { ok: false, code: 'not_finished' }

    // Skip eliminated submitters
    if (nextRound.submitter_player_id) {
      const { data: submitter } = await supabase
        .from('players')
        .select('is_eliminated')
        .eq('id', nextRound.submitter_player_id)
        .maybeSingle()

      if (submitter?.is_eliminated) {
        // Find the next non-eliminated round in sequence
        const laterRounds = roundList
          .filter((r) => r.round_number > pointerRound.round_number)
          .sort((a, b) => a.round_number - b.round_number)

        let replacement: typeof nextRound | undefined
        for (const r of laterRounds) {
          if (!r.submitter_player_id) continue
          const { data: sub } = await supabase
            .from('players')
            .select('is_eliminated')
            .eq('id', r.submitter_player_id)
            .maybeSingle()
          if (!sub?.is_eliminated) {
            replacement = r
            break
          }
        }

        if (!replacement) {
          const { error: finishError } = await markGameFinished(supabase, gameId)
          if (finishError) console.error('Failed to mark game finished after elimination:', finishError)
          return { ok: true, code: 'advanced_finish' }
        }

        const activated = await activateRound(supabase, replacement.id)
        if (!activated) return { ok: false, code: 'not_finished' }
        await syncGamePointer(supabase, gameId, replacement.round_number)
        return { ok: true, code: 'advanced_next', nextRound: replacement.round_number }
      }
    }

    const activated = await activateRound(supabase, nextRound.id)
    if (!activated) return { ok: false, code: 'not_finished' }
    await syncGamePointer(supabase, gameId, nextRound.round_number)
    return { ok: true, code: 'advanced_next', nextRound: nextRound.round_number }
  }

  if (pointerRound && pointerRound.status === 'pending') {
    const activated = await activateRound(supabase, pointerRound.id)
    if (activated) return { ok: true, code: 'synced_pointer' }
  }

  return { ok: true, code: 'not_finished' }
}
