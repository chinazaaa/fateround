import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import type {
  MonopolyAuctionState,
  MonopolyBoard,
  MonopolyLastCardEvent,
  MonopolyLastCashEvent,
  MonopolyLastTradeEvent,
  MonopolyLastRentEvent,
  MonopolyPendingTrade,
  MonopolyPhase,
  MonopolyPlayerState,
  MonopolyPendingDebt,
  Game,
} from '@/types'
import {
  MONOPOLY_BOARD,
  MONOPOLY_BOARD_SIZE,
  MONOPOLY_GO_SALARY,
  MONOPOLY_GO_TO_JAIL_POSITION,
  MONOPOLY_HOUSES_IN_BANK,
  MONOPOLY_HOUSES_UNDER_HOTEL,
  MONOPOLY_HOTELS_IN_BANK,
  MONOPOLY_HOTEL_LEVEL,
  MONOPOLY_MAX_HOUSES_PER_PROPERTY,
  MONOPOLY_JAIL_FINE,
  MONOPOLY_JAIL_POSITION,
  MONOPOLY_STARTING_CASH,
  formatMonopolyMoney,
  mortgageValue,
  spaceAt,
  spacesInGroup,
  unmortgageCost,
  type MonopolyColorGroup,
  type MonopolySpace,
} from '@/lib/monopoly-board'
import { MONOPOLY_AUCTION_TIMER_SECONDS, MONOPOLY_DEFAULT_TURN_TIMER } from '@/lib/supabase-selects'
import {
  applyCardEffect,
  createShuffledDeck,
  drawCard,
  goSalaryForCard,
  type CardKind,
} from '@/lib/monopoly-cards'
import {
  canAddHotel,
  canAddHouse,
  canRemoveHotel,
  canRemoveHouse,
  groupHasBuildings,
} from '@/lib/monopoly-build'
import {
  buildingLevel,
  computeRent,
  parseBuildings,
  parseJsonRecord,
  parseMortgaged,
} from '@/lib/monopoly-rent'
import { normalizePendingTrade, normalizeTradePropertyList } from '@/lib/monopoly-trade-messages'
import { secondsUntilDeadline } from '@/lib/round-timing'

export * from '@/lib/monopoly-board'
export { formatMonopolyMoney } from '@/lib/monopoly-board'
export type { MonopolyColorGroup, MonopolySpace, MonopolySpaceType, BuildingLevel } from '@/lib/monopoly-board'
export { computeRent } from '@/lib/monopoly-rent'

export const MONOPOLY_MIN_PLAYERS = 2
export const MONOPOLY_MAX_PLAYERS = 6
export const MONOPOLY_DEFAULT_MAX_PLAYERS = 6

/** Per-turn timer options (seconds). 0 = off. */
export const MONOPOLY_TURN_TIMER_OPTIONS = [0, 30, 60, 90, 120] as const

/** Whole-game session length options (seconds). 0 = no limit. */
export const MONOPOLY_GAME_DURATION_OPTIONS = [0, 900, 1800, 2700, 3600, 5400, 7200] as const

/** Host can add this much time mid-game (seconds). */
export const MONOPOLY_GAME_TIME_EXTENSION_OPTIONS = [600, 900, 1800] as const

export const MONOPOLY_MAX_GAME_DURATION_SECONDS = 14_400

export function clampMonopolyTurnTimer(raw: unknown): number {
  const n = Number(raw ?? 0)
  return (MONOPOLY_TURN_TIMER_OPTIONS as readonly number[]).includes(n) ? n : MONOPOLY_DEFAULT_TURN_TIMER
}

export function clampMonopolyGameDuration(raw: unknown): number {
  const n = Number(raw ?? 0)
  return (MONOPOLY_GAME_DURATION_OPTIONS as readonly number[]).includes(n) ? n : 0
}

export function clampMonopolyTimeExtension(raw: unknown): number {
  const n = Number(raw ?? 0)
  return (MONOPOLY_GAME_TIME_EXTENSION_OPTIONS as readonly number[]).includes(n) ? n : 0
}

export function formatMonopolyGameDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return 'No limit'
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds / 3600 === 1 ? '' : 's'}`
  return `${Math.round(seconds / 60)} minutes`
}

export function monopolyTurnDeadline(timerSeconds: number): string | null {
  if (!timerSeconds || timerSeconds <= 0) return null
  return new Date(Date.now() + timerSeconds * 1000).toISOString()
}

async function getMonopolyTimerSeconds(supabase: SupabaseClient, gameId: string): Promise<number> {
  const { data } = await supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle()
  return (data?.timer_seconds ?? 0) as number
}

function monopolyDeadlineForPhase(timerSeconds: number, phase: MonopolyPhase): string | null {
  if (phase === 'finished') return null
  if (phase === 'auction') return monopolyTurnDeadline(MONOPOLY_AUCTION_TIMER_SECONDS)
  if (phase === 'roll' || phase === 'jail' || phase === 'buy' || phase === 'pay_rent' || phase === 'raise_funds') {
    return monopolyTurnDeadline(timerSeconds)
  }
  return null
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]!]
  }
  return next
}

export function parsePropertyOwners(raw: unknown): Record<string, string> {
  return { ...parseJsonRecord(raw) }
}

export function propertyOwnerId(owners: Record<string, string>, spaceIndex: number): string | undefined {
  return owners[String(spaceIndex)]
}

function applyPendingTradeToOwners(
  owners: Record<string, string>,
  trade: MonopolyPendingTrade
): Record<string, string> {
  const normalized = normalizePendingTrade(trade)
  const next = { ...owners }
  for (const idx of normalized.offer_properties) {
    next[String(idx)] = normalized.to_player_id
  }
  for (const idx of normalized.request_properties) {
    next[String(idx)] = normalized.from_player_id
  }
  return next
}

export function currentPlayerId(board: MonopolyBoard): string | null {
  const order = board.turn_order ?? []
  if (order.length === 0) return null
  return order[board.current_turn_index % order.length] ?? null
}

export function activePlayers(states: MonopolyPlayerState[]): MonopolyPlayerState[] {
  return states.filter((s) => !s.bankrupt)
}

export function rollDice(): { d1: number; d2: number; total: number; doubles: boolean } {
  const d1 = Math.floor(Math.random() * 6) + 1
  const d2 = Math.floor(Math.random() * 6) + 1
  return { d1, d2, total: d1 + d2, doubles: d1 === d2 }
}

export function playerCanBuyProperty(state: Pick<MonopolyPlayerState, 'passed_go_once'>): boolean {
  return state.passed_go_once === true
}

export function movePosition(from: number, steps: number): { to: number; passedGo: boolean } {
  const to = (from + steps) % MONOPOLY_BOARD_SIZE
  const passedGo = from + steps >= MONOPOLY_BOARD_SIZE
  return { to, passedGo }
}

/** First time passing GO unlocks buying/cards but pays no salary; £200 from the second lap onward. */
export function applyGoPass(
  cash: number,
  passedGoOnce: boolean
): { cash: number; passedGoOnce: boolean; collected: number } {
  if (passedGoOnce) {
    return { cash: cash + MONOPOLY_GO_SALARY, passedGoOnce: true, collected: MONOPOLY_GO_SALARY }
  }
  return { cash, passedGoOnce: true, collected: 0 }
}

function goPassStatusSuffix(collected: number): string {
  if (collected > 0) return `Passed GO — collected ${formatMonopolyMoney(collected)}. `
  return 'Passed GO — no salary on your first lap. '
}

export function nextTurnIndex(board: MonopolyBoard, states: MonopolyPlayerState[]): number {
  const order = board.turn_order
  if (order.length === 0) return 0
  let idx = board.current_turn_index
  for (let i = 0; i < order.length; i += 1) {
    idx = (idx + 1) % order.length
    const playerId = order[idx]
    const state = states.find((s) => s.player_id === playerId)
    if (state && !state.bankrupt) return idx
  }
  return board.current_turn_index
}

export function phaseForTurn(
  board: MonopolyBoard,
  states: MonopolyPlayerState[],
  turnIndex: number
): MonopolyPhase {
  const playerId = board.turn_order[turnIndex]
  const state = states.find((s) => s.player_id === playerId)
  if (state?.in_jail) return 'jail'
  return 'roll'
}

export function checkWinner(states: MonopolyPlayerState[]): string | null {
  const alive = activePlayers(states)
  if (alive.length === 1) return alive[0]!.player_id
  return null
}

function buildingAssetValue(space: MonopolySpace, level: number): number {
  if (level === 0) return 0
  const half = Math.floor((space.houseCost ?? 0) / 2)
  if (level === MONOPOLY_HOTEL_LEVEL) return half * MONOPOLY_HOUSES_UNDER_HOTEL
  return Math.min(level, MONOPOLY_MAX_HOUSES_PER_PROPERTY) * half
}

export function computeMonopolyNetWorth(
  state: MonopolyPlayerState,
  owners: Record<string, string>,
  buildings: Record<string, number>,
  mortgaged: Record<string, boolean>
): number {
  if (state.bankrupt) return 0
  let total = state.cash
  for (const [idx, ownerId] of Object.entries(owners)) {
    if (ownerId !== state.player_id) continue
    const spaceIndex = Number(idx)
    const space = spaceAt(spaceIndex)
    if (space.type !== 'property' && space.type !== 'station' && space.type !== 'utility') continue
    if (mortgaged[idx]) {
      total += mortgageValue(space)
    } else {
      total += space.price ?? 0
      total += buildingAssetValue(space, buildingLevel(buildings, spaceIndex))
    }
  }
  return total
}

export function rankMonopolyPlayers(
  states: MonopolyPlayerState[],
  owners: Record<string, string>,
  buildings: Record<string, number>,
  mortgaged: Record<string, boolean>
): { playerId: string; netWorth: number }[] {
  return activePlayers(states)
    .map((state) => ({
      playerId: state.player_id,
      netWorth: computeMonopolyNetWorth(state, owners, buildings, mortgaged),
    }))
    .sort((a, b) => b.netWorth - a.netWorth)
}

export type MonopolyStanding = {
  playerId: string
  name: string
  rank: number
  netWorth: number
  cash: number
  propertyCount: number
}

export function buildMonopolyStandings(
  states: MonopolyPlayerState[],
  players: { id: string; name: string }[],
  propertyOwners: unknown,
  propertyBuildings: unknown,
  mortgagedProperties: unknown
): MonopolyStanding[] {
  const owners = parsePropertyOwners(propertyOwners)
  const buildings = parseBuildings(propertyBuildings)
  const mortgaged = parseMortgaged(mortgagedProperties)

  return rankMonopolyPlayers(states, owners, buildings, mortgaged).map((row, index) => {
    const state = states.find((s) => s.player_id === row.playerId)
    return {
      playerId: row.playerId,
      name: players.find((p) => p.id === row.playerId)?.name ?? 'Player',
      rank: index + 1,
      netWorth: row.netWorth,
      cash: state?.cash ?? 0,
      propertyCount: playerProperties(owners, row.playerId).length,
    }
  })
}

export function resolveMonopolyWinnerId(
  states: MonopolyPlayerState[],
  owners: Record<string, string>,
  buildings: Record<string, number>,
  mortgaged: Record<string, boolean>,
  existingWinnerId?: string | null
): string | null {
  const byElimination = checkWinner(states)
  if (byElimination) return byElimination
  if (existingWinnerId) return existingWinnerId
  return rankMonopolyPlayers(states, owners, buildings, mortgaged)[0]?.playerId ?? null
}

export async function finishMonopolyGameEarly(
  supabase: SupabaseClient,
  gameId: string,
  options?: { reason?: 'host' | 'time_limit' }
): Promise<{ error: string | null }> {
  const { data: boardRaw } = await supabase.from('monopoly_boards').select('*').eq('game_id', gameId).maybeSingle()
  if (!boardRaw) return { error: 'Board not found' }
  const board = boardRaw as MonopolyBoard

  const { data: statesRaw } = await supabase
    .from('monopoly_player_state')
    .select('*')
    .eq('game_id', gameId)
  const states = (statesRaw ?? []) as MonopolyPlayerState[]

  const { data: playersRaw } = await supabase.from('players').select('id,name').eq('game_id', gameId)
  const players = playersRaw ?? []

  const owners = parsePropertyOwners(board.property_owners)
  const buildings = parseBuildings(board.property_buildings)
  const mortgaged = parseMortgaged(board.mortgaged_properties)

  const winnerId = resolveMonopolyWinnerId(states, owners, buildings, mortgaged, board.winner_player_id)
  const winnerName = winnerId ? players.find((p) => p.id === winnerId)?.name : null
  const winnerNetWorth =
    winnerId != null
      ? computeMonopolyNetWorth(
          states.find((s) => s.player_id === winnerId)!,
          owners,
          buildings,
          mortgaged
        )
      : null

  const statusMessage = winnerName
    ? options?.reason === 'time_limit'
      ? `Time's up! ${winnerName} wins with ${formatMonopolyMoney(winnerNetWorth ?? 0)} total assets.`
      : `${winnerName} wins with ${formatMonopolyMoney(winnerNetWorth ?? 0)} total assets!`
    : 'Game over!'

  const { error: boardError } = await supabase
    .from('monopoly_boards')
    .update({
      phase: 'finished',
      winner_player_id: winnerId,
      status_message: statusMessage,
      turn_deadline_at: null,
      auction_state: null,
      pending_trade: null,
      pending_space: null,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
  if (boardError) return { error: boardError.message }

  const { error: gameError } = await markGameFinished(supabase, gameId)
  if (gameError) return { error: gameError.message }

  return { error: null }
}

export function monopolyGameSessionExpired(
  sessionStartedAt: string | null | undefined,
  durationSeconds: number | null | undefined
): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false
  if (!sessionStartedAt) return false
  return secondsUntilDeadline(sessionStartedAt, durationSeconds) <= 0
}

export async function finishExpiredMonopolyGame(
  supabase: SupabaseClient,
  game: Pick<Game, 'id' | 'status' | 'session_started_at' | 'game_duration_seconds'>
): Promise<boolean> {
  if (game.status !== 'active') return false
  if (!monopolyGameSessionExpired(game.session_started_at, game.game_duration_seconds)) return false
  const { error } = await finishMonopolyGameEarly(supabase, game.id, { reason: 'time_limit' })
  return !error
}

export async function extendMonopolyGameDuration(
  supabase: SupabaseClient,
  gameId: string,
  extensionSeconds: number
): Promise<{ error?: string; newDurationSeconds?: number }> {
  const seconds = clampMonopolyTimeExtension(extensionSeconds)
  if (seconds <= 0) return { error: 'Invalid extension' }

  const { data: game } = await supabase
    .from('games')
    .select('id, status, game_duration_seconds')
    .eq('id', gameId)
    .maybeSingle()
  if (!game) return { error: 'Game not found' }
  if (game.status !== 'active') return { error: 'Game not active' }

  const current = game.game_duration_seconds ?? 0
  if (current <= 0) return { error: 'This game has no time limit to extend' }

  const next = current + seconds
  if (next > MONOPOLY_MAX_GAME_DURATION_SECONDS) {
    return {
      error: `Total game time cannot exceed ${formatMonopolyGameDuration(MONOPOLY_MAX_GAME_DURATION_SECONDS)}`,
    }
  }

  const { error: gameError } = await supabase
    .from('games')
    .update({ game_duration_seconds: next })
    .eq('id', gameId)
  if (gameError) return { error: gameError.message }

  await supabase
    .from('monopoly_boards')
    .update({
      status_message: `Host added ${formatMonopolyGameDuration(seconds)} — game continues.`,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  return { newDurationSeconds: next }
}

function parseDeck(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  return raw as number[]
}

function defaultBoardFields(): Partial<MonopolyBoard> {
  return {
    property_buildings: {},
    mortgaged_properties: {},
    houses_in_bank: MONOPOLY_HOUSES_IN_BANK,
    hotels_in_bank: MONOPOLY_HOTELS_IN_BANK,
    chance_deck: createShuffledDeck('chance'),
    community_deck: createShuffledDeck('community'),
    chance_discard: [],
    community_discard: [],
    auction_state: null,
    pending_trade: null,
  }
}

function finishTurnAfterSpaceAction(
  board: MonopolyBoard,
  states: MonopolyPlayerState[],
  playerId: string
): { turnIndex: number; phase: MonopolyPhase; consecutiveDoubles: number } {
  const extraRollPending = (board.consecutive_doubles ?? 0) > 0
  if (extraRollPending) {
    const playerState = states.find((s) => s.player_id === playerId)
    return {
      turnIndex: board.current_turn_index,
      phase: playerState?.in_jail ? 'jail' : 'roll',
      consecutiveDoubles: board.consecutive_doubles ?? 0,
    }
  }
  const turnIndex = nextTurnIndex(board, states)
  return {
    turnIndex,
    phase: phaseForTurn(board, states, turnIndex),
    consecutiveDoubles: 0,
  }
}

function buildAuctionState(
  spaceIndex: number,
  initiatorId: string,
  states: MonopolyPlayerState[]
): MonopolyAuctionState {
  const eligible = activePlayers(states).map((s) => s.player_id)
  return {
    space_index: spaceIndex,
    high_bid: 0,
    high_bidder_id: null,
    current_bidder_id: initiatorId,
    passed: [],
    eligible,
    initiator_id: initiatorId,
  }
}

function auctionShouldEnd(auction: MonopolyAuctionState): boolean {
  if (auction.high_bid <= 0) {
    return auction.passed.length >= auction.eligible.length
  }
  const othersPassed = auction.passed.filter((id) => id !== auction.high_bidder_id).length
  return othersPassed >= auction.eligible.length - 1
}

function nextAuctionBidder(auction: MonopolyAuctionState): string {
  const idx = auction.eligible.indexOf(auction.current_bidder_id)
  for (let i = 1; i <= auction.eligible.length; i += 1) {
    const next = auction.eligible[(idx + i) % auction.eligible.length]!
    if (!auction.passed.includes(next)) return next
  }
  return auction.current_bidder_id
}

type LandingResolution = {
  cash: number
  position: number
  inJail: boolean
  jailTurns: number
  getOutCards: number
  phase: MonopolyPhase
  pendingSpace: number | null
  extraTurn: boolean
  statusSuffix: string
  auctionState?: MonopolyAuctionState | null
  pendingDebt?: MonopolyPendingDebt
}

function resolveSpaceLanding(
  landed: MonopolySpace,
  ctx: {
    playerId: string
    cash: number
    position: number
    inJail: boolean
    jailTurns: number
    getOutCards: number
    owners: Record<string, string>
    buildings: Record<string, number>
    mortgaged: Record<string, boolean>
    states: MonopolyPlayerState[]
    diceTotal: number
    extraTurn: boolean
    passedGoOnce: boolean
  }
): LandingResolution {
  let { cash, position, inJail, jailTurns, getOutCards, extraTurn } = ctx
  let phase: MonopolyPhase = 'roll'
  let pendingSpace: number | null = null
  let statusSuffix = ''
  let auctionState: MonopolyAuctionState | null | undefined

  if (landed.type === 'go_to_jail') {
    return {
      cash,
      position: MONOPOLY_JAIL_POSITION,
      inJail: true,
      jailTurns: 0,
      getOutCards,
      phase: 'roll',
      pendingSpace: null,
      extraTurn: false,
      statusSuffix: ' Go to Jail!',
    }
  }

  if (landed.type === 'tax') {
    if (!ctx.passedGoOnce) {
      statusSuffix = ' Pass GO once before tax applies on your first lap.'
      return { cash, position, inJail, jailTurns, getOutCards, phase: 'roll', pendingSpace: null, extraTurn, statusSuffix }
    }
    const amount = landed.index === 4 ? 200 : 100
    if (cash < amount) {
      return {
        cash,
        position,
        inJail,
        jailTurns,
        getOutCards,
        phase: 'raise_funds',
        pendingSpace: landed.index,
        extraTurn: false,
        statusSuffix: ` Need ${formatMonopolyMoney(amount)} for tax — mortgage or sell assets, pay, or forfeit.`,
        pendingDebt: {
          player_id: ctx.playerId,
          creditor_player_id: null,
          amount,
          reason: `Owe ${formatMonopolyMoney(amount)} tax on ${landed.name}`,
          debt_type: 'tax',
          space_index: landed.index,
        },
      }
    }
    cash -= amount
    statusSuffix = ` Paid ${formatMonopolyMoney(amount)} tax.`
    return { cash, position, inJail, jailTurns, getOutCards, phase: 'roll', pendingSpace, extraTurn, statusSuffix }
  }

  if (landed.type === 'property' || landed.type === 'station' || landed.type === 'utility') {
    const recordedOwnerId = ctx.owners[String(landed.index)]
    const ownerState = recordedOwnerId
      ? ctx.states.find((s) => s.player_id === recordedOwnerId)
      : undefined
    const ownerId =
      recordedOwnerId && ownerState && !ownerState.bankrupt ? recordedOwnerId : undefined
    if (!ownerId) {
      if (!ctx.passedGoOnce) {
        statusSuffix = ' Pass GO once before you can buy property.'
        return { cash, position, inJail, jailTurns, getOutCards, phase: 'roll', pendingSpace: null, extraTurn, statusSuffix }
      }
      if (cash >= (landed.price ?? 0)) {
        phase = 'buy'
        pendingSpace = landed.index
        statusSuffix = ` Buy for ${formatMonopolyMoney(landed.price ?? 0)}?`
      } else {
        phase = 'auction'
        pendingSpace = landed.index
        auctionState = buildAuctionState(landed.index, ctx.playerId, ctx.states)
        statusSuffix = ` Cannot afford list price — property goes to auction.`
      }
    } else if (ownerId !== ctx.playerId) {
      if (ctx.mortgaged[String(landed.index)]) {
        statusSuffix = ' Property is mortgaged — no rent due.'
      } else {
        const rent = computeRent(landed, ctx.owners, ownerId, ctx.diceTotal, ctx.buildings, ctx.mortgaged)
        if (rent > 0 && cash < rent) {
          return {
            cash,
            position,
            inJail,
            jailTurns,
            getOutCards,
            phase: 'raise_funds',
            pendingSpace: landed.index,
            extraTurn: false,
            statusSuffix: ` Need ${formatMonopolyMoney(rent)} rent — mortgage or sell assets, pay, or forfeit.`,
            pendingDebt: {
              player_id: ctx.playerId,
              creditor_player_id: ownerId,
              amount: rent,
              reason: `Owe ${formatMonopolyMoney(rent)} rent on ${landed.name}`,
              debt_type: 'rent',
              space_index: landed.index,
            },
          }
        } else if (rent > 0) {
          phase = 'pay_rent'
          pendingSpace = landed.index
          statusSuffix = ` You owe ${formatMonopolyMoney(rent)} rent on ${landed.name}.`
        }
      }
    }
  }

  return { cash, position, inJail, jailTurns, getOutCards, phase, pendingSpace, extraTurn, statusSuffix, auctionState }
}

async function updatePlayerAndBoard(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  playerPatch: Partial<MonopolyPlayerState>,
  boardPatch: Partial<MonopolyBoard>
): Promise<void> {
  await supabase.from('monopoly_player_state').update(playerPatch).eq('game_id', gameId).eq('player_id', playerId)
  await supabase
    .from('monopoly_boards')
    .update({ ...boardPatch, updated_at: new Date().toISOString() })
    .eq('game_id', gameId)
}

async function applyMultiPlayerCashDeltas(
  supabase: SupabaseClient,
  gameId: string,
  states: MonopolyPlayerState[],
  drawerId: string,
  drawerDelta: number,
  others: Record<string, number>
): Promise<{ drawerCash: number; error?: string; failedPlayerId?: string }> {
  const drawer = states.find((s) => s.player_id === drawerId)
  if (!drawer) return { drawerCash: 0, error: 'Player not found' }

  const drawerCash = drawer.cash + drawerDelta

  for (const [id, delta] of Object.entries(others)) {
    const target = states.find((s) => s.player_id === id)
    if (!target) continue
    if (target.cash + delta < 0) {
      return { drawerCash, error: 'Insufficient funds', failedPlayerId: id }
    }
  }
  if (drawerCash < 0) {
    return { drawerCash, error: 'Insufficient funds', failedPlayerId: drawerId }
  }

  for (const [id, delta] of Object.entries(others)) {
    const target = states.find((s) => s.player_id === id)!
    await supabase
      .from('monopoly_player_state')
      .update({ cash: target.cash + delta })
      .eq('game_id', gameId)
      .eq('player_id', id)
  }

  return { drawerCash }
}

function nextTradeEvent(
  board: Pick<MonopolyBoard, 'last_trade_event'>,
  fromPlayerId: string,
  toPlayerId: string,
  outcome: MonopolyLastTradeEvent['outcome']
): MonopolyLastTradeEvent {
  return {
    seq: (board.last_trade_event?.seq ?? 0) + 1,
    from_player_id: fromPlayerId,
    to_player_id: toPlayerId,
    outcome,
  }
}

async function playerNamesById(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<Record<string, string>> {
  if (playerIds.length === 0) return {}
  const { data } = await supabase.from('players').select('id,name').eq('game_id', gameId).in('id', playerIds)
  const names: Record<string, string> = {}
  for (const row of data ?? []) names[row.id] = row.name
  return names
}

function nextCashEvent(
  board: Pick<MonopolyBoard, 'last_cash_event'>,
  playerId: string,
  previousCash: number,
  newCash: number,
  label: string,
  opts?: { bankrupt?: boolean }
): MonopolyLastCashEvent {
  return {
    seq: (board.last_cash_event?.seq ?? 0) + 1,
    player_id: playerId,
    change: newCash - previousCash,
    balance_after: newCash,
    label,
    ...(opts?.bankrupt ? { bankrupt: true } : {}),
  }
}

async function finalizeAuction(
  supabase: SupabaseClient,
  gameId: string,
  board: MonopolyBoard,
  states: MonopolyPlayerState[],
  auction: MonopolyAuctionState,
  turnPlayerId: string
): Promise<{ error?: string }> {
  const space = spaceAt(auction.space_index)
  const owners = parsePropertyOwners(board.property_owners)
  let statusMessage = ''
  let lastCashEvent: MonopolyLastCashEvent | undefined

  if (auction.high_bid > 0 && auction.high_bidder_id) {
    const winner = states.find((s) => s.player_id === auction.high_bidder_id)
    if (!winner || winner.cash < auction.high_bid) {
      statusMessage = `Auction for ${space.name} — winning bid invalid, property unsold.`
    } else {
      owners[String(auction.space_index)] = auction.high_bidder_id
      const newCash = winner.cash - auction.high_bid
      lastCashEvent = nextCashEvent(board, auction.high_bidder_id, winner.cash, newCash, `Won auction — ${space.name}`)
      await supabase
        .from('monopoly_player_state')
        .update({ cash: newCash })
        .eq('game_id', gameId)
        .eq('player_id', auction.high_bidder_id)
      statusMessage = `${space.name} sold at auction for ${formatMonopolyMoney(auction.high_bid)}.`
    }
  } else {
    statusMessage = `Auction for ${space.name} — no bids, property remains with the Bank.`
  }

  const turnFinish = finishTurnAfterSpaceAction(board, states, turnPlayerId)
  const timerSeconds = await getMonopolyTimerSeconds(supabase, gameId)
  await supabase
    .from('monopoly_boards')
    .update({
      property_owners: owners,
      phase: turnFinish.phase,
      auction_state: null,
      pending_space: null,
      current_turn_index: turnFinish.turnIndex,
      consecutive_doubles: turnFinish.consecutiveDoubles,
      status_message: statusMessage,
      ...(lastCashEvent ? { last_cash_event: lastCashEvent } : {}),
      turn_deadline_at: monopolyDeadlineForPhase(timerSeconds, turnFinish.phase),
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  return {}
}

export async function initializeMonopolyGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[],
  timerSeconds = 0
): Promise<{ error: string | null }> {
  const turnOrder = shuffle(playerIds)
  const stateRows = turnOrder.map((playerId, index) => ({
    game_id: gameId,
    player_id: playerId,
    position: 0,
    cash: MONOPOLY_STARTING_CASH,
    player_order: index,
  }))

  const { error: stateError } = await supabase.from('monopoly_player_state').insert(stateRows)
  if (stateError) return { error: stateError.message }

  const { error: boardError } = await supabase.from('monopoly_boards').insert({
    game_id: gameId,
    turn_order: turnOrder,
    current_turn_index: 0,
    phase: 'roll',
    property_owners: {},
    status_message: 'Game started — pass GO once before you can buy property.',
    turn_deadline_at: monopolyTurnDeadline(timerSeconds),
    ...defaultBoardFields(),
  })
  if (boardError) return { error: boardError.message }

  return { error: null }
}

export async function addMonopolyLateJoinPlayer(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error: string | null }> {
  const { data: board } = await supabase.from('monopoly_boards').select('*').eq('game_id', gameId).maybeSingle()
  if (!board) return { error: 'Game board not found' }

  const { data: existing } = await supabase
    .from('monopoly_player_state')
    .select('id')
    .eq('game_id', gameId)
    .eq('player_id', playerId)
    .maybeSingle()
  if (existing) return { error: null }

  const turnOrder = [...((board.turn_order as string[]) ?? []), playerId]
  const playerOrder = turnOrder.length - 1

  const { error: stateError } = await supabase.from('monopoly_player_state').insert({
    game_id: gameId,
    player_id: playerId,
    position: 0,
    cash: MONOPOLY_STARTING_CASH,
    player_order: playerOrder,
  })
  if (stateError) return { error: stateError.message }

  const { error: boardError } = await supabase
    .from('monopoly_boards')
    .update({ turn_order: turnOrder })
    .eq('game_id', gameId)
  if (boardError) return { error: boardError.message }

  return { error: null }
}

export async function clearMonopolySessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  for (const table of ['monopoly_player_state', 'monopoly_boards'] as const) {
    const { error } = await supabase.from(table).delete().eq('game_id', gameId)
    if (error) return { error: error.message }
  }
  return { error: null }
}

export async function processMonopolyRoll(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string }> {
  const { data: boardRaw } = await supabase.from('monopoly_boards').select('*').eq('game_id', gameId).maybeSingle()
  if (!boardRaw) return { error: 'Board not found' }
  const board = boardRaw as MonopolyBoard

  const { data: statesRaw } = await supabase
    .from('monopoly_player_state')
    .select('*')
    .eq('game_id', gameId)
    .order('player_order')
  if (!statesRaw?.length) return { error: 'No player states' }
  const states = statesRaw as MonopolyPlayerState[]

  const currentId = currentPlayerId(board)
  if (currentId !== playerId) return { error: 'Not your turn' }
  if (board.phase !== 'roll' && board.phase !== 'jail') return { error: 'Cannot roll right now' }

  const state = states.find((s) => s.player_id === playerId)
  if (!state || state.bankrupt) return { error: 'Invalid player' }

  const timerSeconds = await getMonopolyTimerSeconds(supabase, gameId)

  let owners = parsePropertyOwners(board.property_owners)
  let buildings = parseBuildings(board.property_buildings)
  let mortgaged = parseMortgaged(board.mortgaged_properties)
  let housesInBank = board.houses_in_bank ?? MONOPOLY_HOUSES_IN_BANK
  let hotelsInBank = board.hotels_in_bank ?? MONOPOLY_HOTELS_IN_BANK

  const repaired = repairStaleBankruptOwnership(
    states,
    owners,
    buildings,
    mortgaged,
    housesInBank,
    hotelsInBank
  )
  if (repaired.repaired) {
    owners = repaired.owners
    buildings = repaired.buildings
    mortgaged = repaired.mortgaged
    housesInBank = repaired.housesInBank
    hotelsInBank = repaired.hotelsInBank
    await supabase
      .from('monopoly_boards')
      .update({
        property_owners: owners,
        property_buildings: buildings,
        mortgaged_properties: mortgaged,
        houses_in_bank: housesInBank,
        hotels_in_bank: hotelsInBank,
        updated_at: new Date().toISOString(),
      })
      .eq('game_id', gameId)
  }

  let chanceDeck = parseDeck(board.chance_deck)
  let communityDeck = parseDeck(board.community_deck)
  let chanceDiscard = parseDeck(board.chance_discard)
  let communityDiscard = parseDeck(board.community_discard)

  const dice = rollDice()
  let consecutiveDoubles = board.consecutive_doubles ?? 0
  let cash = state.cash
  let position = state.position
  let inJail = state.in_jail
  let jailTurns = state.jail_turns
  let getOutCards = state.get_out_of_jail_free
  let passedGoOnce = state.passed_go_once ?? false
  let phase: MonopolyPhase = 'roll'
  let pendingSpace: number | null = null
  let auctionState: MonopolyAuctionState | null = null
  let statusMessage = ''
  let lastCardEvent: MonopolyLastCardEvent | null = null
  let extraTurn = false
  let pendingDebt: MonopolyPendingDebt | null = null

  if (board.phase === 'jail') {
    jailTurns += 1
    if (dice.doubles) {
      inJail = false
      jailTurns = 0
      statusMessage = `Rolled doubles (${dice.d1}+${dice.d2}) — out of jail!`
      const move = movePosition(position, dice.total)
      position = move.to
      if (move.passedGo) {
        const goPass = applyGoPass(cash, passedGoOnce)
        cash = goPass.cash
        passedGoOnce = goPass.passedGoOnce
      }
    } else if (jailTurns >= 3) {
      if (cash < MONOPOLY_JAIL_FINE) {
        await updatePlayerAndBoard(
          supabase,
          gameId,
          playerId,
          { cash, position, in_jail: inJail, jail_turns: jailTurns, get_out_of_jail_free: getOutCards, passed_go_once: passedGoOnce },
          { last_dice: dice }
        )
        return enterRaiseFundsPhase(supabase, gameId, board, {
          player_id: playerId,
          creditor_player_id: null,
          amount: MONOPOLY_JAIL_FINE,
          reason: `Need ${formatMonopolyMoney(MONOPOLY_JAIL_FINE)} to leave jail`,
          debt_type: 'jail',
          space_index: MONOPOLY_JAIL_POSITION,
        }, { last_dice: dice, phase: 'jail' })
      }
      cash -= MONOPOLY_JAIL_FINE
      inJail = false
      jailTurns = 0
      statusMessage = `Paid ${formatMonopolyMoney(MONOPOLY_JAIL_FINE)} to leave jail. Rolled ${dice.d1}+${dice.d2}.`
      const move = movePosition(position, dice.total)
      position = move.to
      if (move.passedGo) {
        const goPass = applyGoPass(cash, passedGoOnce)
        cash = goPass.cash
        passedGoOnce = goPass.passedGoOnce
      }
    } else {
      const turnIndex = nextTurnIndex(board, states)
      const nextPhase = phaseForTurn(board, states, turnIndex)
      await supabase.from('monopoly_player_state').update({ jail_turns: jailTurns }).eq('game_id', gameId).eq('player_id', playerId)
      await supabase
        .from('monopoly_boards')
        .update({
          last_dice: dice,
          phase: nextPhase,
          current_turn_index: turnIndex,
          status_message: `Still in jail — rolled ${dice.d1}+${dice.d2} (no doubles). Attempt ${jailTurns}/3.`,
          updated_at: new Date().toISOString(),
          turn_deadline_at: monopolyDeadlineForPhase(timerSeconds, nextPhase),
        })
        .eq('game_id', gameId)
      return {}
    }
  } else {
    if (dice.doubles) {
      consecutiveDoubles += 1
      if (consecutiveDoubles >= 3) {
        await updatePlayerAndBoard(
          supabase,
          gameId,
          playerId,
          { cash, position: MONOPOLY_JAIL_POSITION, in_jail: true, jail_turns: 0 },
          {
            last_dice: dice,
            consecutive_doubles: 0,
            phase: 'roll',
            current_turn_index: nextTurnIndex(board, states),
            status_message: 'Three doubles in a row — Go to Jail!',
            pending_space: null,
            auction_state: null,
          }
        )
        return {}
      }
      extraTurn = true
    } else {
      consecutiveDoubles = 0
    }

    const move = movePosition(position, dice.total)
    position = move.to
    if (move.passedGo) {
      const goPass = applyGoPass(cash, passedGoOnce)
      cash = goPass.cash
      passedGoOnce = goPass.passedGoOnce
      statusMessage = goPassStatusSuffix(goPass.collected)
    }
  }

  const landed = spaceAt(position)
  statusMessage += `Landed on ${landed.name}.`

  const landingCtx = {
    playerId,
    cash,
    position,
    inJail,
    jailTurns,
    getOutCards,
    owners,
    buildings,
    mortgaged,
    states,
    diceTotal: dice.total,
    extraTurn,
    passedGoOnce,
  }

  if (landed.type === 'chance' || landed.type === 'community') {
    if (!passedGoOnce) {
      const label = landed.type === 'chance' ? 'Chance' : 'Community Chest'
      statusMessage += ` Pass GO once before drawing ${label} cards.`
      phase = 'roll'
    } else {
    const kind: CardKind = landed.type
    const drawn = drawCard(kind, kind === 'chance' ? chanceDeck : communityDeck, kind === 'chance' ? chanceDiscard : communityDiscard)
    if (kind === 'chance') {
      chanceDeck = drawn.deck
      chanceDiscard = drawn.discard
    } else {
      communityDeck = drawn.deck
      communityDiscard = drawn.discard
    }

    const card = drawn.card
    const otherCount = activePlayers(states).filter((s) => s.player_id !== playerId).length
    lastCardEvent = {
      seq: (board.last_card_event?.seq ?? 0) + 1,
      kind,
      drawn_by_player_id: playerId,
      card_message: card.message,
      effect: card.effect,
      amount: card.amount,
      other_player_count: otherCount,
    }
    statusMessage += ` Drew ${kind === 'chance' ? 'Chance' : 'Community Chest'}.`

    const effect = applyCardEffect(card, {
      playerId,
      position,
      activePlayerIds: activePlayers(states).map((s) => s.player_id),
      buildings,
      owners,
    })

    if (effect.goToJail) {
      position = MONOPOLY_JAIL_POSITION
      inJail = true
      jailTurns = 0
      extraTurn = false
      phase = 'roll'
    } else {
      if (effect.getOutOfJail) getOutCards += 1

      const multi = await applyMultiPlayerCashDeltas(
        supabase,
        gameId,
        states,
        playerId,
        effect.cashDelta,
        effect.playerCashDeltas
      )
      if (multi.error) {
        const failedId = multi.failedPlayerId ?? playerId
        const owed =
          failedId === playerId
            ? Math.abs(effect.cashDelta)
            : Math.abs(effect.playerCashDeltas[failedId] ?? 0)
        const reason =
          failedId === playerId
            ? card.message
            : `Could not pay ${formatMonopolyMoney(owed)} for card: ${card.message}`
        if (failedId !== playerId) {
          return bankruptPlayer(
            supabase,
            gameId,
            board,
            states,
            failedId,
            reason,
            playerId,
            owed
          )
        }
        await updatePlayerAndBoard(
          supabase,
          gameId,
          playerId,
          { cash, position, in_jail: inJail, jail_turns: jailTurns, get_out_of_jail_free: getOutCards, passed_go_once: passedGoOnce },
          {
            last_dice: dice,
            chance_deck: chanceDeck,
            community_deck: communityDeck,
            chance_discard: chanceDiscard,
            community_discard: communityDiscard,
            ...(lastCardEvent ? { last_card_event: lastCardEvent } : {}),
          }
        )
        return enterRaiseFundsPhase(
          supabase,
          gameId,
          board,
          {
            player_id: playerId,
            creditor_player_id: null,
            amount: owed,
            reason,
            debt_type: 'card',
            space_index: position,
          },
          {
            last_dice: dice,
            chance_deck: chanceDeck,
            community_deck: communityDeck,
            chance_discard: chanceDiscard,
            community_discard: communityDiscard,
            ...(lastCardEvent ? { last_card_event: lastCardEvent } : {}),
          }
        )
      }
      cash = multi.drawerCash

      if (effect.moveTo !== undefined) {
        position = effect.moveTo
        const hadPassedGoOnce = passedGoOnce
        if (effect.passedGo) passedGoOnce = true
        const salary = goSalaryForCard(card, effect.passedGo ?? false, hadPassedGoOnce)
        if (salary > 0) {
          cash += salary
          statusMessage += ` Collected ${formatMonopolyMoney(salary)}.`
        } else if (effect.passedGo && !hadPassedGoOnce) {
          statusMessage += ' Passed GO — no salary on your first lap.'
        }
        statusMessage += ` Now on ${spaceAt(position).name}.`
        const afterCard = resolveSpaceLanding(spaceAt(position), {
          ...landingCtx,
          cash,
          position,
          getOutCards,
          extraTurn,
          passedGoOnce,
        })
        if (afterCard.pendingDebt) {
          pendingDebt = afterCard.pendingDebt
        }
        Object.assign(landingCtx, afterCard)
        cash = afterCard.cash
        position = afterCard.position
        inJail = afterCard.inJail
        jailTurns = afterCard.jailTurns
        getOutCards = afterCard.getOutCards
        phase = afterCard.phase
        pendingSpace = afterCard.pendingSpace
        extraTurn = afterCard.extraTurn
        auctionState = afterCard.auctionState ?? null
        statusMessage += afterCard.statusSuffix
      } else if (!effect.getOutOfJail) {
        phase = 'roll'
      } else {
        phase = 'roll'
      }
    }
    }
  } else {
    const resolution = resolveSpaceLanding(landed, landingCtx)
    if (resolution.pendingDebt) {
      pendingDebt = resolution.pendingDebt
    }
    cash = resolution.cash
    position = resolution.position
    inJail = resolution.inJail
    jailTurns = resolution.jailTurns
    getOutCards = resolution.getOutCards
    phase = resolution.phase
    pendingSpace = resolution.pendingSpace
    extraTurn = resolution.extraTurn
    auctionState = resolution.auctionState ?? null
    statusMessage += resolution.statusSuffix
  }

  const turnEnds = phase === 'roll' && !extraTurn
  const turnIndex = turnEnds ? nextTurnIndex(board, states) : board.current_turn_index
  const updatedStatesForPhase = states.map((s) =>
    s.player_id === playerId
      ? {
          ...s,
          cash,
          position,
          in_jail: inJail,
          jail_turns: jailTurns,
          get_out_of_jail_free: getOutCards,
          passed_go_once: passedGoOnce,
        }
      : s
  )
  const boardPhase: MonopolyPhase =
    phase === 'raise_funds'
      ? 'raise_funds'
      : turnEnds
        ? phaseForTurn(board, updatedStatesForPhase, turnIndex)
        : phase === 'roll' && extraTurn && inJail
          ? 'jail'
          : phase

  let lastCashEvent: MonopolyLastCashEvent | null = null
  if (cash !== state.cash) {
    const label = lastCardEvent
      ? 'Card effect'
      : landed.type === 'tax'
        ? `Tax (${landed.name})`
        : statusMessage.includes('Passed GO')
          ? 'Passed GO'
          : statusMessage.includes('jail')
            ? 'Jail fine'
            : 'Your turn'
    lastCashEvent = nextCashEvent(board, playerId, state.cash, cash, label)
  }

  await updatePlayerAndBoard(
    supabase,
    gameId,
    playerId,
    { cash, position, in_jail: inJail, jail_turns: jailTurns, get_out_of_jail_free: getOutCards, passed_go_once: passedGoOnce },
    {
      last_dice: dice,
      consecutive_doubles: consecutiveDoubles,
      phase: boardPhase,
      current_turn_index: turnIndex,
      status_message: statusMessage,
      pending_space: pendingSpace,
      auction_state: auctionState,
      chance_deck: chanceDeck,
      community_deck: communityDeck,
      chance_discard: chanceDiscard,
      community_discard: communityDiscard,
      ...(lastCardEvent ? { last_card_event: lastCardEvent } : {}),
      ...(pendingDebt ? { pending_debt: pendingDebt } : {}),
      ...(lastCashEvent ? { last_cash_event: lastCashEvent } : {}),
      turn_deadline_at: monopolyDeadlineForPhase(timerSeconds, boardPhase),
    }
  )

  const winner = checkWinner(
    ((await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId)).data as MonopolyPlayerState[]) ?? states
  )
  if (winner) {
    await supabase.from('monopoly_boards').update({ phase: 'finished', winner_player_id: winner, status_message: 'Game over!', turn_deadline_at: null }).eq('game_id', gameId)
    await markGameFinished(supabase, gameId)
  }

  return {}
}

export async function processMonopolyBuy(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  buy: boolean
): Promise<{ error?: string }> {
  const { data: boardRaw } = await supabase.from('monopoly_boards').select('*').eq('game_id', gameId).maybeSingle()
  if (!boardRaw) return { error: 'Board not found' }
  const board = boardRaw as MonopolyBoard
  if (board.phase !== 'buy') return { error: 'Not in buy phase' }
  if (currentPlayerId(board) !== playerId) return { error: 'Not your turn' }

  const spaceIndex = board.pending_space
  if (spaceIndex == null) return { error: 'No property pending' }

  const space = spaceAt(spaceIndex)
  const { data: state } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId).eq('player_id', playerId).maybeSingle()
  if (!state) return { error: 'Player not found' }
  if (!playerCanBuyProperty(state)) return { error: 'Pass GO once before you can buy property' }

  const owners = parsePropertyOwners(board.property_owners)
  const { data: statesRaw } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId)
  const states = (statesRaw ?? []) as MonopolyPlayerState[]
  const timerSeconds = await getMonopolyTimerSeconds(supabase, gameId)

  if (buy) {
    const price = space.price ?? 0
    if (state.cash < price) return { error: 'Not enough cash' }
    owners[String(spaceIndex)] = playerId
    const newCash = state.cash - price
    const lastCashEvent = nextCashEvent(board, playerId, state.cash, newCash, `Bought ${space.name}`)
    await supabase.from('monopoly_player_state').update({ cash: newCash }).eq('game_id', gameId).eq('player_id', playerId)
    const turnFinish = finishTurnAfterSpaceAction(board, states, playerId)
    await supabase
      .from('monopoly_boards')
      .update({
        property_owners: owners,
        phase: turnFinish.phase,
        pending_space: null,
        current_turn_index: turnFinish.turnIndex,
        consecutive_doubles: turnFinish.consecutiveDoubles,
        status_message: `Bought ${space.name} for ${formatMonopolyMoney(price)}.`,
        last_cash_event: lastCashEvent,
        turn_deadline_at: monopolyDeadlineForPhase(timerSeconds, turnFinish.phase),
        updated_at: new Date().toISOString(),
      })
      .eq('game_id', gameId)
    return {}
  }

  const auction = buildAuctionState(spaceIndex, playerId, states)
  await supabase
    .from('monopoly_boards')
    .update({
      phase: 'auction',
      auction_state: auction,
      status_message: `Auction started for ${space.name}.`,
      turn_deadline_at: monopolyDeadlineForPhase(timerSeconds, 'auction'),
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  return {}
}

export async function processMonopolyAuction(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  action: 'pass' | 'bid',
  amount?: number
): Promise<{ error?: string }> {
  const { data: boardRaw } = await supabase.from('monopoly_boards').select('*').eq('game_id', gameId).maybeSingle()
  if (!boardRaw) return { error: 'Board not found' }
  const board = boardRaw as MonopolyBoard
  if (board.phase !== 'auction' || !board.auction_state) return { error: 'No auction in progress' }

  const auction = board.auction_state
  if (auction.current_bidder_id !== playerId) return { error: 'Not your turn to bid' }

  const { data: statesRaw } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId)
  const states = (statesRaw ?? []) as MonopolyPlayerState[]
  const bidder = states.find((s) => s.player_id === playerId)
  if (!bidder || bidder.bankrupt) return { error: 'Invalid bidder' }

  let nextAuction = { ...auction }

  if (action === 'bid') {
    const bid = amount ?? 0
    if (bid <= nextAuction.high_bid) return { error: 'Bid must exceed current high bid' }
    if (bidder.cash < bid) return { error: 'Not enough cash' }
    nextAuction.high_bid = bid
    nextAuction.high_bidder_id = playerId
    nextAuction.passed = []
    nextAuction.current_bidder_id = nextAuctionBidder(nextAuction)
  } else {
    if (!nextAuction.passed.includes(playerId)) nextAuction.passed.push(playerId)
    if (auctionShouldEnd(nextAuction)) {
      return finalizeAuction(supabase, gameId, board, states, nextAuction, currentPlayerId(board)!)
    }
    nextAuction.current_bidder_id = nextAuctionBidder(nextAuction)
  }

  if (auctionShouldEnd(nextAuction) && action === 'pass') {
    return finalizeAuction(supabase, gameId, board, states, nextAuction, currentPlayerId(board)!)
  }

  const space = spaceAt(nextAuction.space_index)
  const timerSeconds = await getMonopolyTimerSeconds(supabase, gameId)
  await supabase
    .from('monopoly_boards')
    .update({
      auction_state: nextAuction,
      status_message:
        action === 'bid'
          ? `${space.name} — high bid ${formatMonopolyMoney(nextAuction.high_bid)}.`
          : `${space.name} — waiting for next bid.`,
      turn_deadline_at: monopolyDeadlineForPhase(timerSeconds, 'auction'),
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  return {}
}

export async function processMonopolyPayRent(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  opts?: { fromRaiseFunds?: boolean }
): Promise<{ error?: string }> {
  const { data: boardRaw } = await supabase.from('monopoly_boards').select('*').eq('game_id', gameId).maybeSingle()
  if (!boardRaw) return { error: 'Board not found' }
  const board = boardRaw as MonopolyBoard
  const fromRaiseFunds = opts?.fromRaiseFunds ?? false
  if (fromRaiseFunds) {
    if (board.phase !== 'raise_funds' || !board.pending_debt) return { error: 'No debt to settle' }
    if (board.pending_debt.player_id !== playerId) return { error: 'Not your debt' }
  } else if (board.phase !== 'pay_rent') {
    return { error: 'No rent due' }
  }
  if (currentPlayerId(board) !== playerId) return { error: 'Not your turn' }

  const spaceIndex =
    fromRaiseFunds
      ? (board.pending_debt?.space_index ?? board.pending_space)
      : board.pending_space
  if (spaceIndex == null) return { error: 'No property pending' }

  const space = spaceAt(spaceIndex)
  const owners = parsePropertyOwners(board.property_owners)
  const buildings = parseBuildings(board.property_buildings)
  const mortgaged = parseMortgaged(board.mortgaged_properties)
  const ownerId = owners[String(spaceIndex)]
  if (!ownerId || ownerId === playerId) return { error: 'Invalid rent state' }

  const rent = computeRent(space, owners, ownerId, board.last_dice?.total ?? 2, buildings, mortgaged)

  const { data: state } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId).eq('player_id', playerId).maybeSingle()
  const { data: ownerState } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId).eq('player_id', ownerId).maybeSingle()
  if (!state || !ownerState) return { error: 'Player not found' }

  if (state.cash < rent) {
    return enterRaiseFundsPhase(supabase, gameId, board, {
      player_id: playerId,
      creditor_player_id: ownerId,
      amount: rent,
      reason: `Owe ${formatMonopolyMoney(rent)} rent on ${space.name}`,
      debt_type: 'rent',
      space_index: spaceIndex,
    }, { pending_space: spaceIndex })
  }

  const payerCash = state.cash - rent
  const ownerCash = ownerState.cash + rent

  await supabase.from('monopoly_player_state').update({ cash: payerCash }).eq('game_id', gameId).eq('player_id', playerId)
  await supabase.from('monopoly_player_state').update({ cash: ownerCash }).eq('game_id', gameId).eq('player_id', ownerId)

  const { data: statesRaw } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId)
  const turnFinish = finishTurnAfterSpaceAction(board, (statesRaw ?? []) as MonopolyPlayerState[], playerId)
  const timerSeconds = await getMonopolyTimerSeconds(supabase, gameId)

  const lastRentEvent: MonopolyLastRentEvent = {
    seq: (board.last_rent_event?.seq ?? 0) + 1,
    payer_player_id: playerId,
    owner_player_id: ownerId,
    amount: rent,
    space_name: space.name,
  }

  await supabase
    .from('monopoly_boards')
    .update({
      phase: turnFinish.phase,
      pending_space: null,
      pending_debt: null,
      current_turn_index: turnFinish.turnIndex,
      consecutive_doubles: turnFinish.consecutiveDoubles,
      status_message: `Rent paid on ${space.name}.`,
      last_rent_event: lastRentEvent,
      turn_deadline_at: monopolyDeadlineForPhase(timerSeconds, turnFinish.phase),
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  return {}
}

export async function processMonopolyJailPay(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  method: 'pay' | 'card'
): Promise<{ error?: string }> {
  const { data: board } = await supabase.from('monopoly_boards').select('*').eq('game_id', gameId).maybeSingle()
  if (!board) return { error: 'Board not found' }
  if (board.phase !== 'jail') return { error: 'Not in jail phase' }
  if (currentPlayerId(board as MonopolyBoard) !== playerId) return { error: 'Not your turn' }

  const { data: state } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId).eq('player_id', playerId).maybeSingle()
  if (!state?.in_jail) return { error: 'Not in jail' }

  if (method === 'card') {
    if (state.get_out_of_jail_free < 1) return { error: 'No Get Out of Jail Free card' }
    await supabase
      .from('monopoly_player_state')
      .update({ in_jail: false, jail_turns: 0, get_out_of_jail_free: state.get_out_of_jail_free - 1 })
      .eq('game_id', gameId)
      .eq('player_id', playerId)
    await supabase
      .from('monopoly_boards')
      .update({ phase: 'roll', status_message: 'Used Get Out of Jail Free card — roll to move!' })
      .eq('game_id', gameId)
    return {}
  }

  if (state.cash < MONOPOLY_JAIL_FINE) return { error: 'Not enough cash' }
  await supabase
    .from('monopoly_player_state')
    .update({ cash: state.cash - MONOPOLY_JAIL_FINE, in_jail: false, jail_turns: 0 })
    .eq('game_id', gameId)
    .eq('player_id', playerId)
  await supabase
    .from('monopoly_boards')
    .update({ phase: 'roll', status_message: `Paid ${formatMonopolyMoney(MONOPOLY_JAIL_FINE)} — roll to move!` })
    .eq('game_id', gameId)
  return {}
}

export async function processMonopolyBuild(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  spaceIndex: number,
  action: 'buy_house' | 'sell_house' | 'buy_hotel' | 'sell_hotel'
): Promise<{ error?: string }> {
  const { data: boardRaw } = await supabase.from('monopoly_boards').select('*').eq('game_id', gameId).maybeSingle()
  if (!boardRaw) return { error: 'Board not found' }
  const board = boardRaw as MonopolyBoard

  const space = spaceAt(spaceIndex)
  const owners = parsePropertyOwners(board.property_owners)
  const buildings = parseBuildings(board.property_buildings)
  const mortgaged = parseMortgaged(board.mortgaged_properties)

  if (owners[String(spaceIndex)] !== playerId) return { error: 'You do not own this property' }

  const { data: state } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId).eq('player_id', playerId).maybeSingle()
  if (!state) return { error: 'Player not found' }

  let housesInBank = board.houses_in_bank ?? MONOPOLY_HOUSES_IN_BANK
  let hotelsInBank = board.hotels_in_bank ?? MONOPOLY_HOTELS_IN_BANK
  let cash = state.cash
  const houseCost = space.houseCost ?? 0

  if (action === 'buy_house') {
    if (!canAddHouse(spaceIndex, playerId, owners, buildings, mortgaged, housesInBank)) {
      return { error: 'Cannot build a house here' }
    }
    if (cash < houseCost) return { error: 'Not enough cash' }
    buildings[String(spaceIndex)] = buildingLevel(buildings, spaceIndex) + 1
    cash -= houseCost
    housesInBank -= 1
  } else if (action === 'buy_hotel') {
    if (!canAddHotel(spaceIndex, playerId, owners, buildings, mortgaged, hotelsInBank)) {
      return { error: 'Cannot build a hotel here' }
    }
    if (cash < houseCost) return { error: 'Not enough cash' }
    buildings[String(spaceIndex)] = MONOPOLY_HOTEL_LEVEL
    cash -= houseCost
    hotelsInBank -= 1
    housesInBank += MONOPOLY_HOUSES_UNDER_HOTEL
  } else if (action === 'sell_house') {
    if (!canRemoveHouse(spaceIndex, playerId, owners, buildings)) return { error: 'Cannot sell a house here' }
    buildings[String(spaceIndex)] = buildingLevel(buildings, spaceIndex) - 1
    cash += Math.floor(houseCost / 2)
    housesInBank += 1
  } else if (action === 'sell_hotel') {
    if (!canRemoveHotel(spaceIndex, playerId, owners, buildings)) return { error: 'Cannot sell hotel here' }
    buildings[String(spaceIndex)] = MONOPOLY_MAX_HOUSES_PER_PROPERTY
    cash += Math.floor(houseCost / 2) + Math.floor(houseCost / 2) * MONOPOLY_HOUSES_UNDER_HOTEL
    hotelsInBank += 1
    housesInBank -= MONOPOLY_HOUSES_UNDER_HOTEL
  }

  await supabase.from('monopoly_player_state').update({ cash }).eq('game_id', gameId).eq('player_id', playerId)
  await supabase
    .from('monopoly_boards')
    .update({
      property_buildings: buildings,
      houses_in_bank: housesInBank,
      hotels_in_bank: hotelsInBank,
      status_message: `${action.replace('_', ' ')} on ${space.name}.`,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  return {}
}

export async function processMonopolyMortgage(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  spaceIndex: number,
  action: 'mortgage' | 'unmortgage'
): Promise<{ error?: string }> {
  const { data: boardRaw } = await supabase.from('monopoly_boards').select('*').eq('game_id', gameId).maybeSingle()
  if (!boardRaw) return { error: 'Board not found' }
  const board = boardRaw as MonopolyBoard

  const space = spaceAt(spaceIndex)
  if (space.type !== 'property' && space.type !== 'station' && space.type !== 'utility') {
    return { error: 'Not a mortgageable property' }
  }

  const owners = parsePropertyOwners(board.property_owners)
  const buildings = parseBuildings(board.property_buildings)
  const mortgaged = parseMortgaged(board.mortgaged_properties)

  if (owners[String(spaceIndex)] !== playerId) return { error: 'You do not own this property' }

  const { data: state } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId).eq('player_id', playerId).maybeSingle()
  if (!state) return { error: 'Player not found' }

  if (action === 'mortgage') {
    if (mortgaged[String(spaceIndex)]) return { error: 'Already mortgaged' }
    if (buildingLevel(buildings, spaceIndex) > 0) return { error: 'Sell all buildings first' }
    if (space.color && groupHasBuildings(space.color, playerId, owners, buildings)) {
      return { error: 'Sell all buildings in this colour group first' }
    }
    mortgaged[String(spaceIndex)] = true
    const value = mortgageValue(space)
    await supabase.from('monopoly_player_state').update({ cash: state.cash + value }).eq('game_id', gameId).eq('player_id', playerId)
    await supabase
      .from('monopoly_boards')
      .update({
        mortgaged_properties: mortgaged,
        status_message: `Mortgaged ${space.name} for ${formatMonopolyMoney(value)}.`,
        updated_at: new Date().toISOString(),
      })
      .eq('game_id', gameId)
    return {}
  }

  if (!mortgaged[String(spaceIndex)]) return { error: 'Not mortgaged' }
  const cost = unmortgageCost(space)
  if (state.cash < cost) return { error: 'Not enough cash to unmortgage' }
  delete mortgaged[String(spaceIndex)]
  await supabase.from('monopoly_player_state').update({ cash: state.cash - cost }).eq('game_id', gameId).eq('player_id', playerId)
  await supabase
    .from('monopoly_boards')
    .update({
      mortgaged_properties: mortgaged,
      status_message: `Unmortgaged ${space.name} for ${formatMonopolyMoney(cost)}.`,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  return {}
}

function validateTradeAssets(
  playerId: string,
  cash: number,
  properties: number[],
  getOutCards: number,
  owners: Record<string, string>,
  buildings: Record<string, number>,
  stateCash: number,
  stateCards: number
): string | null {
  if (cash < 0 || cash > stateCash) return 'Invalid cash offer'
  if (getOutCards < 0 || getOutCards > stateCards) return 'Invalid card offer'
  for (const idx of properties) {
    if (owners[String(idx)] !== playerId) return 'You do not own a listed property'
    if (buildingLevel(buildings, idx) > 0) return 'Sell all buildings before trading property'
    const space = spaceAt(idx)
    if (space.color && groupHasBuildings(space.color, playerId, owners, buildings)) {
      return 'Sell all buildings in colour group before trading'
    }
  }
  return null
}

export async function processMonopolyTradePropose(
  supabase: SupabaseClient,
  gameId: string,
  fromPlayerId: string,
  toPlayerId: string,
  offer: { cash: number; properties: number[]; getOutCards: number },
  request: { cash: number; properties: number[] }
): Promise<{ error?: string }> {
  const { data: boardRaw } = await supabase.from('monopoly_boards').select('*').eq('game_id', gameId).maybeSingle()
  if (!boardRaw) return { error: 'Board not found' }
  const board = boardRaw as MonopolyBoard
  if (board.pending_trade) return { error: 'A trade is already pending' }

  const owners = parsePropertyOwners(board.property_owners)
  const buildings = parseBuildings(board.property_buildings)

  const { data: fromState } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId).eq('player_id', fromPlayerId).maybeSingle()
  const { data: toState } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId).eq('player_id', toPlayerId).maybeSingle()
  if (!fromState || !toState || fromState.bankrupt || toState.bankrupt) return { error: 'Invalid players' }

  const offerProperties = normalizeTradePropertyList(offer.properties)
  const requestProperties = normalizeTradePropertyList(request.properties)

  const fromErr = validateTradeAssets(
    fromPlayerId,
    offer.cash,
    offerProperties,
    offer.getOutCards,
    owners,
    buildings,
    fromState.cash,
    fromState.get_out_of_jail_free
  )
  if (fromErr) return { error: fromErr }

  const toErr = validateTradeAssets(
    toPlayerId,
    request.cash,
    requestProperties,
    0,
    owners,
    buildings,
    toState.cash,
    toState.get_out_of_jail_free
  )
  if (toErr) return { error: `Counterparty: ${toErr}` }

  const pending: MonopolyPendingTrade = normalizePendingTrade({
    from_player_id: fromPlayerId,
    to_player_id: toPlayerId,
    offer_cash: offer.cash,
    offer_properties: offerProperties,
    offer_get_out_cards: offer.getOutCards,
    request_cash: request.cash,
    request_properties: requestProperties,
  })

  const names = await playerNamesById(supabase, gameId, [fromPlayerId, toPlayerId])
  const fromName = names[fromPlayerId] ?? 'A player'
  const toName = names[toPlayerId] ?? 'A player'
  const lastTradeEvent = nextTradeEvent(board, fromPlayerId, toPlayerId, 'proposed')

  await supabase
    .from('monopoly_boards')
    .update({
      pending_trade: pending,
      status_message: `${fromName} sent a trade offer to ${toName}.`,
      last_trade_event: lastTradeEvent,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  return {}
}

export async function processMonopolyTradeRespond(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  accept: boolean
): Promise<{ error?: string }> {
  const { data: boardRaw } = await supabase.from('monopoly_boards').select('*').eq('game_id', gameId).maybeSingle()
  if (!boardRaw) return { error: 'Board not found' }
  const board = boardRaw as MonopolyBoard
  if (!board.pending_trade) return { error: 'No pending trade' }
  const trade = normalizePendingTrade(board.pending_trade)
  if (trade.to_player_id !== playerId) return { error: 'Not your trade to accept' }

  if (!accept) {
    const names = await playerNamesById(supabase, gameId, [trade.from_player_id, trade.to_player_id])
    const fromName = names[trade.from_player_id] ?? 'A player'
    const toName = names[trade.to_player_id] ?? 'A player'
    const lastTradeEvent = nextTradeEvent(board, trade.from_player_id, trade.to_player_id, 'declined')

    await supabase
      .from('monopoly_boards')
      .update({
        pending_trade: null,
        status_message: `${toName} declined ${fromName}'s trade offer.`,
        last_trade_event: lastTradeEvent,
        updated_at: new Date().toISOString(),
      })
      .eq('game_id', gameId)
    return {}
  }

  const { data: freshBoardRaw, error: freshBoardError } = await supabase
    .from('monopoly_boards')
    .select('property_owners, property_buildings')
    .eq('game_id', gameId)
    .maybeSingle()
  if (freshBoardError || !freshBoardRaw) return { error: 'Board not found' }

  const owners = parsePropertyOwners(freshBoardRaw.property_owners)
  const buildings = parseBuildings(freshBoardRaw.property_buildings)

  const { data: fromState } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId).eq('player_id', trade.from_player_id).maybeSingle()
  const { data: toState } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId).eq('player_id', trade.to_player_id).maybeSingle()
  if (!fromState || !toState) return { error: 'Players not found' }

  const fromErr = validateTradeAssets(
    trade.from_player_id,
    trade.offer_cash,
    trade.offer_properties,
    trade.offer_get_out_cards,
    owners,
    buildings,
    fromState.cash,
    fromState.get_out_of_jail_free
  )
  if (fromErr) return { error: fromErr }

  const toErr = validateTradeAssets(
    trade.to_player_id,
    trade.request_cash,
    trade.request_properties,
    0,
    owners,
    buildings,
    toState.cash,
    toState.get_out_of_jail_free
  )
  if (toErr) return { error: toErr }

  const nextOwners = applyPendingTradeToOwners(owners, trade)

  const names = await playerNamesById(supabase, gameId, [trade.from_player_id, trade.to_player_id])
  const fromName = names[trade.from_player_id] ?? 'A player'
  const toName = names[trade.to_player_id] ?? 'A player'
  const lastTradeEvent = nextTradeEvent(board, trade.from_player_id, trade.to_player_id, 'accepted')

  const { error: boardUpdateError } = await supabase
    .from('monopoly_boards')
    .update({
      property_owners: nextOwners,
      pending_trade: null,
      status_message: `${toName} accepted ${fromName}'s trade offer.`,
      last_trade_event: lastTradeEvent,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  if (boardUpdateError) return { error: boardUpdateError.message }

  const { error: fromUpdateError } = await supabase
    .from('monopoly_player_state')
    .update({
      cash: fromState.cash - trade.offer_cash + trade.request_cash,
      get_out_of_jail_free: fromState.get_out_of_jail_free - trade.offer_get_out_cards,
    })
    .eq('game_id', gameId)
    .eq('player_id', trade.from_player_id)

  if (fromUpdateError) return { error: fromUpdateError.message }

  const { error: toUpdateError } = await supabase
    .from('monopoly_player_state')
    .update({
      cash: toState.cash + trade.offer_cash - trade.request_cash,
      get_out_of_jail_free: toState.get_out_of_jail_free + trade.offer_get_out_cards,
    })
    .eq('game_id', gameId)
    .eq('player_id', trade.to_player_id)

  if (toUpdateError) return { error: toUpdateError.message }

  return {}
}

function returnPlayerAssetsToBank(
  playerId: string,
  owners: Record<string, string>,
  buildings: Record<string, number>,
  mortgaged: Record<string, boolean>
): {
  owners: Record<string, string>
  buildings: Record<string, number>
  mortgaged: Record<string, boolean>
  housesReturned: number
  hotelsReturned: number
} {
  return releasePropertiesToBank([playerId], owners, buildings, mortgaged)
}

function releasePropertiesToBank(
  playerIds: string[],
  owners: Record<string, string>,
  buildings: Record<string, number>,
  mortgaged: Record<string, boolean>
): {
  owners: Record<string, string>
  buildings: Record<string, number>
  mortgaged: Record<string, boolean>
  housesReturned: number
  hotelsReturned: number
} {
  const releaseIds = new Set(playerIds)
  let housesReturned = 0
  let hotelsReturned = 0
  const nextOwners = { ...owners }
  const nextBuildings = { ...buildings }
  const nextMortgaged = { ...mortgaged }

  for (const [idx, owner] of Object.entries(owners)) {
    if (!releaseIds.has(owner)) continue
    delete nextOwners[idx]
    const level = nextBuildings[idx] ?? 0
    if (level === MONOPOLY_HOTEL_LEVEL) {
      hotelsReturned += 1
      housesReturned += MONOPOLY_HOUSES_UNDER_HOTEL
    } else {
      housesReturned += level
    }
    delete nextBuildings[idx]
    delete nextMortgaged[idx]
  }

  return {
    owners: nextOwners,
    buildings: nextBuildings,
    mortgaged: nextMortgaged,
    housesReturned,
    hotelsReturned,
  }
}

/** Fix boards where bankrupt players still appear in property_owners (legacy assign bug). */
function repairStaleBankruptOwnership(
  states: MonopolyPlayerState[],
  owners: Record<string, string>,
  buildings: Record<string, number>,
  mortgaged: Record<string, boolean>,
  housesInBank: number,
  hotelsInBank: number
): {
  owners: Record<string, string>
  buildings: Record<string, number>
  mortgaged: Record<string, boolean>
  housesInBank: number
  hotelsInBank: number
  repaired: boolean
} {
  const bankruptIds = states.filter((s) => s.bankrupt).map((s) => s.player_id)
  if (bankruptIds.length === 0) {
    return { owners, buildings, mortgaged, housesInBank, hotelsInBank, repaired: false }
  }

  const hasStaleOwnership = Object.values(owners).some((ownerId) => bankruptIds.includes(ownerId))
  if (!hasStaleOwnership) {
    return { owners, buildings, mortgaged, housesInBank, hotelsInBank, repaired: false }
  }

  const released = releasePropertiesToBank(bankruptIds, owners, buildings, mortgaged)
  return {
    owners: released.owners,
    buildings: released.buildings,
    mortgaged: released.mortgaged,
    housesInBank: housesInBank + released.housesReturned,
    hotelsInBank: hotelsInBank + released.hotelsReturned,
    repaired: true,
  }
}

/** Property owners map with bankrupt players' titles returned to the Bank (for display). */
export function effectivePropertyOwners(
  owners: Record<string, string>,
  states: MonopolyPlayerState[]
): Record<string, string> {
  const bankruptIds = new Set(states.filter((s) => s.bankrupt).map((s) => s.player_id))
  if (bankruptIds.size === 0) return owners

  const next: Record<string, string> = {}
  for (const [idx, ownerId] of Object.entries(owners)) {
    if (!bankruptIds.has(ownerId)) next[idx] = ownerId
  }
  return next
}

async function enterRaiseFundsPhase(
  supabase: SupabaseClient,
  gameId: string,
  board: MonopolyBoard,
  debt: MonopolyPendingDebt,
  boardPatch: Partial<MonopolyBoard> = {}
): Promise<{ error?: string }> {
  const timerSeconds = await getMonopolyTimerSeconds(supabase, gameId)
  await supabase
    .from('monopoly_boards')
    .update({
      phase: 'raise_funds',
      pending_debt: debt,
      pending_space: debt.space_index ?? board.pending_space,
      status_message: `${debt.reason} — mortgage or sell buildings to raise cash, pay, or forfeit.`,
      turn_deadline_at: monopolyDeadlineForPhase(timerSeconds, 'raise_funds'),
      auction_state: null,
      pending_trade: null,
      ...boardPatch,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
  return {}
}

function resolveDebtAmount(board: MonopolyBoard, debt: MonopolyPendingDebt): number {
  if (debt.debt_type === 'rent' && debt.space_index != null) {
    const space = spaceAt(debt.space_index)
    const owners = parsePropertyOwners(board.property_owners)
    const buildings = parseBuildings(board.property_buildings)
    const mortgaged = parseMortgaged(board.mortgaged_properties)
    const ownerId = owners[String(debt.space_index)]
    if (ownerId) {
      return computeRent(space, owners, ownerId, board.last_dice?.total ?? 2, buildings, mortgaged)
    }
  }
  return debt.amount
}

export async function processMonopolySettleDebt(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string }> {
  const { data: boardRaw } = await supabase.from('monopoly_boards').select('*').eq('game_id', gameId).maybeSingle()
  if (!boardRaw) return { error: 'Board not found' }
  const board = boardRaw as MonopolyBoard
  const debt = board.pending_debt
  if (board.phase !== 'raise_funds' || !debt) return { error: 'No debt to settle' }
  if (debt.player_id !== playerId) return { error: 'Not your debt to settle' }
  if (currentPlayerId(board) !== playerId) return { error: 'Not your turn' }

  const amount = resolveDebtAmount(board, debt)
  const { data: state } = await supabase
    .from('monopoly_player_state')
    .select('*')
    .eq('game_id', gameId)
    .eq('player_id', playerId)
    .maybeSingle()
  if (!state) return { error: 'Player not found' }
  if (state.cash < amount) return { error: 'Still not enough cash — mortgage or sell assets, or forfeit' }

  if (debt.debt_type === 'rent' && debt.space_index != null && debt.creditor_player_id) {
    return processMonopolyPayRent(supabase, gameId, playerId, { fromRaiseFunds: true })
  }

  const creditorId = debt.creditor_player_id
  let payerCash = state.cash - amount

  if (creditorId) {
    const { data: creditorState } = await supabase
      .from('monopoly_player_state')
      .select('*')
      .eq('game_id', gameId)
      .eq('player_id', creditorId)
      .maybeSingle()
    if (creditorState) {
      await supabase
        .from('monopoly_player_state')
        .update({ cash: creditorState.cash + amount })
        .eq('game_id', gameId)
        .eq('player_id', creditorId)
    }
  }

  if (debt.debt_type === 'jail') {
    await supabase
      .from('monopoly_player_state')
      .update({ cash: payerCash, in_jail: false, jail_turns: 0 })
      .eq('game_id', gameId)
      .eq('player_id', playerId)
    await supabase
      .from('monopoly_boards')
      .update({
        phase: 'roll',
        pending_debt: null,
        pending_space: null,
        status_message: `Paid ${formatMonopolyMoney(amount)} — roll to move!`,
        turn_deadline_at: monopolyDeadlineForPhase(await getMonopolyTimerSeconds(supabase, gameId), 'roll'),
        updated_at: new Date().toISOString(),
      })
      .eq('game_id', gameId)
    return {}
  }

  await supabase.from('monopoly_player_state').update({ cash: payerCash }).eq('game_id', gameId).eq('player_id', playerId)

  const { data: statesRaw } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId)
  const states = (statesRaw ?? []) as MonopolyPlayerState[]
  const turnFinish = finishTurnAfterSpaceAction(board, states, playerId)
  const timerSeconds = await getMonopolyTimerSeconds(supabase, gameId)

  await supabase
    .from('monopoly_boards')
    .update({
      phase: turnFinish.phase,
      pending_debt: null,
      pending_space: null,
      current_turn_index: turnFinish.turnIndex,
      consecutive_doubles: turnFinish.consecutiveDoubles,
      status_message: `Paid ${formatMonopolyMoney(amount)}.`,
      turn_deadline_at: monopolyDeadlineForPhase(timerSeconds, turnFinish.phase),
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  return {}
}

export async function processMonopolyForfeit(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string }> {
  const { data: boardRaw } = await supabase.from('monopoly_boards').select('*').eq('game_id', gameId).maybeSingle()
  if (!boardRaw) return { error: 'Board not found' }
  const board = boardRaw as MonopolyBoard
  const debt = board.pending_debt
  if (board.phase !== 'raise_funds' || !debt) return { error: 'Nothing to forfeit' }
  if (debt.player_id !== playerId) return { error: 'Not your debt' }

  const { data: statesRaw } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId)
  const states = (statesRaw ?? []) as MonopolyPlayerState[]

  return bankruptPlayer(
    supabase,
    gameId,
    board,
    states,
    playerId,
    debt.reason,
    debt.creditor_player_id ?? undefined,
    resolveDebtAmount(board, debt)
  )
}

async function bankruptPlayer(
  supabase: SupabaseClient,
  gameId: string,
  board: MonopolyBoard,
  states: MonopolyPlayerState[],
  playerId: string,
  reason: string,
  creditorId?: string,
  amount?: number
): Promise<{ error?: string }> {
  const state = states.find((s) => s.player_id === playerId)
  if (!state) return { error: 'Player not found' }

  const previousCash = state.cash
  const lastCashEvent = nextCashEvent(board, playerId, previousCash, 0, reason, { bankrupt: true })

  const owners = parsePropertyOwners(board.property_owners)
  const buildings = parseBuildings(board.property_buildings)
  const mortgaged = parseMortgaged(board.mortgaged_properties)

  if (creditorId) {
    const creditor = states.find((s) => s.player_id === creditorId)
    if (creditor) {
      await supabase
        .from('monopoly_player_state')
        .update({
          cash: creditor.cash + Math.max(0, state.cash),
          get_out_of_jail_free: creditor.get_out_of_jail_free + state.get_out_of_jail_free,
        })
        .eq('game_id', gameId)
        .eq('player_id', creditorId)
    }
  }

  const returned = returnPlayerAssetsToBank(playerId, owners, buildings, mortgaged)

  await supabase
    .from('monopoly_player_state')
    .update({ bankrupt: true, cash: 0, in_jail: false, get_out_of_jail_free: 0 })
    .eq('game_id', gameId)
    .eq('player_id', playerId)

  const updatedStates = states.map((s) =>
    s.player_id === playerId ? { ...s, bankrupt: true, cash: 0 } : s
  )
  const turnIndex = nextTurnIndex(board, updatedStates)
  const winner = checkWinner(updatedStates)

  await supabase
    .from('monopoly_boards')
    .update({
      property_owners: returned.owners,
      property_buildings: returned.buildings,
      mortgaged_properties: returned.mortgaged,
      houses_in_bank: (board.houses_in_bank ?? MONOPOLY_HOUSES_IN_BANK) + returned.housesReturned,
      hotels_in_bank: (board.hotels_in_bank ?? MONOPOLY_HOTELS_IN_BANK) + returned.hotelsReturned,
      phase: winner ? 'finished' : phaseForTurn(board, updatedStates, turnIndex),
      current_turn_index: turnIndex,
      winner_player_id: winner,
      status_message: `${reason} — bankrupt! Properties returned to the Bank.`,
      last_cash_event: lastCashEvent,
      pending_debt: null,
      pending_space: null,
      auction_state: null,
      pending_trade: null,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  if (winner) {
    await markGameFinished(supabase, gameId)
  }

  return {}
}

async function skipMonopolyTurnForTimeout(
  supabase: SupabaseClient,
  gameId: string,
  board: MonopolyBoard,
  playerId: string
): Promise<{ error?: string }> {
  const { data: statesRaw } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId)
  const states = (statesRaw ?? []) as MonopolyPlayerState[]
  const timerSeconds = await getMonopolyTimerSeconds(supabase, gameId)
  const turnIndex = nextTurnIndex(board, states)
  const phase = phaseForTurn(board, states, turnIndex)

  await supabase
    .from('monopoly_boards')
    .update({
      current_turn_index: turnIndex,
      phase,
      consecutive_doubles: 0,
      pending_space: null,
      status_message: 'Turn skipped — time ran out.',
      turn_deadline_at: monopolyDeadlineForPhase(timerSeconds, phase),
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  return {}
}

/** Advance or resolve the current turn when the per-turn timer expires. */
export async function processMonopolyExpireTurn(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string; skipped?: boolean }> {
  const { data: boardRaw } = await supabase.from('monopoly_boards').select('*').eq('game_id', gameId).maybeSingle()
  if (!boardRaw) return { error: 'Board not found' }
  const board = boardRaw as MonopolyBoard

  if (board.phase === 'finished') return { skipped: true }
  if (!board.turn_deadline_at || new Date(board.turn_deadline_at) > new Date()) {
    return { skipped: true }
  }

  const playerId = currentPlayerId(board)
  if (!playerId) return { error: 'No current player' }

  switch (board.phase) {
    case 'buy':
      return processMonopolyBuy(supabase, gameId, playerId, false)
    case 'pay_rent':
      return processMonopolyPayRent(supabase, gameId, playerId)
    case 'raise_funds':
      return processMonopolyForfeit(supabase, gameId, playerId)
    case 'auction': {
      const bidderId = board.auction_state?.current_bidder_id
      if (!bidderId) return { error: 'No auction bidder' }
      return processMonopolyAuction(supabase, gameId, bidderId, 'pass')
    }
    case 'roll':
    case 'jail':
    default:
      return skipMonopolyTurnForTimeout(supabase, gameId, board, playerId)
  }
}

export function playerProperties(
  owners: Record<string, string>,
  playerId: string
): MonopolySpace[] {
  return MONOPOLY_BOARD.filter((s) => owners[String(s.index)] === playerId)
}

export function formatDice(dice: { d1: number; d2: number } | null | undefined): string {
  if (!dice) return '—'
  return `${dice.d1} + ${dice.d2} = ${dice.d1 + dice.d2}`
}

export type MonopolyHostMode = 'spectator' | 'player'

const monopolyHostModeKey = (gameCode: string) => `monopoly_host_mode_${gameCode}`

export function getMonopolyHostMode(gameCode: string): MonopolyHostMode {
  if (typeof window === 'undefined') return 'spectator'
  return localStorage.getItem(monopolyHostModeKey(gameCode)) === 'player' ? 'player' : 'spectator'
}

export function setMonopolyHostMode(gameCode: string, mode: MonopolyHostMode): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(monopolyHostModeKey(gameCode), mode)
}

export type MonopolyActionResult = {
  board?: Partial<MonopolyBoard>
  playerState?: Partial<MonopolyPlayerState>
  otherStates?: Partial<MonopolyPlayerState>[]
  gameFinished?: boolean
  winnerPlayerId?: string | null
}

export function railroadRent(owners: Record<string, string>, ownerId: string, baseRent: number): number {
  const count = Object.entries(owners).filter(
    ([idx, id]) => id === ownerId && spaceAt(Number(idx)).type === 'station'
  ).length
  return baseRent * 2 ** Math.max(0, count - 1)
}

export function countOwnedInGroup(
  owners: Record<string, string>,
  ownerId: string,
  group: MonopolyColorGroup
): number {
  return MONOPOLY_BOARD.filter((s) => s.color === group && owners[String(s.index)] === ownerId).length
}
