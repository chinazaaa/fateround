import type { SupabaseClient } from '@supabase/supabase-js'
import { clearSessionTables } from './session-clear'
import { markGameFinished } from '@/lib/game-finish'
import type { Player, SnakeLadderColor, SnakeLadderEvent, SnakeLadderPlayerState, SnakeLadderSession } from '@/types'

export const SNAKE_LADDER_MIN_PLAYERS = 2
export const SNAKE_LADDER_MAX_PLAYERS = 6
export const SNAKE_LADDER_DEFAULT_MAX_PLAYERS = 4

/** Final square — land here exactly to win. */
export const SNAKE_LADDER_GOAL = 100

/** Classic Milton-Bradley board. Ladders climb up: bottom → top. */
export const LADDERS: Readonly<Record<number, number>> = {
  1: 38,
  4: 14,
  9: 31,
  21: 42,
  28: 84,
  36: 44,
  51: 67,
  71: 91,
  80: 100,
}

/** Snakes slide down: head → tail. */
export const SNAKES: Readonly<Record<number, number>> = {
  16: 6,
  47: 26,
  49: 11,
  56: 53,
  62: 19,
  64: 60,
  87: 24,
  93: 73,
  95: 75,
  98: 78,
}

/** Combined jump map — every square that teleports you somewhere else. */
export const JUMPS: Readonly<Record<number, number>> = { ...LADDERS, ...SNAKES }

export const SNAKE_LADDER_COLORS: SnakeLadderColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange']

export const SNAKE_LADDER_COLOR_LABELS: Record<SnakeLadderColor, string> = {
  red: 'Red',
  blue: 'Blue',
  green: 'Green',
  yellow: 'Yellow',
  purple: 'Purple',
  orange: 'Orange',
}

export const SNAKE_LADDER_COLOR_HEX: Record<SnakeLadderColor, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  purple: '#a855f7',
  orange: '#f97316',
}

/** Assign distinct colors in seating order. */
export function colorsForPlayerCount(count: number): SnakeLadderColor[] {
  return SNAKE_LADDER_COLORS.slice(0, Math.max(0, count))
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function currentPlayerId(session: SnakeLadderSession): string | null {
  const order = session.turn_order ?? []
  if (order.length === 0) return null
  return order[session.current_turn_index % order.length] ?? null
}

export function snakeLadderTurnDeadline(timerSeconds: number): string | null {
  if (!timerSeconds || timerSeconds <= 0) return null
  return new Date(Date.now() + timerSeconds * 1000).toISOString()
}

export function snakeLadderSecondsLeft(deadlineAt: string | null | undefined): number {
  if (!deadlineAt) return 0
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000))
}

export function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1
}

export type SnakeLadderStanding = {
  playerId: string
  name: string
  color: SnakeLadderColor
  position: number
  rank: number
}

export function buildSnakeLadderStandings(
  states: SnakeLadderPlayerState[],
  players: Player[],
  winnerPlayerId?: string | null
): SnakeLadderStanding[] {
  const rows = states.map((state) => ({
    playerId: state.player_id,
    name: players.find((p) => p.id === state.player_id)?.name ?? 'Player',
    color: state.color,
    position: state.position,
  }))

  rows.sort((a, b) => {
    if (winnerPlayerId) {
      if (a.playerId === winnerPlayerId) return -1
      if (b.playerId === winnerPlayerId) return 1
    }
    return b.position - a.position || a.name.localeCompare(b.name)
  })

  return rows.map((row, index) => ({ ...row, rank: index + 1 }))
}

function advanceTurnIndex(session: SnakeLadderSession): number {
  return (session.current_turn_index + 1) % session.turn_order.length
}

async function loadGameState(
  supabase: SupabaseClient,
  gameId: string
): Promise<{
  session: SnakeLadderSession | null
  states: SnakeLadderPlayerState[]
  timerSeconds: number
  playerNames: Map<string, string>
}> {
  const [sessionRes, statesRes, gameRes, playersRes] = await Promise.all([
    supabase.from('snake_ladder_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    supabase.from('snake_ladder_player_state').select('*').eq('game_id', gameId).order('player_order'),
    supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle(),
    supabase.from('players').select('id, name').eq('game_id', gameId),
  ])

  const playerNames = new Map<string, string>()
  for (const p of playersRes.data ?? []) {
    playerNames.set(p.id, p.name)
  }

  return {
    session: sessionRes.data as SnakeLadderSession | null,
    states: (statesRes.data as SnakeLadderPlayerState[]) ?? [],
    timerSeconds: gameRes.data?.timer_seconds ?? 0,
    playerNames,
  }
}

export async function initializeSnakeAndLadderGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string }> {
  const turnOrder = shuffle(playerIds)
  const colors = colorsForPlayerCount(turnOrder.length)

  const { data: gameRow } = await supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle()
  const timerSeconds = gameRow?.timer_seconds ?? 0

  const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
  const names = new Map<string, string>()
  for (const p of playerRows ?? []) names.set(p.id, p.name)

  const firstPlayerId = turnOrder[0]
  const firstName = firstPlayerId ? (names.get(firstPlayerId) ?? 'Player') : 'Player'

  const sessionRow: Partial<SnakeLadderSession> = {
    game_id: gameId,
    turn_order: turnOrder,
    current_turn_index: 0,
    phase: 'roll',
    last_roll: null,
    last_from: null,
    last_to: null,
    last_event: 'start',
    last_player_id: null,
    consecutive_sixes: 0,
    status_message: `${firstName}'s turn — roll the dice`,
    winner_player_id: null,
    turn_deadline_at: snakeLadderTurnDeadline(timerSeconds),
  }

  const { error: sessionError } = await supabase.from('snake_ladder_sessions').insert(sessionRow)
  if (sessionError) return { error: sessionError.message }

  const stateRows = turnOrder.map((playerId, index) => ({
    game_id: gameId,
    player_id: playerId,
    color: colors[index]!,
    position: 0,
    player_order: index,
  }))

  const { error: statesError } = await supabase.from('snake_ladder_player_state').insert(stateRows)
  if (statesError) {
    // `snake_ladder_sessions.game_id` is unique — clean up the orphaned session
    // so a retry can start fresh instead of colliding with this row.
    await supabase.from('snake_ladder_sessions').delete().eq('game_id', gameId)
    return { error: statesError.message }
  }

  return {}
}

export async function clearSnakeAndLadderSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  return clearSessionTables(supabase, gameId, ['snake_ladder_sessions', 'snake_ladder_player_state'], {
    resetSpectators: true,
  })
}

/**
 * Optimistic-concurrency session write. The update only lands if the row still
 * carries the `expectedUpdatedAt` we read, so when two requests race (e.g. every
 * client driving the turn timer, or a manual roll colliding with an auto-roll)
 * only the first wins — the loser gets 0 rows and the caller aborts before
 * mutating the position. Returns true if this write won.
 */
async function persistSession(
  supabase: SupabaseClient,
  gameId: string,
  patch: Partial<SnakeLadderSession>,
  timerSeconds: number,
  expectedUpdatedAt: string
): Promise<boolean> {
  const { data } = await supabase
    .from('snake_ladder_sessions')
    .update({
      ...patch,
      turn_deadline_at: patch.phase === 'finished' ? null : snakeLadderTurnDeadline(timerSeconds),
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('updated_at', expectedUpdatedAt)
    .select('game_id')
  return (data?.length ?? 0) > 0
}

interface RollOutcome {
  from: number
  landed: number
  to: number
  event: SnakeLadderEvent
  won: boolean
  /** A 6 grants another roll — unless it busts the turn (third six). */
  extraRoll: boolean
  bust: boolean
  consecutiveSixes: number
}

/** Pure resolution of a single die roll from a given square. Exported for tests/UI. */
export function resolveRoll(from: number, die: number, prevConsecutiveSixes: number): RollOutcome {
  const rolledSix = die === 6
  const consecutiveSixes = rolledSix ? prevConsecutiveSixes + 1 : 0
  const bust = rolledSix && consecutiveSixes >= 3

  if (bust) {
    return { from, landed: from, to: from, event: 'bust', won: false, extraRoll: false, bust: true, consecutiveSixes }
  }

  const landed = from + die
  if (landed > SNAKE_LADDER_GOAL) {
    // Overshoot — must land exactly on 100, so the token stays put.
    return {
      from,
      landed,
      to: from,
      event: 'overshoot',
      won: false,
      extraRoll: rolledSix,
      bust: false,
      consecutiveSixes,
    }
  }

  const jumped = JUMPS[landed]
  const to = jumped ?? landed
  const won = to === SNAKE_LADDER_GOAL
  const event: SnakeLadderEvent = won ? 'win' : jumped != null ? (jumped > landed ? 'ladder' : 'snake') : 'move'

  return { from, landed, to, event, won, extraRoll: rolledSix && !won, bust: false, consecutiveSixes }
}

function describeOutcome(name: string, die: number, outcome: RollOutcome): string {
  switch (outcome.event) {
    case 'win':
      return `${name} rolled a ${die} and reached 100 — wins! 🏆`
    case 'ladder':
      return `${name} rolled a ${die}, climbed a ladder ${outcome.landed} → ${outcome.to}! 🪜`
    case 'snake':
      return `${name} rolled a ${die} and slid down a snake ${outcome.landed} → ${outcome.to} 🐍`
    case 'overshoot':
      return `${name} rolled a ${die} — overshoots 100, stays on ${outcome.from}`
    case 'bust':
      return `${name} rolled three 6s in a row — turn lost`
    default:
      return `${name} rolled a ${die} — now on square ${outcome.to}`
  }
}

export async function processSnakeAndLadderRoll(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string; roll?: number }> {
  const { session, states, timerSeconds, playerNames } = await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }
  if (session.phase !== 'roll') return { error: 'Not roll phase' }
  if (currentPlayerId(session) !== playerId) return { error: 'Not your turn' }

  const playerRow = states.find((s) => s.player_id === playerId)
  if (!playerRow) return { error: 'Player state not found' }

  const die = rollDie()
  const outcome = resolveRoll(playerRow.position, die, session.consecutive_sixes)
  const name = playerNames.get(playerId) ?? 'Player'

  const samePlayerAgain = outcome.extraRoll && !outcome.won
  const nextTurnIndex = samePlayerAgain ? session.current_turn_index : advanceTurnIndex(session)
  const phase: SnakeLadderSession['phase'] = outcome.won ? 'finished' : 'roll'

  let statusMessage = describeOutcome(name, die, outcome)
  if (!outcome.won) {
    if (samePlayerAgain) {
      statusMessage += ' — rolled a 6, roll again!'
    } else {
      const nextId = session.turn_order[nextTurnIndex]
      statusMessage += `. ${playerNames.get(nextId ?? '') ?? 'Next player'}'s turn`
    }
  }

  // Claim the turn via CAS FIRST. If another request already advanced the game
  // from this exact state, we lose the CAS and bail without moving the token.
  const claimed = await persistSession(
    supabase,
    gameId,
    {
      phase,
      current_turn_index: nextTurnIndex,
      last_roll: die,
      last_from: outcome.from,
      last_to: outcome.to,
      last_event: outcome.event,
      last_player_id: playerId,
      consecutive_sixes: samePlayerAgain ? outcome.consecutiveSixes : 0,
      status_message: statusMessage,
      winner_player_id: outcome.won ? playerId : null,
    },
    timerSeconds,
    session.updated_at
  )
  if (!claimed) return {}

  if (outcome.to !== outcome.from) {
    const { error: moveError } = await supabase
      .from('snake_ladder_player_state')
      .update({ position: outcome.to })
      .eq('game_id', gameId)
      .eq('player_id', playerId)
    if (moveError) return { error: moveError.message }
  }

  if (outcome.won) await markGameFinished(supabase, gameId)

  return { roll: die }
}

export async function processSnakeAndLadderExpireTurn(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string }> {
  const { session } = await loadGameState(supabase, gameId)
  if (!session || session.phase === 'finished') return {}

  // Only auto-roll once the turn has genuinely expired — never let a caller force
  // the current player's move early.
  if (!session.turn_deadline_at) return {}
  if (snakeLadderSecondsLeft(session.turn_deadline_at) > 0) return { error: 'Turn has not expired' }

  const playerId = currentPlayerId(session)
  if (!playerId) return { error: 'No current player' }

  // Only one phase ('roll') — a timeout simply auto-rolls for the current player.
  const { error } = await processSnakeAndLadderRoll(supabase, gameId, playerId)
  return error ? { error } : {}
}

/**
 * Remove a player who left or was kicked. Without this their id stays in
 * `turn_order`, so the game keeps handing turns to a ghost. Drop them from the
 * order (fixing current_turn_index), delete their state, end the game if fewer
 * than two players remain (lone survivor wins), then delete their player row.
 *
 * The session write is a plain (non-CAS) update on purpose: a removal must
 * always land.
 */
export async function removeSnakeAndLadderPlayer(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  playerName?: string
): Promise<{ error: string | null }> {
  const { data: sessionRaw } = await supabase
    .from('snake_ladder_sessions')
    .select('*')
    .eq('game_id', gameId)
    .maybeSingle()
  const session = sessionRaw as SnakeLadderSession | null
  const order = session ? [...(session.turn_order ?? [])] : []
  const removedIndex = order.indexOf(playerId)

  if (session && removedIndex >= 0 && session.phase !== 'finished') {
    const turnOrder = order.filter((id) => id !== playerId)
    let currentTurnIndex = session.current_turn_index
    if (removedIndex < currentTurnIndex) currentTurnIndex -= 1
    else if (removedIndex === currentTurnIndex && turnOrder.length > 0) currentTurnIndex %= turnOrder.length
    if (turnOrder.length === 0) currentTurnIndex = 0

    const removedName = playerName ?? 'A player'
    const { data: gameRow } = await supabase.from('games').select('timer_seconds').eq('id', gameId).maybeSingle()
    const timerSeconds = gameRow?.timer_seconds ?? 0
    const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
    const names = new Map<string, string>()
    for (const p of playerRows ?? []) names.set(p.id, p.name)

    const update: Record<string, unknown> = {
      turn_order: turnOrder,
      current_turn_index: currentTurnIndex,
      consecutive_sixes: 0,
      updated_at: new Date().toISOString(),
    }

    const finishing = turnOrder.length < 2
    if (finishing) {
      const winnerPlayerId = turnOrder[0] ?? null
      const winnerName = winnerPlayerId ? (names.get(winnerPlayerId) ?? 'Winner') : null
      update.phase = 'finished'
      update.winner_player_id = winnerPlayerId
      update.status_message = winnerName
        ? `${removedName} left — ${winnerName} wins!`
        : `${removedName} left — game over.`
      update.turn_deadline_at = null
    } else {
      const nextPlayerId = turnOrder[currentTurnIndex]
      update.phase = 'roll'
      update.status_message = `${removedName} left. ${names.get(nextPlayerId) ?? 'Next player'}'s turn`
      update.turn_deadline_at = snakeLadderTurnDeadline(timerSeconds)
    }

    const { error: sessionError } = await supabase.from('snake_ladder_sessions').update(update).eq('game_id', gameId)
    if (sessionError) return { error: sessionError.message }

    await supabase.from('snake_ladder_player_state').delete().eq('game_id', gameId).eq('player_id', playerId)
    if (finishing) await markGameFinished(supabase, gameId)
    const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
    return { error: error?.message ?? null }
  }

  // Lobby, spectator, already-finished, or not in the turn order — just drop their state + row.
  await supabase.from('snake_ladder_player_state').delete().eq('game_id', gameId).eq('player_id', playerId)
  const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
  return { error: error?.message ?? null }
}

export type SnakeLadderHostMode = 'spectator' | 'player'

const SNAKE_LADDER_HOST_MODE_KEY = 'snake_ladder_host_mode'

export function getSnakeLadderHostMode(gameCode: string): SnakeLadderHostMode {
  if (typeof window === 'undefined') return 'spectator'
  return (localStorage.getItem(`${SNAKE_LADDER_HOST_MODE_KEY}_${gameCode}`) as SnakeLadderHostMode) ?? 'spectator'
}

export function setSnakeLadderHostMode(gameCode: string, mode: SnakeLadderHostMode): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${SNAKE_LADDER_HOST_MODE_KEY}_${gameCode}`, mode)
}
