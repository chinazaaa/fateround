import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  MonopolyAuctionState,
  MonopolyBoard,
  MonopolyPendingTrade,
  MonopolyPhase,
  MonopolyPlayerState,
} from '@/types'
import {
  MONOPOLY_BOARD,
  MONOPOLY_BOARD_SIZE,
  MONOPOLY_GO_SALARY,
  MONOPOLY_GO_TO_JAIL_POSITION,
  MONOPOLY_HOUSES_IN_BANK,
  MONOPOLY_HOTELS_IN_BANK,
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

export * from '@/lib/monopoly-board'
export { formatMonopolyMoney } from '@/lib/monopoly-board'
export type { MonopolyColorGroup, MonopolySpace, MonopolySpaceType, BuildingLevel } from '@/lib/monopoly-board'
export { computeRent } from '@/lib/monopoly-rent'

export const MONOPOLY_MIN_PLAYERS = 2
export const MONOPOLY_MAX_PLAYERS = 6
export const MONOPOLY_DEFAULT_MAX_PLAYERS = 6

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]!]
  }
  return next
}

export function parsePropertyOwners(raw: unknown): Record<string, string> {
  return parseJsonRecord(raw)
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

export function movePosition(from: number, steps: number): { to: number; passedGo: boolean } {
  const to = (from + steps) % MONOPOLY_BOARD_SIZE
  const passedGo = from + steps >= MONOPOLY_BOARD_SIZE
  return { to, passedGo }
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
  bankruptcy?: { reason: string; creditorId?: string; amount?: number }
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
    const amount = landed.index === 4 ? 200 : 100
    if (cash < amount) {
      return {
        cash,
        position,
        inJail,
        jailTurns,
        getOutCards,
        phase: 'roll',
        pendingSpace: null,
        extraTurn: false,
        statusSuffix: '',
        bankruptcy: { reason: `Could not pay ${formatMonopolyMoney(amount)} tax` },
      }
    }
    cash -= amount
    statusSuffix = ` Paid ${formatMonopolyMoney(amount)} tax.`
    return { cash, position, inJail, jailTurns, getOutCards, phase: 'roll', pendingSpace, extraTurn, statusSuffix }
  }

  if (landed.type === 'property' || landed.type === 'station' || landed.type === 'utility') {
    const ownerId = ctx.owners[String(landed.index)]
    if (!ownerId) {
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
        const ownerState = ctx.states.find((s) => s.player_id === ownerId)
        if (!ownerState || ownerState.bankrupt) {
          // no rent
        } else if (rent > 0 && cash < rent) {
          return {
            cash,
            position,
            inJail,
            jailTurns,
            getOutCards,
            phase: 'roll',
            pendingSpace: null,
            extraTurn: false,
            statusSuffix: '',
            bankruptcy: {
              reason: `Could not pay ${formatMonopolyMoney(rent)} rent`,
              creditorId: ownerId,
              amount: rent,
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
): Promise<{ drawerCash: number; error?: string }> {
  const drawer = states.find((s) => s.player_id === drawerId)
  if (!drawer) return { drawerCash: 0, error: 'Player not found' }

  let drawerCash = drawer.cash + drawerDelta
  for (const [id, delta] of Object.entries(others)) {
    const target = states.find((s) => s.player_id === id)
    if (!target) continue
    const next = target.cash + delta
    if (next < 0) {
      return { drawerCash, error: `${id} cannot pay` }
    }
    await supabase.from('monopoly_player_state').update({ cash: next }).eq('game_id', gameId).eq('player_id', id)
  }
  if (drawerCash < 0) {
    return { drawerCash, error: 'Insufficient funds' }
  }
  return { drawerCash }
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

  if (auction.high_bid > 0 && auction.high_bidder_id) {
    const winner = states.find((s) => s.player_id === auction.high_bidder_id)
    if (!winner || winner.cash < auction.high_bid) {
      statusMessage = `Auction for ${space.name} — winning bid invalid, property unsold.`
    } else {
      owners[String(auction.space_index)] = auction.high_bidder_id
      await supabase
        .from('monopoly_player_state')
        .update({ cash: winner.cash - auction.high_bid })
        .eq('game_id', gameId)
        .eq('player_id', auction.high_bidder_id)
      statusMessage = `${space.name} sold at auction for ${formatMonopolyMoney(auction.high_bid)}.`
    }
  } else {
    statusMessage = `Auction for ${space.name} — no bids, property remains with the Bank.`
  }

  const turnFinish = finishTurnAfterSpaceAction(board, states, turnPlayerId)
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
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  return {}
}

export async function initializeMonopolyGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
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
    status_message: 'Game started — first player rolls the dice!',
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

  const owners = parsePropertyOwners(board.property_owners)
  const buildings = parseBuildings(board.property_buildings)
  const mortgaged = parseMortgaged(board.mortgaged_properties)
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
  let phase: MonopolyPhase = 'roll'
  let pendingSpace: number | null = null
  let auctionState: MonopolyAuctionState | null = null
  let statusMessage = ''
  let extraTurn = false

  if (board.phase === 'jail') {
    jailTurns += 1
    if (dice.doubles) {
      inJail = false
      jailTurns = 0
      statusMessage = `Rolled doubles (${dice.d1}+${dice.d2}) — out of jail!`
      const move = movePosition(position, dice.total)
      position = move.to
      if (move.passedGo) cash += MONOPOLY_GO_SALARY
    } else if (jailTurns >= 3) {
      if (cash < MONOPOLY_JAIL_FINE) {
        return bankruptPlayer(supabase, gameId, board, states, playerId, 'Could not pay jail fine')
      }
      cash -= MONOPOLY_JAIL_FINE
      inJail = false
      jailTurns = 0
      statusMessage = `Paid ${formatMonopolyMoney(MONOPOLY_JAIL_FINE)} to leave jail. Rolled ${dice.d1}+${dice.d2}.`
      const move = movePosition(position, dice.total)
      position = move.to
      if (move.passedGo) cash += MONOPOLY_GO_SALARY
    } else {
      await supabase.from('monopoly_player_state').update({ jail_turns: jailTurns }).eq('game_id', gameId).eq('player_id', playerId)
      await supabase
        .from('monopoly_boards')
        .update({ last_dice: dice, phase: 'jail', status_message: `Still in jail — rolled ${dice.d1}+${dice.d2} (no doubles). Turn ${jailTurns}/3.`, updated_at: new Date().toISOString() })
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
      cash += MONOPOLY_GO_SALARY
      statusMessage = `Passed GO — collected ${formatMonopolyMoney(MONOPOLY_GO_SALARY)}. `
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
  }

  if (landed.type === 'chance' || landed.type === 'community') {
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
    statusMessage += ` ${card.message}`

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
        return bankruptPlayer(supabase, gameId, board, states, playerId, card.message)
      }
      cash = multi.drawerCash

      if (effect.moveTo !== undefined) {
        position = effect.moveTo
        const salary = goSalaryForCard(card, effect.passedGo ?? false)
        if (salary > 0) {
          cash += salary
          statusMessage += ` Collected ${formatMonopolyMoney(salary)}.`
        }
        statusMessage += ` Now on ${spaceAt(position).name}.`
        const afterCard = resolveSpaceLanding(spaceAt(position), { ...landingCtx, cash, position, getOutCards, extraTurn })
        if (afterCard.bankruptcy) {
          const { reason, creditorId, amount } = afterCard.bankruptcy
          return bankruptPlayer(supabase, gameId, board, states, playerId, reason, creditorId, amount)
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
  } else {
    const resolution = resolveSpaceLanding(landed, landingCtx)
    if (resolution.bankruptcy) {
      const { reason, creditorId, amount } = resolution.bankruptcy
      return bankruptPlayer(supabase, gameId, board, states, playerId, reason, creditorId, amount)
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
      ? { ...s, cash, position, in_jail: inJail, jail_turns: jailTurns, get_out_of_jail_free: getOutCards }
      : s
  )
  const boardPhase: MonopolyPhase =
    turnEnds
      ? phaseForTurn(board, updatedStatesForPhase, turnIndex)
      : phase === 'roll' && extraTurn && inJail
        ? 'jail'
        : phase

  await updatePlayerAndBoard(
    supabase,
    gameId,
    playerId,
    { cash, position, in_jail: inJail, jail_turns: jailTurns, get_out_of_jail_free: getOutCards },
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
    }
  )

  const winner = checkWinner(
    ((await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId)).data as MonopolyPlayerState[]) ?? states
  )
  if (winner) {
    await supabase.from('monopoly_boards').update({ phase: 'finished', winner_player_id: winner, status_message: 'Game over!' }).eq('game_id', gameId)
    await supabase.from('games').update({ status: 'finished' }).eq('id', gameId)
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

  const owners = parsePropertyOwners(board.property_owners)
  const { data: statesRaw } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId)
  const states = (statesRaw ?? []) as MonopolyPlayerState[]

  if (buy) {
    const price = space.price ?? 0
    if (state.cash < price) return { error: 'Not enough cash' }
    owners[String(spaceIndex)] = playerId
    await supabase.from('monopoly_player_state').update({ cash: state.cash - price }).eq('game_id', gameId).eq('player_id', playerId)
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
  await supabase
    .from('monopoly_boards')
    .update({
      auction_state: nextAuction,
      status_message:
        action === 'bid'
          ? `${space.name} — high bid ${formatMonopolyMoney(nextAuction.high_bid)}.`
          : `${space.name} — waiting for next bid.`,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  return {}
}

export async function processMonopolyPayRent(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string }> {
  const { data: boardRaw } = await supabase.from('monopoly_boards').select('*').eq('game_id', gameId).maybeSingle()
  if (!boardRaw) return { error: 'Board not found' }
  const board = boardRaw as MonopolyBoard
  if (board.phase !== 'pay_rent') return { error: 'No rent due' }
  if (currentPlayerId(board) !== playerId) return { error: 'Not your turn' }

  const spaceIndex = board.pending_space
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
    const { data: statesRaw } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId)
    return bankruptPlayer(
      supabase,
      gameId,
      board,
      (statesRaw ?? []) as MonopolyPlayerState[],
      playerId,
      `Could not pay ${formatMonopolyMoney(rent)} rent`,
      ownerId,
      rent
    ).then((r) => (r.error ? { error: r.error } : {}))
  }

  await supabase.from('monopoly_player_state').update({ cash: state.cash - rent }).eq('game_id', gameId).eq('player_id', playerId)
  await supabase.from('monopoly_player_state').update({ cash: ownerState.cash + rent }).eq('game_id', gameId).eq('player_id', ownerId)

  const { data: statesRaw } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId)
  const turnFinish = finishTurnAfterSpaceAction(board, (statesRaw ?? []) as MonopolyPlayerState[], playerId)

  await supabase
    .from('monopoly_boards')
    .update({
      phase: turnFinish.phase,
      pending_space: null,
      current_turn_index: turnFinish.turnIndex,
      consecutive_doubles: turnFinish.consecutiveDoubles,
      status_message: `Paid ${formatMonopolyMoney(rent)} rent on ${space.name}.`,
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
    buildings[String(spaceIndex)] = 5
    cash -= houseCost
    hotelsInBank -= 1
    housesInBank += 4
  } else if (action === 'sell_house') {
    if (!canRemoveHouse(spaceIndex, playerId, owners, buildings)) return { error: 'Cannot sell a house here' }
    buildings[String(spaceIndex)] = buildingLevel(buildings, spaceIndex) - 1
    cash += Math.floor(houseCost / 2)
    housesInBank += 1
  } else if (action === 'sell_hotel') {
    if (!canRemoveHotel(spaceIndex, playerId, owners, buildings)) return { error: 'Cannot sell hotel here' }
    buildings[String(spaceIndex)] = 4
    cash += Math.floor(houseCost / 2) + Math.floor(houseCost / 2) * 4
    hotelsInBank += 1
    housesInBank -= 4
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

  const fromErr = validateTradeAssets(
    fromPlayerId,
    offer.cash,
    offer.properties,
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
    request.properties,
    0,
    owners,
    buildings,
    toState.cash,
    toState.get_out_of_jail_free
  )
  if (toErr) return { error: `Counterparty: ${toErr}` }

  const pending: MonopolyPendingTrade = {
    from_player_id: fromPlayerId,
    to_player_id: toPlayerId,
    offer_cash: offer.cash,
    offer_properties: offer.properties,
    offer_get_out_cards: offer.getOutCards,
    request_cash: request.cash,
    request_properties: request.properties,
  }

  await supabase
    .from('monopoly_boards')
    .update({ pending_trade: pending, status_message: 'Trade offer pending.' })
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
  const trade = board.pending_trade
  if (!trade) return { error: 'No pending trade' }
  if (trade.to_player_id !== playerId) return { error: 'Not your trade to accept' }

  if (!accept) {
    await supabase
      .from('monopoly_boards')
      .update({ pending_trade: null, status_message: 'Trade declined.' })
      .eq('game_id', gameId)
    return {}
  }

  const owners = parsePropertyOwners(board.property_owners)
  const buildings = parseBuildings(board.property_buildings)
  const mortgaged = parseMortgaged(board.mortgaged_properties)

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

  for (const idx of trade.offer_properties) owners[String(idx)] = trade.to_player_id
  for (const idx of trade.request_properties) owners[String(idx)] = trade.from_player_id

  await supabase
    .from('monopoly_player_state')
    .update({
      cash: fromState.cash - trade.offer_cash + trade.request_cash,
      get_out_of_jail_free: fromState.get_out_of_jail_free - trade.offer_get_out_cards,
    })
    .eq('game_id', gameId)
    .eq('player_id', trade.from_player_id)

  await supabase
    .from('monopoly_player_state')
    .update({
      cash: toState.cash + trade.offer_cash - trade.request_cash,
      get_out_of_jail_free: toState.get_out_of_jail_free + trade.offer_get_out_cards,
    })
    .eq('game_id', gameId)
    .eq('player_id', trade.to_player_id)

  await supabase
    .from('monopoly_boards')
    .update({
      property_owners: owners,
      pending_trade: null,
      status_message: 'Trade completed.',
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  return {}
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
    for (const [idx, owner] of Object.entries(owners)) {
      if (owner === playerId) owners[idx] = creditorId
    }
  } else {
    let housesReturned = 0
    let hotelsReturned = 0
    for (const [idx, owner] of Object.entries(parsePropertyOwners(board.property_owners))) {
      if (owner !== playerId) continue
      delete owners[idx]
      const level = buildings[idx] ?? 0
      if (level === 5) {
        hotelsReturned += 1
        housesReturned += 4
      } else {
        housesReturned += level
      }
      delete buildings[idx]
      delete mortgaged[idx]
    }
    await supabase
      .from('monopoly_boards')
      .update({
        houses_in_bank: (board.houses_in_bank ?? MONOPOLY_HOUSES_IN_BANK) + housesReturned,
        hotels_in_bank: (board.hotels_in_bank ?? MONOPOLY_HOTELS_IN_BANK) + hotelsReturned,
      })
      .eq('game_id', gameId)
  }

  for (const [idx] of Object.entries(mortgaged)) {
    if (!owners[idx]) delete mortgaged[idx]
  }

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
      property_owners: owners,
      property_buildings: buildings,
      mortgaged_properties: mortgaged,
      phase: winner ? 'finished' : phaseForTurn(board, updatedStates, turnIndex),
      current_turn_index: turnIndex,
      winner_player_id: winner,
      status_message: `${reason} — bankrupt!`,
      pending_space: null,
      auction_state: null,
      pending_trade: null,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)

  if (winner) {
    await supabase.from('games').update({ status: 'finished' }).eq('id', gameId)
  }

  return {}
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
