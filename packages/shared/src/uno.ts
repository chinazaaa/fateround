import type { Game, UnoCard, UnoCardColor, UnoColor, UnoPlayerHand, UnoSession } from './types'

/**
 * Client-safe UNO helpers — mirrors the read-only half of web's `src/lib/uno.ts`.
 * The mutation/server functions (initializeUnoGame, processUnoPlay, processUnoDraw, …) stay
 * web-only: mobile never writes uno_sessions/uno_player_hands directly, it calls the same
 * web API routes over HTTP (see apps/mobile/lib/game-api.ts postUno*). Only the pure
 * display/validation logic needed to render the board and pre-validate a tap is duplicated here.
 *
 * PHASE 2: Multi-Play, Team-Up (2v2), Jump-In, and Team-Up quick-chat are now wired into
 * mobile UI (see apps/mobile/components/games/UnoPlayerView.tsx and
 * apps/mobile/hooks/useUnoQuickChat.ts).
 */

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

/** Hex accents for each colour — mirrors the web card faces. */
export const UNO_COLOR_HEX: Record<UnoColor, string> = {
  red: '#ef4444',
  yellow: '#f59e0b',
  green: '#22c55e',
  blue: '#3b82f6',
}

// ── Rules ───────────────────────────────────────────────────────────────────────
export type UnoRules = {
  /** Allow challenging a Wild Draw Four. Core. */
  wd4Challenge: boolean
  /** Cards drawn for a missed "UNO" call. Core. */
  unoPenalty: number
  /** Cards a failed challenger draws. Core. */
  wd4ChallengePenalty: number
  /** 0 = all hands pass in play direction; 7 = swap hands with a chosen player. Core toggle
   *  (per the task's ruleset check), but mobile's UI does not yet render the `swap_target`
   *  picker — see UnoPlayerView.tsx note. */
  zeroSeven: boolean
  /** Allow stacking Draw Two on Draw Two / Draw Four on Draw Four. Core. */
  stacking: boolean
  /** Multi-Play grouping rule. */
  multiPlay: UnoMultiPlayMode
  /** 2v2 Team-Up mode. */
  teamMode: boolean
  /** Jump-In. */
  jumpIn: boolean
}

export const UNO_TEAM_PLAYERS = 4

/** Multi-Play grouping rule. `off` = Classic (one card per turn). Phase 2 — unused on mobile. */
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

// ── Team-Up (2v2) ────────────────────────────────────────────────────────────────
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
 * Did `playerId` win this round? True for the winner, and — in Team-Up — also for
 * the winner's teammate (both partners share the win).
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
  // which case only a matching card stacks onto it.
  if ((session.draw_penalty ?? 0) > 0) {
    return card.kind === session.draw_penalty_kind
  }

  if (isWildCard(card)) return true

  const reqColor = session.required_color
  if (reqColor) return card.color === reqColor

  const top = session.top_card
  if (!top) return true
  if (top.color === 'wild' && !reqColor) return true

  if (card.color === top.color) return true
  if (card.kind === 'number' && top.kind === 'number') return card.value === top.value
  if (card.kind !== 'number' && card.kind === top.kind) return true
  return false
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

/**
 * Jump-In eligibility: `card` is an EXACT match for the settled top card — same colour AND same
 * number (for number cards) or same symbol (Skip/Reverse/Draw Two). Wild and Wild Draw Four are
 * never eligible (no fixed colour/number to match).
 */
export function isJumpInMatch(card: UnoCard, top: UnoCard | null): boolean {
  if (!top) return false
  if (isWildCard(card) || isWildCard(top)) return false
  if (card.color !== top.color) return false
  if (card.kind === 'number' && top.kind === 'number') return card.value === top.value
  return card.kind !== 'number' && card.kind === top.kind
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

export function isDrawPileDepleted(session: UnoSession): boolean {
  const drawLen = ((session.draw_pile as UnoCard[]) ?? []).length
  const discardLen = ((session.discard_pile as UnoCard[]) ?? []).length
  return drawLen === 0 && discardLen === 0
}

export function unoGameSessionExpired(
  sessionStartedAt: string | null | undefined,
  durationSeconds: number | null | undefined
): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false
  if (!sessionStartedAt) return false
  const deadline = new Date(sessionStartedAt).getTime() + durationSeconds * 1000
  return deadline <= Date.now()
}

// ── Standings / placement ───────────────────────────────────────────────────────
export type UnoStanding = {
  playerId: string
  name: string
  cardCount: number
  handSum: number
  rank: number
}

type UnoRankableHand = { player_id: string; cards: UnoCard[] | null }

/**
 * Final placement order (1st → last). Players who emptied their hand rank FIRST, in the
 * exact order they finished (`finishOrder`); everyone still holding cards follows, ordered
 * by lowest hand total then fewest cards. Mirrors web's unoPlacementOrder, including the
 * Team-Up branch (teams win/lose together).
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

/** Colour accent for the required-colour card-table hint (falls back to a neutral slate). */
export function unoColorHex(color: UnoCardColor | null | undefined): string {
  if (!color || color === 'wild') return '#334155'
  return UNO_COLOR_HEX[color]
}
