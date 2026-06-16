import type { SupabaseClient } from '@supabase/supabase-js'
import type { MonopolyBoard, MonopolyPhase, MonopolyPlayerState } from '@/types'

export const MONOPOLY_MIN_PLAYERS = 2
export const MONOPOLY_MAX_PLAYERS = 6
export const MONOPOLY_DEFAULT_MAX_PLAYERS = 6
export const MONOPOLY_STARTING_CASH = 1500
export const MONOPOLY_GO_SALARY = 200
export const MONOPOLY_JAIL_FINE = 50
export const MONOPOLY_JAIL_POSITION = 10
export const MONOPOLY_GO_TO_JAIL_POSITION = 30
export const MONOPOLY_BOARD_SIZE = 40

export type MonopolySpaceType =
  | 'go'
  | 'property'
  | 'railroad'
  | 'utility'
  | 'tax'
  | 'chance'
  | 'community'
  | 'jail'
  | 'go_to_jail'
  | 'free_parking'

export type MonopolyColorGroup =
  | 'brown'
  | 'light_blue'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'dark_blue'
  | 'railroad'
  | 'utility'

export interface MonopolySpace {
  index: number
  name: string
  type: MonopolySpaceType
  price?: number
  rent?: number
  color?: MonopolyColorGroup
}

export const MONOPOLY_BOARD: MonopolySpace[] = [
  { index: 0, name: 'GO', type: 'go' },
  { index: 1, name: 'Mediterranean Ave', type: 'property', price: 60, rent: 2, color: 'brown' },
  { index: 2, name: 'Community Chest', type: 'community' },
  { index: 3, name: 'Baltic Ave', type: 'property', price: 60, rent: 4, color: 'brown' },
  { index: 4, name: 'Income Tax', type: 'tax' },
  { index: 5, name: 'Reading Railroad', type: 'railroad', price: 200, rent: 25, color: 'railroad' },
  { index: 6, name: 'Oriental Ave', type: 'property', price: 100, rent: 6, color: 'light_blue' },
  { index: 7, name: 'Chance', type: 'chance' },
  { index: 8, name: 'Vermont Ave', type: 'property', price: 100, rent: 6, color: 'light_blue' },
  { index: 9, name: 'Connecticut Ave', type: 'property', price: 120, rent: 8, color: 'light_blue' },
  { index: 10, name: 'Jail', type: 'jail' },
  { index: 11, name: 'St. Charles Pl', type: 'property', price: 140, rent: 10, color: 'pink' },
  { index: 12, name: 'Electric Company', type: 'utility', price: 150, color: 'utility' },
  { index: 13, name: 'States Ave', type: 'property', price: 140, rent: 10, color: 'pink' },
  { index: 14, name: 'Virginia Ave', type: 'property', price: 160, rent: 12, color: 'pink' },
  { index: 15, name: 'Pennsylvania Railroad', type: 'railroad', price: 200, rent: 25, color: 'railroad' },
  { index: 16, name: 'St. James Pl', type: 'property', price: 180, rent: 14, color: 'orange' },
  { index: 17, name: 'Community Chest', type: 'community' },
  { index: 18, name: 'Tennessee Ave', type: 'property', price: 180, rent: 14, color: 'orange' },
  { index: 19, name: 'New York Ave', type: 'property', price: 200, rent: 16, color: 'orange' },
  { index: 20, name: 'Free Parking', type: 'free_parking' },
  { index: 21, name: 'Kentucky Ave', type: 'property', price: 220, rent: 18, color: 'red' },
  { index: 22, name: 'Chance', type: 'chance' },
  { index: 23, name: 'Indiana Ave', type: 'property', price: 220, rent: 18, color: 'red' },
  { index: 24, name: 'Illinois Ave', type: 'property', price: 240, rent: 20, color: 'red' },
  { index: 25, name: 'B&O Railroad', type: 'railroad', price: 200, rent: 25, color: 'railroad' },
  { index: 26, name: 'Atlantic Ave', type: 'property', price: 260, rent: 22, color: 'yellow' },
  { index: 27, name: 'Ventnor Ave', type: 'property', price: 260, rent: 22, color: 'yellow' },
  { index: 28, name: 'Water Works', type: 'utility', price: 150, color: 'utility' },
  { index: 29, name: 'Marvin Gardens', type: 'property', price: 280, rent: 24, color: 'yellow' },
  { index: 30, name: 'Go To Jail', type: 'go_to_jail' },
  { index: 31, name: 'Pacific Ave', type: 'property', price: 300, rent: 26, color: 'green' },
  { index: 32, name: 'North Carolina Ave', type: 'property', price: 300, rent: 26, color: 'green' },
  { index: 33, name: 'Community Chest', type: 'community' },
  { index: 34, name: 'Pennsylvania Ave', type: 'property', price: 320, rent: 28, color: 'green' },
  { index: 35, name: 'Short Line Railroad', type: 'railroad', price: 200, rent: 25, color: 'railroad' },
  { index: 36, name: 'Chance', type: 'chance' },
  { index: 37, name: 'Park Place', type: 'property', price: 350, rent: 35, color: 'dark_blue' },
  { index: 38, name: 'Luxury Tax', type: 'tax' },
  { index: 39, name: 'Boardwalk', type: 'property', price: 400, rent: 50, color: 'dark_blue' },
]

export const MONOPOLY_COLOR_CLASSES: Record<MonopolyColorGroup, string> = {
  brown: 'bg-amber-900',
  light_blue: 'bg-sky-400',
  pink: 'bg-pink-400',
  orange: 'bg-orange-500',
  red: 'bg-red-600',
  yellow: 'bg-yellow-400',
  green: 'bg-emerald-600',
  dark_blue: 'bg-blue-800',
  railroad: 'bg-neutral-700',
  utility: 'bg-neutral-500',
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function spaceAt(index: number): MonopolySpace {
  const normalized = ((index % MONOPOLY_BOARD_SIZE) + MONOPOLY_BOARD_SIZE) % MONOPOLY_BOARD_SIZE
  return MONOPOLY_BOARD[normalized]!
}

export function parsePropertyOwners(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  return raw as Record<string, string>
}

export function currentPlayerId(board: MonopolyBoard): string | null {
  const order = board.turn_order ?? []
  if (order.length === 0) return null
  return order[board.current_turn_index % order.length] ?? null
}

export function activePlayers(states: MonopolyPlayerState[]): MonopolyPlayerState[] {
  return states.filter((s) => !s.bankrupt)
}

export function countOwnedInGroup(
  owners: Record<string, string>,
  ownerId: string,
  group: MonopolyColorGroup
): number {
  return MONOPOLY_BOARD.filter(
    (s) => s.color === group && owners[String(s.index)] === ownerId
  ).length
}

export function railroadRent(owners: Record<string, string>, ownerId: string, baseRent: number): number {
  const count = countOwnedInGroup(owners, ownerId, 'railroad')
  return baseRent * 2 ** Math.max(0, count - 1)
}

export function utilityRent(
  owners: Record<string, string>,
  ownerId: string,
  diceTotal: number
): number {
  const count = countOwnedInGroup(owners, ownerId, 'utility')
  return diceTotal * (count >= 2 ? 10 : 4)
}

export function computeRent(
  space: MonopolySpace,
  owners: Record<string, string>,
  ownerId: string,
  diceTotal: number
): number {
  if (space.type === 'railroad') return railroadRent(owners, ownerId, space.rent ?? 25)
  if (space.type === 'utility') return utilityRent(owners, ownerId, diceTotal)
  return space.rent ?? 0
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

type CardEffect = { message: string; cash?: number; moveTo?: number; goToJail?: boolean; getOutOfJail?: boolean }

const CHANCE_CARDS: CardEffect[] = [
  { message: 'Advance to GO — collect $200', moveTo: 0 },
  { message: 'Bank error in your favor — collect $200', cash: 200 },
  { message: 'Doctor fee — pay $50', cash: -50 },
  { message: 'Go to Jail', goToJail: true },
  { message: 'Speeding fine — pay $15', cash: -15 },
  { message: 'Advance to Illinois Ave', moveTo: 24 },
  { message: 'Your building loan matures — collect $150', cash: 150 },
  { message: 'Get Out of Jail Free card', getOutOfJail: true },
]

const COMMUNITY_CARDS: CardEffect[] = [
  { message: 'Advance to GO — collect $200', moveTo: 0 },
  { message: 'Bank error in your favor — collect $200', cash: 200 },
  { message: 'Doctor fee — pay $50', cash: -50 },
  { message: 'Go to Jail', goToJail: true },
  { message: 'From sale of stock — collect $45', cash: 45 },
  { message: 'Holiday fund matures — collect $100', cash: 100 },
  { message: 'Income tax refund — collect $20', cash: 20 },
  { message: 'Get Out of Jail Free card', getOutOfJail: true },
]

function pickCard(type: 'chance' | 'community'): CardEffect {
  const deck = type === 'chance' ? CHANCE_CARDS : COMMUNITY_CARDS
  return deck[Math.floor(Math.random() * deck.length)]!
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
  })
  if (boardError) return { error: boardError.message }

  return { error: null }
}

/** Add a player who joined mid-game (appended to turn order, starts on GO). */
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

export type MonopolyActionResult = {
  board?: Partial<MonopolyBoard>
  playerState?: Partial<MonopolyPlayerState>
  otherStates?: Partial<MonopolyPlayerState>[]
  gameFinished?: boolean
  winnerPlayerId?: string | null
}

export async function processMonopolyRoll(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string }> {
  const { data: board } = await supabase.from('monopoly_boards').select('*').eq('game_id', gameId).maybeSingle()
  if (!board) return { error: 'Board not found' }

  const { data: states } = await supabase
    .from('monopoly_player_state')
    .select('*')
    .eq('game_id', gameId)
    .order('player_order')

  if (!states?.length) return { error: 'No player states' }

  const currentId = currentPlayerId(board as MonopolyBoard)
  if (currentId !== playerId) return { error: 'Not your turn' }
  if (board.phase !== 'roll' && board.phase !== 'jail') return { error: 'Cannot roll right now' }

  const state = states.find((s) => s.player_id === playerId)
  if (!state || state.bankrupt) return { error: 'Invalid player' }

  const dice = rollDice()
  const owners = parsePropertyOwners(board.property_owners)
  let consecutiveDoubles = board.consecutive_doubles ?? 0
  let cash = state.cash
  let position = state.position
  let inJail = state.in_jail
  let jailTurns = state.jail_turns
  let getOutCards = state.get_out_of_jail_free
  let phase: MonopolyPhase = 'roll'
  let pendingSpace: number | null = null
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
        return await bankruptPlayer(supabase, gameId, board as MonopolyBoard, states as MonopolyPlayerState[], playerId, 'Could not pay jail fine')
      }
      cash -= MONOPOLY_JAIL_FINE
      inJail = false
      jailTurns = 0
      statusMessage = `Paid $${MONOPOLY_JAIL_FINE} to leave jail. Rolled ${dice.d1}+${dice.d2}.`
      const move = movePosition(position, dice.total)
      position = move.to
      if (move.passedGo) cash += MONOPOLY_GO_SALARY
    } else {
      statusMessage = `Still in jail — rolled ${dice.d1}+${dice.d2} (no doubles). Turn ${jailTurns}/3.`
      phase = 'jail'
      await supabase
        .from('monopoly_player_state')
        .update({ jail_turns: jailTurns })
        .eq('game_id', gameId)
        .eq('player_id', playerId)
      await supabase
        .from('monopoly_boards')
        .update({
          last_dice: dice,
          phase: 'jail',
          status_message: statusMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('game_id', gameId)
      return {}
    }
  } else {
    if (dice.doubles) {
      consecutiveDoubles += 1
      if (consecutiveDoubles >= 3) {
        position = MONOPOLY_JAIL_POSITION
        inJail = true
        jailTurns = 0
        consecutiveDoubles = 0
        statusMessage = 'Three doubles in a row — Go to Jail!'
        phase = 'roll'
        await updatePlayerAndBoard(supabase, gameId, playerId, { cash, position, in_jail: true, jail_turns: 0 }, {
          last_dice: dice,
          consecutive_doubles: 0,
          phase: 'roll',
          current_turn_index: nextTurnIndex(board as MonopolyBoard, states as MonopolyPlayerState[]),
          status_message: statusMessage,
          pending_space: null,
        })
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
      statusMessage = `Passed GO — collected $${MONOPOLY_GO_SALARY}. `
    }
  }

  const landed = spaceAt(position)
  statusMessage += `Landed on ${landed.name}.`

  if (landed.type === 'go_to_jail') {
    position = MONOPOLY_JAIL_POSITION
    inJail = true
    jailTurns = 0
    statusMessage = 'Go to Jail!'
    phase = 'roll'
    extraTurn = false
  } else if (landed.type === 'tax') {
    const amount = landed.index === 4 ? 200 : 100
    if (cash < amount) {
      return await bankruptPlayer(supabase, gameId, board as MonopolyBoard, states as MonopolyPlayerState[], playerId, `Could not pay $${amount} tax`)
    }
    cash -= amount
    statusMessage += ` Paid $${amount} tax.`
    phase = 'roll'
  } else if (landed.type === 'chance' || landed.type === 'community') {
    const card = pickCard(landed.type)
    statusMessage += ` ${card.message}`
    if (card.cash) {
      cash += card.cash
      if (cash < 0) {
        return await bankruptPlayer(supabase, gameId, board as MonopolyBoard, states as MonopolyPlayerState[], playerId, card.message)
      }
    }
    if (card.getOutOfJail) getOutCards += 1
    if (card.goToJail) {
      position = MONOPOLY_JAIL_POSITION
      inJail = true
      jailTurns = 0
      extraTurn = false
    } else if (card.moveTo !== undefined) {
      const passed = card.moveTo < position && card.moveTo !== MONOPOLY_JAIL_POSITION
      position = card.moveTo
      if (passed) cash += MONOPOLY_GO_SALARY
    }
    phase = 'roll'
  } else if (landed.type === 'property' || landed.type === 'railroad' || landed.type === 'utility') {
    const ownerId = owners[String(landed.index)]
    if (!ownerId) {
      if (cash >= (landed.price ?? 0)) {
        phase = 'buy'
        pendingSpace = landed.index
        statusMessage += ` Buy for $${landed.price}?`
      } else {
        statusMessage += ' Cannot afford — passing.'
        phase = 'roll'
      }
    } else if (ownerId !== playerId) {
      const rent = computeRent(landed, owners, ownerId, dice.total)
      const ownerState = states.find((s) => s.player_id === ownerId)
      if (!ownerState || ownerState.bankrupt) {
        phase = 'roll'
      } else if (cash < rent) {
        return await bankruptPlayer(supabase, gameId, board as MonopolyBoard, states as MonopolyPlayerState[], playerId, `Could not pay $${rent} rent`, ownerId, rent)
      } else {
        statusMessage = `You owe $${rent} rent on ${landed.name}.`
        phase = 'pay_rent'
        pendingSpace = landed.index
        extraTurn = false
      }
    } else {
      phase = 'roll'
    }
  } else {
    phase = 'roll'
  }

  const turnIndex =
    phase === 'roll' && !extraTurn
      ? nextTurnIndex(board as MonopolyBoard, states as MonopolyPlayerState[])
      : board.current_turn_index

  const updatedStatesForPhase = states.map((s) =>
    s.player_id === playerId
      ? { ...s, cash, position, in_jail: inJail, jail_turns: jailTurns, get_out_of_jail_free: getOutCards }
      : s
  ) as MonopolyPlayerState[]

  const boardPhase: MonopolyPhase =
    phase === 'roll' && !extraTurn
      ? phaseForTurn(board as MonopolyBoard, updatedStatesForPhase, turnIndex)
      : phase === 'roll' && extraTurn && inJail
        ? 'jail'
        : phase

  if (boardPhase === 'jail' && phase === 'roll') {
    await updatePlayerAndBoard(supabase, gameId, playerId, { cash, position, in_jail: inJail, jail_turns: jailTurns, get_out_of_jail_free: getOutCards }, {
      last_dice: dice,
      consecutive_doubles: consecutiveDoubles,
      phase: boardPhase,
      current_turn_index: turnIndex,
      status_message: statusMessage,
      pending_space: pendingSpace,
    })
    return {}
  }

  await updatePlayerAndBoard(supabase, gameId, playerId, { cash, position, in_jail: inJail, jail_turns: jailTurns, get_out_of_jail_free: getOutCards }, {
    last_dice: dice,
    consecutive_doubles: consecutiveDoubles,
    phase: boardPhase,
    current_turn_index: turnIndex,
    status_message: statusMessage,
    pending_space: pendingSpace,
  })

  const winner = checkWinner(
    (await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId)).data as MonopolyPlayerState[] ?? states as MonopolyPlayerState[]
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
  const { data: board } = await supabase.from('monopoly_boards').select('*').eq('game_id', gameId).maybeSingle()
  if (!board) return { error: 'Board not found' }
  if (board.phase !== 'buy') return { error: 'Not in buy phase' }
  if (currentPlayerId(board as MonopolyBoard) !== playerId) return { error: 'Not your turn' }

  const spaceIndex = board.pending_space
  if (spaceIndex == null) return { error: 'No property pending' }

  const space = spaceAt(spaceIndex)
  const { data: state } = await supabase
    .from('monopoly_player_state')
    .select('*')
    .eq('game_id', gameId)
    .eq('player_id', playerId)
    .maybeSingle()
  if (!state) return { error: 'Player not found' }

  const owners = parsePropertyOwners(board.property_owners)
  let cash = state.cash
  let statusMessage = ''

  if (buy) {
    const price = space.price ?? 0
    if (cash < price) return { error: 'Not enough cash' }
    cash -= price
    owners[String(spaceIndex)] = playerId
    statusMessage = `Bought ${space.name} for $${price}.`
  } else {
    statusMessage = `Passed on ${space.name}.`
  }

  const { data: states } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId)
  const turnIndex = nextTurnIndex(board as MonopolyBoard, (states ?? []) as MonopolyPlayerState[])
  const nextPhase = phaseForTurn(board as MonopolyBoard, (states ?? []) as MonopolyPlayerState[], turnIndex)

  await supabase.from('monopoly_player_state').update({ cash }).eq('game_id', gameId).eq('player_id', playerId)
  await supabase
    .from('monopoly_boards')
    .update({
      property_owners: owners,
      phase: nextPhase,
      pending_space: null,
      current_turn_index: turnIndex,
      status_message: statusMessage,
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
  const { data: board } = await supabase.from('monopoly_boards').select('*').eq('game_id', gameId).maybeSingle()
  if (!board) return { error: 'Board not found' }
  if (board.phase !== 'pay_rent') return { error: 'No rent due' }
  if (currentPlayerId(board as MonopolyBoard) !== playerId) return { error: 'Not your turn' }

  const spaceIndex = board.pending_space
  if (spaceIndex == null) return { error: 'No property pending' }

  const space = spaceAt(spaceIndex)
  const owners = parsePropertyOwners(board.property_owners)
  const ownerId = owners[String(spaceIndex)]
  if (!ownerId || ownerId === playerId) return { error: 'Invalid rent state' }

  const diceTotal = board.last_dice?.total ?? 2
  const rent = computeRent(space, owners, ownerId, diceTotal)

  const { data: state } = await supabase
    .from('monopoly_player_state')
    .select('*')
    .eq('game_id', gameId)
    .eq('player_id', playerId)
    .maybeSingle()
  const { data: ownerState } = await supabase
    .from('monopoly_player_state')
    .select('*')
    .eq('game_id', gameId)
    .eq('player_id', ownerId)
    .maybeSingle()

  if (!state || !ownerState) return { error: 'Player not found' }

  if (state.cash < rent) {
    const { data: states } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId)
    return bankruptPlayer(
      supabase,
      gameId,
      board as MonopolyBoard,
      (states ?? []) as MonopolyPlayerState[],
      playerId,
      `Could not pay $${rent} rent`,
      ownerId,
      rent
    ).then((r) => (r.error ? { error: r.error } : {}))
  }

  await supabase
    .from('monopoly_player_state')
    .update({ cash: state.cash - rent })
    .eq('game_id', gameId)
    .eq('player_id', playerId)
  await supabase
    .from('monopoly_player_state')
    .update({ cash: ownerState.cash + rent })
    .eq('game_id', gameId)
    .eq('player_id', ownerId)

  const { data: states } = await supabase.from('monopoly_player_state').select('*').eq('game_id', gameId)
  const turnIndex = nextTurnIndex(board as MonopolyBoard, (states ?? []) as MonopolyPlayerState[])
  const nextPhase = phaseForTurn(board as MonopolyBoard, (states ?? []) as MonopolyPlayerState[], turnIndex)

  await supabase
    .from('monopoly_boards')
    .update({
      phase: nextPhase,
      pending_space: null,
      current_turn_index: turnIndex,
      status_message: `Paid $${rent} rent on ${space.name}.`,
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

  const { data: state } = await supabase
    .from('monopoly_player_state')
    .select('*')
    .eq('game_id', gameId)
    .eq('player_id', playerId)
    .maybeSingle()
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
    .update({ phase: 'roll', status_message: `Paid $${MONOPOLY_JAIL_FINE} — roll to move!` })
    .eq('game_id', gameId)
  return {}
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
  const newOwners = { ...owners }
  for (const [idx, owner] of Object.entries(newOwners)) {
    if (owner === playerId) delete newOwners[idx]
  }

  if (creditorId && amount) {
    const creditor = states.find((s) => s.player_id === creditorId)
    if (creditor) {
      await supabase
        .from('monopoly_player_state')
        .update({ cash: creditor.cash + Math.max(0, state.cash) })
        .eq('game_id', gameId)
        .eq('player_id', creditorId)
    }
  }

  await supabase
    .from('monopoly_player_state')
    .update({ bankrupt: true, cash: 0, in_jail: false })
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
      property_owners: newOwners,
      phase: winner ? 'finished' : phaseForTurn(board, updatedStates, turnIndex),
      current_turn_index: turnIndex,
      winner_player_id: winner,
      status_message: `${reason} — bankrupt!`,
      pending_space: null,
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
