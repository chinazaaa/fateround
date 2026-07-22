import type { SupabaseClient } from '@supabase/supabase-js'
import { internalErrorMessage } from '@/lib/api-errors'
import { clearSessionTables } from './session-clear'
import { markGameFinished } from '@/lib/game-finish'
import { secondsUntilDeadline } from '@/lib/round-timing'
import type { Game, UnoCard, UnoCardColor, UnoColor, UnoPlayerHand, UnoSession } from '@/types'

export const UNO_MIN_PLAYERS = 2
export const UNO_MAX_PLAYERS = 10
export const UNO_DEFAULT_MAX_PLAYERS = 6

/** Cards dealt to each player at the start of a hand. */
export const UNO_DEAL_COUNT = 7

/** Whole-game session length (seconds). 0 = no limit. */
export const UNO_GAME_DURATION_OPTIONS = [0, 600, 900, 1800, 2700, 3600, 5400] as const

/** The four playable colours (excludes the colourless `wild` slot). */
export const UNO_COLORS: UnoColor[] = ['red', 'yellow', 'green', 'blue']

export const UNO_COLOR_LABELS: Record<UnoColor, string> = {
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
}

/** Hex accents for each colour — mirrored by the CSS card faces (kept here for status copy/tests). */
export const UNO_COLOR_HEX: Record<UnoColor, string> = {
  red: '#ef4444',
  yellow: '#f59e0b',
  green: '#22c55e',
  blue: '#3b82f6',
}

// ── Rules ───────────────────────────────────────────────────────────────────────
export type UnoRules = {
  /** Allow challenging a Wild Draw Four. */
  wd4Challenge: boolean
  /** Cards drawn for a missed "UNO" call. */
  unoPenalty: number
  /** Cards a failed challenger draws. */
  wd4ChallengePenalty: number
  /** 0 = all hands pass in play direction; 7 = swap hands with a chosen player. */
  zeroSeven: boolean
  /** Allow stacking Draw Two on Draw Two / Draw Four on Draw Four (penalty accumulates). */
  stacking: boolean
  /** Multi-Play grouping rule (lay several matching cards in one turn). */
  multiPlay: UnoMultiPlayMode
  /** 2v2 Team-Up mode: a team wins the moment either member empties their hand. */
  teamMode: boolean
  /** Jump-In: any player may play an exact-match card out of turn (same colour + value/symbol). */
  jumpIn: boolean
}

/** Team-Up requires exactly this many players (2 teams of 2). */
export const UNO_TEAM_PLAYERS = 4

/**
 * Team-Up teams are derived from seating parity: turn_order alternates A–B–A–B, so seats at
 * even indices are team 0 and odd indices are team 1. Returns the team (0/1) for a player, or
 * null if they're not seated.
 */
export function unoTeamIndex(turnOrder: string[], playerId: string): 0 | 1 | null {
  const i = (turnOrder ?? []).indexOf(playerId)
  if (i < 0) return null
  return (i % 2) as 0 | 1
}

/** The player id of `playerId`'s teammate (same parity, other seat), or null. */
export function unoTeammateId(turnOrder: string[], playerId: string): string | null {
  const order = turnOrder ?? []
  const i = order.indexOf(playerId)
  if (i < 0) return null
  return order.find((id, j) => j !== i && j % 2 === i % 2) ?? null
}

/** Ids of players who left mid-round — kept in turn_order (parity) but skipped by play + placement. */
export function unoLeftPlayerIds(session: Pick<UnoSession, 'left_player_ids'>): string[] {
  return (session.left_player_ids as string[] | undefined) ?? []
}

/**
 * Seats on `playerId`'s Team-Up team that are still in the round — not left, still holding cards.
 * Used to decide, after a leave, whether a teammate remains (prompt to continue/forfeit) or the
 * whole team is gone (the other team wins).
 */
export function unoActiveTeammates(
  turnOrder: string[],
  hands: UnoPlayerHand[],
  leftIds: string[],
  playerId: string
): string[] {
  const i = (turnOrder ?? []).indexOf(playerId)
  if (i < 0) return []
  const left = new Set(leftIds)
  return (turnOrder ?? []).filter((id, j) => j !== i && j % 2 === i % 2 && !left.has(id) && unoHandCount(hands, id) > 0)
}

/**
 * Did `playerId` win this round? True for the winner, and — in Team-Up — also for
 * the winner's teammate (both partners share the win, so both belong on the
 * community leaderboard).
 */
export function unoPlayerSharesWin(
  turnOrder: string[],
  winnerId: string | null | undefined,
  playerId: string | null | undefined,
  teamMode: boolean
): boolean {
  if (!winnerId || !playerId) return false
  if (winnerId === playerId) return true
  return teamMode && unoTeammateId(turnOrder ?? [], winnerId) === playerId
}

/** Multi-Play grouping rule. `off` = Classic (one card per turn). */
export type UnoMultiPlayMode = 'off' | 'same_color' | 'same_number' | 'same_color_or_number'

const MULTI_PLAY_MODES: UnoMultiPlayMode[] = ['off', 'same_color', 'same_number', 'same_color_or_number']

export function parseMultiPlayMode(raw: unknown): UnoMultiPlayMode {
  return (MULTI_PLAY_MODES as readonly string[]).includes(String(raw)) ? (raw as UnoMultiPlayMode) : 'off'
}

export function parseUnoRules(
  game:
    | Pick<
        Game,
        | 'uno_wd4_challenge'
        | 'uno_uno_penalty'
        | 'uno_wd4_challenge_penalty'
        | 'uno_zero_seven'
        | 'uno_stacking'
        | 'uno_multi_play_mode'
        | 'uno_team_mode'
        | 'uno_jump_in'
      >
    | null
    | undefined
): UnoRules {
  const penalty = Number(game?.uno_uno_penalty ?? 2)
  const wd4Penalty = Number(game?.uno_wd4_challenge_penalty ?? 6)
  return {
    wd4Challenge: game?.uno_wd4_challenge !== false,
    unoPenalty: penalty === 4 ? 4 : 2,
    // Standard UNO: a failed challenger draws 6 (the 4 they refused + a 2 penalty). 4 is a milder variant.
    wd4ChallengePenalty: wd4Penalty === 4 ? 4 : 6,
    zeroSeven: game?.uno_zero_seven === true,
    stacking: game?.uno_stacking === true,
    multiPlay: parseMultiPlayMode(game?.uno_multi_play_mode),
    teamMode: game?.uno_team_mode === true,
    jumpIn: game?.uno_jump_in === true,
  }
}

export function clampUnoGameDuration(raw: unknown): number {
  const n = Number(raw ?? 0)
  return (UNO_GAME_DURATION_OPTIONS as readonly number[]).includes(n) ? n : 0
}

export function formatUnoGameDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return 'No limit'
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds / 3600 === 1 ? '' : 's'}`
  return `${Math.round(seconds / 60)} minutes`
}

// ── Card helpers ──────────────────────────────────────────────────────────────
export function isWildCard(card: UnoCard): boolean {
  return card.kind === 'wild' || card.kind === 'wild_draw4'
}

export function isActionCard(card: UnoCard): boolean {
  return card.kind === 'skip' || card.kind === 'reverse' || card.kind === 'draw2'
}

const KIND_SHORT: Record<UnoCard['kind'], string> = {
  number: '',
  skip: 'Skip',
  reverse: 'Reverse',
  draw2: '+2',
  wild: 'Wild',
  wild_draw4: 'Wild +4',
}

export function cardLabel(card: UnoCard): string {
  if (card.kind === 'number') return `${UNO_COLOR_LABELS[card.color as UnoColor]} ${card.value}`
  if (card.kind === 'wild') return 'Wild'
  if (card.kind === 'wild_draw4') return 'Wild Draw Four'
  return `${UNO_COLOR_LABELS[card.color as UnoColor]} ${KIND_SHORT[card.kind]}`
}

export function cardShortLabel(card: UnoCard): string {
  if (card.kind === 'number') return String(card.value)
  return KIND_SHORT[card.kind]
}

/** Points a card is worth when tallying hands at game end (lowest wins). */
export function cardPoints(card: UnoCard): number {
  if (card.kind === 'number') return card.value ?? 0
  if (isWildCard(card)) return 50
  return 20 // skip / reverse / draw2
}

export function unoHandSum(cards: UnoCard[]): number {
  return cards.reduce((sum, card) => sum + cardPoints(card), 0)
}

/** Build the standard 108-card UNO deck. */
export function buildUnoDeck(): UnoCard[] {
  const deck: UnoCard[] = []
  for (const color of UNO_COLORS) {
    // One 0, two each of 1–9.
    deck.push({ id: `${color}-0`, color, kind: 'number', value: 0 })
    for (let value = 1; value <= 9; value += 1) {
      deck.push({ id: `${color}-${value}-a`, color, kind: 'number', value })
      deck.push({ id: `${color}-${value}-b`, color, kind: 'number', value })
    }
    // Two each of Skip / Reverse / Draw Two.
    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      deck.push({ id: `${color}-${kind}-a`, color, kind })
      deck.push({ id: `${color}-${kind}-b`, color, kind })
    }
  }
  // Four Wild + four Wild Draw Four.
  for (let i = 0; i < 4; i += 1) {
    deck.push({ id: `wild-${i}`, color: 'wild', kind: 'wild' })
    deck.push({ id: `wild4-${i}`, color: 'wild', kind: 'wild_draw4' })
  }
  return deck
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function currentPlayerId(session: UnoSession): string | null {
  const order = session.turn_order ?? []
  if (order.length === 0) return null
  const len = order.length
  return order[((session.current_turn_index % len) + len) % len] ?? null
}

export function unoTurnDeadline(timerSeconds: number): string | null {
  if (!timerSeconds || timerSeconds <= 0) return null
  return new Date(Date.now() + timerSeconds * 1000).toISOString()
}

export function unoSecondsLeft(deadlineAt: string | null | undefined): number {
  if (!deadlineAt) return 0
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000))
}

export function specialCardMessage(card: UnoCard): string | null {
  switch (card.kind) {
    case 'skip':
      return 'Skip — next player loses their turn'
    case 'reverse':
      return 'Reverse — direction of play flips'
    case 'draw2':
      return 'Draw Two — next player draws 2 and loses their turn'
    case 'wild':
      return 'Wild — choose a colour'
    case 'wild_draw4':
      return 'Wild Draw Four — next player draws 4'
    default:
      return null
  }
}

/** Colour the current top card / call demands the next player match. */
export function activeColor(session: UnoSession): UnoColor | null {
  if (session.required_color) return session.required_color
  const top = session.top_card
  if (!top || top.color === 'wild') return null
  return top.color as UnoColor
}

export function canPlayCard(card: UnoCard, session: UnoSession): boolean {
  // A pending forced draw (Draw Two / Draw Four) must be taken — unless stacking is on, in
  // which case only a matching card stacks onto it. `draw_penalty_kind` is set to the
  // stackable card only when the host enabled stacking, so no rules lookup is needed here.
  if ((session.draw_penalty ?? 0) > 0) {
    return card.kind === session.draw_penalty_kind
  }

  // Wild cards play on anything, anytime.
  if (isWildCard(card)) return true

  const reqColor = session.required_color
  if (reqColor) return card.color === reqColor

  const top = session.top_card
  if (!top) return true
  if (top.color === 'wild' && !reqColor) return true // shouldn't happen (colour is always chosen)

  if (card.color === top.color) return true
  if (card.kind === 'number' && top.kind === 'number') return card.value === top.value
  if (card.kind !== 'number' && card.kind === top.kind) return true // matching symbol (Skip on Skip, etc.)
  return false
}

/**
 * Jump-In eligibility: `card` is an EXACT match for the settled top card — same colour AND same
 * number (for number cards) or same symbol (Skip/Reverse/Draw Two). Wild and Wild Draw Four are
 * never eligible (no fixed colour/number to match). A different colour or a different value/symbol
 * does not qualify.
 */
export function isJumpInMatch(card: UnoCard, top: UnoCard | null): boolean {
  if (!top) return false
  if (isWildCard(card) || isWildCard(top)) return false
  if (card.color !== top.color) return false
  if (card.kind === 'number' && top.kind === 'number') return card.value === top.value
  return card.kind !== 'number' && card.kind === top.kind
}

export function playPenaltyError(card: UnoCard, session: UnoSession): string | null {
  const penalty = session.draw_penalty ?? 0
  if (penalty <= 0) return null
  if (card.kind === session.draw_penalty_kind) return null // a legal stack
  const kind = session.draw_penalty_kind
  if (kind === 'draw2') return `Draw ${penalty} — play another Draw Two to stack, or draw`
  if (kind === 'wild_draw4') return `Draw ${penalty} — play another Wild Draw Four to stack, or draw`
  return `Draw the ${penalty}-card penalty`
}

export function hasPlayableCard(hand: UnoCard[], session: UnoSession): boolean {
  return hand.some((c) => canPlayCard(c, session))
}

// ── Multi-Play ──────────────────────────────────────────────────────────────────
/** A card that can be part of a Multi-Play set (wilds are colourless — must be played alone). */
export function isMultiPlayableCard(card: UnoCard): boolean {
  return !isWildCard(card)
}

/** Do these cards form a legal Multi-Play group under the mode? Order-independent. */
export function multiSetGroupingOk(cards: UnoCard[], mode: UnoMultiPlayMode): boolean {
  if (mode === 'off' || cards.length < 2) return false
  if (cards.some((c) => isWildCard(c))) return false
  const first = cards[0]!
  const allSameColor = cards.every((c) => c.color === first.color)
  const allSameValue = cards.every((c) => c.kind === 'number' && c.value === first.value)
  if (mode === 'same_color') return allSameColor
  if (mode === 'same_number') return allSameValue
  return allSameColor || allSameValue // same_color_or_number
}

/**
 * Validate a Multi-Play. `cards` are IN PLAY ORDER — the FIRST must legally match the top of
 * the discard, and every card must satisfy the grouping rule. Returns an error string or null.
 */
export function validateMultiSet(cards: UnoCard[], session: UnoSession, mode: UnoMultiPlayMode): string | null {
  if (mode === 'off') return 'Multi-Play is off'
  if ((session.draw_penalty ?? 0) > 0) return 'Resolve the draw penalty first'
  if (cards.length < 2) return 'Select at least two cards'
  if (cards.some((c) => isWildCard(c))) return 'Wild cards must be played on their own'
  if (!multiSetGroupingOk(cards, mode)) {
    return mode === 'same_color'
      ? 'All cards must be the same colour'
      : mode === 'same_number'
        ? 'All cards must be the same number'
        : 'All cards must share a colour or a number'
  }
  if (!canPlayCard(cards[0]!, session)) return 'The first card must match the top card'
  return null
}

export function unoHandCount(hands: UnoPlayerHand[], playerId: string): number {
  return ((hands.find((h) => h.player_id === playerId)?.cards as UnoCard[]) ?? []).length
}

/** True when the player has no cards left and is watching the rest of the game. */
export function isUnoPlayerOut(handCount: number, spectator?: boolean | null): boolean {
  return handCount === 0 || spectator === true
}

/**
 * Advance `steps` active players from `fromIndex` in `direction` (1 forward,
 * -1 reversed), skipping players who are out of cards.
 */
export function unoNextTurnIndex(
  session: UnoSession,
  hands: UnoPlayerHand[],
  fromIndex: number,
  steps: number,
  direction: number
): number {
  const order = session.turn_order ?? []
  const len = order.length
  if (len === 0) return 0
  const dir = direction < 0 ? -1 : 1

  let idx = fromIndex
  for (let s = 0; s < steps; s += 1) {
    let advanced = false
    for (let attempt = 0; attempt < len; attempt += 1) {
      idx = (((idx + dir) % len) + len) % len
      if (unoHandCount(hands, order[idx]!) > 0) {
        advanced = true
        break
      }
    }
    if (!advanced) return fromIndex
  }
  return idx
}

function activePlayerCount(session: UnoSession, hands: UnoPlayerHand[]): number {
  return (session.turn_order ?? []).filter((id) => unoHandCount(hands, id) > 0).length
}

export function anyPlayerCanPlay(hands: UnoPlayerHand[], session: UnoSession): boolean {
  for (const row of hands) {
    const cards = (row.cards as UnoCard[]) ?? []
    if (cards.length === 0) continue
    if (hasPlayableCard(cards, session)) return true
  }
  return false
}

export function isDrawPileDepleted(session: UnoSession): boolean {
  const drawLen = ((session.draw_pile as UnoCard[]) ?? []).length
  const discardLen = ((session.discard_pile as UnoCard[]) ?? []).length
  return drawLen === 0 && discardLen === 0
}

// ── Standings / placement ───────────────────────────────────────────────────────
export type UnoStanding = {
  playerId: string
  name: string
  cardCount: number
  handSum: number
  rank: number
}

type UnoRankableHand = { player_id: string; cards: UnoCard[] }

/**
 * Final placement order (1st → last). Players who emptied their hand rank FIRST, in the
 * exact order they finished (`finishOrder`); everyone still holding cards follows, ordered
 * by lowest hand total then fewest cards. Mirrors crazyEightsPlacementOrder.
 */
export function unoPlacementOrder(
  hands: UnoRankableHand[],
  turnOrder: string[],
  finishOrder: string[],
  teamMode = false,
  leftPlayerIds: string[] = []
): string[] {
  const activeIds = new Set(turnOrder ?? [])
  const finished = (finishOrder ?? []).filter((id) => activeIds.has(id))
  const finishedSet = new Set(finished)
  const leftSet = new Set(leftPlayerIds)

  // Team-Up: rank the winning team's two members first, then the losing team. The winning team
  // is whoever emptied a hand first, or — if a timer ended it — the lower combined hand total.
  // A member who left mid-round counts for nothing: excluded from the team total, and sorted to
  // the back of their group. If a whole team has left, the other team wins by default.
  const order = turnOrder ?? []
  if (teamMode && order.length === UNO_TEAM_PLAYERS) {
    const sumOf = (id: string) => unoHandSum((hands.find((h) => h.player_id === id)?.cards as UnoCard[]) ?? [])
    const teamActive = (parity: number) => order.filter((id, i) => i % 2 === parity && !leftSet.has(id))
    let winTeam: number
    if (finished.length > 0) winTeam = order.indexOf(finished[0]!) % 2
    else if (teamActive(0).length === 0) winTeam = 1
    else if (teamActive(1).length === 0) winTeam = 0
    else {
      const s0 = teamActive(0).reduce((s, id) => s + sumOf(id), 0)
      const s1 = teamActive(1).reduce((s, id) => s + sumOf(id), 0)
      winTeam = s0 <= s1 ? 0 : 1
    }
    // Players who left sort last within their group (they didn't finish the round).
    const byLeft = (a: string, b: string) => (leftSet.has(a) ? 1 : 0) - (leftSet.has(b) ? 1 : 0)
    const winners = order
      .filter((_, i) => i % 2 === winTeam)
      .sort(
        (a, b) =>
          byLeft(a, b) ||
          (finishedSet.has(b) ? 1 : 0) - (finishedSet.has(a) ? 1 : 0) ||
          sumOf(a) - sumOf(b) ||
          a.localeCompare(b)
      )
    const losers = order
      .filter((_, i) => i % 2 !== winTeam)
      .sort((a, b) => byLeft(a, b) || sumOf(a) - sumOf(b) || a.localeCompare(b))
    return [...winners, ...losers]
  }
  const remaining = hands
    .filter((h) => activeIds.has(h.player_id) && !finishedSet.has(h.player_id))
    .map((h) => {
      const cards = (h.cards as UnoCard[]) ?? []
      return { playerId: h.player_id, handSum: unoHandSum(cards), cardCount: cards.length }
    })
    .sort((a, b) => {
      if (a.handSum !== b.handSum) return a.handSum - b.handSum
      if (a.cardCount !== b.cardCount) return a.cardCount - b.cardCount
      return a.playerId.localeCompare(b.playerId)
    })
    .map((r) => r.playerId)
  return [...finished, ...remaining]
}

export function buildUnoStandings(
  hands: UnoPlayerHand[],
  players: { id: string; name: string }[],
  turnOrder: string[],
  finishOrder: string[] = [],
  teamMode = false,
  leftPlayerIds: string[] = []
): UnoStanding[] {
  const activeIds = new Set(turnOrder ?? [])
  const byId = new Map(hands.filter((h) => activeIds.has(h.player_id)).map((h) => [h.player_id, h]))
  return unoPlacementOrder(hands, turnOrder, finishOrder, teamMode, leftPlayerIds).map((playerId, index) => {
    const cards = (byId.get(playerId)?.cards as UnoCard[]) ?? []
    return {
      playerId,
      name: players.find((p) => p.id === playerId)?.name ?? 'Player',
      cardCount: cards.length,
      handSum: unoHandSum(cards),
      rank: index + 1,
    }
  })
}

export function unoGameSessionExpired(
  sessionStartedAt: string | null | undefined,
  durationSeconds: number | null | undefined
): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false
  if (!sessionStartedAt) return false
  return secondsUntilDeadline(sessionStartedAt, durationSeconds) <= 0
}

// ── Deck / init ───────────────────────────────────────────────────────────────
function isStarterSpecial(card: UnoCard): boolean {
  return card.kind !== 'number'
}

/** Choose the colour the player holds most of — used to auto-name a colour on timeout. */
function dominantColor(hand: UnoCard[]): UnoColor {
  const counts: Record<UnoColor, number> = { red: 0, yellow: 0, green: 0, blue: 0 }
  for (const c of hand) {
    if (c.color !== 'wild') counts[c.color as UnoColor] += 1
  }
  return UNO_COLORS.reduce((best, color) => (counts[color] > counts[best] ? color : best), 'red')
}

function drawStarter(deck: UnoCard[]): { top: UnoCard; rest: UnoCard[] } {
  const pile = [...deck]
  // Prefer a plain number starter so the first turn has no action to resolve.
  const idx = pile.findIndex((c) => !isStarterSpecial(c))
  if (idx === -1) {
    const top = pile.pop()!
    return { top, rest: pile }
  }
  const [top] = pile.splice(idx, 1)
  return { top: top!, rest: pile }
}

export async function initializeUnoGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string }> {
  const { data: gameRow } = await supabase
    .from('games')
    .select('timer_seconds, uno_team_mode')
    .eq('id', gameId)
    .maybeSingle()
  const timerSeconds = gameRow?.timer_seconds ?? 0
  const teamMode = gameRow?.uno_team_mode === true

  if (teamMode && playerIds.length !== UNO_TEAM_PLAYERS) {
    return { error: `Team-Up needs exactly ${UNO_TEAM_PLAYERS} players (2 teams of 2)` }
  }

  // Team-Up: randomly pair the 4 players into two teams, then seat them alternating
  // (A–B–A–B) so teammates sit across and team = seat parity in turn_order.
  const turnOrder = teamMode
    ? (() => {
        const s = shuffle(playerIds)
        return [s[0]!, s[2]!, s[1]!, s[3]!]
      })()
    : shuffle(playerIds)
  const deck = shuffle(buildUnoDeck())

  const hands: UnoCard[][] = turnOrder.map(() => [])
  let drawPile = [...deck]

  for (let c = 0; c < UNO_DEAL_COUNT; c += 1) {
    for (let p = 0; p < turnOrder.length; p += 1) {
      const card = drawPile.pop()
      if (card) hands[p].push(card)
    }
  }

  const { top, rest } = drawStarter(drawPile)
  drawPile = rest

  const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
  const initNames = new Map<string, string>()
  for (const p of playerRows ?? []) initNames.set(p.id, p.name)

  const firstPlayerId = turnOrder[0]
  const firstName = firstPlayerId ? (initNames.get(firstPlayerId) ?? 'Player') : 'Player'
  const sessionRow: Partial<UnoSession> = {
    game_id: gameId,
    turn_order: turnOrder,
    current_turn_index: 0,
    direction: 1,
    phase: 'playing',
    draw_pile: drawPile,
    discard_pile: [],
    top_card: top,
    last_play_cards: null,
    required_color: null,
    draw_penalty: 0,
    pending_wild: null,
    challenge_prev_color: null,
    wd4_player_id: null,
    uno_pending_player: null,
    uno_called: false,
    status_message: `${firstName}'s turn — match ${cardLabel(top)}`,
    winner_player_id: null,
    finish_order: [],
    turn_deadline_at: unoTurnDeadline(timerSeconds),
  }

  const { error: sessionError } = await supabase.from('uno_sessions').insert(sessionRow)
  if (sessionError) return { error: internalErrorMessage('uno', sessionError) }

  const handRows = turnOrder.map((playerId, index) => ({
    game_id: gameId,
    player_id: playerId,
    cards: hands[index],
    player_order: index,
  }))

  const { error: handsError } = await supabase.from('uno_player_hands').insert(handRows)
  if (handsError) {
    await supabase.from('uno_sessions').delete().eq('game_id', gameId)
    return { error: internalErrorMessage('uno', handsError) }
  }

  return {}
}

export async function clearUnoSessionData(supabase: SupabaseClient, gameId: string): Promise<{ error: string | null }> {
  return clearSessionTables(supabase, gameId, ['uno_sessions', 'uno_player_hands'], {
    resetSpectators: true,
  })
}

// ── State loading ─────────────────────────────────────────────────────────────
async function loadGameState(
  supabase: SupabaseClient,
  gameId: string
): Promise<{
  session: UnoSession | null
  hands: UnoPlayerHand[]
  timerSeconds: number
  gameDurationSeconds: number
  sessionStartedAt: string | null
  rules: UnoRules
  playerNames: Map<string, string>
}> {
  const [sessionRes, handsRes, gameRes, playersRes] = await Promise.all([
    supabase.from('uno_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    supabase.from('uno_player_hands').select('*').eq('game_id', gameId).order('player_order'),
    supabase
      .from('games')
      .select(
        'timer_seconds, game_duration_seconds, session_started_at, uno_wd4_challenge, uno_uno_penalty, uno_wd4_challenge_penalty, uno_zero_seven, uno_stacking, uno_multi_play_mode, uno_team_mode, uno_jump_in'
      )
      .eq('id', gameId)
      .maybeSingle(),
    supabase.from('players').select('id, name').eq('game_id', gameId),
  ])

  const playerNames = new Map<string, string>()
  for (const p of playersRes.data ?? []) playerNames.set(p.id, p.name)

  return {
    session: sessionRes.data as UnoSession | null,
    hands: (handsRes.data as UnoPlayerHand[]) ?? [],
    timerSeconds: gameRes.data?.timer_seconds ?? 0,
    gameDurationSeconds: gameRes.data?.game_duration_seconds ?? 0,
    sessionStartedAt: gameRes.data?.session_started_at ?? null,
    rules: parseUnoRules(gameRes.data),
    playerNames,
  }
}

function handForPlayer(hands: UnoPlayerHand[], playerId: string): UnoCard[] {
  const row = hands.find((h) => h.player_id === playerId)
  return (row?.cards as UnoCard[]) ?? []
}

function playerName(playerNames: Map<string, string>, playerId: string): string {
  return playerNames.get(playerId) ?? 'Player'
}

function refillDrawPile(
  drawPile: UnoCard[],
  discardPile: UnoCard[]
): { drawPile: UnoCard[]; discardPile: UnoCard[]; reshuffled: boolean } {
  if (drawPile.length > 0) return { drawPile, discardPile, reshuffled: false }
  if (discardPile.length === 0) return { drawPile, discardPile, reshuffled: false }
  return { drawPile: shuffle(discardPile), discardPile: [], reshuffled: true }
}

function drawCardsWithRefill(
  drawPile: UnoCard[],
  discardPile: UnoCard[],
  count: number
): { drawn: UnoCard[]; drawPile: UnoCard[]; discardPile: UnoCard[]; reshuffled: boolean } {
  let pile = [...drawPile]
  let discard = [...discardPile]
  let reshuffled = false
  const drawn: UnoCard[] = []

  for (let i = 0; i < count; i += 1) {
    if (pile.length === 0) {
      const refilled = refillDrawPile(pile, discard)
      pile = refilled.drawPile
      discard = refilled.discardPile
      if (refilled.reshuffled) reshuffled = true
    }
    if (pile.length === 0) break
    const card = pile.pop()
    if (card) drawn.push(card)
  }

  return { drawn, drawPile: pile, discardPile: discard, reshuffled }
}

/**
 * A player dropped to one card without calling "UNO". If they haven't satisfied the call by
 * the time the NEXT player acts, they draw the penalty. Returns the resulting piles plus the
 * penalised player's new hand, or null when there's nothing to settle.
 */
function settleMissedUno(
  session: UnoSession,
  hands: UnoPlayerHand[],
  actingPlayerId: string,
  rules: UnoRules,
  playerNames: Map<string, string>
): { drawPile: UnoCard[]; discardPile: UnoCard[]; playerId: string; hand: UnoCard[]; note: string } | null {
  const pending = session.uno_pending_player
  if (!pending || session.uno_called) return null
  if (pending === actingPlayerId) return null
  if (unoHandCount(hands, pending) === 0) return null

  const { drawn, drawPile, discardPile } = drawCardsWithRefill(
    (session.draw_pile as UnoCard[]) ?? [],
    (session.discard_pile as UnoCard[]) ?? [],
    rules.unoPenalty
  )
  if (drawn.length === 0) return null

  const hand = [...handForPlayer(hands, pending), ...drawn]
  return {
    drawPile,
    discardPile,
    playerId: pending,
    hand,
    note: `${playerName(playerNames, pending)} forgot to call UNO — drew ${drawn.length}`,
  }
}

// ── Finish helpers ────────────────────────────────────────────────────────────
async function finishByLowestHand(
  supabase: SupabaseClient,
  gameId: string,
  session: UnoSession,
  hands: UnoPlayerHand[],
  playerNames: Map<string, string>,
  reasonPrefix: string,
  teamMode = false
): Promise<boolean> {
  const finishOrder = session.finish_order ?? []
  const leftIds = unoLeftPlayerIds(session)
  const placement = unoPlacementOrder(hands, session.turn_order ?? [], finishOrder, teamMode, leftIds)
  const winnerId = placement[0] ?? null
  const winnerName = winnerId ? playerName(playerNames, winnerId) : 'Nobody'

  let statusMessage: string
  if (teamMode && winnerId) {
    // The winner + their teammate share the round — unless the teammate left mid-round.
    const mate = unoTeammateId(session.turn_order ?? [], winnerId)
    const mateName = mate && !leftIds.includes(mate) ? playerName(playerNames, mate) : null
    statusMessage = mateName
      ? `${reasonPrefix} ${winnerName} & ${mateName} win!`
      : `${reasonPrefix} ${winnerName} wins!`
  } else {
    let detail = 'lowest hand total'
    if (winnerId && finishOrder.includes(winnerId)) {
      detail = 'emptied their hand first'
    } else if (winnerId) {
      const winnerHand = hands.find((h) => h.player_id === winnerId)
      detail = `lowest hand total (${unoHandSum((winnerHand?.cards as UnoCard[]) ?? [])})`
    }
    statusMessage = `${reasonPrefix} ${winnerName} wins — ${detail}.`
  }

  const { data } = await supabase
    .from('uno_sessions')
    .update({
      phase: 'finished',
      winner_player_id: winnerId,
      status_message: statusMessage,
      turn_deadline_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('updated_at', session.updated_at)
    .select('game_id')

  if ((data?.length ?? 0) === 0) return false
  await markGameFinished(supabase, gameId)
  return true
}

async function finalizeIfGameExpired(
  supabase: SupabaseClient,
  gameId: string,
  session: UnoSession,
  hands: UnoPlayerHand[],
  playerNames: Map<string, string>,
  sessionStartedAt: string | null,
  gameDurationSeconds: number,
  teamMode = false
): Promise<boolean> {
  if (session.phase === 'finished') return false
  if (!unoGameSessionExpired(sessionStartedAt, gameDurationSeconds)) return false
  return finishByLowestHand(supabase, gameId, session, hands, playerNames, "Time's up!", teamMode)
}

/**
 * Session patch for when `playerId` empties their hand this turn. Folded into the play
 * handler's single session write. `board` carries the board changes from the card played.
 */
function playerOutPatch(
  session: UnoSession,
  hands: UnoPlayerHand[],
  gameDurationSeconds: number,
  playerId: string,
  name: string,
  playerNames: Map<string, string>,
  board: Partial<UnoSession>,
  nextDirection: number,
  teamMode: boolean
): Partial<UnoSession> {
  const finishOrder = [...(session.finish_order ?? []), playerId]
  const winnerId = finishOrder[0]

  // Team-Up: the round ends the instant a member empties their hand — their team wins.
  if (teamMode) {
    const mate = unoTeammateId(session.turn_order ?? [], playerId)
    // A teammate who left mid-round isn't celebrated (the solo player wins for the team).
    const mateName = mate && !unoLeftPlayerIds(session).includes(mate) ? playerName(playerNames, mate) : null
    return {
      ...board,
      phase: 'finished',
      finish_order: finishOrder,
      winner_player_id: winnerId,
      status_message: mateName ? `${name} & ${mateName} win!` : `${name} wins!`,
    }
  }

  const remaining = (session.turn_order ?? []).filter((id) => id !== playerId && unoHandCount(hands, id) > 0)

  if (gameDurationSeconds <= 0 || remaining.length < 2) {
    return {
      ...board,
      phase: 'finished',
      finish_order: finishOrder,
      winner_player_id: winnerId,
      status_message: `${playerName(playerNames, winnerId)} wins!`,
    }
  }

  const nextIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1, nextDirection)
  const nextId = session.turn_order[nextIndex]
  const top = board.top_card ?? session.top_card
  const matchHint = top ? ` — match ${cardLabel(top)}` : ''
  return {
    ...board,
    current_turn_index: nextIndex,
    direction: nextDirection,
    phase: 'playing',
    finish_order: finishOrder,
    status_message: `${playerName(playerNames, nextId)}'s turn${matchHint} — ${name} is out (${remaining.length} left)`,
  }
}

type TurnAdvance = { nextIndex: number; direction: number }

/** Resolve where the turn goes after a NON-wild card is played (skip / reverse / plain). */
function resolveNextTurn(session: UnoSession, hands: UnoPlayerHand[], card: UnoCard): TurnAdvance {
  let direction = session.direction < 0 ? -1 : 1
  let steps = 1

  if (card.kind === 'reverse') {
    direction = -direction
    // With two active players Reverse acts as a Skip (the mover goes again).
    if (activePlayerCount(session, hands) <= 2) steps = 2
  } else if (card.kind === 'skip') {
    steps = 2
  }
  // Draw Two advances 1 (the target becomes current and faces the pending draw penalty).

  const nextIndex = unoNextTurnIndex(session, hands, session.current_turn_index, steps, direction)
  return { nextIndex, direction }
}

/**
 * Turn resolution for a Multi-Play set (cards IN PLAY ORDER). Action cards resolve in sequence:
 * a Draw Two makes the *immediate* next player draw and lose their turn; a Skip then skips whoever
 * is up after that. So order matters — the Draw-Two penalty lands on the player reached after the
 * skips that come BEFORE it, and skips AFTER it push the turn further along.
 *
 * The card left on top wins (WYSIWYG): only the run of action cards laid AFTER the last non-action
 * (number) card counts. Covering your own Draw Two with a number settles the pile — the next player
 * just matches the number, no draw — so the demand always matches the visible top card.
 *
 * Returns:
 *  - `direction`   — play direction after any reverses.
 *  - `penalty`     — total Draw-Two cards owed (0 when the trailing run has no Draw Two).
 *  - `skipsBefore` — skip-steps (skip / 2-player reverse) laid down before the first Draw Two.
 *  - `skipsAfter`  — skip-steps laid down after the first Draw Two.
 *
 * The caller turns this into indices: the drawer sits `1 + skipsBefore` active seats ahead; when
 * there are `skipsAfter` skips the penalty is applied immediately and the turn advances past the
 * drawer + those skips (see processUnoPlayMulti). All Draw Twos accumulate onto the one drawer.
 */
export function resolveMultiPlayAdvance(
  cards: UnoCard[],
  session: Pick<UnoSession, 'direction'>,
  activeCount: number
): { direction: number; penalty: number; skipsBefore: number; skipsAfter: number } {
  const baseDirection = session.direction < 0 ? -1 : 1
  let direction = baseDirection
  let skipsBefore = 0
  let skipsAfter = 0
  let penalty = 0
  let seenDraw2 = false
  for (const c of cards) {
    if (c.kind === 'reverse') {
      // With ≤2 active players Reverse acts as a Skip; otherwise it just flips direction.
      if (activeCount <= 2) {
        if (seenDraw2) skipsAfter += 1
        else skipsBefore += 1
      } else {
        direction = -direction
      }
    } else if (c.kind === 'skip') {
      if (seenDraw2) skipsAfter += 1
      else skipsBefore += 1
    } else if (c.kind === 'draw2') {
      seenDraw2 = true
      penalty += 2
    } else {
      // A non-action (number) card settles the pile: everything laid before it is covered and
      // cancelled. Only the action cards played after it carry a turn-flow effect.
      direction = baseDirection
      skipsBefore = 0
      skipsAfter = 0
      penalty = 0
      seenDraw2 = false
    }
  }
  return { direction, penalty, skipsBefore, skipsAfter }
}

function discardWith(base: UnoCard[], top: UnoCard | null): UnoCard[] {
  const discard = [...base]
  if (top) discard.push(top)
  return discard
}

async function persistSession(
  supabase: SupabaseClient,
  gameId: string,
  patch: Partial<UnoSession>,
  timerSeconds: number,
  expectedUpdatedAt: string
): Promise<boolean> {
  const { data } = await supabase
    .from('uno_sessions')
    .update({
      ...patch,
      turn_deadline_at: patch.phase === 'finished' ? null : (patch.turn_deadline_at ?? unoTurnDeadline(timerSeconds)),
      updated_at: new Date().toISOString(),
    })
    .eq('game_id', gameId)
    .eq('updated_at', expectedUpdatedAt)
    .select('game_id')
  return (data?.length ?? 0) > 0
}

async function writeHand(supabase: SupabaseClient, gameId: string, playerId: string, cards: UnoCard[]) {
  await supabase.from('uno_player_hands').update({ cards }).eq('game_id', gameId).eq('player_id', playerId)
}

/** Snapshot of every player's hand AFTER the current play + any missed-UNO penalty. */
function handMapAfter(
  hands: UnoPlayerHand[],
  playerId: string,
  newHand: UnoCard[],
  missed: { playerId: string; hand: UnoCard[] } | null
): Map<string, UnoCard[]> {
  const m = new Map<string, UnoCard[]>()
  for (const h of hands) m.set(h.player_id, (h.cards as UnoCard[]) ?? [])
  m.set(playerId, newHand)
  if (missed) m.set(missed.playerId, missed.hand)
  return m
}

/**
 * 0-rule: pass every active hand one seat in the direction of play. Forward → each player
 * hands their cards to the next active seat; reversed → to the previous one. Players who are
 * out (no cards) are skipped. Returns the new (playerId, cards) for every active seat.
 */
export function rotateActiveHands(
  session: UnoSession,
  handMap: Map<string, UnoCard[]>,
  direction: number
): { playerId: string; cards: UnoCard[] }[] {
  const seq = (session.turn_order ?? []).filter((id) => (handMap.get(id)?.length ?? 0) > 0)
  const n = seq.length
  if (n < 2) return seq.map((id) => ({ playerId: id, cards: handMap.get(id) ?? [] }))
  const H = seq.map((id) => handMap.get(id) ?? [])
  const newH: UnoCard[][] = new Array(n)
  const dir = direction < 0 ? -1 : 1
  for (let i = 0; i < n; i += 1) {
    const target = dir === 1 ? (i + 1) % n : (i - 1 + n) % n
    newH[target] = H[i]
  }
  return seq.map((id, i) => ({ playerId: id, cards: newH[i]! }))
}

// ── Play ──────────────────────────────────────────────────────────────────────
export async function processUnoPlay(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  cardId: string,
  callUno = false,
  opts?: { jumpIn?: boolean }
): Promise<{ error?: string }> {
  const { session, hands, timerSeconds, gameDurationSeconds, sessionStartedAt, rules, playerNames } =
    await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }
  if (session.phase === 'finished') return { error: 'Game is finished' }

  if (
    await finalizeIfGameExpired(
      supabase,
      gameId,
      session,
      hands,
      playerNames,
      sessionStartedAt,
      gameDurationSeconds,
      rules.teamMode
    )
  ) {
    return { error: "Time's up — the game has ended" }
  }

  if (session.phase !== 'playing') return { error: 'Resolve the current card first' }
  if (unoHandCount(hands, playerId) === 0) return { error: 'You are out of the game' }

  const hand = handForPlayer(hands, playerId)
  const cardIndex = hand.findIndex((c) => c.id === cardId)
  if (cardIndex < 0) return { error: 'Card not in hand' }
  const card = hand[cardIndex]

  if (opts?.jumpIn) {
    // Jump-In: play an exact-match card out of turn. Only settled top cards are eligible — no
    // jumping while a Draw penalty is pending, and Wilds are never eligible (see isJumpInMatch).
    if (!rules.jumpIn) return { error: 'Jump-In is off for this game' }
    if ((session.draw_penalty ?? 0) > 0) return { error: "Can't jump in while a Draw penalty is pending" }
    if (!isJumpInMatch(card, session.top_card)) return { error: 'Only an exact match can jump in' }
    // The jumper takes the seat; play then flows on from immediately after them, so seats that
    // would have played in between are skipped. Everything below keys off current_turn_index.
    const jumpIndex = (session.turn_order ?? []).indexOf(playerId)
    if (jumpIndex < 0) return { error: 'You are not in this game' }
    session.current_turn_index = jumpIndex
  } else {
    if (currentPlayerId(session) !== playerId) return { error: 'Not your turn' }
    const penaltyError = playPenaltyError(card, session)
    if (penaltyError) return { error: penaltyError }
    if (!canPlayCard(card, session)) return { error: 'Cannot play that card' }
  }

  // Settle a missed "UNO" call by the previous player before applying this move.
  const missed = settleMissedUno(session, hands, playerId, rules, playerNames)
  const basePile = missed?.drawPile ?? (session.draw_pile as UnoCard[]) ?? []
  const baseDiscard = missed?.discardPile ?? (session.discard_pile as UnoCard[]) ?? []

  const newHand = hand.filter((_, i) => i !== cardIndex)
  const wentOut = newHand.length === 0
  const name = playerName(playerNames, playerId)

  // UNO-call bookkeeping: a play that leaves exactly one card owes a call.
  const owesUno = newHand.length === 1
  const unoPatch: Partial<UnoSession> = owesUno
    ? { uno_pending_player: playerId, uno_called: callUno }
    : { uno_pending_player: null, uno_called: false }

  let patch: Partial<UnoSession>
  // 0-7 rule: a 0 rotates every hand in play direction; a 7 pauses for a swap choice.
  const isZero = rules.zeroSeven && card.kind === 'number' && card.value === 0 && !wentOut
  // Only enter the swap phase if there's actually another player to swap with — otherwise a
  // no-timer game would hang on the picker. Without a target the 7 just plays as a number.
  const sevenHasTarget = (session.turn_order ?? []).some((id) => id !== playerId && unoHandCount(hands, id) > 0)
  const isSeven = rules.zeroSeven && card.kind === 'number' && card.value === 7 && !wentOut && sevenHasTarget
  let rotatedWrites: { playerId: string; cards: UnoCard[] }[] | null = null

  if (isWildCard(card) && !wentOut) {
    // Wild / Wild Draw Four with cards left: pause for the colour choice.
    patch = {
      top_card: card,
      last_play_cards: [card],
      discard_pile: discardWith(baseDiscard, session.top_card),
      draw_pile: basePile,
      required_color: null,
      pending_wild: card.kind === 'wild_draw4' ? 'wild_draw4' : 'wild',
      challenge_prev_color: card.kind === 'wild_draw4' ? activeColor(session) : null,
      wd4_player_id: card.kind === 'wild_draw4' ? playerId : null,
      // Carry the accumulated Draw Four penalty when stacking a WD4 onto a WD4 (choose adds its 4).
      draw_penalty:
        card.kind === 'wild_draw4' && session.draw_penalty_kind === 'wild_draw4' ? (session.draw_penalty ?? 0) : 0,
      draw_penalty_kind: null,
      drawn_card_id: null,
      phase: 'choose_color',
      status_message:
        card.kind === 'wild_draw4'
          ? `${name} played a Wild Draw Four — choose a colour`
          : `${name} played a Wild — choose a colour`,
      ...unoPatch,
    }
  } else {
    // Draw Two: with stacking on, a 2 played onto a pending Draw-Two stack adds to it.
    const draw2Base = card.kind === 'draw2' && session.draw_penalty_kind === 'draw2' ? (session.draw_penalty ?? 0) : 0
    const draw2Penalty = card.kind === 'draw2' ? draw2Base + 2 : 0
    const board: Partial<UnoSession> = {
      top_card: card,
      last_play_cards: [card],
      required_color: null,
      pending_wild: null,
      challenge_prev_color: null,
      wd4_player_id: null,
      draw_penalty: draw2Penalty,
      draw_penalty_kind: card.kind === 'draw2' && rules.stacking ? 'draw2' : null,
      drawn_card_id: null,
      discard_pile: discardWith(baseDiscard, session.top_card),
      draw_pile: basePile,
    }

    if (wentOut) {
      patch = {
        ...playerOutPatch(
          session,
          hands,
          gameDurationSeconds,
          playerId,
          name,
          playerNames,
          board,
          session.direction,
          rules.teamMode
        ),
        ...unoPatch,
      }
    } else if (isSeven) {
      // Pause on the same player for the swap-target choice; hand counts change on swap,
      // so the UNO-call obligation is cleared here.
      patch = {
        ...board,
        current_turn_index: session.current_turn_index,
        direction: session.direction,
        phase: 'swap_target',
        status_message: `${name} played a 7 — choose a player to swap hands with`,
        uno_pending_player: null,
        uno_called: false,
      }
    } else {
      const advance = resolveNextTurn(session, hands, card)
      const nextPlayerId = session.turn_order[advance.nextIndex]
      const special = specialCardMessage(card)
      let status = `${playerName(playerNames, nextPlayerId)}'s turn — match ${cardLabel(card)}`
      if (special) status = `${status} · ${special}`
      if (card.kind === 'draw2') {
        status = `${playerName(playerNames, nextPlayerId)} must draw ${draw2Penalty}${rules.stacking ? ' or stack a Draw Two' : ''} (Draw Two)`
      }
      if (isZero) {
        // Rotate every active hand one seat in the direction of play (this play's post-settle
        // hands are the source). The UNO-call obligation is recomputed from the new sizes below.
        const handMap = handMapAfter(hands, playerId, newHand, missed)
        rotatedWrites = rotateActiveHands(session, handMap, advance.direction)
        status = `${name} played a 0 — everyone passed their hand · ${playerName(playerNames, nextPlayerId)}'s turn`
      }
      // A 0 can leave a player on exactly one card — flag the first such seat (turn order) to
      // owe an "UNO" call. (Single field, so if the pass leaves several on one card only the
      // first is tracked.)
      const zeroPending = isZero ? (rotatedWrites?.find((w) => w.cards.length === 1)?.playerId ?? null) : null
      patch = {
        ...board,
        current_turn_index: advance.nextIndex,
        direction: advance.direction,
        phase: 'playing',
        status_message: status,
        ...(isZero ? { uno_pending_player: zeroPending, uno_called: false } : unoPatch),
      }
    }
  }

  // Surface a missed-UNO penalty in the status so the whole room sees the catch.
  if (missed && patch.status_message) patch.status_message = `${patch.status_message} · ${missed.note}`

  const won = await persistSession(supabase, gameId, patch, timerSeconds, session.updated_at)
  if (!won) return {}

  if (rotatedWrites) {
    // Rotation is the source of truth for every active hand (includes the mover + any
    // missed-UNO penalty), so it replaces the individual hand writes.
    for (const w of rotatedWrites) await writeHand(supabase, gameId, w.playerId, w.cards)
  } else {
    await writeHand(supabase, gameId, playerId, newHand)
    if (missed) await writeHand(supabase, gameId, missed.playerId, missed.hand)
  }

  if (wentOut) {
    await supabase.from('players').update({ spectator: true }).eq('id', playerId).eq('game_id', gameId)
    if (patch.phase === 'finished') await markGameFinished(supabase, gameId)
  }

  return {}
}

/**
 * Jump-In: `playerId` plays an exact-match card out of turn. Shares the single-card play pipeline
 * (missed-UNO settle, 0-7, UNO-call bookkeeping, turn advance) — only the turn/eligibility gate
 * differs. Play resumes from the seat immediately after the jumper.
 */
export async function processUnoJumpIn(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  cardId: string,
  callUno = false
): Promise<{ error?: string }> {
  return processUnoPlay(supabase, gameId, playerId, cardId, callUno, { jumpIn: true })
}

// ── Multi-Play (lay several matching cards at once) ──────────────────────────────
export async function processUnoPlayMulti(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  cardIds: string[],
  callUno = false
): Promise<{ error?: string }> {
  const { session, hands, timerSeconds, gameDurationSeconds, sessionStartedAt, rules, playerNames } =
    await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }
  if (session.phase === 'finished') return { error: 'Game is finished' }

  if (
    await finalizeIfGameExpired(
      supabase,
      gameId,
      session,
      hands,
      playerNames,
      sessionStartedAt,
      gameDurationSeconds,
      rules.teamMode
    )
  ) {
    return { error: "Time's up — the game has ended" }
  }

  if (rules.multiPlay === 'off') return { error: 'Multi-Play is off for this game' }
  if (session.phase !== 'playing') return { error: 'Resolve the current card first' }

  const currentId = currentPlayerId(session)
  if (currentId !== playerId) return { error: 'Not your turn' }
  if (unoHandCount(hands, playerId) === 0) return { error: 'You are out of the game' }

  const hand = handForPlayer(hands, playerId)
  // Resolve the requested cards IN ORDER; reject duplicates or unknown ids.
  const remaining = [...hand]
  const cards: UnoCard[] = []
  for (const id of cardIds) {
    const idx = remaining.findIndex((c) => c.id === id)
    if (idx < 0) return { error: 'Card not in hand' }
    cards.push(remaining.splice(idx, 1)[0]!)
  }

  const setError = validateMultiSet(cards, session, rules.multiPlay)
  if (setError) return { error: setError }

  const playedIds = new Set(cards.map((c) => c.id))
  const newHand = hand.filter((c) => !playedIds.has(c.id))
  const wentOut = newHand.length === 0
  const name = playerName(playerNames, playerId)

  // Settle a missed "UNO" call by the previous player first.
  const missed = settleMissedUno(session, hands, playerId, rules, playerNames)
  const basePile = missed?.drawPile ?? (session.draw_pile as UnoCard[]) ?? []
  const baseDiscard = missed?.discardPile ?? (session.discard_pile as UnoCard[]) ?? []

  // Resolve the action cards in play order. A Draw Two makes the *immediate* next player draw and
  // lose their turn; a Skip then skips whoever is up after that. So the penalty lands on the seat
  // reached after the skips laid BEFORE it, and skips laid AFTER push the turn further along.
  const activeCount = activePlayerCount(session, hands)
  const { direction, penalty, skipsBefore, skipsAfter } = resolveMultiPlayAdvance(cards, session, activeCount)
  const draw2Count = penalty / 2
  const lastCard = cards[cards.length - 1]!
  // Discard everything except the card that stays face-up on top.
  const discardPile = [...baseDiscard, ...(session.top_card ? [session.top_card] : []), ...cards.slice(0, -1)]

  // A Draw Two followed by a Skip can't be resolved with a single pending penalty (the trailing
  // skip must fire only after the draw), so that combo auto-applies the draw here and advances
  // past the drawer + skips. A pending penalty (Draw Two with no trailing skip) stays live so the
  // target can stack when the host allows it.
  const autoResolve = penalty > 0 && skipsAfter > 0 && !wentOut
  const pendingPenalty = penalty > 0 && !autoResolve && !wentOut

  const board: Partial<UnoSession> = {
    top_card: lastCard,
    // The whole set, in play order — the client fans the covered cards behind the top one.
    last_play_cards: cards,
    required_color: null,
    pending_wild: null,
    challenge_prev_color: null,
    wd4_player_id: null,
    draw_penalty: pendingPenalty ? penalty : 0,
    draw_penalty_kind: pendingPenalty && rules.stacking ? 'draw2' : null,
    drawn_card_id: null,
    discard_pile: discardPile,
    draw_pile: basePile,
  }

  const owesUno = newHand.length === 1
  const unoPatch: Partial<UnoSession> = owesUno
    ? { uno_pending_player: playerId, uno_called: callUno }
    : { uno_pending_player: null, uno_called: false }

  // AUTO-resolve draws for the target here; captured so the hand write happens after persist.
  let autoDraw: { playerId: string; hand: UnoCard[] } | null = null

  let patch: Partial<UnoSession>
  if (wentOut) {
    patch = {
      ...playerOutPatch(
        session,
        hands,
        gameDurationSeconds,
        playerId,
        name,
        playerNames,
        board,
        direction,
        rules.teamMode
      ),
      ...unoPatch,
    }
  } else if (pendingPenalty) {
    // Land on the drawer (the seat after the leading skips); they draw or stack on their turn.
    const drawerIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1 + skipsBefore, direction)
    const drawerId = session.turn_order[drawerIndex]
    const stackNote = rules.stacking ? ' or stack a Draw Two' : ''
    patch = {
      ...board,
      current_turn_index: drawerIndex,
      direction,
      phase: 'playing',
      status_message: `${name} played ${cards.length} cards — ${playerName(playerNames, drawerId)} must draw ${penalty}${stackNote} (${draw2Count} × Draw Two)`,
      ...unoPatch,
    }
  } else if (autoResolve) {
    // The immediate target draws now and loses their turn; play continues past them + the skips.
    const drawerIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1 + skipsBefore, direction)
    const drawerId = session.turn_order[drawerIndex]
    const drawerBase = missed && missed.playerId === drawerId ? missed.hand : handForPlayer(hands, drawerId)
    const drawResult = drawCardsWithRefill(basePile, discardPile, penalty)
    autoDraw = { playerId: drawerId, hand: [...drawerBase, ...drawResult.drawn] }
    const nextIndex = unoNextTurnIndex(session, hands, drawerIndex, 1 + skipsAfter, direction)
    const nextPlayerId = session.turn_order[nextIndex]
    patch = {
      ...board,
      draw_pile: drawResult.drawPile,
      discard_pile: drawResult.discardPile,
      current_turn_index: nextIndex,
      direction,
      phase: 'playing',
      status_message: `${name} played ${cards.length} cards — ${playerName(playerNames, drawerId)} drew ${drawResult.drawn.length}, skipped to ${playerName(playerNames, nextPlayerId)}`,
      ...unoPatch,
    }
  } else {
    // Plain multi (no Draw Two): advance past every skip to the next player.
    const nextIndex = unoNextTurnIndex(
      session,
      hands,
      session.current_turn_index,
      1 + skipsBefore + skipsAfter,
      direction
    )
    const nextPlayerId = session.turn_order[nextIndex]
    patch = {
      ...board,
      current_turn_index: nextIndex,
      direction,
      phase: 'playing',
      status_message: `${name} played ${cards.length} cards — ${playerName(playerNames, nextPlayerId)}'s turn, match ${cardLabel(lastCard)}`,
      ...unoPatch,
    }
  }

  if (missed && patch.status_message) patch.status_message = `${patch.status_message} · ${missed.note}`

  const won = await persistSession(supabase, gameId, patch, timerSeconds, session.updated_at)
  if (!won) return {}

  await writeHand(supabase, gameId, playerId, newHand)
  // AUTO-resolve drew for the target (its hand already folds in any missed-UNO penalty for them).
  if (autoDraw) await writeHand(supabase, gameId, autoDraw.playerId, autoDraw.hand)
  if (missed && missed.playerId !== autoDraw?.playerId) await writeHand(supabase, gameId, missed.playerId, missed.hand)

  if (wentOut) {
    await supabase.from('players').update({ spectator: true }).eq('id', playerId).eq('game_id', gameId)
    if (patch.phase === 'finished') await markGameFinished(supabase, gameId)
  }

  return {}
}

// ── Draw ──────────────────────────────────────────────────────────────────────
export async function processUnoDraw(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string }> {
  const { session, hands, timerSeconds, gameDurationSeconds, sessionStartedAt, rules, playerNames } =
    await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }
  if (session.phase === 'finished') return { error: 'Game is finished' }

  if (
    await finalizeIfGameExpired(
      supabase,
      gameId,
      session,
      hands,
      playerNames,
      sessionStartedAt,
      gameDurationSeconds,
      rules.teamMode
    )
  ) {
    return { error: "Time's up — the game has ended" }
  }

  if (session.phase !== 'playing') return { error: 'Resolve the current card first' }

  const currentId = currentPlayerId(session)
  if (currentId !== playerId) return { error: 'Not your turn' }
  if (unoHandCount(hands, playerId) === 0) return { error: 'You are out of the game' }
  // One draw per turn: after drawing you either play the drawn card or keep it (pass).
  if (session.drawn_card_id && (session.draw_penalty ?? 0) === 0) {
    return { error: 'You already drew — play it or keep it' }
  }

  // Settle a missed UNO call by the previous player first.
  const missed = settleMissedUno(session, hands, playerId, rules, playerNames)
  let drawPile = missed?.drawPile ?? (session.draw_pile as UnoCard[]) ?? []
  let discardPile = missed?.discardPile ?? (session.discard_pile as UnoCard[]) ?? []

  const penalty = session.draw_penalty ?? 0
  const drawCount = penalty > 0 ? penalty : 1

  const {
    drawn,
    drawPile: nextDrawPile,
    discardPile: nextDiscardPile,
    reshuffled,
  } = drawCardsWithRefill(drawPile, discardPile, drawCount)
  drawPile = nextDrawPile
  discardPile = nextDiscardPile

  const direction = session.direction < 0 ? -1 : 1
  const hand = handForPlayer(hands, playerId)

  if (drawn.length === 0) {
    if (hasPlayableCard(hand, session)) {
      return { error: 'Draw pile is empty — play a card from your hand' }
    }
    if (!anyPlayerCanPlay(hands, session)) {
      await finishByLowestHand(supabase, gameId, session, hands, playerNames, 'Nobody can play —', rules.teamMode)
      return {}
    }
    const nextIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1, direction)
    const nextPlayerId = session.turn_order[nextIndex]
    const top = session.top_card
    const matchHint = top ? ` — match ${cardLabel(top)}` : ''
    await persistSession(
      supabase,
      gameId,
      {
        draw_pile: drawPile,
        discard_pile: discardPile,
        current_turn_index: nextIndex,
        uno_pending_player: null,
        uno_called: false,
        status_message: `${playerName(playerNames, nextPlayerId)}'s turn${matchHint} (draw pile empty)`,
      },
      timerSeconds,
      session.updated_at
    )
    if (missed) await writeHand(supabase, gameId, missed.playerId, missed.hand)
    return {}
  }

  const newHand = [...hand, ...drawn]
  const missedNote = missed ? ` · ${missed.note}` : ''
  const reshuffledNote = reshuffled ? ' · deck reshuffled' : ''
  const forced = penalty > 0

  let patch: Partial<UnoSession>

  if (forced) {
    // A forced penalty draw (Draw Two / Draw Four target) ends the turn — pass play on.
    const nextIndex = unoNextTurnIndex(
      session,
      updateHand(hands, playerId, newHand),
      session.current_turn_index,
      1,
      direction
    )
    const nextPlayerId = session.turn_order[nextIndex]
    const penaltyName =
      session.draw_penalty_kind === 'wild_draw4'
        ? ' (Draw Four)'
        : session.draw_penalty_kind === 'draw2'
          ? ' (Draw Two)'
          : ''
    patch = {
      draw_pile: drawPile,
      discard_pile: discardPile,
      draw_penalty: 0,
      draw_penalty_kind: null,
      drawn_card_id: null,
      current_turn_index: nextIndex,
      uno_pending_player: null,
      uno_called: false,
      status_message: `${playerName(playerNames, nextPlayerId)}'s turn — ${playerName(playerNames, playerId)} drew ${drawn.length}${penaltyName}${reshuffledNote}${missedNote}`,
    }
  } else {
    // Voluntary single draw. If the drawn card is playable, keep the turn so the player may
    // play it or keep it (pass). Otherwise the turn ends — they keep the card.
    const drawnCard = drawn[0]!
    const drawnPlayable = canPlayCard(drawnCard, { ...session, draw_penalty: 0 })
    if (drawnPlayable) {
      patch = {
        draw_pile: drawPile,
        discard_pile: discardPile,
        draw_penalty: 0,
        drawn_card_id: drawnCard.id,
        current_turn_index: session.current_turn_index,
        uno_pending_player: null,
        uno_called: false,
        // Never disclose the drawn card in the shared board status — only the drawer sees it
        // (in their own hand + private "play it or keep it" hint).
        status_message: `${playerName(playerNames, playerId)} drew a card${reshuffledNote}${missedNote}`,
      }
    } else {
      const nextIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1, direction)
      const nextPlayerId = session.turn_order[nextIndex]
      patch = {
        draw_pile: drawPile,
        discard_pile: discardPile,
        draw_penalty: 0,
        drawn_card_id: null,
        current_turn_index: nextIndex,
        uno_pending_player: null,
        uno_called: false,
        status_message: `${playerName(playerNames, playerId)} drew a card — ${playerName(playerNames, nextPlayerId)}'s turn${reshuffledNote}${missedNote}`,
      }
    }
  }

  const won = await persistSession(supabase, gameId, patch, timerSeconds, session.updated_at)
  if (!won) return {}

  await writeHand(supabase, gameId, playerId, newHand)
  if (missed) await writeHand(supabase, gameId, missed.playerId, missed.hand)

  return {}
}

// ── Keep the drawn card (pass) ──────────────────────────────────────────────────
export async function processUnoPass(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string }> {
  const { session, hands, timerSeconds, gameDurationSeconds, sessionStartedAt, rules, playerNames } =
    await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }
  if (session.phase === 'finished') return { error: 'Game is finished' }

  if (
    await finalizeIfGameExpired(
      supabase,
      gameId,
      session,
      hands,
      playerNames,
      sessionStartedAt,
      gameDurationSeconds,
      rules.teamMode
    )
  ) {
    return { error: "Time's up — the game has ended" }
  }

  if (session.phase !== 'playing') return { error: 'Resolve the current card first' }
  const currentId = currentPlayerId(session)
  if (currentId !== playerId) return { error: 'Not your turn' }
  // You can only pass after drawing (keeping the card you just drew).
  if (!session.drawn_card_id) return { error: 'Draw a card first' }

  const direction = session.direction < 0 ? -1 : 1
  const nextIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1, direction)
  const nextPlayerId = session.turn_order[nextIndex]

  await persistSession(
    supabase,
    gameId,
    {
      drawn_card_id: null,
      current_turn_index: nextIndex,
      status_message: `${playerName(playerNames, playerId)} kept the card — ${playerName(playerNames, nextPlayerId)}'s turn`,
    },
    timerSeconds,
    session.updated_at
  )
  return {}
}

function updateHand(hands: UnoPlayerHand[], playerId: string, cards: UnoCard[]): UnoPlayerHand[] {
  return hands.map((h) => (h.player_id === playerId ? { ...h, cards } : h))
}

// ── Choose colour ───────────────────────────────────────────────────────────────
export async function processUnoChoose(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  color: UnoColor
): Promise<{ error?: string }> {
  const { session, hands, timerSeconds, gameDurationSeconds, sessionStartedAt, rules, playerNames } =
    await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }

  if (
    await finalizeIfGameExpired(
      supabase,
      gameId,
      session,
      hands,
      playerNames,
      sessionStartedAt,
      gameDurationSeconds,
      rules.teamMode
    )
  ) {
    return { error: "Time's up — the game has ended" }
  }

  if (session.phase !== 'choose_color') return { error: 'Not choosing a colour' }

  const currentId = currentPlayerId(session)
  if (currentId !== playerId) return { error: 'Not your turn' }
  if (!UNO_COLORS.includes(color)) return { error: 'Choose a colour' }

  const direction = session.direction < 0 ? -1 : 1
  const nextIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1, direction)
  const nextPlayerId = session.turn_order[nextIndex]

  if (session.pending_wild === 'wild_draw4') {
    // The play carried any accumulated Draw Four penalty; this WD4 adds its own 4.
    const accumulated = (session.draw_penalty ?? 0) + 4
    // The challenge window only applies to a lone Draw Four — stacking replaces it.
    if (rules.wd4Challenge && !rules.stacking) {
      const status = `${playerName(playerNames, nextPlayerId)} — accept Draw 4 or challenge (colour: ${UNO_COLOR_LABELS[color]})`
      await persistSession(
        supabase,
        gameId,
        {
          required_color: color,
          pending_wild: null,
          phase: 'challenge_window',
          current_turn_index: nextIndex,
          draw_penalty: accumulated,
          draw_penalty_kind: null,
          status_message: status,
        },
        timerSeconds,
        session.updated_at
      )
      return {}
    }
    // Stacking (or challenge disabled): the penalty passes to the next player, who may stack
    // another Wild Draw Four (when stacking is on), draw the accumulated total, or — when the
    // challenge is also on — challenge the most recent Wild Draw Four player. Keep wd4_player_id
    // + challenge_prev_color only when the challenge stays available, so the UI can offer it.
    const challengeable = rules.wd4Challenge && rules.stacking
    const options = [rules.stacking ? 'stack a Wild Draw Four' : null, challengeable ? 'challenge' : null].filter(
      Boolean
    )
    const optionNote = options.length ? ` or ${options.join(' / ')}` : ''
    const status = `${playerName(playerNames, nextPlayerId)} must draw ${accumulated}${optionNote} — colour ${UNO_COLOR_LABELS[color]}`
    await persistSession(
      supabase,
      gameId,
      {
        required_color: color,
        pending_wild: null,
        challenge_prev_color: challengeable ? session.challenge_prev_color : null,
        wd4_player_id: challengeable ? session.wd4_player_id : null,
        phase: 'playing',
        current_turn_index: nextIndex,
        draw_penalty: accumulated,
        draw_penalty_kind: rules.stacking ? 'wild_draw4' : null,
        status_message: status,
      },
      timerSeconds,
      session.updated_at
    )
    return {}
  }

  // Plain Wild: colour set, play passes on.
  await persistSession(
    supabase,
    gameId,
    {
      required_color: color,
      pending_wild: null,
      phase: 'playing',
      current_turn_index: nextIndex,
      draw_penalty: 0,
      draw_penalty_kind: null,
      status_message: `${playerName(playerNames, nextPlayerId)}'s turn — match ${UNO_COLOR_LABELS[color]}`,
    },
    timerSeconds,
    session.updated_at
  )
  return {}
}

// ── Wild Draw Four challenge ──────────────────────────────────────────────────────
export async function processUnoChallenge(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  challenge: boolean
): Promise<{ error?: string }> {
  const { session, hands, timerSeconds, gameDurationSeconds, sessionStartedAt, rules, playerNames } =
    await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }

  if (
    await finalizeIfGameExpired(
      supabase,
      gameId,
      session,
      hands,
      playerNames,
      sessionStartedAt,
      gameDurationSeconds,
      rules.teamMode
    )
  ) {
    return { error: "Time's up — the game has ended" }
  }

  // Challengeable either in the dedicated window (challenge-only games) or, when stacking is on,
  // while a Wild Draw Four penalty sits pending on the current player in normal play.
  const inChallengeWindow = session.phase === 'challenge_window'
  const inStackedPenalty =
    session.phase === 'playing' &&
    !!session.wd4_player_id &&
    (session.draw_penalty ?? 0) > 0 &&
    session.draw_penalty_kind === 'wild_draw4'
  if (!inChallengeWindow && !inStackedPenalty) return { error: 'No Wild Draw Four to challenge' }

  const currentId = currentPlayerId(session)
  if (currentId !== playerId) return { error: 'Not your decision' }

  const wd4PlayerId = session.wd4_player_id
  const prevColor = session.challenge_prev_color
  const penalty = session.draw_penalty > 0 ? session.draw_penalty : 4
  const direction = session.direction < 0 ? -1 : 1
  // "Turn skipped as normal": after the WD4 resolves, play continues past this player.
  const afterIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1, direction)
  const afterId = session.turn_order[afterIndex]

  const clearBoard = (extra: Partial<UnoSession>): Partial<UnoSession> => ({
    pending_wild: null,
    challenge_prev_color: null,
    wd4_player_id: null,
    draw_penalty: 0,
    draw_penalty_kind: null,
    phase: 'playing',
    ...extra,
  })

  const applyDrawTo = async (
    targetId: string
  ): Promise<{ hand: UnoCard[]; drawPile: UnoCard[]; discardPile: UnoCard[] }> => {
    const { drawn, drawPile, discardPile } = drawCardsWithRefill(
      (session.draw_pile as UnoCard[]) ?? [],
      (session.discard_pile as UnoCard[]) ?? [],
      penalty
    )
    return { hand: [...handForPlayer(hands, targetId), ...drawn], drawPile, discardPile }
  }

  if (!challenge) {
    // Accept: challenger draws 4 and is skipped.
    if (!playerId) return { error: 'Player required' }
    const drawResult = await applyDrawTo(playerId)
    const won = await persistSession(
      supabase,
      gameId,
      clearBoard({
        draw_pile: drawResult.drawPile,
        discard_pile: drawResult.discardPile,
        current_turn_index: afterIndex,
        status_message: `${playerName(playerNames, playerId)} drew ${penalty} — ${playerName(playerNames, afterId)}'s turn`,
      }),
      timerSeconds,
      session.updated_at
    )
    if (!won) return {}
    await writeHand(supabase, gameId, playerId, drawResult.hand)
    return {}
  }

  // Challenge: reveal the WD4 player's hand; did they hold a card of the previous colour?
  const wd4Hand = wd4PlayerId ? handForPlayer(hands, wd4PlayerId) : []
  const hadMatch = prevColor != null && wd4Hand.some((c) => c.color === prevColor)

  if (hadMatch && wd4PlayerId) {
    // Challenge succeeds: the Wild Draw Four player draws instead and their turn ends. The
    // challenger never lost their turn (they only avoided the draw), so play stays on them —
    // it's now their normal turn, matching the colour the WD4 named (required_color is kept).
    const drawResult = await applyDrawTo(wd4PlayerId)
    const colorHint = session.required_color ? ` — match ${UNO_COLOR_LABELS[session.required_color as UnoColor]}` : ''
    const won = await persistSession(
      supabase,
      gameId,
      clearBoard({
        draw_pile: drawResult.drawPile,
        discard_pile: drawResult.discardPile,
        current_turn_index: session.current_turn_index,
        status_message: `Challenge succeeded — ${playerName(playerNames, wd4PlayerId)} draws ${penalty}. ${playerName(playerNames, playerId)}'s turn${colorHint}`,
      }),
      timerSeconds,
      session.updated_at
    )
    if (!won) return {}
    await writeHand(supabase, gameId, wd4PlayerId, drawResult.hand)
    return {}
  }

  // Challenge fails: challenger draws the pending total plus the failed-challenge extra
  // (the standard +2 when wd4ChallengePenalty is 6; +0 for the milder 4 variant). This
  // generalises correctly when the pending penalty is a stacked total, not just a single 4.
  const failPenalty = penalty + (rules.wd4ChallengePenalty - 4)
  const { drawn, drawPile, discardPile } = drawCardsWithRefill(
    (session.draw_pile as UnoCard[]) ?? [],
    (session.discard_pile as UnoCard[]) ?? [],
    failPenalty
  )
  const failHand = [...handForPlayer(hands, playerId), ...drawn]
  const won = await persistSession(
    supabase,
    gameId,
    clearBoard({
      draw_pile: drawPile,
      discard_pile: discardPile,
      current_turn_index: afterIndex,
      status_message: `Challenge failed — ${playerName(playerNames, playerId)} draws ${drawn.length}. ${playerName(playerNames, afterId)}'s turn`,
    }),
    timerSeconds,
    session.updated_at
  )
  if (!won) return {}
  await writeHand(supabase, gameId, playerId, failHand)
  return {}
}

// ── 0-7 rule: seven swap ────────────────────────────────────────────────────────
export async function processUnoSwap(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  targetId: string
): Promise<{ error?: string }> {
  const { session, hands, timerSeconds, gameDurationSeconds, sessionStartedAt, rules, playerNames } =
    await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }

  if (
    await finalizeIfGameExpired(
      supabase,
      gameId,
      session,
      hands,
      playerNames,
      sessionStartedAt,
      gameDurationSeconds,
      rules.teamMode
    )
  ) {
    return { error: "Time's up — the game has ended" }
  }

  if (session.phase !== 'swap_target') return { error: 'No hand swap pending' }

  const currentId = currentPlayerId(session)
  if (currentId !== playerId) return { error: 'Not your turn' }
  if (targetId === playerId) return { error: 'Pick another player to swap with' }
  if (!(session.turn_order ?? []).includes(targetId)) return { error: 'That player is not in the game' }
  if (unoHandCount(hands, targetId) === 0) return { error: 'That player has no cards to swap' }

  const myCards = handForPlayer(hands, playerId)
  const theirCards = handForPlayer(hands, targetId)

  // Swap done, then play passes on normally (a 7 has no skip).
  const handsAfter = updateHand(updateHand(hands, playerId, theirCards), targetId, myCards)
  const direction = session.direction < 0 ? -1 : 1
  const nextIndex = unoNextTurnIndex(session, handsAfter, session.current_turn_index, 1, direction)
  const nextPlayerId = session.turn_order[nextIndex]

  // A swap can leave a player on exactly one card — they now owe an "UNO" call.
  const swapPending = theirCards.length === 1 ? playerId : myCards.length === 1 ? targetId : null

  const won = await persistSession(
    supabase,
    gameId,
    {
      phase: 'playing',
      current_turn_index: nextIndex,
      uno_pending_player: swapPending,
      uno_called: false,
      status_message: `${playerName(playerNames, playerId)} swapped hands with ${playerName(playerNames, targetId)} — ${playerName(playerNames, nextPlayerId)}'s turn`,
    },
    timerSeconds,
    session.updated_at
  )
  if (!won) return {}

  await writeHand(supabase, gameId, playerId, theirCards)
  await writeHand(supabase, gameId, targetId, myCards)
  return {}
}

// ── UNO call ──────────────────────────────────────────────────────────────────
export async function processUnoCall(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<{ error?: string }> {
  const { data: sessionRaw } = await supabase.from('uno_sessions').select('*').eq('game_id', gameId).maybeSingle()
  const session = sessionRaw as UnoSession | null
  if (!session) return { error: 'Session not found' }
  if (session.uno_pending_player !== playerId) return { error: 'Nothing to call' }
  if (session.uno_called) return {}

  const { data: playerRow } = await supabase.from('players').select('name').eq('id', playerId).maybeSingle()
  const nm = playerRow?.name ?? 'A player'

  await supabase
    .from('uno_sessions')
    .update({ uno_called: true, status_message: `${nm} called UNO! 🎉`, updated_at: new Date().toISOString() })
    .eq('game_id', gameId)
    .eq('updated_at', session.updated_at)
  return {}
}

// ── Turn / game expiry ────────────────────────────────────────────────────────
export async function processUnoExpireTurn(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error?: string; skipped?: boolean }> {
  const { session, hands, timerSeconds, gameDurationSeconds, sessionStartedAt, rules, playerNames } =
    await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }
  if (session.phase === 'finished') return { skipped: true }

  if (
    await finalizeIfGameExpired(
      supabase,
      gameId,
      session,
      hands,
      playerNames,
      sessionStartedAt,
      gameDurationSeconds,
      rules.teamMode
    )
  ) {
    return {}
  }

  if (!session.turn_deadline_at || new Date(session.turn_deadline_at as string) > new Date()) {
    return { skipped: true }
  }

  const currentId = currentPlayerId(session)
  if (!currentId) return { error: 'No current player' }

  const hand = handForPlayer(hands, currentId)
  if (hand.length === 0) {
    const direction = session.direction < 0 ? -1 : 1
    const nextIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1, direction)
    const nextId = session.turn_order[nextIndex]
    if (!nextId || unoHandCount(hands, nextId) === 0) {
      await finishByLowestHand(supabase, gameId, session, hands, playerNames, 'Nobody left —', rules.teamMode)
      return {}
    }
    const top = session.top_card
    const matchHint = top ? ` — match ${cardLabel(top)}` : ''
    await persistSession(
      supabase,
      gameId,
      {
        current_turn_index: nextIndex,
        phase: 'playing',
        status_message: `${playerName(playerNames, nextId)}'s turn${matchHint}`,
      },
      timerSeconds,
      session.updated_at
    )
    return {}
  }

  if (session.phase === 'choose_color') {
    return processUnoChoose(supabase, gameId, currentId, dominantColor(hand))
  }

  if (session.phase === 'challenge_window') {
    // Auto-accept on timeout — the safe default.
    return processUnoChallenge(supabase, gameId, currentId, false)
  }

  if (session.phase === 'swap_target') {
    // Auto-swap with the first other active player on timeout.
    const targetId = (session.turn_order ?? []).find((id) => id !== currentId && unoHandCount(hands, id) > 0)
    if (targetId) return processUnoSwap(supabase, gameId, currentId, targetId)
    // No one to swap with — just resume play.
    const direction = session.direction < 0 ? -1 : 1
    const nextIndex = unoNextTurnIndex(session, hands, session.current_turn_index, 1, direction)
    await persistSession(
      supabase,
      gameId,
      {
        phase: 'playing',
        current_turn_index: nextIndex,
        status_message: `${playerName(playerNames, session.turn_order[nextIndex])}'s turn`,
      },
      timerSeconds,
      session.updated_at
    )
    return {}
  }

  // Already drew this turn and idled — keep the card (auto-pass), the safe default.
  if (session.drawn_card_id) {
    return processUnoPass(supabase, gameId, currentId)
  }

  if (hasPlayableCard(hand, session)) {
    const playable = hand.filter((c) => canPlayCard(c, session))
    // Prefer a non-wild, lowest-points card so the auto-play doesn't waste a wild.
    const nonWild = playable.filter((c) => !isWildCard(c))
    const pool = nonWild.length > 0 ? nonWild : playable
    const card = [...pool].sort((a, b) => cardPoints(a) - cardPoints(b))[0]!
    return processUnoPlay(supabase, gameId, currentId, card.id, hand.length - 1 === 1)
  }

  return processUnoDraw(supabase, gameId, currentId)
}

export async function finishExpiredUnoGame(
  supabase: SupabaseClient,
  game: Pick<Game, 'id' | 'status' | 'session_started_at' | 'game_duration_seconds' | 'uno_team_mode'>
): Promise<boolean> {
  if (game.status !== 'active') return false
  if (!unoGameSessionExpired(game.session_started_at, game.game_duration_seconds)) return false

  const gameId = game.id
  const [sessionRes, handsRes, playersRes] = await Promise.all([
    supabase.from('uno_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    supabase.from('uno_player_hands').select('player_id, cards, player_order').eq('game_id', gameId),
    supabase.from('players').select('id, name').eq('game_id', gameId),
  ])

  const session = sessionRes.data as UnoSession | null
  if (!session) return false

  const playerNames = new Map<string, string>()
  for (const p of playersRes.data ?? []) playerNames.set(p.id, p.name)

  const hands = (handsRes.data as UnoPlayerHand[]) ?? []
  await finishByLowestHand(supabase, gameId, session, hands, playerNames, "Time's up!", game.uno_team_mode === true)
  return true
}

// ── Host mode ─────────────────────────────────────────────────────────────────
export type UnoHostMode = 'spectator' | 'player'
const UNO_HOST_MODE_KEY = 'uno_host_mode'

export function getUnoHostMode(gameCode: string): UnoHostMode {
  if (typeof window === 'undefined') return 'player'
  return (localStorage.getItem(`${UNO_HOST_MODE_KEY}_${gameCode}`) as UnoHostMode) ?? 'player'
}

export function setUnoHostMode(gameCode: string, mode: UnoHostMode): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${UNO_HOST_MODE_KEY}_${gameCode}`, mode)
}

// ── Remove player ─────────────────────────────────────────────────────────────
export async function removeUnoPlayer(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  playerNameArg?: string
): Promise<{ error: string | null }> {
  const { data: sessionRaw } = await supabase.from('uno_sessions').select('*').eq('game_id', gameId).maybeSingle()
  const session = sessionRaw as UnoSession | null

  // A player who already went out has a locked placement (finish_order) — preserve it.
  if (session?.finish_order?.includes(playerId)) {
    return { error: null }
  }

  const order = session ? [...(session.turn_order ?? [])] : []
  const removedIndex = order.indexOf(playerId)

  if (session && removedIndex >= 0 && session.phase !== 'finished') {
    const { data: gameRow } = await supabase
      .from('games')
      .select('timer_seconds, uno_team_mode')
      .eq('id', gameId)
      .maybeSingle()
    const timerSeconds = gameRow?.timer_seconds ?? 0
    const teamMode = gameRow?.uno_team_mode === true
    const { data: playerRows } = await supabase.from('players').select('id, name').eq('game_id', gameId)
    const names = new Map<string, string>()
    for (const p of playerRows ?? []) names.set(p.id, p.name)
    const removedName = playerNameArg ?? names.get(playerId) ?? 'A player'

    // ── Team-Up (2v2): keep the leaver's seat in turn_order (teams derive from A-B-A-B
    // parity, which needs 4 seats) and mark them left instead. If their teammate is still
    // in, pause for that teammate to choose continue-solo vs forfeit; if the whole team is
    // gone, the other team wins. ────────────────────────────────────────────────────────
    if (teamMode && order.length === UNO_TEAM_PLAYERS) {
      const { data: handRows } = await supabase
        .from('uno_player_hands')
        .select('player_id, cards')
        .eq('game_id', gameId)
      const hands = (handRows ?? []) as UnoPlayerHand[]
      const prevLeft = unoLeftPlayerIds(session)
      const leftIds = prevLeft.includes(playerId) ? prevLeft : [...prevLeft, playerId]
      const partner = unoTeammateId(order, playerId)
      const partnerActive = !!partner && !leftIds.includes(partner) && unoHandCount(hands, partner) > 0
      const opponentIds = order.filter(
        (id, i) => i % 2 !== removedIndex % 2 && !leftIds.includes(id) && unoHandCount(hands, id) > 0
      )

      const teamUpdate: Record<string, unknown> = {
        left_player_ids: leftIds,
        uno_pending_player: session.uno_pending_player === playerId ? null : session.uno_pending_player,
        updated_at: new Date().toISOString(),
      }

      if (partnerActive) {
        // Pause the round; the remaining teammate decides via processUnoTeamLeaveDecision.
        teamUpdate.phase = 'team_leave_decision'
        teamUpdate.team_decider_id = partner
        teamUpdate.turn_deadline_at = null
        teamUpdate.status_message = `${removedName} left — ${names.get(partner!) ?? 'their teammate'}: play on solo (1 vs 2) or forfeit?`
      } else {
        // The leaver's whole team is gone — the opposing team takes the round.
        const winnerId = opponentIds[0] ?? null
        const winnerMate = winnerId ? unoTeammateId(order, winnerId) : null
        const winNames = [winnerId, winnerMate]
          .filter((id): id is string => !!id && !leftIds.includes(id))
          .map((id) => names.get(id) ?? 'Winner')
        teamUpdate.phase = 'finished'
        teamUpdate.team_decider_id = null
        teamUpdate.winner_player_id = winnerId
        teamUpdate.turn_deadline_at = null
        teamUpdate.status_message = winNames.length
          ? `${removedName} left — ${winNames.join(' & ')} win!`
          : `${removedName} left — game over.`
      }

      const { error: teamError } = await supabase.from('uno_sessions').update(teamUpdate).eq('game_id', gameId)
      if (teamError) return { error: internalErrorMessage('uno', teamError) }
      await supabase.from('uno_player_hands').delete().eq('game_id', gameId).eq('player_id', playerId)
      if (teamUpdate.phase === 'finished') await markGameFinished(supabase, gameId)
      const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
      return { error: error?.message ?? null }
    }

    const turnOrder = order.filter((id) => id !== playerId)
    let currentTurnIndex = session.current_turn_index
    if (removedIndex < currentTurnIndex) currentTurnIndex -= 1
    else if (removedIndex === currentTurnIndex && turnOrder.length > 0) currentTurnIndex %= turnOrder.length
    if (turnOrder.length === 0) currentTurnIndex = 0

    const update: Record<string, unknown> = {
      turn_order: turnOrder,
      current_turn_index: currentTurnIndex,
      // A removed player might have owed an UNO call — clear it so a ghost never penalises.
      uno_pending_player: session.uno_pending_player === playerId ? null : session.uno_pending_player,
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
      // If we removed the player mid-decision (choose/challenge), fall back to plain play.
      if (session.phase !== 'playing') update.phase = 'playing'
      const nextPlayerId = turnOrder[currentTurnIndex]
      update.status_message = `${removedName} left. ${names.get(nextPlayerId) ?? 'Next player'}'s turn`
      update.turn_deadline_at = unoTurnDeadline(timerSeconds)
    }

    const { error: sessionError } = await supabase.from('uno_sessions').update(update).eq('game_id', gameId)
    if (sessionError) return { error: internalErrorMessage('uno', sessionError) }

    await supabase.from('uno_player_hands').delete().eq('game_id', gameId).eq('player_id', playerId)
    if (finishing) await markGameFinished(supabase, gameId)
    const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
    return { error: error?.message ?? null }
  }

  await supabase.from('uno_player_hands').delete().eq('game_id', gameId).eq('player_id', playerId)
  const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
  return { error: error?.message ?? null }
}

// ── Team-Up mid-round leave: the remaining teammate's decision ─────────────────
/**
 * The teammate of a player who left mid-round chooses to continue solo (1v2) or forfeit.
 * Only valid while `phase === 'team_leave_decision'` and only for `team_decider_id`.
 * - continue → resume play, skipping the departed seat.
 * - forfeit  → the round ends; the opposing team wins.
 */
export async function processUnoTeamLeaveDecision(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string,
  decision: 'continue' | 'forfeit'
): Promise<{ error?: string }> {
  const { session, hands, timerSeconds, playerNames } = await loadGameState(supabase, gameId)
  if (!session) return { error: 'Session not found' }
  if (session.phase === 'finished') return { error: 'The round has already ended' }
  if (session.phase !== 'team_leave_decision') return { error: 'No teammate-leave decision pending' }
  if (session.team_decider_id !== playerId) return { error: 'Not your decision' }

  const order = session.turn_order ?? []
  const leftIds = unoLeftPlayerIds(session)
  const deciderName = playerName(playerNames, playerId)
  const decIdx = order.indexOf(playerId)

  if (decision === 'forfeit') {
    // The remaining teammate concedes — the opposing team takes the round.
    const opponents = order.filter((id, i) => decIdx >= 0 && i % 2 !== decIdx % 2 && !leftIds.includes(id))
    const winnerId = opponents[0] ?? null
    const winnerMate = winnerId ? unoTeammateId(order, winnerId) : null
    const winNames = [winnerId, winnerMate]
      .filter((id): id is string => !!id && !leftIds.includes(id))
      .map((id) => playerName(playerNames, id))
    const won = await persistSession(
      supabase,
      gameId,
      {
        phase: 'finished',
        team_decider_id: null,
        winner_player_id: winnerId,
        turn_deadline_at: null,
        status_message: winNames.length
          ? `${deciderName} forfeited — ${winNames.join(' & ')} win!`
          : `${deciderName} forfeited — game over.`,
      },
      timerSeconds,
      session.updated_at
    )
    if (won) await markGameFinished(supabase, gameId)
    return {}
  }

  // Continue solo: resume play. The departed teammate's hand is already gone, so the turn
  // engine skips their seat; advance off it if the paused turn landed there.
  const direction = session.direction < 0 ? -1 : 1
  const len = order.length
  const currentId = len > 0 ? order[((session.current_turn_index % len) + len) % len] : null
  const currentGone = !currentId || leftIds.includes(currentId) || unoHandCount(hands, currentId) === 0
  const nextIndex = currentGone
    ? unoNextTurnIndex(session, hands, session.current_turn_index, 1, direction)
    : session.current_turn_index
  const nextId = order[nextIndex]

  const patch: Partial<UnoSession> = {
    phase: 'playing',
    team_decider_id: null,
    current_turn_index: nextIndex,
    turn_deadline_at: unoTurnDeadline(timerSeconds),
    // A pause invalidates any half-made decision by/about the departed seat.
    pending_wild: null,
    challenge_prev_color: null,
    wd4_player_id: null,
    drawn_card_id: null,
    status_message: `${deciderName} plays on — 1 vs 2! ${playerName(playerNames, nextId ?? '')}'s turn`,
  }
  // A draw penalty owed by the departed seat leaves with them.
  if (currentGone) {
    patch.draw_penalty = 0
    patch.draw_penalty_kind = null
  }
  await persistSession(supabase, gameId, patch, timerSeconds, session.updated_at)
  return {}
}
