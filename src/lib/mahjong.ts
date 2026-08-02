import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import { mahjongRulesetConfig, parseMahjongRuleOptions, parseMahjongRuleset } from '@/lib/mahjong-rulesets'
import type {
  MahjongClaimType,
  MahjongDiscard,
  MahjongLastDiscard,
  MahjongMeld,
  MahjongMeldType,
  MahjongPlayerState,
  MahjongRuleOptions,
  MahjongRuleset,
  MahjongScorePayment,
  MahjongScoreSummary,
  MahjongSeat,
  MahjongSession,
  Player,
} from '@/types'

import {
  addedKongIndex,
  canResolveClaimNow,
  claimTilesFor,
  eligibleClaimPlayerIds,
  mahjongClaimOptionsForPlayer,
} from '@/lib/mahjong-claims'
import {
  MAHJONG_DEFAULT_MAX_PLAYERS,
  MAHJONG_MAX_PLAYERS,
  MAHJONG_MIN_PLAYERS,
  MAHJONG_SEAT_LABELS,
  MAHJONG_SEATS,
  buildMahjongWall,
  countsFor,
  doraIndicatorsAfterKong,
  drawPlayableTileFromWall,
  initialMahjongScores,
  mahjongTileBase,
  mahjongTileLabel,
  mahjongTileShortLabel,
  nextRoundWind,
  removeMany,
  removeOne,
  ruleOptionsForSession,
  shuffle,
  sortMahjongTiles,
  splitDeadWall,
} from '@/lib/mahjong-core'
import {
  analyzeMahjongWinForRuleset,
  hasDiscardedWinningTile,
  isClosedHand,
  isTenpai,
  repeatedTile,
} from '@/lib/mahjong-hand'
import {
  applyMahjongPayments,
  bumpMahjongCounters,
  dealerRepeatsAfterHand,
  finishAbortiveDraw,
  finishMahjongMultiRon,
  finishMahjongWin,
  finishWallDraw,
  mahjongGameCounters,
  maybeFinishMahjongMatch,
  riichiAbortiveDrawReason,
} from '@/lib/mahjong-hand-resolution'
import {
  currentMahjongPlayerId,
  mahjongTurnDeadline,
  nextTurnIndexAfter,
  playerName,
  stateFor,
} from '@/lib/mahjong-session'

export {
  MAHJONG_DEFAULT_MAX_PLAYERS,
  MAHJONG_MAX_PLAYERS,
  MAHJONG_MIN_PLAYERS,
  MAHJONG_SEAT_LABELS,
  MAHJONG_SEATS,
  buildMahjongWall,
  mahjongTileBase,
  mahjongTileLabel,
  mahjongTileShortLabel,
  sortMahjongTiles,
} from '@/lib/mahjong-core'
export {
  analyzeMahjongWin,
  canDeclareMahjong,
  canDeclareMahjongForRuleset,
  winningTilesForHand,
} from '@/lib/mahjong-hand'

import { dealerPlayerId } from '@/lib/mahjong-scoring'

export { scoreMahjongHandForRuleset } from '@/lib/mahjong-scoring'
export { currentMahjongPlayerId, mahjongSecondsLeft, mahjongTurnDeadline } from '@/lib/mahjong-session'
export {
  mahjongClaimOptionsForPlayer,
  mahjongSelfKongOptions,
  possibleChowCombos,
  type MahjongClaimOption,
} from '@/lib/mahjong-claims'

export function sanitizeMahjongSession(session: MahjongSession | null): MahjongSession | null {
  if (!session) return null
  return {
    ...session,
    wall: Array.from({ length: session.wall.length }, () => '__hidden__'),
    dead_wall: Array.from({ length: session.dead_wall?.length ?? 0 }, () => '__hidden__'),
    ura_dora_indicators: Array.from({ length: session.ura_dora_indicators?.length ?? 0 }, () => '__hidden__'),
  }
}

export function sanitizeMahjongPlayerStates(
  states: MahjongPlayerState[],
  visiblePlayerId: string | null
): MahjongPlayerState[] {
  return states.map((state) => ({
    ...state,
    hand_count: state.hand.length,
    hand: state.player_id === visiblePlayerId ? state.hand : [],
    last_drawn_tile: state.player_id === visiblePlayerId ? state.last_drawn_tile : null,
  }))
}

const MAHJONG_CONFLICT_ERROR = 'Mahjong table changed; please retry'

async function persistMahjongSession(
  supabase: SupabaseClient,
  gameId: string,
  patch: Partial<MahjongSession>,
  expectedUpdatedAt: string
): Promise<{ error?: string; updatedAt?: string }> {
  const { data, error } = await supabase
    .from('mahjong_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('game_id', gameId)
    .eq('updated_at', expectedUpdatedAt)
    .select('game_id, updated_at')
  if (error) return { error: error.message }
  if ((data?.length ?? 0) === 0) return { error: MAHJONG_CONFLICT_ERROR }
  return { updatedAt: data?.[0]?.updated_at as string | undefined }
}

async function loadMahjong(
  supabase: SupabaseClient,
  gameId: string
): Promise<{
  session: MahjongSession | null
  states: MahjongPlayerState[]
  players: Pick<Player, 'id' | 'name'>[]
  timerSeconds: number
  error?: string
}> {
  const [sessionRes, statesRes, playersRes, gameRes] = await Promise.all([
    supabase.from('mahjong_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    supabase.from('mahjong_player_state').select('*').eq('game_id', gameId).order('player_order'),
    supabase.from('players').select('id, name').eq('game_id', gameId),
    supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle(),
  ])

  if (sessionRes.error)
    return { session: null, states: [], players: [], timerSeconds: 0, error: sessionRes.error.message }
  if (statesRes.error)
    return { session: null, states: [], players: [], timerSeconds: 0, error: statesRes.error.message }
  if (playersRes.error)
    return { session: null, states: [], players: [], timerSeconds: 0, error: playersRes.error.message }
  if (gameRes.error) return { session: null, states: [], players: [], timerSeconds: 0, error: gameRes.error.message }

  return {
    session: sessionRes.data as MahjongSession | null,
    states: (statesRes.data as MahjongPlayerState[]) ?? [],
    players: playersRes.data ?? [],
    timerSeconds: gameRes.data?.timer_seconds ?? 0,
  }
}

async function advanceAfterDiscardIfNoClaims(
  supabase: SupabaseClient,
  session: MahjongSession,
  states: MahjongPlayerState[],
  players: Pick<Player, 'id' | 'name'>[],
  timerSeconds: number
): Promise<{ error?: string }> {
  const eligible = eligibleClaimPlayerIds(session, states)
  if (eligible.length > 0) {
    return persistMahjongSession(
      supabase,
      session.game_id,
      {
        phase: 'claim',
        claim_passes: [],
        status_message: `${playerName(players, session.last_discard?.player_id)} discarded ${mahjongTileShortLabel(
          session.last_discard?.tile ?? ''
        )}`,
        turn_deadline_at: mahjongTurnDeadline(timerSeconds),
      },
      session.updated_at
    )
  }

  const nextIndex = session.last_discard
    ? nextTurnIndexAfter(session, session.last_discard.player_id)
    : (session.current_turn_index + 1) % session.turn_order.length
  const nextPlayerId = session.turn_order[nextIndex] ?? null
  return autoDrawForPlayer(supabase, session, states, players, timerSeconds, nextPlayerId, nextIndex)
}

async function autoDrawForPlayer(
  supabase: SupabaseClient,
  session: MahjongSession,
  states: MahjongPlayerState[],
  players: Pick<Player, 'id' | 'name'>[],
  timerSeconds: number,
  playerId: string | null,
  turnIndex: number
): Promise<{ error?: string }> {
  if (!playerId) return { error: 'Next player not found' }
  const ruleset = parseMahjongRuleset(session.ruleset)
  const cfg = mahjongRulesetConfig(ruleset)
  const kongReplacement = !!session.status_message?.includes('Kong')
  const drawFromDeadWall = cfg.deadWall && kongReplacement
  const drawSource = drawFromDeadWall ? (session.dead_wall ?? []) : session.wall
  if (drawSource.length === 0) return finishWallDraw(supabase, session.game_id, session, states)

  const state = stateFor(states, playerId)
  if (!state) return { error: 'Player not found' }

  const { tile, wall: nextDrawSource, flowers } = drawPlayableTileFromWall(drawSource, ruleset)
  if (!tile) return finishWallDraw(supabase, session.game_id, session, states)
  const nextWall = drawFromDeadWall ? session.wall : nextDrawSource
  const nextDeadWall = drawFromDeadWall ? nextDrawSource : (session.dead_wall ?? [])
  const nextDoraIndicators = drawFromDeadWall
    ? doraIndicatorsAfterKong(session, nextDeadWall)
    : (session.dora_indicators ?? [])

  const { error: stateError } = await supabase
    .from('mahjong_player_state')
    .update({
      hand: sortMahjongTiles([...state.hand, tile]),
      last_drawn_tile: tile,
      flowers: [...(state.flowers ?? []), ...flowers],
      temporary_furiten: false,
    })
    .eq('id', state.id)
  if (stateError) return { error: stateError.message }

  return persistMahjongSession(
    supabase,
    session.game_id,
    {
      current_turn_index: turnIndex,
      wall: nextWall,
      dead_wall: nextDeadWall,
      dora_indicators: nextDoraIndicators,
      phase: 'discard',
      rinshan_player_id: drawFromDeadWall ? playerId : null,
      last_action: drawFromDeadWall ? 'kong' : 'draw',
      discard_pile: session.discard_pile,
      last_discard: session.last_discard,
      claim_passes: [],
      status_message: session.status_message?.includes('Kong')
        ? `${session.status_message}; drew a replacement tile and must discard`
        : flowers.length > 0
          ? `${playerName(players, playerId)} revealed ${flowers.length} flower tile${flowers.length === 1 ? '' : 's'} and drew again`
          : `${playerName(players, playerId)} drew a tile and must discard`,
      turn_deadline_at: mahjongTurnDeadline(timerSeconds),
    },
    session.updated_at
  )
}

export async function initializeMahjongGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string }> {
  if (playerIds.length !== MAHJONG_MIN_PLAYERS) {
    return { error: `Need exactly ${MAHJONG_MIN_PLAYERS} players to start` }
  }

  const gameRes = await supabase
    .from('games')
    .select('timer_seconds, mahjong_ruleset, mahjong_rule_options')
    .eq('id', gameId)
    .maybeSingle()
  const timerSeconds = gameRes.data?.timer_seconds ?? 0
  const ruleset = parseMahjongRuleset(gameRes.data?.mahjong_ruleset)
  const ruleOptions = parseMahjongRuleOptions(gameRes.data?.mahjong_rule_options)
  let wall = buildMahjongWall(ruleset, ruleOptions)
  const wallSplit = splitDeadWall(wall, ruleset)
  wall = wallSplit.wall
  const order = shuffle(playerIds)
  const hands = new Map<string, string[]>()
  const flowers = new Map<string, string[]>()
  for (const playerId of order) hands.set(playerId, [])
  for (const playerId of order) flowers.set(playerId, [])

  for (let round = 0; round < 13; round += 1) {
    for (const playerId of order) {
      const draw = drawPlayableTileFromWall(wall, ruleset)
      wall = draw.wall
      if (draw.flowers.length > 0) flowers.get(playerId)?.push(...draw.flowers)
      const tile = draw.tile
      if (tile) hands.get(playerId)?.push(tile)
    }
  }
  const dealer = order[0]
  let dealerDrawnTile: string | null = null
  if (dealer) {
    const draw = drawPlayableTileFromWall(wall, ruleset)
    wall = draw.wall
    if (draw.flowers.length > 0) flowers.get(dealer)?.push(...draw.flowers)
    const tile = draw.tile
    if (tile) {
      hands.get(dealer)?.push(tile)
      dealerDrawnTile = tile
    }
  }

  const { data: existing } = await supabase.from('mahjong_sessions').select('id').eq('game_id', gameId).maybeSingle()
  if (existing) {
    const [{ error: statesDeleteError }, { error: sessionDeleteError }] = await Promise.all([
      supabase.from('mahjong_player_state').delete().eq('game_id', gameId),
      supabase.from('mahjong_sessions').delete().eq('game_id', gameId),
    ])
    if (statesDeleteError) return { error: statesDeleteError.message }
    if (sessionDeleteError) return { error: sessionDeleteError.message }
  }

  const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
  const names = new Map<string, string>()
  for (const p of playerRows ?? []) names.set(p.id, p.name)

  const { error: sessionError } = await supabase.from('mahjong_sessions').insert({
    game_id: gameId,
    ruleset,
    turn_order: order,
    dealer_index: 0,
    current_turn_index: 0,
    phase: 'discard',
    wall,
    dead_wall: wallSplit.deadWall,
    dora_indicators: wallSplit.doraIndicators,
    ura_dora_indicators: wallSplit.uraDoraIndicators,
    honba: 0,
    riichi_sticks: 0,
    round_wind: 'east',
    hand_number: 1,
    last_action: null,
    hand_result: null,
    rule_options: ruleOptions,
    rinshan_player_id: null,
    chankan_player_id: null,
    ippatsu_eligible_player_ids: [],
    exhaustive_draw_tenpai_player_ids: [],
    scores: initialMahjongScores(order, ruleset, ruleOptions),
    discard_pile: [],
    last_discard: null,
    claim_passes: [],
    status_message: `${names.get(order[0] ?? '') ?? 'East'} starts as East`,
    winner_player_id: null,
    winner_player_ids: [],
    winning_tile: null,
    win_type: null,
    score_summary: null,
    turn_deadline_at: mahjongTurnDeadline(timerSeconds),
  })
  if (sessionError) return { error: sessionError.message }

  const stateRows = order.map((playerId, index) => ({
    game_id: gameId,
    player_id: playerId,
    seat: MAHJONG_SEATS[index],
    hand: sortMahjongTiles(hands.get(playerId) ?? []),
    last_drawn_tile: playerId === dealer ? dealerDrawnTile : null,
    flowers: flowers.get(playerId) ?? [],
    riichi_declared: false,
    riichi_discard_index: null,
    temporary_furiten: false,
    permanent_furiten: false,
    melds: [],
    discarded: [],
    player_order: index,
    // Seat trophies, credited for the hand about to be played. Later hands are credited in
    // processMahjongNextHand; between them every played hand's seat is recorded exactly once.
    game_counters: {
      mahjong_seat_mask: 1 << index,
      ...(MAHJONG_SEATS[index] === 'east' ? { mahjong_hands_as_east: 1 } : {}),
    },
  }))

  const { error: statesError } = await supabase.from('mahjong_player_state').insert(stateRows)
  if (statesError) return { error: statesError.message }

  return {}
}

function dealMahjongHand(
  ruleset: MahjongRuleset,
  order: string[],
  dealerIndex: number,
  ruleOptions?: MahjongRuleOptions | null
) {
  let wall = buildMahjongWall(ruleset, ruleOptions)
  const wallSplit = splitDeadWall(wall, ruleset)
  wall = wallSplit.wall
  const hands = new Map<string, string[]>()
  const flowers = new Map<string, string[]>()
  for (const playerId of order) {
    hands.set(playerId, [])
    flowers.set(playerId, [])
  }

  for (let round = 0; round < 13; round += 1) {
    for (const playerId of order) {
      const draw = drawPlayableTileFromWall(wall, ruleset)
      wall = draw.wall
      if (draw.flowers.length > 0) flowers.get(playerId)?.push(...draw.flowers)
      if (draw.tile) hands.get(playerId)?.push(draw.tile)
    }
  }

  const dealer = order[dealerIndex] ?? order[0]
  let dealerDrawnTile: string | null = null
  if (dealer) {
    const draw = drawPlayableTileFromWall(wall, ruleset)
    wall = draw.wall
    if (draw.flowers.length > 0) flowers.get(dealer)?.push(...draw.flowers)
    if (draw.tile) {
      hands.get(dealer)?.push(draw.tile)
      dealerDrawnTile = draw.tile
    }
  }

  return { wall, wallSplit, hands, flowers, dealer, dealerDrawnTile }
}

function seatForOrderIndex(index: number, dealerIndex: number): MahjongSeat {
  return MAHJONG_SEATS[(index - dealerIndex + MAHJONG_SEATS.length) % MAHJONG_SEATS.length] ?? 'east'
}

function nextMahjongHandPosition(session: MahjongSession): {
  dealerIndex: number
  roundWind: MahjongSeat
  handNumber: number
  honba: number
} {
  const repeatDealer = dealerRepeatsAfterHand(session)

  if (repeatDealer) {
    return {
      dealerIndex: session.dealer_index,
      roundWind: session.round_wind ?? 'east',
      handNumber: session.hand_number ?? 1,
      honba: session.hand_result === 'chombo' ? (session.honba ?? 0) : (session.honba ?? 0) + 1,
    }
  }

  const nextDealerIndex = (session.dealer_index + 1) % session.turn_order.length
  const currentHandNumber = session.hand_number ?? 1
  const wrapsRound = currentHandNumber >= 4
  return {
    dealerIndex: nextDealerIndex,
    roundWind: wrapsRound ? nextRoundWind(session.round_wind ?? 'east') : (session.round_wind ?? 'east'),
    handNumber: wrapsRound ? 1 : currentHandNumber + 1,
    honba:
      session.hand_result === 'exhaustive_draw' || session.hand_result === 'abortive_draw'
        ? (session.honba ?? 0) + 1
        : 0,
  }
}

export async function processMahjongNextHand(supabase: SupabaseClient, gameId: string): Promise<{ error?: string }> {
  const { session, states, players, timerSeconds, error } = await loadMahjong(supabase, gameId)
  if (error) return { error }
  if (!session) return { error: 'Game not found' }
  if (session.phase !== 'finished') return { error: 'Current hand is not finished' }
  if (states.length !== MAHJONG_MIN_PLAYERS || session.turn_order.length !== MAHJONG_MIN_PLAYERS) {
    return { error: `Need exactly ${MAHJONG_MIN_PLAYERS} seated players to continue` }
  }

  const ruleset = parseMahjongRuleset(session.ruleset)
  const nextPosition = nextMahjongHandPosition(session)
  const deal = dealMahjongHand(ruleset, session.turn_order, nextPosition.dealerIndex, session.rule_options)
  const now = new Date().toISOString()
  const dealerName = playerName(players, deal.dealer)
  const stateUpdates = session.turn_order.map((playerId, index) => {
    const state = stateFor(states, playerId)
    if (!state) return Promise.resolve({ error: { message: 'Player state not found' } })
    const seat = seatForOrderIndex(index, nextPosition.dealerIndex)
    // The per-MATCH trophy blob MUST survive this per-hand re-deal (see the migration header):
    // it is carried forward here, never reset. We extend it with this new hand's seat, and settle
    // the consecutive-win streak — the just-finished hand's winner keeps their run (already
    // advanced at resolution), everyone else is reset to zero here so a run needs the SAME player
    // to keep winning. A draw/abortive/chombo has no winner, so every run resets.
    const base = mahjongGameCounters(state)
    const nextCounters = { ...base }
    const seatIndex = MAHJONG_SEATS.indexOf(seat)
    nextCounters.mahjong_seat_mask = (base.mahjong_seat_mask ?? 0) | (seatIndex >= 0 ? 1 << seatIndex : 0)
    if (seat === 'east') nextCounters.mahjong_hands_as_east = (base.mahjong_hands_as_east ?? 0) + 1
    const wonLastHand = session.hand_result === 'win' && (session.winner_player_ids ?? []).includes(playerId)
    if (!wonLastHand) nextCounters.mahjong_win_streak = 0
    return supabase
      .from('mahjong_player_state')
      .update({
        seat,
        hand: sortMahjongTiles(deal.hands.get(playerId) ?? []),
        last_drawn_tile: playerId === deal.dealer ? deal.dealerDrawnTile : null,
        flowers: deal.flowers.get(playerId) ?? [],
        riichi_declared: false,
        riichi_discard_index: null,
        temporary_furiten: false,
        permanent_furiten: false,
        melds: [],
        discarded: [],
        player_order: index,
        game_counters: nextCounters,
      })
      .eq('id', state.id)
  })
  const stateResults = await Promise.all(stateUpdates)
  const stateError = stateResults.find((result) => result.error)?.error
  if (stateError) return { error: stateError.message }

  const sessionWrite = await persistMahjongSession(
    supabase,
    gameId,
    {
      dealer_index: nextPosition.dealerIndex,
      current_turn_index: nextPosition.dealerIndex,
      phase: 'discard',
      wall: deal.wall,
      dead_wall: deal.wallSplit.deadWall,
      dora_indicators: deal.wallSplit.doraIndicators,
      ura_dora_indicators: deal.wallSplit.uraDoraIndicators,
      honba: nextPosition.honba,
      round_wind: nextPosition.roundWind,
      hand_number: nextPosition.handNumber,
      last_action: null,
      hand_result: null,
      rinshan_player_id: null,
      chankan_player_id: null,
      ippatsu_eligible_player_ids: [],
      exhaustive_draw_tenpai_player_ids: [],
      discard_pile: [],
      last_discard: null,
      claim_passes: [],
      status_message: `${dealerName} starts ${MAHJONG_SEAT_LABELS[nextPosition.roundWind]} ${nextPosition.handNumber}${
        nextPosition.honba > 0 ? `, ${nextPosition.honba} honba` : ''
      }`,
      winner_player_id: null,
      winner_player_ids: [],
      winning_tile: null,
      win_type: null,
      score_summary: null,
      turn_deadline_at: mahjongTurnDeadline(timerSeconds),
    },
    session.updated_at
  )
  return { error: sessionWrite.error }
}

export async function processMahjongPenalty(
  supabase: SupabaseClient,
  gameId: string,
  offenderPlayerId: string
): Promise<{ error?: string }> {
  const { session, states, players, error } = await loadMahjong(supabase, gameId)
  if (error) return { error }
  if (!session) return { error: 'Game not found' }
  if (session.phase === 'finished') return { error: 'Current hand is already finished' }
  if (!stateFor(states, offenderPlayerId)) return { error: 'Player not found' }
  const options = ruleOptionsForSession(session)
  if (options.chomboPenalty === 'none') return { error: 'Chombo penalties are disabled for this table' }

  const dealerId = dealerPlayerId(session)
  const offenderIsDealer = offenderPlayerId === dealerId
  const payments: MahjongScorePayment[] = []
  let offenderDelta = 0
  for (const playerId of session.turn_order.filter((id) => id !== offenderPlayerId)) {
    const amount = offenderIsDealer ? 4000 : playerId === dealerId ? 4000 : 2000
    payments.push({ player_id: playerId, delta: amount, reason: 'Chombo payment' })
    offenderDelta -= amount
  }
  payments.push({ player_id: offenderPlayerId, delta: offenderDelta, reason: 'Chombo penalty' })

  const handScores = applyMahjongPayments(session.scores, payments)
  const now = new Date().toISOString()
  const resultSession: MahjongSession = {
    ...session,
    hand_result: 'chombo',
    winner_player_id: null,
    winner_player_ids: [],
  }
  const matchFinish = await maybeFinishMahjongMatch(supabase, gameId, resultSession, handScores, now)
  if (matchFinish.gameFinishError) return { error: matchFinish.gameFinishError }
  const scoreSummary: MahjongScoreSummary = {
    ruleset: parseMahjongRuleset(session.ruleset),
    pattern: 'standard',
    fan: 0,
    fu: null,
    base_points: 0,
    total_points: Math.abs(offenderDelta),
    lines: [
      { label: 'Chombo', fan: 0 },
      ...(matchFinish.payments.length > 0 ? [{ label: 'Final match settlement', fan: 0 }] : []),
    ],
    payments: [...payments, ...matchFinish.payments],
    payer_player_id: offenderPlayerId,
    winner_player_ids: [],
    honba: session.honba ?? 0,
    riichi_sticks: session.riichi_sticks ?? 0,
  }

  const sessionWrite = await persistMahjongSession(
    supabase,
    gameId,
    {
      phase: 'finished',
      hand_result: 'chombo',
      status_message: `${playerName(players, offenderPlayerId)} receives a Chombo penalty`,
      winner_player_id: null,
      winner_player_ids: [],
      winning_tile: null,
      win_type: null,
      score_summary: scoreSummary,
      scores: matchFinish.scores,
      turn_deadline_at: null,
    },
    session.updated_at
  )
  return { error: sessionWrite.error }
}

export async function processMahjongDraw(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ tile?: string; error?: string }> {
  const { session, states, players, timerSeconds, error } = await loadMahjong(supabase, gameId)
  if (error) return { error }
  if (!session) return { error: 'Game not found' }
  if (session.phase !== 'draw') return { error: 'You cannot draw right now' }
  if (currentMahjongPlayerId(session) !== playerId) return { error: "It's not your turn" }
  if (session.wall.length === 0) {
    const draw = await finishWallDraw(supabase, gameId, session, states)
    return { error: draw.error }
  }

  const state = stateFor(states, playerId)
  if (!state) return { error: 'Player not found' }

  const { tile, wall, flowers } = drawPlayableTileFromWall(session.wall, parseMahjongRuleset(session.ruleset))
  if (!tile) return { error: 'Wall is empty' }

  const { error: stateError } = await supabase
    .from('mahjong_player_state')
    .update({
      hand: sortMahjongTiles([...state.hand, tile]),
      last_drawn_tile: tile,
      flowers: [...(state.flowers ?? []), ...flowers],
      temporary_furiten: false,
    })
    .eq('id', state.id)
  if (stateError) return { error: stateError.message }

  const sessionWrite = await persistMahjongSession(
    supabase,
    gameId,
    {
      wall,
      phase: 'discard',
      status_message: `${playerName(players, playerId)} drew a tile`,
      turn_deadline_at: mahjongTurnDeadline(timerSeconds),
    },
    session.updated_at
  )
  if (sessionWrite.error) return { error: sessionWrite.error }

  return { tile }
}

export async function processMahjongDiscard(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  tile: string
): Promise<{ error?: string }> {
  const { session, states, players, timerSeconds, error } = await loadMahjong(supabase, gameId)
  if (error) return { error }
  if (!session) return { error: 'Game not found' }
  if (session.phase !== 'discard') return { error: 'You cannot discard right now' }
  if (currentMahjongPlayerId(session) !== playerId) return { error: "It's not your turn" }

  const state = stateFor(states, playerId)
  if (!state) return { error: 'Player not found' }
  const nextHand = removeOne(state.hand, tile)
  if (!nextHand) return { error: 'You do not have that tile' }

  const discard: MahjongDiscard = {
    tile,
    player_id: playerId,
    claimed_by_player_id: null,
    claimed_as: null,
    riichi_declared: state.riichi_declared && state.riichi_discard_index === session.discard_pile.length,
  }
  const discardPile = [...session.discard_pile, discard]
  const lastDiscard: MahjongLastDiscard = { tile, player_id: playerId, discard_index: discardPile.length - 1 }

  const { error: stateError } = await supabase
    .from('mahjong_player_state')
    .update({
      hand: sortMahjongTiles(nextHand),
      last_drawn_tile: null,
      discarded: [...state.discarded, tile],
      permanent_furiten: hasDiscardedWinningTile({
        ...state,
        hand: sortMahjongTiles(nextHand),
        discarded: [...state.discarded, tile],
      }),
      // First Discard / lifetime discards — bumped in the same write as the discard itself.
      game_counters: bumpMahjongCounters(mahjongGameCounters(state), { mahjong_discards: 1 }),
    })
    .eq('id', state.id)
  if (stateError) return { error: stateError.message }

  const draftSession: MahjongSession = {
    ...session,
    phase: 'claim',
    discard_pile: discardPile,
    last_discard: lastDiscard,
    claim_passes: [],
  }
  const draftStates = states.map((row) =>
    row.player_id === playerId
      ? { ...row, hand: sortMahjongTiles(nextHand), last_drawn_tile: null, discarded: [...state.discarded, tile] }
      : row
  )

  const sessionWrite = await persistMahjongSession(
    supabase,
    gameId,
    {
      discard_pile: discardPile,
      last_discard: lastDiscard,
      phase: 'claim',
      claim_passes: [],
      last_action: 'discard',
      status_message: `${playerName(players, playerId)} discarded ${mahjongTileShortLabel(tile)}`,
      turn_deadline_at: mahjongTurnDeadline(timerSeconds),
    },
    session.updated_at
  )
  if (sessionWrite.error) return { error: sessionWrite.error }
  const persistedDraftSession: MahjongSession = {
    ...draftSession,
    updated_at: sessionWrite.updatedAt ?? draftSession.updated_at,
  }

  const abortReason = riichiAbortiveDrawReason(persistedDraftSession, draftStates)
  if (abortReason) return finishAbortiveDraw(supabase, gameId, abortReason, persistedDraftSession, draftStates)

  return advanceAfterDiscardIfNoClaims(supabase, persistedDraftSession, draftStates, players, timerSeconds)
}

export async function processMahjongClaim(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  claimType: MahjongClaimType,
  requestedTiles?: string[]
): Promise<{ error?: string }> {
  const { session, states, players, timerSeconds, error } = await loadMahjong(supabase, gameId)
  if (error) return { error }
  if (!session) return { error: 'Game not found' }
  const state = stateFor(states, playerId)
  if (!state) return { error: 'Player not found' }

  if (session.phase === 'discard' && currentMahjongPlayerId(session) === playerId) {
    if (claimType === 'mahjong') {
      const ruleset = parseMahjongRuleset(session.ruleset)
      const analysis = analyzeMahjongWinForRuleset(state.hand, state.melds, ruleset)
      if (!analysis.valid) return { error: 'That hand is not Mahjong yet' }
      return finishMahjongWin(supabase, {
        gameId,
        winnerPlayerId: playerId,
        winningTile: state.last_drawn_tile ?? null,
        winType: 'self_draw',
        players,
        winnerState: state,
        winTiles: state.hand,
        analysis,
        ruleset,
        session,
        turnOrder: session.turn_order,
      })
    }

    if (claimType === 'kong') {
      const counts = countsFor(state.hand)
      const requestedTile = requestedTiles?.[0]
      const concealedTile =
        requestedTile && (counts.get(requestedTile) ?? 0) >= 4
          ? requestedTile
          : [...counts.entries()].find(([, count]) => count >= 4)?.[0]
      const addedTile =
        requestedTile && addedKongIndex(state, requestedTile) !== -1 && (counts.get(requestedTile) ?? 0) >= 1
          ? requestedTile
          : state.melds
              .map((meld) => (meld.type === 'pung' ? repeatedTile(meld.tiles) : null))
              .find((tile) => tile && (counts.get(tile) ?? 0) >= 1)

      let nextHand: string[] | null = null
      let nextMelds: MahjongMeld[] | null = null
      let status = ''

      if (concealedTile) {
        nextHand = removeMany(state.hand, [concealedTile, concealedTile, concealedTile, concealedTile])
        if (!nextHand) return { error: 'No concealed Kong available' }
        nextMelds = [
          ...state.melds,
          { type: 'kong', tiles: [concealedTile, concealedTile, concealedTile, concealedTile], concealed: true },
        ]
        status = `${playerName(players, playerId)} made a concealed Kong`
      } else if (addedTile) {
        const ruleset = parseMahjongRuleset(session.ruleset)
        const chankanWinners = states
          .filter((row) => row.player_id !== playerId)
          .flatMap((row) => {
            const analysis = analyzeMahjongWinForRuleset([...row.hand, addedTile], row.melds, ruleset)
            if (
              !analysis.valid ||
              (ruleset === 'riichi' && (row.permanent_furiten || row.temporary_furiten || hasDiscardedWinningTile(row)))
            ) {
              return []
            }
            return [{ state: row, winTiles: [...row.hand, addedTile], analysis }]
          })
        if (chankanWinners.length > 0) {
          return finishMahjongMultiRon(supabase, {
            gameId,
            winningTile: addedTile,
            players,
            winners: chankanWinners,
            ruleset,
            session: { ...session, chankan_player_id: chankanWinners[0]?.state.player_id ?? null },
            fromPlayerId: playerId,
            statusMessage: `${chankanWinners.map((winner) => playerName(players, winner.state.player_id)).join(', ')} win by Chankan`,
          })
        }
        const index = addedKongIndex(state, addedTile)
        if (index === -1) return { error: 'No Pung can be upgraded to Kong' }
        nextHand = removeOne(state.hand, addedTile)
        if (!nextHand) return { error: 'You do not have the fourth tile for that Kong' }
        nextMelds = state.melds.map((meld, meldIndex) =>
          meldIndex === index
            ? { ...meld, type: 'kong', tiles: [addedTile, addedTile, addedTile, addedTile], added: true }
            : meld
        )
        status = `${playerName(players, playerId)} upgraded a Pung to Kong`
      }

      if (!nextHand || !nextMelds) return { error: 'No Kong available' }
      const nextState: MahjongPlayerState = {
        ...state,
        hand: sortMahjongTiles(nextHand),
        last_drawn_tile: null,
        melds: nextMelds,
      }
      const nextStates = states.map((row) => (row.player_id === playerId ? nextState : row))
      // Kong trophy counters. A concealed Kong and a Pung upgraded to a Kong both count as
      // "calling a Kong" (Kong trophy) plus their specific flavour (Concealed / Added Kong).
      const kongDeltas: Record<string, number> = concealedTile
        ? { mahjong_kongs_called: 1, mahjong_concealed_kongs: 1 }
        : { mahjong_kongs_called: 1, mahjong_added_kongs: 1 }
      const { error: stateError } = await supabase
        .from('mahjong_player_state')
        .update({
          hand: nextState.hand,
          last_drawn_tile: null,
          melds: nextState.melds,
          game_counters: bumpMahjongCounters(mahjongGameCounters(state), kongDeltas),
        })
        .eq('id', state.id)
      if (stateError) return { error: stateError.message }
      const abortReason = riichiAbortiveDrawReason(session, nextStates)
      if (abortReason) return finishAbortiveDraw(supabase, gameId, abortReason, session, nextStates)
      return autoDrawForPlayer(
        supabase,
        { ...session, status_message: status },
        nextStates,
        players,
        timerSeconds,
        playerId,
        session.current_turn_index
      )
    }
  }

  if (session.phase !== 'claim' || !session.last_discard) return { error: 'There is no discard to claim' }
  if (session.last_discard.player_id === playerId) return { error: 'You cannot claim your own discard' }

  const options = mahjongClaimOptionsForPlayer(session, states, playerId)
  if (!options.some((option) => option.type === claimType)) return { error: `You cannot call ${claimType}` }
  if (!canResolveClaimNow(session, states, playerId, claimType)) {
    return { error: 'A higher-priority call is still pending' }
  }
  const discardTile = session.last_discard.tile

  if (claimType === 'mahjong') {
    const ruleset = parseMahjongRuleset(session.ruleset)
    const passed = new Set(session.claim_passes ?? [])
    const winners = states
      .filter((row) => row.player_id !== session.last_discard?.player_id && !passed.has(row.player_id))
      .flatMap((row) => {
        const winTiles = [...row.hand, discardTile]
        const analysis = analyzeMahjongWinForRuleset(winTiles, row.melds, ruleset)
        if (!analysis.valid) return []
        if (ruleset === 'riichi' && (row.permanent_furiten || row.temporary_furiten || hasDiscardedWinningTile(row))) {
          return []
        }
        return [{ state: row, winTiles, analysis }]
      })
    if (!winners.some((winner) => winner.state.player_id === playerId)) return { error: 'That hand is not Mahjong yet' }
    const discardPile = [...session.discard_pile]
    const discard = discardPile[session.last_discard.discard_index]
    if (discard)
      discardPile[session.last_discard.discard_index] = {
        ...discard,
        claimed_by_player_id: winners[0]?.state.player_id ?? playerId,
        claimed_as: 'mahjong',
      }
    return finishMahjongMultiRon(supabase, {
      gameId,
      winningTile: discardTile,
      players,
      winners,
      ruleset,
      session: { ...session, discard_pile: discardPile },
      fromPlayerId: session.last_discard.player_id,
    })
  }

  const claim = claimTilesFor(claimType, state.hand, discardTile, requestedTiles)
  if (claim.error) return { error: claim.error }
  const nextHand = removeMany(state.hand, claim.tiles)
  if (!nextHand) return { error: `You do not have the tiles for ${claimType}` }

  const meld: MahjongMeld = {
    type: claimType as MahjongMeldType,
    tiles: claim.meldTiles,
    claimed_tile: discardTile,
    from_player_id: session.last_discard.player_id,
  }
  const discardPile = [...session.discard_pile]
  const discard = discardPile[session.last_discard.discard_index]
  if (discard) {
    discardPile[session.last_discard.discard_index] = {
      ...discard,
      claimed_by_player_id: playerId,
      claimed_as: claimType,
    }
  }

  const nextTurnIndex = session.turn_order.indexOf(playerId)
  const nextState: MahjongPlayerState = {
    ...state,
    hand: sortMahjongTiles(nextHand),
    last_drawn_tile: null,
    melds: [...state.melds, meld],
  }
  const nextStates = states.map((row) => (row.player_id === playerId ? nextState : row))
  // Called-meld trophy counters (Chow / Pung / Kong), for a meld taken from an opponent's
  // discard. `claimType` here is one of chow | pung | kong (a winning claim exited above).
  const callDeltas: Record<string, number> =
    claimType === 'chow'
      ? { mahjong_chows_called: 1 }
      : claimType === 'pung'
        ? { mahjong_pungs_called: 1 }
        : { mahjong_kongs_called: 1 }
  const { error: stateError } = await supabase
    .from('mahjong_player_state')
    .update({
      hand: nextState.hand,
      last_drawn_tile: null,
      melds: nextState.melds,
      game_counters: bumpMahjongCounters(mahjongGameCounters(state), callDeltas),
    })
    .eq('id', state.id)
  if (stateError) return { error: stateError.message }

  if (claimType === 'kong') {
    const abortReason = riichiAbortiveDrawReason(session, nextStates)
    if (abortReason) return finishAbortiveDraw(supabase, gameId, abortReason, session, nextStates)
    return autoDrawForPlayer(
      supabase,
      {
        ...session,
        current_turn_index: nextTurnIndex,
        discard_pile: discardPile,
        claim_passes: [],
        ippatsu_eligible_player_ids: [],
        status_message: `${playerName(players, playerId)} called KONG`,
      },
      nextStates,
      players,
      timerSeconds,
      playerId,
      nextTurnIndex
    )
  }

  const sessionWrite = await persistMahjongSession(
    supabase,
    gameId,
    {
      current_turn_index: nextTurnIndex,
      phase: 'discard',
      discard_pile: discardPile,
      claim_passes: [],
      ippatsu_eligible_player_ids: [],
      status_message: `${playerName(players, playerId)} called ${claimType.toUpperCase()}`,
      turn_deadline_at: mahjongTurnDeadline(timerSeconds),
    },
    session.updated_at
  )
  return { error: sessionWrite.error }
}

export async function processMahjongPass(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string }> {
  const { session, states, players, timerSeconds, error } = await loadMahjong(supabase, gameId)
  if (error) return { error }
  if (!session) return { error: 'Game not found' }
  if (session.phase !== 'claim' || !session.last_discard) return { error: 'No claim is pending' }
  if (session.last_discard.player_id === playerId) return { error: 'Discarding player cannot pass this claim' }

  const eligible = eligibleClaimPlayerIds(session, states)
  if (!eligible.includes(playerId)) return { error: 'You have no call to pass' }
  const winPass =
    parseMahjongRuleset(session.ruleset) === 'riichi' &&
    mahjongClaimOptionsForPlayer(session, states, playerId).some((option) => option.type === 'mahjong')
  if (winPass) {
    const state = stateFor(states, playerId)
    if (state) {
      await supabase.from('mahjong_player_state').update({ temporary_furiten: true }).eq('id', state.id)
    }
  }
  const claimPasses = Array.from(new Set([...(session.claim_passes ?? []), playerId]))
  const allPassed = eligible.every((id) => claimPasses.includes(id))

  if (allPassed) {
    const nextIndex = nextTurnIndexAfter(session, session.last_discard.player_id)
    const nextPlayerId = session.turn_order[nextIndex] ?? null
    return autoDrawForPlayer(
      supabase,
      { ...session, claim_passes: [], status_message: `${playerName(players, nextPlayerId)} draws next` },
      states,
      players,
      timerSeconds,
      nextPlayerId,
      nextIndex
    )
  }

  return persistMahjongSession(supabase, gameId, { claim_passes: claimPasses }, session.updated_at)
}

export async function processMahjongRiichi(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string }> {
  const { session, states, players, timerSeconds, error } = await loadMahjong(supabase, gameId)
  if (error) return { error }
  if (!session) return { error: 'Game not found' }
  if (parseMahjongRuleset(session.ruleset) !== 'riichi') return { error: 'Riichi is only available in Riichi ruleset' }
  if (session.phase !== 'discard') return { error: 'You can only declare Riichi before discarding' }
  if (currentMahjongPlayerId(session) !== playerId) return { error: "It's not your turn" }

  const state = stateFor(states, playerId)
  if (!state) return { error: 'Player not found' }
  if (state.riichi_declared) return { error: 'Riichi already declared' }
  if (!isClosedHand(state.melds)) return { error: 'Riichi requires a closed hand' }
  if (!isTenpai(state.hand, state.melds)) return { error: 'Riichi requires a tenpai hand' }
  if ((session.scores?.[playerId] ?? 0) < 1000) return { error: 'Riichi requires at least 1000 points' }

  const { error: stateError } = await supabase
    .from('mahjong_player_state')
    .update({
      riichi_declared: true,
      riichi_discard_index: session.discard_pile.length,
    })
    .eq('id', state.id)
  if (stateError) return { error: stateError.message }

  const ippatsu = Array.from(new Set([...(session.ippatsu_eligible_player_ids ?? []), playerId]))
  const nextScores =
    session.scores && Object.keys(session.scores).length > 0
      ? { ...session.scores, [playerId]: (session.scores[playerId] ?? 0) - 1000 }
      : session.scores
  const sessionWrite = await persistMahjongSession(
    supabase,
    gameId,
    {
      riichi_sticks: (session.riichi_sticks ?? 0) + 1,
      scores: nextScores,
      ippatsu_eligible_player_ids: ippatsu,
      last_action: 'riichi',
      status_message: `${playerName(players, playerId)} declared Riichi and must discard`,
      turn_deadline_at: mahjongTurnDeadline(timerSeconds),
    },
    session.updated_at
  )
  return { error: sessionWrite.error }
}

export async function processMahjongExpireTurn(supabase: SupabaseClient, gameId: string): Promise<{ error?: string }> {
  const { session, states, players, timerSeconds, error } = await loadMahjong(supabase, gameId)
  if (error) return { error }
  if (!session) return { error: 'Game not found' }
  if (session.phase === 'finished') return {}
  if (!session.turn_deadline_at || new Date(session.turn_deadline_at).getTime() > Date.now()) return {}

  if (session.phase === 'claim') {
    const eligible = eligibleClaimPlayerIds(session, states)
    if (eligible.length === 0 || !session.last_discard) return {}
    const nextIndex = nextTurnIndexAfter(session, session.last_discard.player_id)
    const nextPlayerId = session.turn_order[nextIndex] ?? null
    return autoDrawForPlayer(
      supabase,
      { ...session, claim_passes: [], status_message: 'No calls — next player draws' },
      states,
      players,
      timerSeconds,
      nextPlayerId,
      nextIndex
    )
  }

  const currentPlayer = currentMahjongPlayerId(session)
  if (!currentPlayer) return {}

  if (session.phase === 'draw') {
    const result = await processMahjongDraw(supabase, gameId, currentPlayer)
    return { error: result.error }
  }

  const state = stateFor(states, currentPlayer)
  const fallbackTile = state?.riichi_declared ? state.last_drawn_tile : state?.hand[0]
  if (!fallbackTile) return {}
  return processMahjongDiscard(supabase, gameId, currentPlayer, fallbackTile)
}

export async function canMahjongPlayAgain(
  supabase: SupabaseClient,
  gameId: string,
  gameStatus: string
): Promise<boolean> {
  if (gameStatus === 'waiting' || gameStatus === 'finished') return true
  if (gameStatus !== 'active') return false
  const { data } = await supabase.from('mahjong_sessions').select('phase').eq('game_id', gameId).maybeSingle()
  return data?.phase === 'finished'
}

export async function clearMahjongSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  const { error: statesError } = await supabase.from('mahjong_player_state').delete().eq('game_id', gameId)
  if (statesError) return { error: statesError.message }
  const { error: sessionError } = await supabase.from('mahjong_sessions').delete().eq('game_id', gameId)
  return { error: sessionError?.message ?? null }
}

export async function removeMahjongPlayer(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  playerName?: string
): Promise<{ error: string | null }> {
  const { data: sessionRaw } = await supabase.from('mahjong_sessions').select('*').eq('game_id', gameId).maybeSingle()
  const session = sessionRaw as MahjongSession | null
  const now = new Date().toISOString()

  if (session && session.phase !== 'finished' && session.turn_order.includes(playerId)) {
    const turnOrder = session.turn_order.filter((id) => id !== playerId)
    const removedName = playerName ?? 'A player'
    const sessionWrite = await persistMahjongSession(
      supabase,
      gameId,
      {
        turn_order: turnOrder,
        current_turn_index: 0,
        phase: 'finished',
        hand_result: 'abortive_draw',
        status_message: `${removedName} left. Mahjong table closed.`,
        turn_deadline_at: null,
      },
      session.updated_at
    )
    if (sessionWrite.error) return { error: sessionWrite.error }

    const finish = await markGameFinished(supabase, gameId, now)
    if (finish.error) return { error: finish.error.message }
  }

  const { error: stateError } = await supabase
    .from('mahjong_player_state')
    .delete()
    .eq('game_id', gameId)
    .eq('player_id', playerId)
  if (stateError) return { error: stateError.message }

  const { error: playerError } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
  return { error: playerError?.message ?? null }
}
