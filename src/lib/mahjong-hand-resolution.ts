import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import { mahjongRulesetConfig, parseMahjongRuleset } from '@/lib/mahjong-rulesets'
import { isTerminalOrHonor, rankedScoreEntries, ruleOptionsForSession } from '@/lib/mahjong-core'
import { isClosedHand, isTenpai, type MahjongWinAnalysis } from '@/lib/mahjong-hand'
import { buildMahjongScoreSummary, buildRiichiPayments, dealerPlayerId } from '@/lib/mahjong-scoring'
import { playerName, turnDistanceAfterDiscard } from '@/lib/mahjong-session'
import type {
  MahjongPlayerState,
  MahjongRuleset,
  MahjongScorePayment,
  MahjongScoreSummary,
  MahjongSeat,
  MahjongSession,
  MahjongWinType,
  Player,
} from '@/types'

const MAHJONG_CONFLICT_ERROR = 'Mahjong table changed; please retry'

// ── Per-game (per-MATCH) trophy counters ────────────────────────────────────────────────────
// `mahjong_player_state.game_counters` (migration 20260812030000) is a scratch blob that must
// SURVIVE `processMahjongNextHand`'s per-hand wipe, because a Mahjong match is many hands and
// per-hand melds/winner/score are erased each hand. It is bumped here AT HAND RESOLUTION and in
// the play routes (src/lib/mahjong.ts), then folded into lifetime trophy counters at match
// finish by src/lib/trophies/game-facts/mahjong.ts. Everything here is ADDITIVE — it changes no
// scoring, payment, or hand logic; it only records what already happened. See the migration
// header for the full field list and the preservation contract.

export type MahjongCounters = Record<string, number>

/** Read the trophy counter blob off a state row (column added by 20260812030000). */
export function mahjongGameCounters(state: Pick<MahjongPlayerState, 'id'>): MahjongCounters {
  const raw = (state as unknown as { game_counters?: unknown }).game_counters
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as MahjongCounters) } : {}
}

/** A NEW blob with the given integer deltas added (additive; a missing key counts as 0). */
export function bumpMahjongCounters(base: MahjongCounters, deltas: MahjongCounters): MahjongCounters {
  const next: MahjongCounters = { ...base }
  for (const [key, delta] of Object.entries(deltas)) next[key] = (next[key] ?? 0) + delta
  return next
}

/**
 * The "High Fan" bar, per ruleset — fan/point scales are NOT comparable across rulesets (a
 * Riichi han, a Hong Kong faan, an MCR point and a Simple fan measure different things), so one
 * global number would be meaningless. Each is set at roughly the "big hand" tier for its scale:
 *   fate_round 6 (Simple base 1 + several patterns)   hong_kong 8 (comfortably past the low limit)
 *   riichi     6 (Haneman and above)                  mcr       40 (a heavyweight MCR hand)
 */
function mahjongHighFanBar(ruleset: MahjongRuleset): number {
  switch (ruleset) {
    case 'hong_kong':
      return 8
    case 'mcr':
      return 40
    case 'riichi':
      return 6
    default:
      return 6
  }
}

/** The trophy deltas earned by one winning hand, derived from the already-computed win. */
function mahjongWinCounterDeltas(opts: {
  winnerState: MahjongPlayerState
  analysis: MahjongWinAnalysis
  winType: MahjongWinType
  ruleset: MahjongRuleset
  session: MahjongSession
  fan: number
}): MahjongCounters {
  const { winnerState, analysis, winType, ruleset, session, fan } = opts
  const melds = winnerState.melds ?? []
  const deltas: MahjongCounters = { mahjong_hands_won: 1 }
  if (winType === 'self_draw') deltas.mahjong_self_draw_wins = 1
  if (analysis.pattern === 'seven_pairs') deltas.mahjong_seven_pairs_wins = 1
  if (analysis.pattern === 'thirteen_orphans') deltas.mahjong_thirteen_orphans_wins = 1
  const closed = isClosedHand(melds)
  if (closed) deltas.mahjong_concealed_wins = 1
  // "Clean hand" — no meld was claimed from an opponent's discard (self concealed/added kongs,
  // which carry no `from_player_id`, still count as a clean hand).
  if (melds.every((meld) => !meld.from_player_id)) deltas.mahjong_no_call_wins = 1
  // Per-ruleset win flag. `mahjong_won_mcr` / `mahjong_won_fate_round` have no single-counter
  // trophy today; they exist so "win under all four rulesets" can be assembled once the distinct
  // set is wired (see game-facts/mahjong.ts + the report). Keys resolve to mahjong_won_<ruleset>.
  deltas[`mahjong_won_${ruleset}`] = 1
  // Exposed melds in the winning hand — three (Silver) and the fuller four (Gold). Melds a hand
  // did NOT win with are wiped, so this is scoped to the winning hand rather than the match.
  const exposedMelds = melds.length
  if (exposedMelds >= 3) deltas.mahjong_triple_meld = 1
  if (exposedMelds >= 4) deltas.mahjong_four_melds = 1
  if (melds.filter((meld) => meld.type === 'kong').length >= 2) deltas.mahjong_double_kong = 1
  // Grand Slam: a fully concealed standard (four-meld) win — the four-meld sibling of a plain
  // concealed win, which also fires for seven pairs / thirteen orphans.
  if (analysis.pattern === 'standard' && closed) deltas.mahjong_grand_slam = 1
  // Quick Hand: won with ten or fewer tiles on the table (a very fast hand).
  if ((session.discard_pile?.length ?? 0) <= 10) deltas.mahjong_quick_hand = 1
  if (fan >= mahjongHighFanBar(ruleset)) deltas.mahjong_high_fan = 1
  // Heavenly Hand is Riichi-only (Tenhou): the dealer self-draws on the opening hand, before any
  // discard has hit the table.
  if (
    ruleset === 'riichi' &&
    winType === 'self_draw' &&
    dealerPlayerId(session) === winnerState.player_id &&
    (session.discard_pile?.length ?? 0) === 0
  ) {
    deltas.mahjong_heavenly_hand = 1
  }
  return deltas
}

/**
 * Credit one winner's per-match counters for the hand they just won.
 *
 * Also advances the consecutive-hand-win streak (Table Sweep): the winner's run grows by one and
 * the match's best run is remembered. Non-winners' runs are reset to zero when the NEXT hand is
 * dealt (`processMahjongNextHand`), which reads this hand's result — so a run only survives while
 * the same player keeps winning, and this credit still lands for the final hand of a match, which
 * has no next-hand. Best-effort: a failure here must never turn a real win into an error.
 */
async function creditMahjongHandWin(
  supabase: SupabaseClient,
  opts: {
    winnerState: MahjongPlayerState
    analysis: MahjongWinAnalysis
    winType: MahjongWinType
    ruleset: MahjongRuleset
    session: MahjongSession
    fan: number
  }
): Promise<void> {
  const base = mahjongGameCounters(opts.winnerState)
  const next = bumpMahjongCounters(base, mahjongWinCounterDeltas(opts))
  const streak = (base.mahjong_win_streak ?? 0) + 1
  next.mahjong_win_streak = streak
  next.mahjong_win_streak_max = Math.max(base.mahjong_win_streak_max ?? 0, streak)
  await supabase.from('mahjong_player_state').update({ game_counters: next }).eq('id', opts.winnerState.id)
}

/** Credit every seated player for reaching the end of the wall (Wall Watcher). */
async function creditMahjongExhaustiveDraw(supabase: SupabaseClient, states: MahjongPlayerState[]): Promise<void> {
  await Promise.all(
    states.map(async (state) => {
      // RE-READ before bumping. The in-memory `state` predates the discard counter increment this
      // same turn wrote to the row (a discard folds `mahjong_discards` into its own update), so
      // bumping the stale blob and writing it back would clobber that discard. Read the current
      // blob, add the exhaustive-draw credit to it, write once.
      const { data } = await supabase
        .from('mahjong_player_state')
        .select('game_counters')
        .eq('id', state.id)
        .maybeSingle()
      const current = mahjongGameCounters((data ?? state) as MahjongPlayerState)
      await supabase
        .from('mahjong_player_state')
        .update({ game_counters: bumpMahjongCounters(current, { mahjong_exhaustive_draws_seen: 1 }) })
        .eq('id', state.id)
    })
  )
}

async function persistMahjongSession(
  supabase: SupabaseClient,
  gameId: string,
  patch: Partial<MahjongSession>,
  expectedUpdatedAt?: string
): Promise<{ error?: string; updatedAt?: string }> {
  let query = supabase
    .from('mahjong_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('game_id', gameId)
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt)
  const { data, error } = await query.select('game_id, updated_at')
  if (error) return { error: error.message }
  if (expectedUpdatedAt && (data?.length ?? 0) === 0) return { error: MAHJONG_CONFLICT_ERROR }
  return { updatedAt: data?.[0]?.updated_at as string | undefined }
}

function buildExhaustiveDrawSummary(session: MahjongSession, states: MahjongPlayerState[]): MahjongScoreSummary | null {
  const tenpai = states.filter((state) => isTenpai(state.hand, state.melds))
  if (tenpai.length === 0 || tenpai.length === states.length) return null
  const noten = states.filter((state) => !tenpai.some((row) => row.player_id === state.player_id))
  const total = 3000
  const gain = Math.floor(total / tenpai.length)
  const loss = Math.floor(total / noten.length)
  return {
    ruleset: parseMahjongRuleset(session.ruleset),
    pattern: 'standard',
    fan: 0,
    fu: null,
    base_points: 0,
    total_points: total,
    lines: [{ label: 'Exhaustive draw tenpai payments', fan: 0 }],
    payments: [
      ...tenpai.map((state) => ({ player_id: state.player_id, delta: gain, reason: 'Tenpai at exhaustive draw' })),
      ...noten.map((state) => ({ player_id: state.player_id, delta: -loss, reason: 'Noten at exhaustive draw' })),
    ],
    payer_player_id: null,
  }
}

function buildNagashiManganSummary(session: MahjongSession, states: MahjongPlayerState[]): MahjongScoreSummary | null {
  if (parseMahjongRuleset(session.ruleset) !== 'riichi' || !ruleOptionsForSession(session).nagashiMangan) return null
  const claimedDiscardIndexes = new Set(
    session.discard_pile.flatMap((discard, index) => (discard.claimed_by_player_id ? [index] : []))
  )
  const winners = states.filter((state) => {
    if (state.discarded.length === 0) return false
    const ownDiscardIndexes = session.discard_pile.flatMap((discard, index) =>
      discard.player_id === state.player_id ? [index] : []
    )
    return (
      ownDiscardIndexes.every((index) => !claimedDiscardIndexes.has(index)) &&
      state.discarded.every((tile) => isTerminalOrHonor(tile))
    )
  })
  if (winners.length === 0) return null

  const payments = new Map<string, MahjongScorePayment>()
  for (const winner of winners) {
    const manganPayments = buildRiichiPayments({
      winnerId: winner.player_id,
      winType: 'self_draw',
      turnOrder: session.turn_order,
      session: { ...session, riichi_sticks: 0 },
      basePoints: 2000,
      riichiSticks: 0,
    })
    for (const payment of manganPayments) {
      const existing = payments.get(payment.player_id)
      payments.set(payment.player_id, {
        player_id: payment.player_id,
        delta: (existing?.delta ?? 0) + payment.delta,
        reason: existing ? `${existing.reason}; Nagashi Mangan` : 'Nagashi Mangan',
      })
    }
  }
  const stickWinner = winners[0]
  if (stickWinner && (session.riichi_sticks ?? 0) > 0) {
    const existing = payments.get(stickWinner.player_id)
    payments.set(stickWinner.player_id, {
      player_id: stickWinner.player_id,
      delta: (existing?.delta ?? 0) + (session.riichi_sticks ?? 0) * 1000,
      reason: existing ? `${existing.reason}; Riichi sticks` : 'Riichi sticks',
    })
  }

  return {
    ruleset: 'riichi',
    pattern: 'standard',
    fan: 5,
    yaku_fan: 5,
    yakuman: 0,
    limit: 'Mangan',
    fu: null,
    base_points: 2000,
    total_points: [...payments.values()]
      .filter((payment) => winners.some((winner) => winner.player_id === payment.player_id))
      .reduce((sum, payment) => sum + payment.delta, 0),
    lines: [{ label: 'Nagashi Mangan', fan: 5 }],
    payments: [...payments.values()],
    payer_player_id: null,
    winner_player_ids: winners.map((winner) => winner.player_id),
    honba: session.honba ?? 0,
    riichi_sticks: session.riichi_sticks ?? 0,
  }
}

export function applyMahjongPayments(
  scores: Record<string, number> | undefined,
  payments: MahjongScoreSummary['payments']
) {
  const next = { ...(scores ?? {}) }
  for (const payment of payments) {
    next[payment.player_id] = (next[payment.player_id] ?? 0) + payment.delta
  }
  return next
}

function isRiichiFinalScheduledHand(session: MahjongSession): boolean {
  const options = ruleOptionsForSession(session)
  const finalWind: MahjongSeat = options.matchLength === 'east' ? 'east' : 'south'
  return (
    parseMahjongRuleset(session.ruleset) === 'riichi' &&
    session.round_wind === finalWind &&
    (session.hand_number ?? 1) >= 4
  )
}

export function dealerRepeatsAfterHand(session: MahjongSession): boolean {
  const dealerId = dealerPlayerId(session)
  const winnerIds = session.winner_player_ids?.length
    ? session.winner_player_ids
    : session.winner_player_id
      ? [session.winner_player_id]
      : []
  if (dealerId && winnerIds.includes(dealerId)) return true
  if (winnerIds.length === 0 && session.hand_result === 'exhaustive_draw') {
    return !!dealerId && (session.exhaustive_draw_tenpai_player_ids ?? []).includes(dealerId)
  }
  if (session.hand_result === 'abortive_draw') return true
  if (session.hand_result === 'chombo') return true
  return false
}

function shouldFinishMahjongMatch(session: MahjongSession, scores: Record<string, number>): boolean {
  const ruleset = parseMahjongRuleset(session.ruleset)
  if (ruleset !== 'riichi') return false
  const options = ruleOptionsForSession(session)
  if (options.bankruptcyEndsMatch && Object.values(scores).some((score) => score < 0)) return true
  if (!isRiichiFinalScheduledHand(session)) return false

  const ranked = rankedScoreEntries(scores, session.turn_order)
  const leader = ranked[0]
  if (!leader || leader.score < options.returnScore) return false

  const dealerId = dealerPlayerId(session)
  const dealerIsLeader = dealerId === leader.playerId
  if (dealerRepeatsAfterHand(session)) return options.agariYame && dealerIsLeader
  return true
}

function applyMahjongMatchSettlement(
  session: MahjongSession,
  scores: Record<string, number>,
  payments: MahjongScorePayment[]
): { scores: Record<string, number>; payments: MahjongScorePayment[] } {
  if (parseMahjongRuleset(session.ruleset) !== 'riichi') return { scores, payments }
  const options = ruleOptionsForSession(session)
  const ranked = rankedScoreEntries(scores, session.turn_order)
  if (ranked.length !== 4) return { scores, payments }

  const settlementPayments: MahjongScorePayment[] = []
  const nextScores = { ...scores }
  ranked.forEach((entry, index) => {
    const uma = options.uma[index] ?? 0
    const oka = options.okaEnabled && index === 0 ? (options.returnScore - options.startingScore) * ranked.length : 0
    const delta = uma + oka
    if (delta !== 0) {
      nextScores[entry.playerId] = (nextScores[entry.playerId] ?? 0) + delta
      settlementPayments.push({
        player_id: entry.playerId,
        delta,
        reason: index === 0 && oka ? 'Final uma/oka settlement' : 'Final uma settlement',
      })
    }
  })

  return { scores: nextScores, payments: [...payments, ...settlementPayments] }
}

export async function maybeFinishMahjongMatch(
  supabase: SupabaseClient,
  gameId: string,
  session: MahjongSession,
  scores: Record<string, number>,
  now: string
): Promise<{ scores: Record<string, number>; payments: MahjongScorePayment[]; gameFinishError?: string }> {
  if (!shouldFinishMahjongMatch(session, scores)) return { scores, payments: [] }
  const settlement = applyMahjongMatchSettlement(session, scores, [])
  const finish = await markGameFinished(supabase, gameId, now)
  return { scores: settlement.scores, payments: settlement.payments, gameFinishError: finish.error?.message }
}

export async function finishWallDraw(
  supabase: SupabaseClient,
  gameId: string,
  session?: MahjongSession,
  states: MahjongPlayerState[] = []
): Promise<{ error?: string }> {
  const now = new Date().toISOString()
  const tenpaiIds = states.filter((state) => isTenpai(state.hand, state.melds)).map((state) => state.player_id)
  const nagashiSummary = session ? buildNagashiManganSummary(session, states) : null
  const drawSummary = nagashiSummary ?? (session ? buildExhaustiveDrawSummary(session, states) : null)
  const drawScores = drawSummary ? applyMahjongPayments(session?.scores, drawSummary.payments) : (session?.scores ?? {})
  const winnerIds = nagashiSummary?.winner_player_ids ?? []
  const resultSession = session
    ? {
        ...session,
        hand_result: nagashiSummary ? ('win' as const) : ('exhaustive_draw' as const),
        winner_player_id: winnerIds[0] ?? null,
        winner_player_ids: winnerIds,
        exhaustive_draw_tenpai_player_ids: tenpaiIds,
      }
    : null
  const matchFinish = resultSession
    ? await maybeFinishMahjongMatch(supabase, gameId, resultSession, drawScores, now)
    : { scores: drawScores, payments: [] }
  if (matchFinish.gameFinishError) return { error: matchFinish.gameFinishError }
  const finalSummary =
    drawSummary || matchFinish.payments.length === 0
      ? drawSummary
        ? { ...drawSummary, payments: [...drawSummary.payments, ...matchFinish.payments] }
        : null
      : ({
          ruleset: parseMahjongRuleset(session?.ruleset),
          pattern: 'standard',
          fan: 0,
          fu: null,
          base_points: 0,
          total_points: 0,
          lines: [{ label: 'Final match settlement', fan: 0 }],
          payments: matchFinish.payments,
          payer_player_id: null,
        } satisfies MahjongScoreSummary)
  const sessionWrite = await persistMahjongSession(
    supabase,
    gameId,
    {
      phase: 'finished',
      hand_result: nagashiSummary ? 'win' : 'exhaustive_draw',
      status_message: nagashiSummary
        ? `Nagashi Mangan — ${winnerIds.length} player${winnerIds.length === 1 ? '' : 's'}`
        : tenpaiIds.length > 0
          ? `The wall is empty — ${tenpaiIds.length} player(s) tenpai`
          : 'The wall is empty — draw game',
      winner_player_id: winnerIds[0] ?? null,
      winning_tile: null,
      win_type: nagashiSummary ? 'self_draw' : null,
      exhaustive_draw_tenpai_player_ids: tenpaiIds,
      score_summary: finalSummary,
      scores: matchFinish.scores,
      winner_player_ids: winnerIds,
      riichi_sticks: nagashiSummary ? 0 : (session?.riichi_sticks ?? 0),
      turn_deadline_at: null,
    },
    session?.updated_at
  )
  // The wall ran out with everyone still in the hand — credit Wall Watcher to all seated players.
  // (Nagashi Mangan reaches here too and its winners are not credited to the hand-win trophies;
  // it is a rare special ruling, noted in the report.)
  if (!sessionWrite.error && states.length > 0) await creditMahjongExhaustiveDraw(supabase, states)
  return { error: sessionWrite.error }
}

export async function finishAbortiveDraw(
  supabase: SupabaseClient,
  gameId: string,
  reason: string,
  session: MahjongSession,
  states: MahjongPlayerState[]
): Promise<{ error?: string }> {
  const now = new Date().toISOString()
  const tenpaiIds = states.filter((state) => isTenpai(state.hand, state.melds)).map((state) => state.player_id)
  const resultSession = {
    ...session,
    hand_result: 'abortive_draw' as const,
    winner_player_id: null,
    winner_player_ids: [],
    exhaustive_draw_tenpai_player_ids: tenpaiIds,
  }
  const matchFinish = await maybeFinishMahjongMatch(supabase, gameId, resultSession, session.scores ?? {}, now)
  if (matchFinish.gameFinishError) return { error: matchFinish.gameFinishError }
  const scoreSummary =
    matchFinish.payments.length > 0
      ? ({
          ruleset: parseMahjongRuleset(session.ruleset),
          pattern: 'standard',
          fan: 0,
          fu: null,
          base_points: 0,
          total_points: 0,
          lines: [{ label: 'Final match settlement', fan: 0 }],
          payments: matchFinish.payments,
          payer_player_id: null,
        } satisfies MahjongScoreSummary)
      : null
  return persistMahjongSession(
    supabase,
    gameId,
    {
      phase: 'finished',
      hand_result: 'abortive_draw',
      status_message: reason,
      winner_player_id: null,
      winner_player_ids: [],
      winning_tile: null,
      win_type: null,
      exhaustive_draw_tenpai_player_ids: tenpaiIds,
      score_summary: scoreSummary,
      scores: matchFinish.scores,
      turn_deadline_at: null,
    },
    session.updated_at
  )
}

export function riichiAbortiveDrawReason(session: MahjongSession, states: MahjongPlayerState[]): string | null {
  if (parseMahjongRuleset(session.ruleset) !== 'riichi') return null
  if (!ruleOptionsForSession(session).abortiveDraws) return null

  const firstDiscards = states.map((state) => state.discarded[0]).filter(Boolean)
  if (
    firstDiscards.length === 4 &&
    firstDiscards.every((tile) => tile === firstDiscards[0]) &&
    ['we', 'ws', 'ww', 'wn'].includes(firstDiscards[0] ?? '')
  ) {
    return 'Abortive draw — four players discarded the same wind first'
  }

  if (states.length === 4 && states.every((state) => state.riichi_declared)) {
    return 'Abortive draw — all four players declared Riichi'
  }

  const kongCount = states.reduce((sum, state) => sum + state.melds.filter((meld) => meld.type === 'kong').length, 0)
  if (kongCount >= 4) return 'Abortive draw — four Kans'

  return null
}

export async function finishMahjongWin(
  supabase: SupabaseClient,
  opts: {
    gameId: string
    winnerPlayerId: string
    winningTile: string | null
    winType: 'self_draw' | 'discard'
    players: Pick<Player, 'id' | 'name'>[]
    winnerState: MahjongPlayerState
    winTiles: string[]
    analysis: MahjongWinAnalysis
    ruleset: MahjongRuleset
    session: MahjongSession
    turnOrder: string[]
    fromPlayerId?: string | null
  }
): Promise<{ error?: string }> {
  const now = new Date().toISOString()
  const scoreSummary = buildMahjongScoreSummary({
    winnerState: opts.winnerState,
    winTiles: opts.winTiles,
    analysis: opts.analysis,
    winType: opts.winType,
    ruleset: opts.ruleset,
    session: opts.session,
    fromPlayerId: opts.fromPlayerId,
    turnOrder: opts.turnOrder,
    winningTile: opts.winningTile,
  })
  const cfg = mahjongRulesetConfig(opts.ruleset)
  const options = ruleOptionsForSession(opts.session)
  const minimumFan = opts.ruleset === 'hong_kong' ? options.hongKongMinimumFan : cfg.minimumFan
  const minimumPoints = opts.ruleset === 'mcr' ? options.mcrMinimumPoints : cfg.minimumPoints
  const qualifyingScore = scoreSummary.yaku_fan ?? scoreSummary.fan
  if (qualifyingScore < minimumFan) {
    return { error: `${cfg.label} requires at least ${minimumFan} fan to win` }
  }
  if (qualifyingScore < minimumPoints) {
    return { error: `${cfg.label} requires at least ${minimumPoints} points to win` }
  }
  if (opts.ruleset === 'riichi' && (scoreSummary.yaku_fan ?? 0) <= 0 && (scoreSummary.yakuman ?? 0) <= 0) {
    return { error: 'Riichi requires at least one yaku; dora alone cannot win' }
  }
  const handScores = applyMahjongPayments(opts.session.scores, scoreSummary.payments)
  const resultSession: MahjongSession = {
    ...opts.session,
    hand_result: 'win',
    winner_player_id: opts.winnerPlayerId,
    winner_player_ids: [opts.winnerPlayerId],
  }
  const matchFinish = await maybeFinishMahjongMatch(supabase, opts.gameId, resultSession, handScores, now)
  if (matchFinish.gameFinishError) return { error: matchFinish.gameFinishError }
  const finalScoreSummary: MahjongScoreSummary =
    matchFinish.payments.length > 0
      ? {
          ...scoreSummary,
          payments: [...scoreSummary.payments, ...matchFinish.payments],
          lines: [...scoreSummary.lines, { label: 'Final match settlement', fan: 0 }],
        }
      : scoreSummary
  const sessionWrite = await persistMahjongSession(
    supabase,
    opts.gameId,
    {
      phase: 'finished',
      hand_result: 'win',
      status_message: `${playerName(opts.players, opts.winnerPlayerId)} wins by ${
        opts.winType === 'self_draw' ? 'self draw' : 'discard'
      }`,
      winner_player_id: opts.winnerPlayerId,
      winner_player_ids: [opts.winnerPlayerId],
      winning_tile: opts.winningTile,
      win_type: opts.winType,
      discard_pile: opts.session.discard_pile,
      score_summary: finalScoreSummary,
      scores: matchFinish.scores,
      riichi_sticks: opts.ruleset === 'riichi' ? 0 : (opts.session.riichi_sticks ?? 0),
      turn_deadline_at: null,
    },
    opts.session.updated_at
  )
  // Credit the win's per-match trophy counters only once the win is durably recorded — a lost
  // CAS race means another request already resolved this hand, and must not double-count.
  if (!sessionWrite.error) {
    await creditMahjongHandWin(supabase, {
      winnerState: opts.winnerState,
      analysis: opts.analysis,
      winType: opts.winType,
      ruleset: opts.ruleset,
      session: opts.session,
      fan: scoreSummary.fan,
    })
  }
  return { error: sessionWrite.error }
}

export async function finishMahjongMultiRon(
  supabase: SupabaseClient,
  opts: {
    gameId: string
    winningTile: string
    players: Pick<Player, 'id' | 'name'>[]
    winners: Array<{
      state: MahjongPlayerState
      winTiles: string[]
      analysis: MahjongWinAnalysis
    }>
    ruleset: MahjongRuleset
    session: MahjongSession
    fromPlayerId: string
    statusMessage?: string
  }
): Promise<{ error?: string }> {
  if (opts.winners.length === 0) return { error: 'No winning players found' }
  if (opts.winners.length === 1) {
    const winner = opts.winners[0]
    return finishMahjongWin(supabase, {
      gameId: opts.gameId,
      winnerPlayerId: winner.state.player_id,
      winningTile: opts.winningTile,
      winType: 'discard',
      players: opts.players,
      winnerState: winner.state,
      winTiles: winner.winTiles,
      analysis: winner.analysis,
      ruleset: opts.ruleset,
      session: opts.session,
      turnOrder: opts.session.turn_order,
      fromPlayerId: opts.fromPlayerId,
    })
  }

  const sortedWinners = [...opts.winners].sort(
    (a, b) =>
      turnDistanceAfterDiscard(opts.session, a.state.player_id) -
      turnDistanceAfterDiscard(opts.session, b.state.player_id)
  )
  const summaries = sortedWinners.map((winner, index) =>
    buildMahjongScoreSummary({
      winnerState: winner.state,
      winTiles: winner.winTiles,
      analysis: winner.analysis,
      winType: 'discard',
      ruleset: opts.ruleset,
      session: index === 0 ? opts.session : { ...opts.session, riichi_sticks: 0 },
      fromPlayerId: opts.fromPlayerId,
      turnOrder: opts.session.turn_order,
      winningTile: opts.winningTile,
    })
  )
  const cfg = mahjongRulesetConfig(opts.ruleset)
  const options = ruleOptionsForSession(opts.session)
  for (const summary of summaries) {
    const minimumFan = opts.ruleset === 'hong_kong' ? options.hongKongMinimumFan : cfg.minimumFan
    const minimumPoints = opts.ruleset === 'mcr' ? options.mcrMinimumPoints : cfg.minimumPoints
    const qualifyingScore = summary.yaku_fan ?? summary.fan
    if (qualifyingScore < minimumFan) return { error: `${cfg.label} requires at least ${minimumFan} fan to win` }
    if (qualifyingScore < minimumPoints)
      return { error: `${cfg.label} requires at least ${minimumPoints} points to win` }
    if (opts.ruleset === 'riichi' && (summary.yaku_fan ?? 0) <= 0 && (summary.yakuman ?? 0) <= 0) {
      return { error: 'Riichi requires at least one yaku; dora alone cannot win' }
    }
  }

  const paymentMap = new Map<string, MahjongScorePayment>()
  for (const summary of summaries) {
    for (const payment of summary.payments) {
      const existing = paymentMap.get(payment.player_id)
      paymentMap.set(payment.player_id, {
        player_id: payment.player_id,
        delta: (existing?.delta ?? 0) + payment.delta,
        reason: existing ? `${existing.reason}; ${payment.reason}` : payment.reason,
      })
    }
  }
  const payments = [...paymentMap.values()]
  const winnerIds = sortedWinners.map((winner) => winner.state.player_id)
  const firstSummary = summaries[0]
  const scoreSummary: MahjongScoreSummary = {
    ruleset: opts.ruleset,
    pattern: firstSummary?.pattern ?? 'standard',
    fan: Math.max(...summaries.map((summary) => summary.fan)),
    yaku_fan: Math.max(...summaries.map((summary) => summary.yaku_fan ?? summary.fan)),
    yakuman: summaries.reduce((sum, summary) => sum + (summary.yakuman ?? 0), 0),
    limit:
      summaries
        .map((summary) => summary.limit)
        .filter(Boolean)
        .join(', ') || null,
    fu: firstSummary?.fu ?? null,
    base_points: summaries.reduce((sum, summary) => sum + summary.base_points, 0),
    total_points: payments
      .filter((payment) => winnerIds.includes(payment.player_id))
      .reduce((sum, payment) => sum + payment.delta, 0),
    lines: summaries.flatMap((summary) =>
      summary.lines.map((line) => ({
        ...line,
        label: `${playerName(opts.players, summary.winner_player_ids?.[0])}: ${line.label}`,
      }))
    ),
    payments,
    payer_player_id: opts.fromPlayerId,
    winner_player_ids: winnerIds,
    honba: opts.session.honba ?? 0,
    riichi_sticks: opts.session.riichi_sticks ?? 0,
  }

  const now = new Date().toISOString()
  const handScores = applyMahjongPayments(opts.session.scores, scoreSummary.payments)
  const resultSession: MahjongSession = {
    ...opts.session,
    hand_result: 'win',
    winner_player_id: winnerIds[0] ?? null,
    winner_player_ids: winnerIds,
  }
  const matchFinish = await maybeFinishMahjongMatch(supabase, opts.gameId, resultSession, handScores, now)
  if (matchFinish.gameFinishError) return { error: matchFinish.gameFinishError }
  const finalScoreSummary: MahjongScoreSummary =
    matchFinish.payments.length > 0
      ? {
          ...scoreSummary,
          payments: [...scoreSummary.payments, ...matchFinish.payments],
          lines: [...scoreSummary.lines, { label: 'Final match settlement', fan: 0 }],
        }
      : scoreSummary
  const sessionWrite = await persistMahjongSession(
    supabase,
    opts.gameId,
    {
      phase: 'finished',
      hand_result: 'win',
      status_message:
        opts.statusMessage ?? `${winnerIds.map((id) => playerName(opts.players, id)).join(', ')} win by Ron`,
      winner_player_id: winnerIds[0],
      winner_player_ids: winnerIds,
      winning_tile: opts.winningTile,
      win_type: 'discard',
      discard_pile: opts.session.discard_pile,
      score_summary: finalScoreSummary,
      scores: matchFinish.scores,
      riichi_sticks: opts.ruleset === 'riichi' ? 0 : (opts.session.riichi_sticks ?? 0),
      turn_deadline_at: null,
    },
    opts.session.updated_at
  )
  // Each Ron winner is credited from their own hand (discard win), using that winner's own score
  // summary. Only once the multi-Ron result is durably recorded.
  if (!sessionWrite.error) {
    await Promise.all(
      sortedWinners.map((winner, index) =>
        creditMahjongHandWin(supabase, {
          winnerState: winner.state,
          analysis: winner.analysis,
          winType: 'discard',
          ruleset: opts.ruleset,
          session: opts.session,
          fan: summaries[index]?.fan ?? 0,
        })
      )
    )
  }
  return { error: sessionWrite.error }
}
